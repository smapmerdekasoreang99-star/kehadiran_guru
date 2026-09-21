import { supabaseClient, isSupabaseConfigured } from "../assets/supabase-client.js?v=20260920w";
import { demoData, demoKetidakhadiran, demoPenugasan } from "../assets/demo-data.js?v=20260920w";
import { isUnlocked, initLockUI } from "../assets/auth-gate.js?v=20260920w";
import { terapkanUrutan } from "../assets/guru-order.js?v=20260920w";
import { urutkanKelas, indeksKelas } from "../assets/kelas-order.js?v=20260920w";
import { susunKelompok, buatTeks, gambarTabel, tanggalPanjang } from "../assets/bagikan-wa.js?v=20260921a";
import { MAPEL_WALI_KELAS } from "../assets/rekap-hitung.js?v=20260920w";

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

const STATUS_LABEL = {
    ST: "Sakit dengan Tugas",
    STT: "Sakit tanpa Tugas",
    IT: "Ijin dengan Tugas",
    ITT: "Ijin tanpa Tugas",
    TK: "Tanpa Keterangan",
    HTTM: "Hadir tanpa Tatap Muka",
};

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
    piket: [],
};

async function boot() {
    document.getElementById("notice").hidden = isSupabaseConfigured;

    if (isSupabaseConfigured) {
        const [{ data: guru }, { data: kelas }, { data: mapel }, { data: jam }] =
            await Promise.all([
                terapkanUrutan(supabaseClient.from("v_guru").select("id, nama, mapel_utama, is_piket, status_aktif, tmt_sekolah")),
                supabaseClient.from("kg_kelas").select("id, nama_kelas, tingkat"),
                supabaseClient.from("kg_mapel").select("id, nama_mapel, rumpun_mapel").order("nama_mapel"),
                supabaseClient.from("kg_jam_pelajaran").select("*").order("jam_ke"),
            ]);
        state.guru = guru || [];
        state.kelas = urutkanKelas(kelas || []);
        state.mapel = mapel || [];
        state.jam = (jam || []).filter((j) => j.keterangan !== "Tahsin");
    } else {
        state.guru = demoData.guru;
        state.kelas = urutkanKelas(demoData.kelas);
        state.mapel = demoData.mapel;
        state.jam = demoData.jam.filter((j) => j.keterangan !== "Tahsin");
    }

    document.getElementById("fGuruPengganti").innerHTML = daftarGuruAktif()
        .map((g) => `<option value="${g.id}">${g.nama}</option>`)
        .join("");

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
        const [{ data: jadwal }, { data: ketidakhadiran }, { data: piket }] = await Promise.all([
            supabaseClient
                .from("kg_jadwal_kbm")
                .select("id, hari, jam_ke, kelas_id, mapel_id, guru_id")
                .eq("hari", state.hari)
                .order("jam_ke"),
            supabaseClient
                .from("kg_ketidakhadiran_guru")
                .select("*")
                .eq("tanggal", state.tanggal),
            supabaseClient.from("kg_piket").select("*").eq("hari", state.hari),
        ]);
        state.jadwal = jadwal || [];
        state.ketidakhadiran = ketidakhadiran || [];
        state.piket = piket || [];

        const ketidakhadiranIds = state.ketidakhadiran.map((k) => k.id);
        const { data: penugasan } = ketidakhadiranIds.length
            ? await supabaseClient
                  .from("kg_penugasan_pengganti")
                  .select("*")
                  .in("ketidakhadiran_id", ketidakhadiranIds)
            : { data: [] };
        state.penugasan = penugasan || [];
    } else {
        state.jadwal = demoData.jadwal.filter((r) => r.hari === state.hari);
        state.ketidakhadiran = demoKetidakhadiran.filter((r) => r.tanggal === state.tanggal);
        state.piket = demoData.piket.filter((p) => p.hari === state.hari);
        const ketidakhadiranIds = state.ketidakhadiran.map((k) => k.id);
        state.penugasan = demoPenugasan.filter((p) => ketidakhadiranIds.includes(p.ketidakhadiran_id));
    }

    renderTable();
}

const namaGuru = (id) => (id ? state.guru.find((g) => g.id === id)?.nama || id : "—");

// Guru lain yang mengajar di kelas & jam yang sama (team teaching, mis. Matematika Dasar)
function pendampingUntuk(jadwal) {
    return state.jadwal
        .filter((j) => j.id !== jadwal.id && j.hari === jadwal.hari && j.jam_ke === jadwal.jam_ke && j.kelas_id === jadwal.kelas_id)
        .map((j) => {
            const absen = state.ketidakhadiran.find((k) => k.jadwal_id === j.id);
            return { guru_id: j.guru_id, hadir: !absen };
        });
}
const urutKelas = (id) => indeksKelas(state.kelas)(id);

// Status aktif dari view v_guru — toleran terhadap boolean maupun teks ("Aktif"/"Y"/1).
// Bila kolomnya tidak ada (mode pratinjau), guru dianggap aktif.
function guruAktif(g) {
    const v = g?.status_aktif;
    if (v === undefined || v === null) return true;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
    return /^(aktif|active|y|ya|true|1)$/i.test(String(v).trim());
}
const daftarGuruAktif = () => state.guru.filter(guruAktif);

const perluPengganti = (jadwal) => jadwal.jam_ke !== 8 && !MAPEL_WALI_KELAS.includes(jadwal.mapel_id);
const namaKelas = (id) => state.kelas.find((k) => k.id === id)?.nama_kelas || id;
const mapelById = (id) => state.mapel.find((m) => m.id === id);
const jamInfo = (jamKe) => state.jam.find((j) => j.jam_ke === Number(jamKe));

function renderTable() {
    const tbody = document.getElementById("body");
    const empty = document.getElementById("emptyState");
    const unlocked = isUnlocked();
    const disabledAttr = unlocked ? "" : "disabled";

    // Tidak memerlukan guru pengganti: jam ke-8 (Tahsin, kewenangan Kesiswaan)
    // dan jam tugas wali kelas (Upacara & Bimbingan Wali Kelas, Senin jam 1-2)
    const rows = state.ketidakhadiran
        .map((k) => ({ k, jadwal: state.jadwal.find((j) => j.id === k.jadwal_id) }))
        .filter((r) => r.jadwal && perluPengganti(r.jadwal))
        .sort((a, b) => a.jadwal.jam_ke - b.jadwal.jam_ke);

    if (rows.length === 0) {
        tbody.innerHTML = "";
        empty.hidden = false;
        return;
    }
    empty.hidden = true;

    tbody.innerHTML = rows
        .map(({ k, jadwal }) => {
            const jam = jamInfo(jadwal.jam_ke);
            const waktu = jam ? `${jam.mulai}–${jam.selesai}` : "";
            const mapel = mapelById(jadwal.mapel_id);
            const penugasan = state.penugasan.find((p) => p.ketidakhadiran_id === k.id);

            const pendamping = pendampingUntuk(jadwal);
            const pendampingNote = pendamping.length
                ? `<span class="partner-note">${pendamping
                      .map((p) => `Berpasangan dengan ${namaGuru(p.guru_id)} — ${p.hadir ? "hadir" : "juga tidak hadir"}`)
                      .join("<br>")}</span>`
                : "";

            const statusCell = penugasan
                ? `<span class="badge-tugas badge-${penugasan.status_pengganti.toLowerCase()}">${penugasan.status_pengganti}</span>
                   <span class="tugas-note">${penugasan.status_pengganti === "TP" ? "Tidak perlu pengganti" : namaGuru(penugasan.guru_pengganti_id)}</span>`
                : `<span class="badge-tugas badge-kosong">Belum ditugaskan</span>`;

            const actionCell = penugasan
                ? `<div class="row-actions">
                     <button class="btn-danger-text" ${disabledAttr} data-action="edit" data-kid="${k.id}">Ubah</button>
                     <button class="btn-danger-text" ${disabledAttr} data-action="clear" data-kid="${k.id}">Batalkan</button>
                   </div>`
                : `<div class="row-actions">
                     <button class="btn-mark" ${disabledAttr} data-action="assign" data-kid="${k.id}">Tugaskan</button>
                     <button class="btn-danger-text" ${disabledAttr} data-action="tp" data-kid="${k.id}">Tidak perlu</button>
                   </div>`;

            return `
        <tr>
          <td class="jam-cell">
            <span class="jam-ke">Jam ke-${jadwal.jam_ke}</span>
            <span class="jam-waktu">${waktu}</span>
          </td>
          <td><span class="badge-kelas">${namaKelas(jadwal.kelas_id)}</span></td>
          <td>${mapel?.nama_mapel || jadwal.mapel_id}</td>
          <td>
            ${namaGuru(jadwal.guru_id)}
            <span class="tugas-note">${k.status} — ${STATUS_LABEL[k.status] || ""}</span>
            ${pendampingNote}
          </td>
          <td>${statusCell}</td>
          <td>${actionCell}</td>
        </tr>`;
        })
        .join("");

    if (!unlocked) return;

    tbody.querySelectorAll('[data-action="assign"], [data-action="edit"]').forEach((b) =>
        b.addEventListener("click", () => openModal(b.dataset.kid))
    );
    tbody.querySelectorAll('[data-action="clear"]').forEach((b) =>
        b.addEventListener("click", () => clearPenugasan(b.dataset.kid))
    );
    tbody.querySelectorAll('[data-action="tp"]').forEach((b) =>
        b.addEventListener("click", () => simpanPenugasan({
            ketidakhadiran_id: b.dataset.kid,
            guru_pengganti_id: null,
            status_pengganti: "TP",
            catatan: null,
        }))
    );
}

// ---------- Rekomendasi ----------
function computeRecommendations(jadwal, mapel) {
    const busyGuruIds = new Set(
        state.jadwal.filter((j) => j.jam_ke === jadwal.jam_ke).map((j) => j.guru_id)
    );

    const idAktif = new Set(daftarGuruAktif().map((g) => g.id));
    const piketJamIni = state.piket
        .filter((p) => p.jam_ke === jadwal.jam_ke)
        .map((p) => p.guru_id)
        .filter((id) => !busyGuruIds.has(id) && idAktif.has(id));

    const infaler = daftarGuruAktif()
        .filter(
            (g) =>
                g.mapel_utama &&
                mapel &&
                g.mapel_utama === mapel.nama_mapel &&
                g.id !== jadwal.guru_id &&
                !busyGuruIds.has(g.id)
        )
        .map((g) => g.id);

    const serumpun = daftarGuruAktif()
        .filter(
            (g) =>
                mapel &&
                mapel.rumpun_mapel &&
                mapel.rumpun_mapel !== "Kegiatan Sekolah" &&
                g.mapel_utama &&
                state.mapel.find((m) => m.nama_mapel === g.mapel_utama)?.rumpun_mapel === mapel.rumpun_mapel &&
                !busyGuruIds.has(g.id) &&
                !piketJamIni.includes(g.id) &&
                !infaler.includes(g.id) &&
                g.id !== jadwal.guru_id
        )
        .map((g) => g.id);

    return { piket: piketJamIni, infaler, serumpun };
}

function renderRecommendations(jadwal, mapel) {
    const { piket, infaler, serumpun } = computeRecommendations(jadwal, mapel);
    const wrap = document.getElementById("rekomendasi");

    const chip = (guruId, status, label) =>
        `<button type="button" class="chip chip-${status.toLowerCase()}" data-guru="${guruId}" data-status="${status}">
           ${namaGuru(guruId)} <span class="chip-tag">${label}</span>
         </button>`;

    const groups = [
        piket.map((id) => chip(id, "PT", "Piket")),
        infaler.map((id) => chip(id, "Inf", "Infaler")),
        serumpun.slice(0, 5).map((id) => chip(id, "GT", "Serumpun")),
    ].flat();

    wrap.innerHTML = groups.length
        ? groups.join("")
        : `<span class="tugas-note">Tidak ada rekomendasi otomatis untuk jam ini — pilih manual di bawah.</span>`;

    wrap.querySelectorAll(".chip").forEach((c) =>
        c.addEventListener("click", () => {
            document.getElementById("fGuruPengganti").value = c.dataset.guru;
            document.getElementById("fStatus").value = c.dataset.status;
        })
    );
}

// ---------- Modal ----------
let activeKetidakhadiranId = null;

function openModal(ketidakhadiranId) {
    try {
        bukaFormPenugasan(ketidakhadiranId);
    } catch (err) {
        laporError("Gagal membuka form penugasan (kemungkinan penugasan.html masih versi lama — unggah ulang & hard refresh)", err);
    }
}

function bukaFormPenugasan(ketidakhadiranId) {
    activeKetidakhadiranId = ketidakhadiranId;
    const k = state.ketidakhadiran.find((r) => r.id === ketidakhadiranId);
    const jadwal = state.jadwal.find((j) => j.id === k.jadwal_id);
    const mapel = mapelById(jadwal.mapel_id);
    const existing = state.penugasan.find((p) => p.ketidakhadiran_id === ketidakhadiranId);

    document.getElementById("modalSubjudul").textContent =
        `${namaGuru(jadwal.guru_id)} (${k.status}) — ${mapel?.nama_mapel || ""} — ${namaKelas(jadwal.kelas_id)}, Jam ke-${jadwal.jam_ke}`;

    renderRecommendations(jadwal, mapel);

    document.getElementById("fGuruPengganti").value = existing?.guru_pengganti_id || daftarGuruAktif()[0]?.id;
    document.getElementById("fStatus").value = existing ? existing.status_pengganti : "GT";
    document.getElementById("fCatatan").value = existing ? existing.catatan || "" : "";
    toggleGuruField();

    document.getElementById("penugasanModal").hidden = false;
}

function toggleGuruField() {
    const tp = document.getElementById("fStatus").value === "TP";
    document.getElementById("fGuruPengganti").disabled = tp;
    document.getElementById("guruField")?.classList.toggle("field-muted", tp);
}

function closeModal() {
    document.getElementById("penugasanModal").hidden = true;
    activeKetidakhadiranId = null;
}

async function savePenugasan(e) {
    e.preventDefault();
    const status = document.getElementById("fStatus").value;
    await simpanPenugasan({
        ketidakhadiran_id: activeKetidakhadiranId,
        guru_pengganti_id: status === "TP" ? null : document.getElementById("fGuruPengganti").value,
        status_pengganti: status,
        catatan: document.getElementById("fCatatan").value || null,
    });
    closeModal();
}

async function simpanPenugasan(payload) {
    const kid = payload.ketidakhadiran_id;
    if (isSupabaseConfigured) {
        {
            const { error } = await supabaseClient
            .from("kg_penugasan_pengganti")
            .upsert(payload, { onConflict: "ketidakhadiran_id" });
            if (error) { laporError("Gagal menyimpan ke tabel kg_penugasan_pengganti", error); return; }
        }
    } else {
        const idx = demoPenugasan.findIndex((p) => p.ketidakhadiran_id === kid);
        if (idx > -1) demoPenugasan[idx] = { ...demoPenugasan[idx], ...payload };
        else demoPenugasan.push({ id: `P${Date.now()}`, ...payload });
    }
    await loadForDate();
}

async function clearPenugasan(ketidakhadiranId) {
    if (isSupabaseConfigured) {
        {
            const { error } = await supabaseClient
            .from("kg_penugasan_pengganti")
            .delete()
            .eq("ketidakhadiran_id", ketidakhadiranId);
            if (error) { laporError("Gagal menghapus ke tabel kg_penugasan_pengganti", error); return; }
        }
    } else {
        const idx = demoPenugasan.findIndex((p) => p.ketidakhadiran_id === ketidakhadiranId);
        if (idx > -1) demoPenugasan.splice(idx, 1);
    }
    await loadForDate();
}

// ---------- Bagikan ke WhatsApp ----------
const NAMA_SEKOLAH = "SMA Plus Merdeka Soreang";
let waCache = { teks: "", canvas: null };

function dataBagikan() {
    // hanya jam yang sudah ditugaskan (GT/PT/Inf); TP & jam 8 dikecualikan
    const items = []; let belum = 0;
    for (const k of state.ketidakhadiran) {
        const j = state.jadwal.find((x) => x.id === k.jadwal_id);
        if (!j || !perluPengganti(j)) continue;
        const p = state.penugasan.find((x) => x.ketidakhadiran_id === k.id);
        if (!p) { belum++; continue; }
        if (p.status_pengganti === "TP") continue;
        items.push({ guru_id: j.guru_id, status: k.status, jam_ke: j.jam_ke, kelas_id: j.kelas_id, pengganti_id: p.guru_pengganti_id, status_pengganti: p.status_pengganti });
    }
    const lookup = { namaGuru, namaKelas, labelStatus: (kode) => STATUS_LABEL[kode] || kode };
    return { kelompok: susunKelompok(items, lookup), belum, jumlah: items.length };
}

let logoImg = null;
function muatLogo() {
    return new Promise((res) => {
        if (logoImg) return res(logoImg);
        const img = new Image();
        img.onload = () => { logoImg = img; res(img); };
        img.onerror = () => res(null);
        img.src = "assets/logo.png";
    });
}

async function renderBagikan() {
    const { kelompok, belum, jumlah } = dataBagikan();
    const catatan = document.getElementById("fCatatanWA").value;
    const info = document.getElementById("bagikanInfo");
    if (jumlah === 0) {
        info.textContent = "Belum ada penugasan (GT/PT/Inf) pada tanggal ini yang bisa dibagikan.";
        info.classList.add("peringatan");
    } else {
        info.textContent = `${jumlah} jam pelajaran, ${kelompok.length} guru tidak hadir · ${tanggalPanjang(state.tanggal)}` +
            (belum ? ` · ${belum} jam belum ditugaskan (tidak ikut dibagikan)` : "");
        info.classList.toggle("peringatan", belum > 0);
    }
    waCache.teks = buatTeks({ tanggal: state.tanggal, kelompok, catatan, namaSekolah: NAMA_SEKOLAH });

    const logo = await muatLogo();
    const off = gambarTabel({ tanggal: state.tanggal, kelompok, catatan, namaSekolah: NAMA_SEKOLAH, logo,
        createCanvas: (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; } });
    const view = document.getElementById("pratinjauCanvas");
    view.width = off.width; view.height = off.height;
    view.getContext("2d").drawImage(off, 0, 0);
    waCache.canvas = off;

    document.getElementById("bagikanCatatan").hidden = true;
}

async function unduhGambar() {
    const blob = await canvasKeBlob(waCache.canvas);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = namaBerkas(); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function catatanBagikan(teks) {
    const el = document.getElementById("bagikanCatatan");
    el.textContent = teks; el.hidden = false;
}

function namaBerkas() { return `jadwal-guru-pengganti-${state.tanggal}.png`; }

function canvasKeBlob(canvas) {
    return new Promise((res) => canvas.toBlob((b) => res(b), "image/png"));
}

function pasangBagikan() {
    const modal = document.getElementById("bagikanModal");
    document.getElementById("bagikanBtn").addEventListener("click", async () => {
        modal.hidden = false;
        await renderBagikan();
    });
    document.getElementById("bagikanTutup").addEventListener("click", () => (modal.hidden = true));
    let timer = null;
    document.getElementById("fCatatanWA").addEventListener("input", () => {
        clearTimeout(timer); timer = setTimeout(renderBagikan, 250);
    });
    document.getElementById("waSalinTeks").addEventListener("click", async (e) => {
        try { await navigator.clipboard.writeText(waCache.teks); e.target.textContent = "Teks tersalin ✓"; setTimeout(() => (e.target.textContent = "Salin teks"), 1800); }
        catch (err) { laporError("Gagal menyalin teks", err); }
    });
    document.getElementById("waBukaTeks").addEventListener("click", () => {
        window.open("https://wa.me/?text=" + encodeURIComponent(waCache.teks), "_blank");
    });
    document.getElementById("waUnduh").addEventListener("click", unduhGambar);
    document.getElementById("waBagikanGambar").addEventListener("click", async () => {
        try {
            const blob = await canvasKeBlob(waCache.canvas);
            const file = new File([blob], namaBerkas(), { type: "image/png" });
            const bisa = typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
            if (bisa) {
                await navigator.share({ files: [file], title: "Jadwal Guru Pengganti" });
            } else {
                await unduhGambar();
                catatanBagikan("Browser ini belum bisa membagikan gambar langsung, jadi gambarnya diunduh. Lampirkan file tersebut di grup WhatsApp (di HP, tombol ini biasanya langsung membuka WhatsApp).");
            }
        } catch (err) { if (err?.name !== "AbortError") laporError("Gagal membagikan gambar", err); }
    });
}

// ---------- Pasang kontrol statis, lalu muat data ----------
try {
    document.getElementById("modalCancel").addEventListener("click", closeModal);
    document.getElementById("penugasanForm").addEventListener("submit", savePenugasan);
    document.getElementById("fStatus").addEventListener("change", toggleGuruField);
    pasangBagikan();
} catch (err) {
    console.error("Ada elemen halaman yang tidak ditemukan — kemungkinan HTML dan JS beda versi. Lakukan hard refresh (Ctrl+Shift+R).", err);
}

boot().catch((err) => console.error("Gagal memuat data halaman:", err));
