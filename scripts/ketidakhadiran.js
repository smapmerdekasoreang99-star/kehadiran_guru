import { supabaseClient, isSupabaseConfigured } from "../assets/supabase-client.js?v=20261004a";
import { demoData, demoKetidakhadiran, demoPenugasan } from "../assets/demo-data.js?v=20260921v";
import { isUnlocked, initLockUI } from "../assets/auth-gate.js?v=20260921v";
import { peringkatGuru } from "../assets/guru-order.js?v=20260921v";
import { urutkanKelas, indeksKelas } from "../assets/kelas-order.js?v=20260921v";
import { muatRujukan } from "../assets/simpanan.js?v=20261004a";
import { semesterTanggal, semesterBaris } from "../assets/semester.js?v=20260921ad";
import { esc, tombolSibuk } from "../assets/aman.js?v=20261004a";
import { mencakup, petaTingkat, uraianCakupan, uraianJam } from "../assets/libur.js?v=20261007a";

// Tombol kunci dipasang paling pertama & terpisah, supaya tetap berfungsi
// walaupun ada bagian lain halaman yang gagal dimuat.
try {
    initLockUI(() => renderTable());
} catch (err) {
    console.error("Gagal memasang tombol kunci:", err);
}

// ---------- Pelaporan error ke layar ----------
function laporError(konteks, error) {
    console.error(konteks, error);
    let box = document.getElementById("errorBanner");
    if (!box) {
        box = document.createElement("div");
        box.id = "errorBanner";
        box.className = "error-banner";
        const main = document.querySelector("main");
        main.insertBefore(box, main.firstChild);
    }
    const detail = error?.message || error?.details || String(error);
    box.innerHTML = `<strong>${esc(konteks)}</strong><br>${esc(detail)}<button type="button" class="error-close" aria-label="Tutup">×</button>`;
    box.querySelector(".error-close").addEventListener("click", () => box.remove());
    box.scrollIntoView({ behavior: "smooth", block: "start" });
}

const HARI_LIST = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"];
const HARI_FROM_JS_DAY = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

// Tanggal hari ini (waktu lokal) dalam format YYYY-MM-DD
function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let state = {
    // Terhubung Supabase: hari ini. Mode pratinjau: Senin contoh agar data contoh muncul.
    tanggal: isSupabaseConfigured ? todayISO() : "2026-09-14",
    hari: "Senin",
    jadwal: [],
    ketidakhadiran: [],
    penugasan: [],
    guru: [],
    kelas: [],
    mapel: [],
    jam: [],
    // Libur tanggal terpilih: libur penuh (kg_hari_libur) dan libur sebagian.
    liburPenuh: null,         // { keterangan } bila seluruh sekolah libur sehari penuh
    liburSebagian: [],
    liburJam: new Set(),      // id jadwal yang diliburkan pada tanggal ini
    filter: { q: "", guruId: null, kelasId: "ALL", hanyaAbsen: false },
};

async function boot() {
    document.getElementById("notice").hidden = isSupabaseConfigured;

    if (isSupabaseConfigured) {
        // Rujukan — termasuk jadwal sepekan — dari simpanan bersama. Jadwal
        // hari yang dipilih disaring dari situ, bukan diminta ulang ke
        // Supabase setiap kali tanggalnya berganti.
        let rujukan;
        try {
            rujukan = await muatRujukan(supabaseClient, ["guru", "kelas", "mapel", "jam", "jadwal"], (r) => {
                terapkanRujukan(r);
                state.jadwal = jadwalHariIni();
                renderTable();
            });
        } catch (err) { laporError("Gagal memuat data rujukan", err); return; }
        terapkanRujukan(rujukan);
    } else {
        state.guru = demoData.guru;
        state.kelas = urutkanKelas(demoData.kelas);
        state.mapel = demoData.mapel;
        state.jam = demoData.jam;
        isiKelasFilter();
    }

    const tanggalInput = document.getElementById("tanggalPicker");
    tanggalInput.value = state.tanggal;
    tanggalInput.addEventListener("change", async (e) => {
        state.tanggal = e.target.value;
        await loadForDate();
    });

    await loadForDate();
}

function terapkanRujukan(r) {
    state.guru = r.guru;
    state.kelas = urutkanKelas(r.kelas);
    state.mapel = r.mapel;
    state.jam = r.jam;
    state.jadwalSepekan = r.jadwal;
    isiKelasFilter();
}

function isiKelasFilter() {
    const sel = document.getElementById("kelasFilter");
    const sebelumnya = sel.value || "ALL";
    sel.innerHTML =
        `<option value="ALL">Semua kelas</option>` +
        state.kelas.map((k) => `<option value="${esc(k.id)}">${esc(k.nama_kelas)}</option>`).join("");
    sel.value = state.kelas.some((k) => k.id === sebelumnya) ? sebelumnya : "ALL";
    state.filter.kelasId = sel.value;
}

// Jadwal hari itu: harinya cocok DAN semesternya semester tanggal itu —
// jadwal semester lain tidak ikut terbaca.
const jadwalHariIni = () => {
    const smt = semesterTanggal(state.tanggal);
    return (state.jadwalSepekan || [])
        .filter((r) => r.hari === state.hari && semesterBaris(r) === smt)
        .sort((a, b) => a.jam_ke - b.jam_ke);
};

function hariFromTanggal(tanggalStr) {
    const d = new Date(tanggalStr + "T00:00:00");
    return HARI_FROM_JS_DAY[d.getDay()];
}

// Nomor muat: bila tanggal diganti lagi sebelum jawaban sebelumnya tiba,
// jawaban yang basi dibuang — bukan menimpa tabel tanggal yang baru.
let muatKe = 0;

async function loadForDate() {
    const no = ++muatKe;
    state.hari = hariFromTanggal(state.tanggal);
    document.getElementById("hariLabel").textContent = state.hari;

    const weekendNotice = document.getElementById("weekendNotice");
    const card = document.getElementById("mainCard");

    if (!HARI_LIST.includes(state.hari)) {
        weekendNotice.hidden = false;
        document.getElementById("liburPenuhNotice").hidden = true;
        document.getElementById("liburSebagianNotice").hidden = true;
        card.hidden = true;
        return;
    }
    weekendNotice.hidden = true;
    card.hidden = false;

    if (isSupabaseConfigured) {
        const jadwal = jadwalHariIni();
        // Catatan dan penugasan penggantinya dalam satu permintaan (relasi
        // satu-satu lewat ketidakhadiran_id) — dulu dua perjalanan berurutan.
        // Libur tanggal itu diminta serentak.
        const [{ data: ketidakhadiran, error: eK }, penuh, sebagian] = await Promise.all([
            supabaseClient
                .from("kg_ketidakhadiran_guru")
                .select("id, jadwal_id, tanggal, guru_id, status, keterangan_tugas, kg_penugasan_pengganti(guru_pengganti_id, status_pengganti)")
                .eq("tanggal", state.tanggal),
            supabaseClient.from("kg_hari_libur").select("tanggal, keterangan").eq("tanggal", state.tanggal),
            supabaseClient.from("libur_sebagian").select("id, tanggal, tingkat, kelas_id, jam_dari, jam_sampai, keterangan").eq("tanggal", state.tanggal),
        ]);
        if (no !== muatKe) return;
        // Libur yang gagal dimuat tidak menghalangi pencatatan: halaman tampil seperti biasa.
        if (penuh.error) console.warn("Gagal memuat hari libur:", penuh.error);
        if (sebagian.error) console.warn("Gagal memuat libur sebagian:", sebagian.error);
        state.liburPenuh = (penuh.data || [])[0] || null;
        state.liburSebagian = sebagian.data || [];
        if (eK) {
            // Tabel tanggal sebelumnya tidak dibiarkan tampil di bawah label hari yang baru.
            state.jadwal = []; state.ketidakhadiran = []; state.penugasan = [];
            renderTable();
            laporError("Gagal memuat catatan ketidakhadiran", eK);
            return;
        }
        state.jadwal = jadwal;
        state.ketidakhadiran = (ketidakhadiran || []).map(({ kg_penugasan_pengganti, ...k }) => k);
        state.penugasan = (ketidakhadiran || [])
            .filter((k) => k.kg_penugasan_pengganti)
            .map((k) => ({ ketidakhadiran_id: k.id, ...k.kg_penugasan_pengganti }));
    } else {
        state.jadwal = demoData.jadwal.filter((r) => r.hari === state.hari);
        state.ketidakhadiran = demoKetidakhadiran.filter((r) => r.tanggal === state.tanggal);
        const ids = state.ketidakhadiran.map((k) => k.id);
        state.penugasan = demoPenugasan.filter((p) => ids.includes(p.ketidakhadiran_id));
        state.liburPenuh = null; state.liburSebagian = [];
    }

    terapkanLibur();
    renderTable();
}

/* Libur penuh: tidak ada KBM — tabel disembunyikan seperti Sabtu/Minggu.
   Libur sebagian: jam yang tercakup tetap tampil, ditandai Libur, dan tidak
   bisa ditandai tidak hadir (rekap pun mengabaikannya). */
function terapkanLibur() {
    const tingkat = petaTingkat(state.kelas);
    state.liburJam = new Set(state.jadwal
        .filter((j) => state.liburSebagian.some((l) => mencakup(l, j, tingkat)))
        .map((j) => j.id));

    const penuh = document.getElementById("liburPenuhNotice");
    penuh.hidden = !state.liburPenuh;
    document.getElementById("mainCard").hidden = !!state.liburPenuh;
    if (state.liburPenuh) {
        penuh.innerHTML = `<strong>Hari libur${state.liburPenuh.keterangan ? ` — ${esc(state.liburPenuh.keterangan)}` : ""}</strong>
          Seluruh sekolah libur sehari penuh, jadi tidak ada jam pelajaran untuk dicatat. Libur diatur di Rekapitulasi Kehadiran → tab Hari Libur.`;
    }

    const sebagian = document.getElementById("liburSebagianNotice");
    sebagian.hidden = !!state.liburPenuh || !state.liburSebagian.length;
    if (!sebagian.hidden) {
        sebagian.innerHTML = `<b>Libur sebagian hari ini</b> — ${state.liburJam.size} jam pelajaran ditandai Libur dan tidak dihitung di rekap:
          <ul>${state.liburSebagian.map((l) => `<li>${esc(uraianCakupan(l, namaKelas))} · ${esc(uraianJam(l))}${l.keterangan ? ` — ${esc(l.keterangan)}` : ""}</li>`).join("")}</ul>`;
    }
}

const diliburkan = (jadwalId) => state.liburJam.has(jadwalId);
// Jam pelajaran yang benar-benar berlangsung (tanpa jam yang diliburkan).
const jamBerlangsung = () => baseRows().filter((r) => !diliburkan(r.id));

const namaGuru = (id) => state.guru.find((g) => g.id === id)?.nama || id;
const urutKelas = (id) => indeksKelas(state.kelas)(id);
const namaKelas = (id) => state.kelas.find((k) => k.id === id)?.nama_kelas || id;
const namaMapel = (id) => state.mapel.find((m) => m.id === id)?.nama_mapel || id;
const jamInfo = (jamKe) => state.jam.find((j) => j.jam_ke === Number(jamKe));
const penugasanUntuk = (catatan) => (catatan ? state.penugasan.find((p) => p.ketidakhadiran_id === catatan.id) : null);
const catatanUntuk = (jadwalId) => state.ketidakhadiran.find((k) => k.jadwal_id === jadwalId);

const STATUS_LABEL = {
    ST: "Sakit dengan Tugas",
    IT: "Ijin dengan Tugas",
    TK: "Tanpa Keterangan",
    HTTM: "Hadir tanpa Tatap Muka",
};
const STATUS_PERLU_KETERANGAN = ["ST", "IT", "HTTM"];

function baseRows() {
    return [...state.jadwal].sort((a, b) => a.jam_ke - b.jam_ke || urutKelas(a.kelas_id) - urutKelas(b.kelas_id));
}

function filteredRows() {
    const f = state.filter;
    const q = f.q.trim().toLowerCase();
    return baseRows().filter((r) => {
        if (f.guruId && r.guru_id !== f.guruId) return false;
        if (!f.guruId && q && !namaGuru(r.guru_id).toLowerCase().includes(q)) return false;
        if (f.kelasId !== "ALL" && r.kelas_id !== f.kelasId) return false;
        if (f.hanyaAbsen && !catatanUntuk(r.id)) return false;
        return true;
    });
}

function renderBanner() {
    const banner = document.getElementById("guruBanner");
    const gid = state.filter.guruId;
    if (!gid) { banner.hidden = true; return; }
    const jamGuru = jamBerlangsung().filter((r) => r.guru_id === gid);
    const jamLibur = baseRows().filter((r) => r.guru_id === gid && diliburkan(r.id)).length;
    const dicatat = jamGuru.filter((r) => catatanUntuk(r.id)).length;
    document.getElementById("bannerNama").textContent = namaGuru(gid);
    document.getElementById("bannerInfo").textContent =
        `${jamGuru.length} jam pelajaran hari ${state.hari}` +
        (jamLibur ? ` · ${jamLibur} jam libur` : "") +
        (dicatat ? ` · ${dicatat} sudah dicatat tidak hadir` : "");
    const btn = document.getElementById("bannerTandaiSemua");
    const sisa = jamGuru.length - dicatat;
    btn.disabled = !isUnlocked() || sisa === 0;
    btn.textContent = sisa === 0 ? "Semua jam sudah dicatat" : `Tandai semua ${sisa} jam tidak hadir`;
    banner.hidden = false;
}

function renderTable() {
    const tbody = document.getElementById("body");
    const rows = filteredRows();
    const unlocked = isUnlocked();
    const disabledAttr = unlocked ? "" : "disabled";

    renderBanner();
    document.getElementById("emptyState").hidden = rows.length > 0;
    document.getElementById("ringkasan").textContent =
        `Menampilkan ${rows.length} dari ${state.jadwal.length} jam pelajaran`
        + (state.liburJam.size ? ` · ${state.liburJam.size} jam diliburkan` : "");

    tbody.innerHTML = rows
        .map((r) => {
            const jam = jamInfo(r.jam_ke);
            const waktu = jam ? `${jam.mulai}–${jam.selesai}` : "";
            const catatan = catatanUntuk(r.id);
            const libur = diliburkan(r.id);

            const statusCell = libur && !catatan
                ? `<span class="badge-status badge-libur">Libur</span><span class="tugas-note">Jam ini diliburkan</span>`
                : catatan
                ? `<span class="badge-status badge-${esc(catatan.status.toLowerCase())}">${esc(catatan.status)}</span>
                   <span class="tugas-note">${STATUS_LABEL[catatan.status] || ""}</span>${(() => {
                       const p = penugasanUntuk(catatan);
                       return p ? `<span class="tugas-note pengganti-note">Pengganti: ${p.status_pengganti === "TP" ? "tidak perlu (TP)" : `${esc(namaGuru(p.guru_pengganti_id))} (${esc(p.status_pengganti)})`}</span>` : "";
                   })()}`
                : `<span class="badge-status badge-hadir">Hadir</span>`;

            const actionCell = catatan
                ? `<div class="row-actions">
                     <button class="btn-danger-text" ${disabledAttr} data-action="edit" data-jid="${esc(r.id)}">Ubah</button>
                     <button class="btn-danger-text" ${disabledAttr} data-action="clear" data-jid="${esc(r.id)}">Batalkan</button>
                   </div>`
                : libur ? ""
                : `<button class="btn-mark" ${disabledAttr} data-action="mark" data-jid="${esc(r.id)}">Tandai Tidak Hadir</button>`;

            return `
        <tr${libur ? ' class="baris-libur"' : ""}>
          <td class="jam-cell">
            <span class="jam-ke">Jam ke-${esc(r.jam_ke)}</span>
            <span class="jam-waktu">${esc(waktu)}</span>
          </td>
          <td><span class="badge-kelas">${esc(namaKelas(r.kelas_id))}</span></td>
          <td>${esc(namaMapel(r.mapel_id))}</td>
          <td>${esc(namaGuru(r.guru_id))}</td>
          <td>${statusCell}</td>
          <td>${actionCell}</td>
        </tr>`;
        })
        .join("");

    if (!unlocked) return;

    tbody.querySelectorAll('[data-action="mark"], [data-action="edit"]').forEach((b) =>
        b.addEventListener("click", () => openModal(b.dataset.jid))
    );
    tbody.querySelectorAll('[data-action="clear"]').forEach((b) =>
        b.addEventListener("click", () => clearCatatan(b.dataset.jid))
    );
}

// ---------- Modal ----------
let activeJadwalIds = [];

// jadwalId: satu id (tandai/ubah satu jam) atau array id (tandai banyak jam sekaligus)
function openModal(jadwalId) {
    activeJadwalIds = Array.isArray(jadwalId) ? jadwalId : [jadwalId];
    const first = state.jadwal.find((r) => r.id === activeJadwalIds[0]);
    const catatan = activeJadwalIds.length === 1 ? catatanUntuk(activeJadwalIds[0]) : null;

    document.getElementById("modalSubjudul").textContent = activeJadwalIds.length === 1
        ? `${namaGuru(first.guru_id)} — ${namaMapel(first.mapel_id)} — ${namaKelas(first.kelas_id)}, Jam ke-${first.jam_ke}`
        : `${namaGuru(first.guru_id)} — ${activeJadwalIds.length} jam pelajaran hari ${state.hari} (semua akan diberi status yang sama)`;

    const jamGuruHariIni = jamBerlangsung().filter((r) => r.guru_id === first.guru_id);
    const catatanPertama = activeJadwalIds.length === 1 && !catatan &&
        jamGuruHariIni.every((r) => !catatanUntuk(r.id)) && jamGuruHariIni.length > 1;
    const fieldSemua = document.getElementById("terapkanSemuaField");
    fieldSemua.hidden = !catatanPertama;
    document.getElementById("fTerapkanSemua").checked = catatanPertama;
    if (catatanPertama) {
        document.getElementById("terapkanSemuaLabel").textContent =
            `Terapkan ke semua ${jamGuruHariIni.length} jam pelajaran ${namaGuru(first.guru_id)} hari ini`;
    }

    document.getElementById("fStatus").value = catatan ? catatan.status : "ST";
    document.getElementById("fKeteranganTugas").value = catatan ? catatan.keterangan_tugas || "" : "";
    toggleKeteranganField();

    document.getElementById("ketidakhadiranModal").hidden = false;
}

function closeModal() {
    document.getElementById("ketidakhadiranModal").hidden = true;
    activeJadwalIds = [];
}

function toggleKeteranganField() {
    const status = document.getElementById("fStatus").value;
    document.getElementById("keteranganField").hidden = !STATUS_PERLU_KETERANGAN.includes(status);
}

async function saveCatatan(e) {
    e.preventDefault();
    // Tombol simpan nonaktif sampai selesai: ketukan kedua di jaringan lambat tidak menyimpan dua kali.
    const tombol = e.submitter || e.target.querySelector('[type="submit"]');
    await tombolSibuk(tombol, () => simpanCatatan());
}

async function simpanCatatan() {
    const status = document.getElementById("fStatus").value;
    const keterangan = document.getElementById("fKeteranganTugas").value || null;

    // Catatan pertama guru hari ini + centang aktif -> salin ke semua jam pelajarannya
    let targetIds = activeJadwalIds;
    const fieldSemua = document.getElementById("terapkanSemuaField");
    if (!fieldSemua.hidden && document.getElementById("fTerapkanSemua").checked && activeJadwalIds.length === 1) {
        const gid = state.jadwal.find((r) => r.id === activeJadwalIds[0]).guru_id;
        targetIds = jamBerlangsung().filter((r) => r.guru_id === gid).map((r) => r.id);
    }

    const payloads = targetIds.map((jid) => ({
        jadwal_id: jid,
        tanggal: state.tanggal,
        guru_id: state.jadwal.find((r) => r.id === jid).guru_id,
        status,
        keterangan_tugas: keterangan,
    }));

    if (isSupabaseConfigured) {
        {
            const { error } = await supabaseClient
            .from("kg_ketidakhadiran_guru")
            .upsert(payloads, { onConflict: "jadwal_id,tanggal" });
            if (error) { laporError("Gagal menyimpan ke tabel kg_ketidakhadiran_guru", error); return; }
        }
    } else {
        for (const payload of payloads) {
            const idx = demoKetidakhadiran.findIndex(
                (k) => k.jadwal_id === payload.jadwal_id && k.tanggal === state.tanggal
            );
            if (idx > -1) demoKetidakhadiran[idx] = { ...demoKetidakhadiran[idx], ...payload };
            else demoKetidakhadiran.push({ id: `K${Date.now()}${Math.random().toString(36).slice(2, 6)}`, ...payload });
        }
    }

    closeModal();
    await loadForDate();
}

let konfirmasiJadwalId = null;

function clearCatatan(jadwalId) {
    const catatan = catatanUntuk(jadwalId);
    const p = penugasanUntuk(catatan);
    if (!p) return hapusCatatan(jadwalId);
    konfirmasiJadwalId = jadwalId;
    const siapa = p.status_pengganti === "TP" ? "status Tidak Perlu Pengganti" : `${namaGuru(p.guru_pengganti_id)} (${p.status_pengganti})`;
    document.getElementById("konfirmasiTeks").textContent =
        `Jam ini sudah punya penugasan pengganti: ${siapa}. Membatalkan catatan ini akan ikut menghapus penugasannya — guru pengganti mungkin sudah diberi tahu. Lanjutkan?`;
    document.getElementById("konfirmasiModal").hidden = false;
}

function tutupKonfirmasi() { konfirmasiJadwalId = null; document.getElementById("konfirmasiModal").hidden = true; }

async function hapusCatatan(jadwalId) {
    if (isSupabaseConfigured) {
        // Penugasan penggantinya ikut terhapus oleh database (FK ON DELETE
        // CASCADE) dalam perintah yang sama — tidak perlu permintaan terpisah,
        // dan tidak ada keadaan setengah terhapus bila sambungan putus.
        {
            const { error } = await supabaseClient
            .from("kg_ketidakhadiran_guru")
            .delete()
            .eq("jadwal_id", jadwalId)
            .eq("tanggal", state.tanggal);
            if (error) { laporError("Gagal menghapus ke tabel kg_ketidakhadiran_guru", error); return; }
        }
    } else {
        const idx = demoKetidakhadiran.findIndex(
            (k) => k.jadwal_id === jadwalId && k.tanggal === state.tanggal
        );
        if (idx > -1) {
            const kid = demoKetidakhadiran[idx].id;
            const pi = demoPenugasan.findIndex((p) => p.ketidakhadiran_id === kid);
            if (pi > -1) demoPenugasan.splice(pi, 1);
            demoKetidakhadiran.splice(idx, 1);
        }
    }
    await loadForDate();
}

// ---------- Pencarian guru & filter ----------
function guruHariIni() {
    const map = new Map();
    for (const r of state.jadwal) {
        const g = map.get(r.guru_id) || { id: r.guru_id, nama: namaGuru(r.guru_id), jam: 0, absen: 0 };
        g.jam += 1;
        if (catatanUntuk(r.id)) g.absen += 1;
        map.set(r.guru_id, g);
    }
    const urut = peringkatGuru(state.guru);
    return [...map.values()].sort((a, b) => urut(a.guru_id) - urut(b.guru_id));
}

function renderSaran() {
    const box = document.getElementById("cariSaran");
    const q = state.filter.q.trim().toLowerCase();
    if (!q || state.filter.guruId) { box.hidden = true; return; }
    const hits = guruHariIni().filter((g) => g.nama.toLowerCase().includes(q)).slice(0, 8);
    if (!hits.length) {
        box.innerHTML = `<div class="suggest-empty">Tidak ada guru bernama "${esc(state.filter.q)}" yang mengajar hari ${esc(state.hari)}</div>`;
    } else {
        box.innerHTML = hits.map((g) => `
            <button type="button" class="suggest-item" data-guru="${esc(g.id)}">
              <span class="suggest-nama">${sorot(g.nama, q)}</span>
              <span class="suggest-meta">${g.jam} jam${g.absen ? ` · <em>${g.absen} tidak hadir</em>` : ""}</span>
            </button>`).join("");
        box.querySelectorAll(".suggest-item").forEach((b) =>
            b.addEventListener("mousedown", (e) => { e.preventDefault(); pilihGuru(b.dataset.guru); })
        );
    }
    box.hidden = false;
}

function sorot(nama, q) {
    // Ketiga potongan di-escape dulu; hanya <mark> yang HTML.
    const i = nama.toLowerCase().indexOf(q);
    if (i < 0) return esc(nama);
    return `${esc(nama.slice(0, i))}<mark>${esc(nama.slice(i, i + q.length))}</mark>${esc(nama.slice(i + q.length))}`;
}

function pilihGuru(id) {
    state.filter.guruId = id;
    state.filter.q = namaGuru(id);
    document.getElementById("cariGuru").value = state.filter.q;
    document.getElementById("cariClear").hidden = false;
    document.getElementById("cariSaran").hidden = true;
    renderTable();
}

function bersihkanCari() {
    state.filter.guruId = null;
    state.filter.q = "";
    document.getElementById("cariGuru").value = "";
    document.getElementById("cariClear").hidden = true;
    document.getElementById("cariSaran").hidden = true;
    renderTable();
}

function pasangPencarian() {
    const input = document.getElementById("cariGuru");
    input.addEventListener("input", () => {
        state.filter.guruId = null;
        state.filter.q = input.value;
        document.getElementById("cariClear").hidden = !input.value;
        renderSaran();
        renderTable();
    });
    input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") bersihkanCari();
        if (e.key === "Enter") {
            const first = document.querySelector("#cariSaran .suggest-item");
            if (first) pilihGuru(first.dataset.guru);
        }
    });
    input.addEventListener("focus", renderSaran);
    input.addEventListener("blur", () => setTimeout(() => (document.getElementById("cariSaran").hidden = true), 120));
    document.getElementById("cariClear").addEventListener("click", bersihkanCari);

    document.getElementById("kelasFilter").addEventListener("change", (e) => {
        state.filter.kelasId = e.target.value;
        renderTable();
    });
    const absenBtn = document.getElementById("filterAbsen");
    absenBtn.addEventListener("click", () => {
        state.filter.hanyaAbsen = !state.filter.hanyaAbsen;
        absenBtn.classList.toggle("active", state.filter.hanyaAbsen);
        renderTable();
    });
    document.getElementById("bannerTandaiSemua").addEventListener("click", () => {
        const gid = state.filter.guruId;
        const ids = jamBerlangsung().filter((r) => r.guru_id === gid && !catatanUntuk(r.id)).map((r) => r.id);
        if (ids.length) openModal(ids);
    });
}

// ---------- Pasang kontrol statis, lalu muat data ----------
try {
    document.getElementById("modalCancel").addEventListener("click", closeModal);
    document.getElementById("ketidakhadiranForm").addEventListener("submit", saveCatatan);
    document.getElementById("fStatus").addEventListener("change", toggleKeteranganField);
    pasangPencarian();
    document.getElementById("konfirmasiBatal").addEventListener("click", tutupKonfirmasi);
    document.getElementById("konfirmasiLanjut").addEventListener("click", async () => {
        const id = konfirmasiJadwalId; tutupKonfirmasi(); if (id) await hapusCatatan(id);
    });
} catch (err) {
    console.error("Ada elemen halaman yang tidak ditemukan — kemungkinan HTML dan JS beda versi. Lakukan hard refresh (Ctrl+Shift+R).", err);
}

boot().catch((err) => console.error("Gagal memuat data halaman:", err));
