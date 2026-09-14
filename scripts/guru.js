import { supabaseClient, isSupabaseConfigured } from "../assets/supabase-client.js?v=20260914m";
import { isUnlocked, initLockUI } from "../assets/auth-gate.js?v=20260914m";

// Harus sama dengan fungsi tahun_ajaran_aktif() di database.
// Setiap pergantian tahun ajaran, ubah di dua tempat: di sini dan di SQL.
const TAHUN_AJARAN = "2026/2027";

// Tombol kunci dipasang paling pertama & terpisah, supaya tetap berfungsi
// walaupun ada bagian lain halaman yang gagal dimuat.
try {
    initLockUI(() => render());
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

// ---------- State ----------
let state = {
    guru: [],
    tugas: [],   // guru_tugas untuk TAHUN_AJARAN
    mapel: [],
    kelas: [],
    q: "",
    saring: "AKTIF",
};

// ---------- Bantu ----------
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function tglIndo(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    return `${Number(d)} ${bulan[Number(m) - 1]} ${y}`;
}

// Lima hal yang dipantau kelengkapannya.
const KOLOM_LENGKAP = [
    { kunci: "tmt_sekolah", label: "TMT" },
    { kunci: "nuptk", label: "NUPTK" },
    { kunci: "jenis_ptk", label: "Jenis PTK" },
    { kunci: "mapel_utama", label: "Mapel utama" },
    { kunci: "no_hp", label: "Kontak" },
];

const kosong = (v) => v === null || v === undefined || String(v).trim() === "";
const yangKurang = (g) => KOLOM_LENGKAP.filter((k) => kosong(g[k.kunci])).map((k) => k.label);

const waliDari = (guruId) =>
    state.tugas.find((t) => t.guru_id === guruId && t.jenis === "Wali Kelas" && t.aktif)?.rombel_ref || null;
const piketDari = (guruId) =>
    state.tugas.some((t) => t.guru_id === guruId && t.jenis === "Piket" && t.aktif);

function nigBerikut() {
    const angka = state.guru
        .map((g) => parseInt(String(g.nig ?? g.id).replace(/\D/g, ""), 10))
        .filter((n) => !Number.isNaN(n));
    return angka.length ? Math.max(...angka) + 1 : 1;
}

const idDariNig = (nig) => "G" + String(nig).replace(/\D/g, "").padStart(3, "0");

// ---------- Muat data ----------
async function muat() {
    const [{ data: guru, error: e1 }, { data: tugas, error: e2 }, { data: mapel }, { data: kelas }] =
        await Promise.all([
            supabaseClient.from("guru").select("id, nig, nama, nuptk, mapel_utama, jenis_ptk, status_aktif, tmt_sekolah, no_hp").order("nama"),
            supabaseClient.from("guru_tugas").select("id, guru_id, jenis, rombel_ref, aktif").eq("tahun_ajaran", TAHUN_AJARAN),
            supabaseClient.from("kg_mapel").select("id, nama_mapel").order("nama_mapel"),
            supabaseClient.from("kg_kelas").select("id, nama_kelas, tingkat").order("nama_kelas"),
        ]);

    if (e1) { laporError("Gagal memuat tabel guru", e1); return; }
    if (e2) { laporError("Gagal memuat tabel guru_tugas", e2); return; }

    state.guru = guru || [];
    state.tugas = tugas || [];
    state.mapel = mapel || [];
    state.kelas = kelas || [];

    isiPilihanMapel();
    isiPilihanKelas();
    render();
}

function isiPilihanMapel() {
    const sel = document.getElementById("fMapel");
    sel.innerHTML = `<option value="">— belum diisi —</option>` +
        state.mapel.map((m) => `<option value="${esc(m.nama_mapel)}">${esc(m.nama_mapel)}</option>`).join("");
}

function isiPilihanKelas() {
    const sel = document.getElementById("fWali");
    sel.innerHTML = `<option value="">— bukan wali kelas —</option>` +
        state.kelas.map((k) => `<option value="${esc(k.nama_kelas)}">${esc(k.nama_kelas)}</option>`).join("");
}

// ---------- Ringkasan kelengkapan ----------
function renderKelengkapan() {
    const aktif = state.guru.filter((g) => g.status_aktif === "Aktif");
    const total = aktif.length;
    const wrap = document.getElementById("lengkapWrap");

    wrap.innerHTML = KOLOM_LENGKAP.map((k) => {
        const terisi = aktif.filter((g) => !kosong(g[k.kunci])).length;
        const kelas = terisi === total && total > 0 ? "penuh" : terisi === 0 ? "kosong" : "";
        return `<span class="lengkap-chip ${kelas}">${esc(k.label)} <b>${terisi} / ${total}</b></span>`;
    }).join("");
}

// ---------- Tabel ----------
function terlihat() {
    const q = state.q.trim().toLowerCase();
    return state.guru.filter((g) => {
        if (state.saring === "AKTIF" && g.status_aktif !== "Aktif") return false;
        if (state.saring === "NONAKTIF" && g.status_aktif === "Aktif") return false;
        if (state.saring === "KURANG" && yangKurang(g).length === 0) return false;
        if (!q) return true;
        return [g.nig, g.id, g.nama, g.mapel_utama].some((v) => String(v ?? "").toLowerCase().includes(q));
    });
}

function render() {
    renderKelengkapan();

    const rows = terlihat();
    const buka = isUnlocked();
    document.getElementById("addBtn").disabled = !buka;

    document.getElementById("guruBody").innerHTML = rows.map((g) => {
        const kurang = yangKurang(g);
        const wali = waliDari(g.id);
        const piket = piketDari(g.id);
        const tugas = [
            wali ? `<span class="badge-kelas">${esc(wali)}</span>` : "",
            piket ? `<span class="badge-tugas badge-gt">Piket</span>` : "",
        ].filter(Boolean).join(" ") || `<span class="sel-kecil">—</span>`;

        return `<tr class="${g.status_aktif === "Aktif" ? "" : "baris-nonaktif"}">
            <td>${esc(g.nig ?? g.id)}</td>
            <td>
              ${esc(g.nama)}
              ${g.status_aktif !== "Aktif" ? `<span class="badge-nonaktif">${esc(g.status_aktif)}</span>` : ""}
              ${kurang.length ? `<div><span class="badge-kurang">Belum ada: ${esc(kurang.join(", "))}</span></div>` : ""}
            </td>
            <td>${g.mapel_utama ? esc(g.mapel_utama) : `<span class="sel-kecil">—</span>`}</td>
            <td>${g.jenis_ptk ? esc(g.jenis_ptk) : `<span class="sel-kecil">—</span>`}</td>
            <td>${tglIndo(g.tmt_sekolah)}</td>
            <td>${tugas}</td>
            <td class="row-actions">
              <button type="button" class="btn-danger-text" data-ubah="${esc(g.id)}" ${buka ? "" : "disabled"} style="color:var(--ink-muted)">Ubah</button>
              <button type="button" class="btn-danger-text" data-tugas="${esc(g.id)}" ${buka ? "" : "disabled"} style="color:var(--ink-muted)">Tugas</button>
            </td>
        </tr>`;
    }).join("");

    document.getElementById("emptyState").hidden = rows.length > 0;

    const aktif = state.guru.filter((g) => g.status_aktif === "Aktif").length;
    document.getElementById("ringkasan").textContent =
        `Menampilkan ${rows.length} dari ${state.guru.length} guru — ${aktif} aktif, ${state.guru.length - aktif} nonaktif.`;

    document.querySelectorAll("[data-ubah]").forEach((b) =>
        b.addEventListener("click", () => bukaModal(b.dataset.ubah)));
    document.querySelectorAll("[data-tugas]").forEach((b) =>
        b.addEventListener("click", () => bukaTugas(b.dataset.tugas)));
}

// ---------- Modal guru ----------
let editingId = null;

function bukaModal(id) {
    editingId = id;
    const g = id ? state.guru.find((x) => x.id === id) : null;

    document.getElementById("modalTitle").textContent = g ? "Ubah Guru" : "Tambah Guru";
    const fNig = document.getElementById("fNig");
    const fId = document.getElementById("fId");

    if (g) {
        fNig.value = g.nig ?? "";
        fId.value = g.id;
        fId.disabled = true;   // id sudah dirujuk data lain, jangan diubah dari sini
        fNig.disabled = true;
        document.getElementById("nigHint").textContent = "NIG dan ID tidak dapat diubah.";
    } else {
        const next = nigBerikut();
        fNig.value = next;
        fId.value = idDariNig(next);
        fId.disabled = false;
        fNig.disabled = false;
        document.getElementById("nigHint").textContent = `Usulan nomor berikutnya: ${next}`;
    }

    document.getElementById("fNama").value = g?.nama ?? "";
    document.getElementById("fTmt").value = g?.tmt_sekolah ?? "";
    document.getElementById("fMapel").value = g?.mapel_utama ?? "";
    document.getElementById("fJenisPtk").value = g?.jenis_ptk ?? "";
    document.getElementById("fNuptk").value = g?.nuptk ?? "";
    document.getElementById("fHp").value = g?.no_hp ?? "";
    document.getElementById("fStatus").value = g?.status_aktif ?? "Aktif";

    document.getElementById("guruModal").hidden = false;
}

function tutupModal() {
    document.getElementById("guruModal").hidden = true;
    editingId = null;
}

async function simpanGuru(e) {
    e.preventDefault();

    const nig = document.getElementById("fNig").value.trim();
    const bersih = (v) => (v.trim() === "" ? null : v.trim());

    const payload = {
        nama: document.getElementById("fNama").value.trim(),
        tmt_sekolah: document.getElementById("fTmt").value,
        mapel_utama: bersih(document.getElementById("fMapel").value),
        jenis_ptk: bersih(document.getElementById("fJenisPtk").value),
        nuptk: bersih(document.getElementById("fNuptk").value),
        no_hp: bersih(document.getElementById("fHp").value),
        status_aktif: document.getElementById("fStatus").value,
        diubah_pada: new Date().toISOString(),
    };

    let error;
    if (editingId) {
        ({ error } = await supabaseClient.from("guru").update(payload).eq("id", editingId));
    } else {
        const id = document.getElementById("fId").value.trim();
        if (state.guru.some((g) => g.id === id)) {
            laporError("ID guru sudah dipakai", { message: `${id} sudah terdaftar. Gunakan ID lain.` });
            return;
        }
        ({ error } = await supabaseClient.from("guru").insert({ id, nig, ...payload }));
    }

    if (error) { laporError("Gagal menyimpan data guru", error); return; }
    tutupModal();
    await muat();
}

// ---------- Modal tugas ----------
let tugasGuruId = null;

function bukaTugas(id) {
    tugasGuruId = id;
    const g = state.guru.find((x) => x.id === id);
    document.getElementById("tugasNama").textContent = `${g.nama} — Tahun Ajaran ${TAHUN_AJARAN}`;
    document.getElementById("fWali").value = waliDari(id) ?? "";
    document.getElementById("fPiket").checked = piketDari(id);
    document.getElementById("tugasModal").hidden = false;
}

function tutupTugas() {
    document.getElementById("tugasModal").hidden = true;
    tugasGuruId = null;
}

async function simpanTugas(e) {
    e.preventDefault();
    const id = tugasGuruId;
    const wali = document.getElementById("fWali").value;
    const piket = document.getElementById("fPiket").checked;

    // Wali kelas: hapus yang lama, pasang yang baru (satu guru satu kelas).
    const { error: eHapusWali } = await supabaseClient.from("guru_tugas")
        .delete().eq("guru_id", id).eq("tahun_ajaran", TAHUN_AJARAN).eq("jenis", "Wali Kelas");
    if (eHapusWali) { laporError("Gagal memperbarui wali kelas", eHapusWali); return; }

    if (wali) {
        const { error } = await supabaseClient.from("guru_tugas")
            .insert({ guru_id: id, tahun_ajaran: TAHUN_AJARAN, jenis: "Wali Kelas", rombel_ref: wali });
        if (error) {
            laporError("Gagal menyimpan wali kelas — kemungkinan kelas itu sudah punya wali lain", error);
            await muat();
            return;
        }
    }

    // Piket
    const { error: eHapusPiket } = await supabaseClient.from("guru_tugas")
        .delete().eq("guru_id", id).eq("tahun_ajaran", TAHUN_AJARAN).eq("jenis", "Piket");
    if (eHapusPiket) { laporError("Gagal memperbarui piket", eHapusPiket); return; }

    if (piket) {
        const { error } = await supabaseClient.from("guru_tugas")
            .insert({ guru_id: id, tahun_ajaran: TAHUN_AJARAN, jenis: "Piket", rombel_ref: "-" });
        if (error) { laporError("Gagal menyimpan piket", error); return; }
    }

    tutupTugas();
    await muat();
}

// ---------- Pencarian ----------
function pasangPencarian() {
    const input = document.getElementById("cariGuru");
    const clear = document.getElementById("cariClear");

    input.addEventListener("input", () => {
        state.q = input.value;
        clear.hidden = input.value === "";
        render();
    });
    clear.addEventListener("click", () => {
        input.value = "";
        state.q = "";
        clear.hidden = true;
        input.focus();
        render();
    });
    document.getElementById("saringFilter").addEventListener("change", (e) => {
        state.saring = e.target.value;
        render();
    });
}

// ---------- Pasang kontrol, lalu muat ----------
try {
    document.getElementById("addBtn").addEventListener("click", () => bukaModal(null));
    document.getElementById("modalCancel").addEventListener("click", tutupModal);
    document.getElementById("guruForm").addEventListener("submit", simpanGuru);
    document.getElementById("tugasCancel").addEventListener("click", tutupTugas);
    document.getElementById("tugasForm").addEventListener("submit", simpanTugas);
    document.getElementById("fNig").addEventListener("input", (e) => {
        if (!editingId) document.getElementById("fId").value = idDariNig(e.target.value);
    });
    pasangPencarian();
} catch (err) {
    console.error("Ada elemen halaman yang tidak ditemukan — kemungkinan HTML dan JS beda versi. Lakukan hard refresh (Ctrl+Shift+R).", err);
}

document.getElementById("notice").hidden = isSupabaseConfigured;
if (isSupabaseConfigured) {
    muat().catch((err) => laporError("Gagal memuat data halaman", err));
}
