import { supabaseClient, isSupabaseConfigured } from "../assets/supabase-client.js?v=20260914m";
import { demoData } from "../assets/demo-data.js?v=20260914m";
import { isUnlocked, initLockUI } from "../assets/auth-gate.js?v=20260914m";
import { urutkanKelas, indeksKelas } from "../assets/kelas-order.js?v=20260914m";

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
const urutanHari = (h) => HARI_LIST.indexOf(h);

function hariIni() {
    const h = HARI_FROM_JS_DAY[new Date().getDay()];
    return HARI_LIST.includes(h) ? h : "Senin"; // akhir pekan -> Senin
}

// ---------- State ----------
let state = {
    // Terhubung Supabase: hari ini. Mode pratinjau: Senin (data contoh hanya Senin).
    hari: isSupabaseConfigured ? hariIni() : "Senin",
    semua: [],   // seluruh jadwal seminggu
    guru: [],
    kelas: [],
    mapel: [],
    jam: [],
    filter: { q: "", guruId: null, mapelId: null, kelasId: "ALL" },
};

const modeCari = () => Boolean(state.filter.guruId || state.filter.mapelId);

// ---------- Boot ----------
async function boot() {
    document.getElementById("notice").hidden = isSupabaseConfigured;
    document.getElementById("addBtn").disabled = !isUnlocked();

    if (isSupabaseConfigured) {
        const [{ data: guru }, { data: kelas }, { data: mapel }, { data: jam }] =
            await Promise.all([
                supabaseClient.from("v_guru").select("id, nama, status_aktif").order("nama"),
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

    populateKelasFilter();
    populateModalSelects();
    renderDayTabs();
    await loadJadwal();
}

function populateKelasFilter() {
    const sel = document.getElementById("kelasFilter");
    sel.innerHTML =
        `<option value="ALL">Semua kelas</option>` +
        state.kelas.map((k) => `<option value="${k.id}">${k.nama_kelas}</option>`).join("");
    sel.addEventListener("change", (e) => {
        state.filter.kelasId = e.target.value;
        renderTable();
    });
}

function renderDayTabs() {
    const wrap = document.getElementById("dayTabs");
    wrap.classList.toggle("dimmed", modeCari());
    wrap.innerHTML = HARI_LIST.map(
        (h) => `<button data-hari="${h}" class="${h === state.hari && !modeCari() ? "active" : ""}">${h}</button>`
    ).join("");
    wrap.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", () => {
            state.hari = btn.dataset.hari;
            if (modeCari()) bersihkanCari(false);
            renderDayTabs();
            renderTable();
        });
    });
}

// ---------- Data loading (seluruh minggu, sekali) ----------
async function loadJadwal() {
    if (isSupabaseConfigured) {
        // Supabase membatasi 1.000 baris per permintaan, sedangkan jadwal seminggu
        // melebihi itu — jadi diambil bertahap sampai habis.
        const UKURAN = 1000;
        let semua = [], mulai = 0;
        for (;;) {
            const { data, error } = await supabaseClient
                .from("kg_jadwal_kbm")
                .select("id, hari, jam_ke, kelas_id, mapel_id, guru_id")
                .order("id")
                .range(mulai, mulai + UKURAN - 1);
            if (error) { laporError("Gagal memuat jadwal", error); return; }
            semua = semua.concat(data || []);
            if (!data || data.length < UKURAN) break;
            mulai += UKURAN;
        }
        state.semua = semua;
    } else {
        state.semua = demoData.jadwal;
    }
    renderTable();
}

// ---------- Lookups ----------

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

const namaGuru = (id) => state.guru.find((g) => g.id === id)?.nama || id;
const urutKelas = (id) => indeksKelas(state.kelas)(id);
const namaKelas = (id) => state.kelas.find((k) => k.id === id)?.nama_kelas || id;
const namaMapel = (id) => state.mapel.find((m) => m.id === id)?.nama_mapel || id;
const jamInfo = (jamKe) => state.jam.find((j) => j.jam_ke === Number(jamKe));

// ---------- Filter ----------
function filteredRows() {
    const f = state.filter;
    const q = f.q.trim().toLowerCase();
    return state.semua
        .filter((r) => {
            if (f.guruId) return r.guru_id === f.guruId;
            if (f.mapelId) return r.mapel_id === f.mapelId;
            if (r.hari !== state.hari) return false;
            if (q) {
                const cocok = namaGuru(r.guru_id).toLowerCase().includes(q) || namaMapel(r.mapel_id).toLowerCase().includes(q);
                if (!cocok) return false;
            }
            return true;
        })
        .filter((r) => f.kelasId === "ALL" || r.kelas_id === f.kelasId)
        .sort((a, b) => urutanHari(a.hari) - urutanHari(b.hari) || a.jam_ke - b.jam_ke || urutKelas(a.kelas_id) - urutKelas(b.kelas_id));
}

// ---------- Render table ----------
function renderBanner(rows) {
    const banner = document.getElementById("cariBanner");
    const f = state.filter;
    if (!modeCari()) {
        banner.hidden = true;
        document.getElementById("bannerNama").textContent = "";
        document.getElementById("bannerInfo").textContent = "";
        return;
    }
    const nama = f.guruId ? namaGuru(f.guruId) : namaMapel(f.mapelId);
    const semuaBaris = state.semua.filter((r) => (f.guruId ? r.guru_id === f.guruId : r.mapel_id === f.mapelId));
    const kelasSet = new Set(semuaBaris.map((r) => r.kelas_id));
    const hariSet = new Set(semuaBaris.map((r) => r.hari));
    document.getElementById("bannerNama").textContent = nama;
    document.getElementById("bannerInfo").textContent =
        `${semuaBaris.length} jam pelajaran per minggu · ${kelasSet.size} kelas · ${[...hariSet].sort((a, b) => urutanHari(a) - urutanHari(b)).join(", ")}` +
        (f.kelasId !== "ALL" ? ` · disaring kelas ${namaKelas(f.kelasId)}` : "");
    banner.hidden = false;
}

function renderTable() {
    document.getElementById("addBtn").disabled = !isUnlocked();

    const tbody = document.getElementById("jadwalBody");
    const empty = document.getElementById("emptyState");
    const rows = filteredRows();
    const lintasHari = modeCari();

    document.getElementById("thHari").hidden = !lintasHari;
    renderBanner(rows);
    document.getElementById("ringkasan").textContent = lintasHari
        ? `Menampilkan ${rows.length} jam pelajaran, semua hari`
        : `Menampilkan ${rows.length} jam pelajaran hari ${state.hari}`;

    if (rows.length === 0) {
        tbody.innerHTML = "";
        empty.hidden = false;
        return;
    }
    empty.hidden = true;

    const unlocked = isUnlocked();
    const disabledAttr = unlocked ? "" : "disabled";

    tbody.innerHTML = rows
        .map((r) => {
            const jam = jamInfo(r.jam_ke);
            const waktu = jam ? `${jam.mulai}–${jam.selesai}` : "";
            return `
        <tr>
          <td class="hari-cell" ${lintasHari ? "" : "hidden"}>${r.hari}</td>
          <td class="jam-cell">
            <span class="jam-ke">Jam ke-${r.jam_ke}</span>
            <span class="jam-waktu">${waktu}</span>
          </td>
          <td><span class="badge-kelas">${namaKelas(r.kelas_id)}</span></td>
          <td>${namaMapel(r.mapel_id)}</td>
          <td>${namaGuru(r.guru_id)}</td>
          <td>
            <div class="row-actions">
              <button class="btn-danger-text" ${disabledAttr} data-action="edit" data-id="${r.id}">Ubah</button>
              <button class="btn-danger-text" ${disabledAttr} data-action="delete" data-id="${r.id}">Hapus</button>
            </div>
          </td>
        </tr>`;
        })
        .join("");

    if (!unlocked) return;

    tbody.querySelectorAll('[data-action="edit"]').forEach((b) =>
        b.addEventListener("click", () => openModal(b.dataset.id))
    );
    tbody.querySelectorAll('[data-action="delete"]').forEach((b) =>
        b.addEventListener("click", () => openConfirmDelete(b.dataset.id))
    );
}

// ---------- Pencarian guru / mapel ----------
function sorot(teks, q) {
    const i = teks.toLowerCase().indexOf(q);
    if (i < 0) return teks;
    return `${teks.slice(0, i)}<mark>${teks.slice(i, i + q.length)}</mark>${teks.slice(i + q.length)}`;
}

function renderSaran() {
    const box = document.getElementById("cariSaran");
    const q = state.filter.q.trim().toLowerCase();
    if (!q || modeCari()) { box.hidden = true; return; }

    const jamGuru = new Map(), jamMapel = new Map();
    for (const r of state.semua) {
        jamGuru.set(r.guru_id, (jamGuru.get(r.guru_id) || 0) + 1);
        jamMapel.set(r.mapel_id, (jamMapel.get(r.mapel_id) || 0) + 1);
    }
    const guruHits = state.guru.filter((g) => g.nama.toLowerCase().includes(q) && jamGuru.has(g.id)).slice(0, 6);
    const mapelHits = state.mapel.filter((m) => m.nama_mapel.toLowerCase().includes(q) && jamMapel.has(m.id)).slice(0, 4);

    if (!guruHits.length && !mapelHits.length) {
        box.innerHTML = `<div class="suggest-empty">Tidak ada guru atau mata pelajaran yang cocok dengan "${state.filter.q}"</div>`;
    } else {
        box.innerHTML =
            guruHits.map((g) => `
              <button type="button" class="suggest-item" data-guru="${g.id}">
                <span class="suggest-nama">${sorot(g.nama, q)}</span>
                <span class="suggest-meta">Guru · ${jamGuru.get(g.id)} jam/minggu</span>
              </button>`).join("") +
            mapelHits.map((m) => `
              <button type="button" class="suggest-item" data-mapel="${m.id}">
                <span class="suggest-nama">${sorot(m.nama_mapel, q)}</span>
                <span class="suggest-meta">Mapel · ${jamMapel.get(m.id)} jam/minggu</span>
              </button>`).join("");
        box.querySelectorAll(".suggest-item").forEach((b) =>
            b.addEventListener("mousedown", (e) => {
                e.preventDefault();
                pilih(b.dataset.guru || null, b.dataset.mapel || null);
            })
        );
    }
    box.hidden = false;
}

function pilih(guruId, mapelId) {
    state.filter.guruId = guruId;
    state.filter.mapelId = mapelId;
    state.filter.q = guruId ? namaGuru(guruId) : namaMapel(mapelId);
    document.getElementById("cariJadwal").value = state.filter.q;
    document.getElementById("cariClear").hidden = false;
    document.getElementById("cariSaran").hidden = true;
    renderDayTabs();
    renderTable();
}

function bersihkanCari(render = true) {
    state.filter.guruId = null;
    state.filter.mapelId = null;
    state.filter.q = "";
    document.getElementById("cariJadwal").value = "";
    document.getElementById("cariClear").hidden = true;
    document.getElementById("cariSaran").hidden = true;
    if (render) { renderDayTabs(); renderTable(); }
}

function pasangPencarian() {
    const input = document.getElementById("cariJadwal");
    input.addEventListener("input", () => {
        state.filter.guruId = null;
        state.filter.mapelId = null;
        state.filter.q = input.value;
        document.getElementById("cariClear").hidden = !input.value;
        renderSaran();
        renderDayTabs();
        renderTable();
    });
    input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") bersihkanCari();
        if (e.key === "Enter") {
            const first = document.querySelector("#cariSaran .suggest-item");
            if (first) pilih(first.dataset.guru || null, first.dataset.mapel || null);
        }
    });
    input.addEventListener("focus", renderSaran);
    input.addEventListener("blur", () => setTimeout(() => (document.getElementById("cariSaran").hidden = true), 120));
    document.getElementById("cariClear").addEventListener("click", () => bersihkanCari());
}

// ---------- Modal: tambah / ubah ----------
function populateModalSelects() {
    document.getElementById("fHari").innerHTML = HARI_LIST.map((h) => `<option value="${h}">${h}</option>`).join("");
    document.getElementById("fJam").innerHTML = state.jam
        .map((j) => `<option value="${j.jam_ke}">Jam ke-${j.jam_ke} (${j.mulai}–${j.selesai})${j.keterangan ? " · " + j.keterangan : ""}</option>`)
        .join("");
    document.getElementById("fKelas").innerHTML = state.kelas.map((k) => `<option value="${k.id}">${k.nama_kelas}</option>`).join("");
    document.getElementById("fMapel").innerHTML = state.mapel.map((m) => `<option value="${m.id}">${m.nama_mapel}</option>`).join("");
    document.getElementById("fGuru").innerHTML = daftarGuruAktif().map((g) => `<option value="${g.id}">${g.nama}</option>`).join("");
}

let editingId = null;

function openModal(id) {
    editingId = id || null;
    const row = id ? state.semua.find((r) => r.id === id) : null;
    const f = state.filter;

    document.getElementById("modalTitle").textContent = id ? "Ubah Jadwal" : "Tambah Jadwal";
    document.getElementById("fHari").value = row ? row.hari : state.hari;
    document.getElementById("fJam").value = row ? row.jam_ke : state.jam[0]?.jam_ke;
    document.getElementById("fKelas").value = row ? row.kelas_id : (f.kelasId !== "ALL" ? f.kelasId : state.kelas[0]?.id);
    document.getElementById("fMapel").value = row ? row.mapel_id : (f.mapelId || state.mapel[0]?.id);
    document.getElementById("fGuru").value = row ? row.guru_id : (f.guruId || daftarGuruAktif()[0]?.id);

    document.getElementById("jadwalModal").hidden = false;
}

function closeModal() {
    document.getElementById("jadwalModal").hidden = true;
    editingId = null;
}

async function saveJadwal(e) {
    e.preventDefault();
    const payload = {
        hari: document.getElementById("fHari").value,
        jam_ke: Number(document.getElementById("fJam").value),
        kelas_id: document.getElementById("fKelas").value,
        mapel_id: document.getElementById("fMapel").value,
        guru_id: document.getElementById("fGuru").value,
    };

    if (isSupabaseConfigured) {
        const { error } = editingId
            ? await supabaseClient.from("kg_jadwal_kbm").update(payload).eq("id", editingId)
            : await supabaseClient.from("kg_jadwal_kbm").insert({ id: `J${Date.now()}`, ...payload });
        if (error) { laporError("Gagal menyimpan ke tabel kg_jadwal_kbm", error); return; }
    } else {
        if (editingId) {
            const idx = demoData.jadwal.findIndex((r) => r.id === editingId);
            if (idx > -1) demoData.jadwal[idx] = { id: editingId, ...payload };
        } else {
            demoData.jadwal.push({ id: `J${Date.now()}`, ...payload });
        }
    }

    closeModal();
    await loadJadwal();
}

// ---------- Hapus ----------
let deletingId = null;

function openConfirmDelete(id) {
    deletingId = id;
    document.getElementById("confirmModal").hidden = false;
}

function closeConfirmDelete() {
    deletingId = null;
    document.getElementById("confirmModal").hidden = true;
}

async function doDelete() {
    if (!deletingId) return;
    if (isSupabaseConfigured) {
        const { error } = await supabaseClient.from("kg_jadwal_kbm").delete().eq("id", deletingId);
        if (error) { laporError("Gagal menghapus dari tabel kg_jadwal_kbm", error); return; }
    } else {
        const idx = demoData.jadwal.findIndex((r) => r.id === deletingId);
        if (idx > -1) demoData.jadwal.splice(idx, 1);
    }
    closeConfirmDelete();
    await loadJadwal();
}

// ---------- Pasang kontrol statis, lalu muat data ----------
try {
    document.getElementById("addBtn").addEventListener("click", () => openModal(null));
    document.getElementById("modalCancel").addEventListener("click", closeModal);
    document.getElementById("jadwalForm").addEventListener("submit", saveJadwal);
    document.getElementById("confirmCancel").addEventListener("click", closeConfirmDelete);
    document.getElementById("confirmDelete").addEventListener("click", doDelete);
    pasangPencarian();
} catch (err) {
    console.error("Ada elemen halaman yang tidak ditemukan — kemungkinan HTML dan JS beda versi. Lakukan hard refresh (Ctrl+Shift+R).", err);
}

boot().catch((err) => console.error("Gagal memuat data halaman:", err));
