import { supabaseClient, isSupabaseConfigured } from "../assets/supabase-client.js?v=20260914i";
import { demoData, demoKetidakhadiran, demoPenugasan } from "../assets/demo-data.js?v=20260914i";
import { isUnlocked, initLockUI } from "../assets/auth-gate.js?v=20260914i";
import { urutkanKelas, indeksKelas } from "../assets/kelas-order.js?v=20260914i";

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
    box.innerHTML = `<strong>${konteks}</strong><br>${detail}<button type="button" class="error-close" aria-label="Tutup">×</button>`;
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
    filter: { q: "", guruId: null, kelasId: "ALL", hanyaAbsen: false },
};

async function boot() {
    document.getElementById("notice").hidden = isSupabaseConfigured;

    if (isSupabaseConfigured) {
        const [{ data: guru }, { data: kelas }, { data: mapel }, { data: jam }] =
            await Promise.all([
                supabaseClient.from("v_guru_aktif").select("id, nama").order("nama"),
                supabaseClient.from("kg_kelas").select("id, nama_kelas, tingkat"),
                supabaseClient.from("kg_mapel").select("id, nama_mapel").order("nama_mapel"),
                supabaseClient.from("kg_jam_pelajaran").select("*").order("jam_ke"),
            ]);
        state.guru = guru || [];
        state.kelas = urutkanKelas(kelas || []);
        state.mapel = mapel || [];
        state.jam = jam || [];
    } else {
        state.guru = demoData.guru;
        state.kelas = urutkanKelas(demoData.kelas);
        state.mapel = demoData.mapel;
        state.jam = demoData.jam;
    }

    document.getElementById("kelasFilter").innerHTML =
        `<option value="ALL">Semua kelas</option>` +
        state.kelas.map((k) => `<option value="${k.id}">${k.nama_kelas}</option>`).join("");

    const tanggalInput = document.getElementById("tanggalPicker");
    tanggalInput.value = state.tanggal;
    tanggalInput.addEventListener("change", async (e) => {
        state.tanggal = e.target.value;
        await loadForDate();
    });

    await loadForDate();
}

function hariFromTanggal(tanggalStr) {
    const d = new Date(tanggalStr + "T00:00:00");
    return HARI_FROM_JS_DAY[d.getDay()];
}

async function loadForDate() {
    state.hari = hariFromTanggal(state.tanggal);
    document.getElementById("hariLabel").textContent = state.hari;

    const weekendNotice = document.getElementById("weekendNotice");
    const card = document.getElementById("mainCard");

    if (!HARI_LIST.includes(state.hari)) {
        weekendNotice.hidden = false;
        card.hidden = true;
        return;
    }
    weekendNotice.hidden = true;
    card.hidden = false;

    if (isSupabaseConfigured) {
        const [{ data: jadwal }, { data: ketidakhadiran }] = await Promise.all([
            supabaseClient
                .from("kg_jadwal_kbm")
                .select("id, hari, jam_ke, kelas_id, mapel_id, guru_id")
                .eq("hari", state.hari)
                .order("jam_ke"),
            supabaseClient
                .from("kg_ketidakhadiran_guru")
                .select("*")
                .eq("tanggal", state.tanggal),
        ]);
        state.jadwal = jadwal || [];
        state.ketidakhadiran = ketidakhadiran || [];
        const ids = state.ketidakhadiran.map((k) => k.id);
        const { data: pen } = ids.length
            ? await supabaseClient.from("kg_penugasan_pengganti").select("ketidakhadiran_id, guru_pengganti_id, status_pengganti").in("ketidakhadiran_id", ids)
            : { data: [] };
        state.penugasan = pen || [];
    } else {
        state.jadwal = demoData.jadwal.filter((r) => r.hari === state.hari);
        state.ketidakhadiran = demoKetidakhadiran.filter((r) => r.tanggal === state.tanggal);
        const ids = state.ketidakhadiran.map((k) => k.id);
        state.penugasan = demoPenugasan.filter((p) => ids.includes(p.ketidakhadiran_id));
    }

    renderTable();
}

const namaGuru = (id) => state.guru.find((g) => g.id === id)?.nama || id;
const urutKelas = (id) => indeksKelas(state.kelas)(id);
const namaKelas = (id) => state.kelas.find((k) => k.id === id)?.nama_kelas || id;
const namaMapel = (id) => state.mapel.find((m) => m.id === id)?.nama_mapel || id;
const jamInfo = (jamKe) => state.jam.find((j) => j.jam_ke === Number(jamKe));
const penugasanUntuk = (catatan) => (catatan ? state.penugasan.find((p) => p.ketidakhadiran_id === catatan.id) : null);
const catatanUntuk = (jadwalId) => state.ketidakhadiran.find((k) => k.jadwal_id === jadwalId);

const STATUS_LABEL = {
    ST: "Sakit dengan Tugas",
    STT: "Sakit tanpa Tugas",
    IT: "Ijin dengan Tugas",
    ITT: "Ijin tanpa Tugas",
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
    const jamGuru = baseRows().filter((r) => r.guru_id === gid);
    const dicatat = jamGuru.filter((r) => catatanUntuk(r.id)).length;
    document.getElementById("bannerNama").textContent = namaGuru(gid);
    document.getElementById("bannerInfo").textContent =
        `${jamGuru.length} jam pelajaran hari ${state.hari}` +
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
        `Menampilkan ${rows.length} dari ${state.jadwal.length} jam pelajaran`;

    tbody.innerHTML = rows
        .map((r) => {
            const jam = jamInfo(r.jam_ke);
            const waktu = jam ? `${jam.mulai}–${jam.selesai}` : "";
            const catatan = catatanUntuk(r.id);

            const statusCell = catatan
                ? `<span class="badge-status badge-${catatan.status.toLowerCase()}">${catatan.status}</span>
                   <span class="tugas-note">${STATUS_LABEL[catatan.status] || ""}</span>${(() => {
                       const p = penugasanUntuk(catatan);
                       return p ? `<span class="tugas-note pengganti-note">Pengganti: ${p.status_pengganti === "TP" ? "tidak perlu (TP)" : `${namaGuru(p.guru_pengganti_id)} (${p.status_pengganti})`}</span>` : "";
                   })()}`
                : `<span class="badge-status badge-hadir">Hadir</span>`;

            const actionCell = catatan
                ? `<div class="row-actions">
                     <button class="btn-danger-text" ${disabledAttr} data-action="edit" data-jid="${r.id}">Ubah</button>
                     <button class="btn-danger-text" ${disabledAttr} data-action="clear" data-jid="${r.id}">Batalkan</button>
                   </div>`
                : `<button class="btn-mark" ${disabledAttr} data-action="mark" data-jid="${r.id}">Tandai Tidak Hadir</button>`;

            return `
        <tr>
          <td class="jam-cell">
            <span class="jam-ke">Jam ke-${r.jam_ke}</span>
            <span class="jam-waktu">${waktu}</span>
          </td>
          <td><span class="badge-kelas">${namaKelas(r.kelas_id)}</span></td>
          <td>${namaMapel(r.mapel_id)}</td>
          <td>${namaGuru(r.guru_id)}</td>
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

    const jamGuruHariIni = baseRows().filter((r) => r.guru_id === first.guru_id);
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
    const status = document.getElementById("fStatus").value;
    const keterangan = document.getElementById("fKeteranganTugas").value || null;

    // Catatan pertama guru hari ini + centang aktif -> salin ke semua jam pelajarannya
    let targetIds = activeJadwalIds;
    const fieldSemua = document.getElementById("terapkanSemuaField");
    if (!fieldSemua.hidden && document.getElementById("fTerapkanSemua").checked && activeJadwalIds.length === 1) {
        const gid = state.jadwal.find((r) => r.id === activeJadwalIds[0]).guru_id;
        targetIds = baseRows().filter((r) => r.guru_id === gid).map((r) => r.id);
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
    const catatan = catatanUntuk(jadwalId);
    if (isSupabaseConfigured) {
        if (catatan && penugasanUntuk(catatan)) {
            const { error } = await supabaseClient.from("kg_penugasan_pengganti").delete().eq("ketidakhadiran_id", catatan.id);
            if (error) { laporError("Gagal menghapus penugasan pengganti", error); return; }
        }
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
    return [...map.values()].sort((a, b) => a.nama.localeCompare(b.nama));
}

function renderSaran() {
    const box = document.getElementById("cariSaran");
    const q = state.filter.q.trim().toLowerCase();
    if (!q || state.filter.guruId) { box.hidden = true; return; }
    const hits = guruHariIni().filter((g) => g.nama.toLowerCase().includes(q)).slice(0, 8);
    if (!hits.length) {
        box.innerHTML = `<div class="suggest-empty">Tidak ada guru bernama "${state.filter.q}" yang mengajar hari ${state.hari}</div>`;
    } else {
        box.innerHTML = hits.map((g) => `
            <button type="button" class="suggest-item" data-guru="${g.id}">
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
    const i = nama.toLowerCase().indexOf(q);
    if (i < 0) return nama;
    return `${nama.slice(0, i)}<mark>${nama.slice(i, i + q.length)}</mark>${nama.slice(i + q.length)}`;
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
        const ids = baseRows().filter((r) => r.guru_id === gid && !catatanUntuk(r.id)).map((r) => r.id);
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
