import { supabaseClient, isSupabaseConfigured } from "../assets/supabase-client.js?v=20260920v";
import { demoData } from "../assets/demo-data.js?v=20260920v";
import { isUnlocked, initLockUI } from "../assets/auth-gate.js?v=20260920v";
import { terapkanUrutan } from "../assets/guru-order.js?v=20260920v";
import { urutkanKelas, indeksKelas, jenisKelas } from "../assets/kelas-order.js?v=20260920v";

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
    tampilan: bacaTampilan(),   // "daftar" atau "matriks"
    lingkup: "reguler",         // isi matriks harian: "reguler" | "md" | "tahsin"
};

const TEKS_KOSONG = 'Belum ada jadwal yang cocok. Klik "Tambah Jadwal" untuk menambahkan.';

// Kelompok belajar yang di matriks kelas reguler diringkas menjadi satu baris.
const KELOMPOK = {
    md: { judul: "Matematika Dasar", blok: "Kelompok MD" },
    tahsin: { judul: "Tahsin", blok: "Kelompok Tahsin" },
};

const modeCari = () => Boolean(state.filter.guruId || state.filter.mapelId);
const modeMatriks = () => state.tampilan === "matriks";
// Matriks mingguan (baris = hari) dipakai bila yang dilihat satu kelas, satu guru,
// atau satu mapel. Selain itu matriks harian (baris = kelas) untuk hari terpilih.
const matriksMingguan = () => modeMatriks() && (modeCari() || state.filter.kelasId !== "ALL");

// Pilihan tampilan diingat per browser — hanya kenyamanan, jadi aman bila gagal.
function bacaTampilan() {
    try { return localStorage.getItem("jadwal.tampilan") === "matriks" ? "matriks" : "daftar"; }
    catch { return "daftar"; }
}
function simpanTampilan(v) {
    try { localStorage.setItem("jadwal.tampilan", v); } catch { /* abaikan */ }
}

// ---------- Boot ----------
async function boot() {
    document.getElementById("notice").hidden = isSupabaseConfigured;
    document.getElementById("addBtn").disabled = !isUnlocked();

    if (isSupabaseConfigured) {
        const [{ data: guru }, { data: kelas }, { data: mapel }, { data: jam }] =
            await Promise.all([
                terapkanUrutan(supabaseClient.from("v_guru").select("id, nama, status_aktif, tmt_sekolah")),
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
        renderDayTabs();
        renderTable();
    });
}

function renderDayTabs() {
    const wrap = document.getElementById("dayTabs");
    wrap.classList.toggle("dimmed", modeCari() || matriksMingguan());
    wrap.innerHTML = HARI_LIST.map(
        (h) => `<button data-hari="${h}" class="${h === state.hari && !modeCari() ? "active" : ""}">${h}</button>`
    ).join("");
    wrap.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", () => {
            state.hari = btn.dataset.hari;
            if (modeCari()) bersihkanCari(false);
            // Matriks satu kelas: tab hari kembali ke matriks harian semua kelas.
            if (matriksMingguan()) {
                state.filter.kelasId = "ALL";
                document.getElementById("kelasFilter").value = "ALL";
            }
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

    const matriks = modeMatriks();
    document.getElementById("viewDaftar").hidden = matriks;
    document.getElementById("viewMatriks").hidden = !matriks;
    document.querySelectorAll("#viewToggle button").forEach((b) =>
        b.classList.toggle("active", b.dataset.view === state.tampilan)
    );
    renderLingkup();
    if (matriks) {
        renderBanner();
        renderMatriks();
        return;
    }
    document.getElementById("emptyState").textContent = TEKS_KOSONG;

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

// ---------- Render matriks ----------
// Pasangan [latar, aksen] lembut yang serasi dengan palet gading-emas halaman.
const WARNA_BLOK = [
    ["#F3E6C4", "#A87D1E"], ["#DCEBE3", "#3F7A5C"], ["#DDE7F1", "#3D6A93"],
    ["#F3DED7", "#A8432E"], ["#E9E0F0", "#71508F"], ["#DDEEEE", "#2F7C7C"],
    ["#F6E3CF", "#B0662A"], ["#F1DDE6", "#9A4468"], ["#E6E9D3", "#6C7430"],
    ["#D9E6EC", "#2E6477"], ["#EFE3D6", "#8A5A35"], ["#E4E1DA", "#6E6455"],
];
const warnaDari = (daftar, id) => {
    const i = daftar.findIndex((x) => x.id === id);
    return WARNA_BLOK[(i < 0 ? 0 : i) % WARNA_BLOK.length];
};

const jam5 = (t) => String(t || "").slice(0, 5);
const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// "Dra. Siti Aminah, M.Pd." -> "Siti Aminah" — sel matriks sempit, nama lengkap ada di tooltip.
function namaPendek(nama) {
    let n = String(nama).split(",")[0];
    n = n.replace(/^((dra?s?|dr|h|hj|ir|prof|kh|ust|ustadz|ustadzah)\.?\s+)+/i, "").trim();
    const kata = n.split(/\s+/);
    return kata.length > 2 ? kata.slice(0, 2).join(" ") : n;
}

// Jam pelajaran yang sedang berlangsung saat ini (untuk sorotan kolom), atau null.
function jamBerjalan() {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const j = state.jam.find((x) => jam5(x.mulai) <= hhmm && hhmm < jam5(x.selesai));
    return j ? { hari: HARI_FROM_JS_DAY[now.getDay()], jamKe: Number(j.jam_ke) } : null;
}

function renderMatriks() {
    const f = state.filter;
    const mingguan = matriksMingguan();
    const unlocked = isUnlocked();
    const q = modeCari() ? "" : f.q.trim().toLowerCase();

    const rows = state.semua.filter((r) => {
        if (f.guruId && r.guru_id !== f.guruId) return false;
        if (f.mapelId && r.mapel_id !== f.mapelId) return false;
        if (f.kelasId !== "ALL" && r.kelas_id !== f.kelasId) return false;
        return mingguan || r.hari === state.hari;
    });

    // Kolom = jam pelajaran; jeda antar-jam (istirahat) diberi kolom sela tipis.
    const jamList = state.jam.length
        ? state.jam
        : [...new Set(rows.map((r) => Number(r.jam_ke)))].sort((a, b) => a - b).map((jk) => ({ jam_ke: jk }));
    let kolom = [];
    jamList.forEach((j, i) => {
        const prev = jamList[i - 1];
        if (prev?.selesai && j.mulai && jam5(prev.selesai) !== jam5(j.mulai)) {
            kolom.push({ sela: true, dari: jam5(prev.selesai), sampai: jam5(j.mulai) });
        }
        kolom.push({ jam: j, jamKe: Number(j.jam_ke) });
    });

    // Baris = hari (mingguan), atau kelas/kelompok yang punya jadwal pada hari itu
    // (harian) — kelompok belajar yang libur hari itu tidak ikut memenuhi matriks.
    // Di matriks kelas reguler, semua kelompok MD dan Tahsin diringkas jadi satu
    // baris per program supaya matriks tidak memanjang ke bawah.
    const jenisMap = new Map(state.kelas.map((k) => [k.id, jenisKelas(k)]));
    const jenis = (id) => jenisMap.get(id) || "reguler";
    const lingkup = state.lingkup;
    const kelasTerpakai = new Set(rows.map((r) => r.kelas_id));
    // Nama kelompok Tahsin tanpa awalan "Tahsin · " — judul matriksnya sudah menyebutkan.
    const barisKelas = (k) => ({ kunci: k.id, hari: state.hari, kelasId: k.id,
        label: lingkup === "tahsin" && !mingguan ? k.nama_kelas.replace(/^tahsin\s*[·:-]\s*/i, "") : k.nama_kelas });
    let baris;
    if (mingguan) {
        baris = HARI_LIST.map((h) => ({ kunci: h, label: h, hari: h, kelasId: f.kelasId !== "ALL" ? f.kelasId : "" }));
    } else {
        baris = state.kelas.filter((k) => jenis(k.id) === lingkup && kelasTerpakai.has(k.id)).map(barisKelas);
        if (lingkup === "reguler") {
            for (const g of ["md", "tahsin"]) {
                if (rows.some((r) => jenis(r.kelas_id) === g)) {
                    baris.push({ kunci: `grup:${g}`, label: KELOMPOK[g].judul, hari: state.hari, kelasId: "", grup: g });
                }
            }
        }
    }

    const kunciBaris = (r) => {
        if (mingguan) return r.hari;
        const j = jenis(r.kelas_id);
        return lingkup === "reguler" && j !== "reguler" ? `grup:${j}` : r.kelas_id;
    };
    const isi = new Map();
    for (const r of rows) {
        const k = `${kunciBaris(r)}|${Number(r.jam_ke)}`;
        if (!isi.has(k)) isi.set(k, []);
        isi.get(k).push(r);
    }
    for (const daftar of isi.values()) daftar.sort((a, b) => urutKelas(a.kelas_id) - urutKelas(b.kelas_id));

    // Hanya jadwal yang tampil di matriks ini (matriks harian hanya satu jenis kelas).
    const rowsTampil = mingguan ? rows : rows.filter((r) => lingkup === "reguler" || jenis(r.kelas_id) === lingkup);

    // Matriks kelompok cukup menampilkan jam yang dipakai kelompok itu (mis. Tahsin
    // hanya jam ke-8) — kolom kosong dibuang supaya ringkas dan nama guru tampil utuh.
    const matriksKelompok = !mingguan && lingkup !== "reguler";
    if (matriksKelompok) {
        const jamDipakai = new Set(rowsTampil.map((r) => Number(r.jam_ke)));
        kolom = kolom.filter((c) => !c.sela && jamDipakai.has(c.jamKe));
    }

    // Keterangan sel ringkasan: jumlah kelompok, plus tingkat bila hanya satu (MD per tingkat).
    const tingkatDari = (id) => {
        const k = state.kelas.find((x) => x.id === id);
        return Number(k?.tingkat) || Number(((k?.nama_kelas || "").match(/(\d+)/) || [])[1]) || 0;
    };
    const ketRingkas = (g, daftar) => {
        const kelompok = new Set(daftar.map((r) => r.kelas_id));
        const tingkat = new Set([...kelompok].map(tingkatDari));
        const jml = `${kelompok.size} kelompok`;
        return g === "md" && tingkat.size === 1 && !tingkat.has(0) ? `Kelas ${[...tingkat][0]} · ${jml}` : jml;
    };

    // Isi blok menyesuaikan sudut pandang: yang sudah jelas dari judul tidak diulang.
    // Di matriks kelompok, mapelnya sudah pasti (MD/Tahsin) — gurunya yang ditonjolkan.
    const teksUtama = (r) => (f.guruId || f.mapelId ? namaKelas(r.kelas_id)
        : matriksKelompok ? namaPendek(namaGuru(r.guru_id)) : namaMapel(r.mapel_id));
    const teksKedua = (r) => (f.guruId || matriksKelompok ? namaMapel(r.mapel_id) : namaPendek(namaGuru(r.guru_id)));
    const warna = (r) => (f.mapelId ? warnaDari(state.guru, r.guru_id) : warnaDari(state.mapel, r.mapel_id));

    const sekarang = jamBerjalan();
    const html = [];

    html.push(`<thead><tr><th class="m-sudut">${mingguan ? "Hari" : matriksKelompok ? "Kelompok" : "Kelas"}</th>`);
    for (const c of kolom) {
        if (c.sela) {
            html.push(`<th class="m-sela" title="Istirahat ${c.dari}–${c.sampai}"></th>`);
            continue;
        }
        const aktif = sekarang && sekarang.jamKe === c.jamKe && (mingguan || sekarang.hari === state.hari);
        html.push(`<th class="m-jam${aktif ? " sekarang" : ""}">
            <span class="m-jam-ke">${c.jamKe}</span>
            ${c.jam.mulai ? `<span class="m-jam-waktu">${jam5(c.jam.mulai)}–${jam5(c.jam.selesai)}</span>` : ""}
            ${c.jam.keterangan ? `<span class="m-jam-ket">${c.jam.keterangan}</span>` : ""}
          </th>`);
    }
    html.push(`</tr></thead><tbody>`);

    for (const b of baris) {
        // Siapkan sel dulu, supaya jam berurutan dengan pelajaran & guru yang sama
        // bisa disambung menjadi satu blok panjang (tetap bisa diklik per jam).
        const sel = kolom.map((c) => {
            if (c.sela) return c;
            const daftar = isi.get(`${b.kunci}|${c.jamKe}`) || [];
            const r = daftar[0];
            if (b.grup) {
                const ket = daftar.length ? ketRingkas(b.grup, daftar) : "";
                return { ...c, daftar, ket, sambung: daftar.length ? `grup|${ket}` : null };
            }
            return { ...c, daftar, sambung: daftar.length === 1 ? `${r.mapel_id}|${r.guru_id}|${r.kelas_id}` : null };
        });
        sel.forEach((s, i) => {
            const prev = sel[i - 1];
            // hanya jam yang benar-benar berurutan (kolom bisa dibuang di matriks kelompok)
            if (s.sambung && prev && !prev.sela && prev.sambung === s.sambung && prev.jamKe === s.jamKe - 1) {
                s.dariKiri = true;
                prev.keKanan = true;
            }
        });
        // Panjang rangkaian (dalam jam) dihitung dari kanan — teks di blok awal
        // boleh melebar sepanjang rangkaian itu, jadi nama mapel tidak terpotong.
        for (let i = sel.length - 1; i >= 0; i--) {
            sel[i].rentang = sel[i].keKanan ? sel[i + 1].rentang + 1 : 1;
        }

        const jumlah = sel.reduce((n, s) => n + (s.daftar?.length || 0), 0);
        const barisAktif = mingguan && b.hari === state.hari && !modeCari();
        const sub = b.grup
            ? `${new Set(sel.flatMap((s) => (s.daftar || []).map((r) => r.kelas_id))).size} kelompok`
            : `${jumlah} JP`;
        html.push(`<tr class="${[barisAktif && "aktif", b.grup && "baris-grup"].filter(Boolean).join(" ")}"><th scope="row" class="m-label">
            <span>${b.label}</span><small>${sub}</small></th>`);

        for (const s of sel) {
            if (s.sela) { html.push(`<td class="m-sela"></td>`); continue; }
            const aktif = sekarang && sekarang.jamKe === s.jamKe && sekarang.hari === b.hari;
            const data = `data-hari="${b.hari}" data-jam="${s.jamKe}" data-kelas="${escAttr(b.kelasId)}"`;
            if (b.grup) {
                // Baris ringkasan: satu blok per jam, klik untuk membuka matriks kelompoknya.
                if (!s.daftar.length) { html.push(`<td class="m-sel${aktif ? " sekarang" : ""}"></td>`); continue; }
                const [bg, aksen] = warnaDari(state.mapel, s.daftar[0].mapel_id);
                const kelasBlok = ["m-blok", "m-ringkas", s.dariKiri && "dari-kiri", s.keKanan && "ke-kanan"].filter(Boolean).join(" ");
                html.push(`<td class="m-sel${aktif ? " sekarang" : ""}">
                  <div class="${kelasBlok}" data-lingkup="${b.grup}" style="--blok-bg:${bg};--blok-aksen:${aksen};--rentang:${s.rentang}"
                       title="${escAttr(`${KELOMPOK[b.grup].blok} · ${s.ket}\nKlik untuk membuka matriks ${KELOMPOK[b.grup].judul}`)}">
                    <span class="m-utama">${KELOMPOK[b.grup].blok}</span>
                    <span class="m-kedua">${s.ket}</span>
                  </div></td>`);
                continue;
            }
            if (!s.daftar.length) {
                html.push(`<td class="m-sel kosong${aktif ? " sekarang" : ""}" ${data}>${unlocked ? '<span class="m-tambah">+</span>' : ""}</td>`);
                continue;
            }
            const bentrok = f.guruId && new Set(s.daftar.map((r) => r.kelas_id)).size > 1;
            const jam = jamInfo(s.jamKe);
            html.push(`<td class="m-sel${aktif ? " sekarang" : ""}${bentrok ? " bentrok" : ""}" ${data}>`);
            if (s.daftar.length > 1) html.push(`<div class="m-tumpuk">`);
            for (const r of s.daftar) {
                const [bg, aksen] = warna(r);
                const redup = q && !namaGuru(r.guru_id).toLowerCase().includes(q) && !namaMapel(r.mapel_id).toLowerCase().includes(q);
                const judul = `${r.hari} · Jam ke-${s.jamKe}${jam ? ` (${jam5(jam.mulai)}–${jam5(jam.selesai)})` : ""}\n` +
                    `${namaKelas(r.kelas_id)} — ${namaMapel(r.mapel_id)}\n${namaGuru(r.guru_id)}`;
                // Beberapa guru dalam satu sel (beregu) ditumpuk ringkas satu baris,
                // supaya selnya tidak menjulang tinggi.
                const kelasBlok = ["m-blok", s.dariKiri && "dari-kiri", s.keKanan && "ke-kanan", redup && "redup",
                    s.daftar.length > 1 && "rapat"].filter(Boolean).join(" ");
                html.push(`<div class="${kelasBlok}" data-id="${escAttr(r.id)}" style="--blok-bg:${bg};--blok-aksen:${aksen};--rentang:${s.rentang}" title="${escAttr(judul)}">
                    <span class="m-utama">${teksUtama(r)}</span>
                    <span class="m-kedua">${teksKedua(r)}</span>
                  </div>`);
            }
            if (s.daftar.length > 1) html.push(`</div>`);
            html.push(`</td>`);
        }
        html.push(`</tr>`);
    }
    html.push(`</tbody>`);

    const table = document.getElementById("matriks");
    table.innerHTML = html.join("");
    table.classList.toggle("bisa-ubah", unlocked);
    table.classList.toggle("kelompok", matriksKelompok);
    const nSela = kolom.filter((c) => c.sela).length;
    table.style.minWidth = `${88 + (kolom.length - nSela) * 72 + nSela * 12}px`;

    const empty = document.getElementById("emptyState");
    empty.hidden = baris.length > 0;
    empty.textContent = matriksKelompok
        ? `Tidak ada jadwal kelompok ${KELOMPOK[lingkup].judul} pada hari ${state.hari}.`
        : TEKS_KOSONG;

    const jmlJam = mingguan ? rows.length : rows.filter((r) => jenis(r.kelas_id) === lingkup).length;
    const judul = f.guruId || f.mapelId
        ? "seminggu"
        : mingguan ? `seminggu kelas ${namaKelas(f.kelasId)}`
        : matriksKelompok ? `${KELOMPOK[lingkup].judul} hari ${state.hari} · ${baris.length} kelompok`
        : `hari ${state.hari} · ${baris.filter((b) => !b.grup).length} kelas`;
    document.getElementById("ringkasan").textContent =
        `Matriks ${judul} · ${jmlJam} jam pelajaran` +
        (unlocked ? " · klik blok untuk mengubah, klik sel kosong untuk menambah" : "");
}

function renderLingkup() {
    const wrap = document.getElementById("lingkupToggle");
    wrap.hidden = !modeMatriks();
    wrap.classList.toggle("dimmed", matriksMingguan());
    wrap.querySelectorAll("button").forEach((b) => {
        b.classList.toggle("active", !matriksMingguan() && b.dataset.lingkup === state.lingkup);
        // Titik warna mengikuti warna blok mapel kelompok itu di matriks.
        const titik = b.querySelector(".lingkup-titik");
        if (!titik) return;
        const kelasIni = new Set(state.kelas.filter((k) => jenisKelas(k) === b.dataset.lingkup).map((k) => k.id));
        const contoh = state.semua.find((r) => kelasIni.has(r.kelas_id));
        titik.hidden = !contoh;
        if (contoh) titik.style.setProperty("--titik", warnaDari(state.mapel, contoh.mapel_id)[1]);
    });
}

// Pindah ke matriks harian suatu lingkup — pencarian & saringan kelas dilepas,
// karena keduanya membuat matriks menjadi tampilan mingguan.
function pilihLingkup(lingkup) {
    state.lingkup = lingkup;
    if (modeCari()) bersihkanCari(false);
    state.filter.kelasId = "ALL";
    document.getElementById("kelasFilter").value = "ALL";
    renderDayTabs();
    renderTable();
    document.getElementById("viewMatriks").scrollTop = 0;
}

function pasangMatriks() {
    document.querySelectorAll("#viewToggle button").forEach((b) =>
        b.addEventListener("click", () => {
            state.tampilan = b.dataset.view;
            simpanTampilan(state.tampilan);
            renderDayTabs();
            renderTable();
        })
    );
    document.querySelectorAll("#lingkupToggle button").forEach((b) =>
        b.addEventListener("click", () => pilihLingkup(b.dataset.lingkup))
    );
    document.getElementById("matriks").addEventListener("click", (e) => {
        const ringkas = e.target.closest("[data-lingkup]");
        if (ringkas) { pilihLingkup(ringkas.dataset.lingkup); return; }
        if (!isUnlocked()) return;
        const blok = e.target.closest("[data-id]");
        if (blok) { openModal(blok.dataset.id); return; }
        const td = e.target.closest("td.kosong");
        if (td) openModal(null, { hari: td.dataset.hari, jam_ke: td.dataset.jam, kelas_id: td.dataset.kelas });
    });
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

// `isian` dipakai saat menambah dari sel kosong matriks: { hari, jam_ke, kelas_id }.
function openModal(id, isian = {}) {
    editingId = id || null;
    const row = id ? state.semua.find((r) => r.id === id) : null;
    const f = state.filter;

    document.getElementById("modalTitle").textContent = id ? "Ubah Jadwal" : "Tambah Jadwal";
    document.getElementById("fHari").value = row ? row.hari : (isian.hari || state.hari);
    document.getElementById("fJam").value = row ? row.jam_ke : (isian.jam_ke || state.jam[0]?.jam_ke);
    document.getElementById("fKelas").value = row ? row.kelas_id : (isian.kelas_id || (f.kelasId !== "ALL" ? f.kelasId : state.kelas[0]?.id));
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
    pasangMatriks();
} catch (err) {
    console.error("Ada elemen halaman yang tidak ditemukan — kemungkinan HTML dan JS beda versi. Lakukan hard refresh (Ctrl+Shift+R).", err);
}

boot().catch((err) => console.error("Gagal memuat data halaman:", err));
