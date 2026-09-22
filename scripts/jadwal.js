// =========================================================
// Jadwal Kegiatan Sekolah — halaman baca saja
// =========================================================
// Satu halaman untuk seluruh jadwal tetap sekolah, dari tiga sudut pandang:
//
//   Per guru   baris = hari, kolom = 12 jam pelajaran + satu kolom "Setelah
//              KBM". Mengajar, piket meja sekolah, dan piket unit ada di jam
//              pelajarannya; piket parkiran dan ekskul/pembinaan — yang
//              memang terjadi sesudah bel pulang dan satuannya bukan jam
//              pelajaran — ada di kolom terakhir. Inilah tab pertama: yang
//              paling sering ditanyakan adalah "hari ini saya ke mana".
//   Per kelas  baris = hari, kolom = jam pelajaran. Rombel dan kelompok
//              belajar (Tahsin, Matematika Dasar) sama-sama bisa dipilih.
//   Per hari   baris = kelas, kolom = jam pelajaran, untuk satu hari; kelompok
//              belajar diringkas satu baris per program, atau dibuka sendiri.
//
// Tata letak, kontrol, dan matriksnya meniru halaman Jadwal KBM di Data Induk
// — di sanalah jadwal disusun — dikurangi seluruh jalur ubah. Tidak ada tombol
// tambah, tidak ada gerbang PIN: satu tempat mengubah, banyak tempat membaca.
// Datanya seluruhnya rujukan dari assets/simpanan.js, jadi setiap klik
// seketika, seperti di Data Induk yang memegang datanya di memori.
//
// Warna blok: KBM per mata pelajaran (sama dengan Data Induk, supaya satu
// jadwal tidak berganti warna hanya karena dibuka dari aplikasi lain); piket
// dan ekskul memakai empat warna tetap yang tidak pernah dipakai mapel —
// sekali lihat terbaca mana mengajar, mana tugas lain.
// =========================================================

import { supabaseClient, isSupabaseConfigured } from "../assets/supabase-client.js?v=20260921v";
import { demoData, demoKegiatan } from "../assets/demo-data.js?v=20260921v";
import { urutkanKelas, indeksKelas, jenisKelas } from "../assets/kelas-order.js?v=20260921v";
import { muatRujukan } from "../assets/simpanan.js?v=20260921ad";
import { semesterSekarang, semesterBaris, LABEL_SEMESTER } from "../assets/semester.js?v=20260921ad";
import { bukuJadwal, unduhWorkbook, ambilLogoBase64 } from "../assets/excel-export.js?v=20260921ae";

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

const HARI_LIST = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const HARI_FROM_JS_DAY = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const hariNyata = () => HARI_FROM_JS_DAY[new Date().getDay()];

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const jam5 = (t) => String(t || "").slice(0, 5);
const urutNama = (a, b) => String(a).localeCompare(String(b), "id", { numeric: true });

// "Dra. Siti Aminah, M.Pd." -> "Siti Aminah" — sel matriks sempit, nama lengkap ada di tooltip.
function namaPendek(nama) {
    let n = String(nama || "").split(",")[0];
    n = n.replace(/^((dra?s?|dr|h|hj|ir|prof|kh|ust|ustadz|ustadzah)\.?\s+)+/i, "").trim();
    const kata = n.split(/\s+/);
    return kata.length > 2 ? kata.slice(0, 2).join(" ") : n;
}

/* Pasangan [latar, aksen] per mata pelajaran — palet yang sama persis dengan
   Data Induk. */
const WARNA_BLOK = [
    ["#F3E6C4", "#A87D1E"], ["#DCEBE3", "#3F7A5C"], ["#DDE7F1", "#3D6A93"],
    ["#F3DED7", "#A8432E"], ["#E9E0F0", "#71508F"], ["#DDEEEE", "#2F7C7C"],
    ["#F6E3CF", "#B0662A"], ["#F1DDE6", "#9A4468"], ["#E6E9D3", "#6C7430"],
    ["#D9E6EC", "#2E6477"], ["#EFE3D6", "#8A5A35"], ["#E4E1DA", "#6E6455"],
];
/* Empat warna tetap untuk yang bukan mengajar. Sengaja di luar palet mapel di
   atas supaya tidak pernah tertukar dengan mata pelajaran mana pun. */
const JENIS = {
    meja:     { label: "Piket meja sekolah", bg: "#D6E9DC", aksen: "#2E6B47" },
    unit:     { label: "Piket unit",         bg: "#D9E4F2", aksen: "#2B5A8C" },
    parkiran: { label: "Piket parkiran",     bg: "#F4DFC9", aksen: "#A5561C" },
    ekskul:   { label: "Ekskul & pembinaan", bg: "#E6DDF1", aksen: "#63417F" },
};

// ---------- State ----------
const state = {
    guru: [], kelas: [], mapel: [], jam: [], jadwalSemua: [],
    piket: [], piketUnit: [], guruUnit: [], parkiran: [], ekskul: [], pembina: [],
    tahunAjaran: "", profil: null,
    // tampilan
    sudut: "guru",                 // "guru" | "kelas" | "hari"
    pilihGuru: null, pilihKelas: null,
    hari: null, lingkup: "reguler", semester: null,
};
const PROFIL_BAWAAN = {
    nama_sekolah: 'SMA Plus "Merdeka" Soreang',
    alamat_sekolah: "Jl. Citaliktik-Sindang Wargi Soreang Kab. Bandung",
    tahun_ajaran: "2026/2027", tempat: "Soreang", kepala_sekolah: "", kurikulum: "",
};

// Pilihan diingat per browser — kenyamanan, jadi kegagalannya diabaikan.
const ingat = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* abaikan */ } };
const ingatan = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

// ---------- Lookups ----------
const guruAktif = (g) => {
    const v = g?.status_aktif;
    if (v === undefined || v === null) return true;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
    return /^(aktif|active|y|ya|true|1)$/i.test(String(v).trim());
};
const namaGuru = (id) => state.guru.find((g) => g.id === id)?.nama || id;
const namaMapel = (id) => state.mapel.find((m) => m.id === id)?.nama_mapel || id;
const namaKelas = (id) => state.kelasMap?.get(id)?.nama_kelas || id;
const jamInfo = (jk) => state.jam.find((j) => Number(j.jam_ke) === Number(jk));
const warnaMapel = (mapelId) => {
    const i = state.mapel.findIndex((m) => m.id === mapelId);
    return WARNA_BLOK[(i < 0 ? 0 : i) % WARNA_BLOK.length];
};
const warnaProgram = (nama) => {
    const m = state.mapel.find((x) => x.nama_mapel === nama);
    return m ? warnaMapel(m.id) : WARNA_BLOK[0];
};

/* Kelas dibaca dari kg_kelas beserta jenisnya (Rombel/Kelompok) dan, untuk
   kelompok belajar, mata pelajaran programnya — persis yang dipakai Data
   Induk. Bila kolom itu kosong (data lama), tebakan dari nama tetap dipakai
   supaya halaman tidak bisu. */
function susunKelas() {
    state.kelas = urutkanKelas(state.kelas);
    state.kelasMap = new Map();
    for (const k of state.kelas) {
        const tebak = jenisKelas(k);
        const kelompok = k.jenis ? k.jenis === "Kelompok" : tebak !== "reguler";
        const program = !kelompok ? null
            : k.mapel_id ? namaMapel(k.mapel_id)
            : tebak === "md" ? "Matematika Dasar" : "Tahsin";
        const tingkat = Number(k.tingkat) || Number(((k.nama_kelas || "").match(/^(?:MD)?\s*(\d{2})/i) || [])[1]) || 0;
        state.kelasMap.set(k.id, { ...k, kelompok, program, tingkat });
    }
    state.urutKelas = indeksKelas(state.kelas);
}
const infoKelas = (id) => state.kelasMap.get(id) || { id, nama_kelas: id, kelompok: false, program: null, tingkat: 0 };

// Jam pelajaran yang sedang berlangsung saat ini (untuk sorotan kolom), atau null.
function jamBerjalan() {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const j = state.jam.find((x) => jam5(x.mulai) <= hhmm && hhmm < jam5(x.selesai));
    return j ? Number(j.jam_ke) : null;
}

// Ekskul yang dibina seorang guru: tautannya ae_pembina.id_guru. Pelatih dari
// luar sekolah tidak punya id_guru, jadi memang tidak muncul di sini.
function ekskulGuru(guruId) {
    const idPembina = new Set(state.pembina.filter((p) => p.id_guru === guruId).map((p) => p.id));
    if (!idPembina.size) return [];
    return state.ekskul.filter((e) => idPembina.has(e.pembina_id));
}
const waktuEkskul = (e) => (e.jam_mulai ? `${jam5(e.jam_mulai)}–${jam5(e.jam_selesai)}` : "jam belum diisi");

// =========================================================
// Boot
// =========================================================
const RUJUKAN = ["guru", "kelas", "mapel", "jam", "jadwal",
    "piketMeja", "piketUnit", "guruUnit", "parkiran", "ekskul", "pembina", "profil", "tahunAjaran"];

async function boot() {
    document.getElementById("notice").hidden = isSupabaseConfigured;
    bacaPilihanAwal();
    document.getElementById("isi").addEventListener("click", saatKlik);
    document.getElementById("isi").addEventListener("change", saatUbah);

    if (!isSupabaseConfigured) { muatDemo(); render(); return; }

    let rujukan;
    try {
        rujukan = await muatRujukan(supabaseClient, RUJUKAN, (r) => { terapkanRujukan(r); render(); });
    } catch (err) {
        laporError("Data jadwal gagal dimuat", err);
        return;
    }
    terapkanRujukan(rujukan);
    render();
}

function terapkanRujukan(r) {
    state.guru = r.guru;
    state.mapel = r.mapel;
    state.kelas = r.kelas;
    state.jam = [...r.jam].sort((a, b) => Number(a.jam_ke) - Number(b.jam_ke));
    state.jadwalSemua = r.jadwal;
    state.piket = r.piketMeja;
    state.piketUnit = r.piketUnit;
    state.guruUnit = r.guruUnit;
    state.parkiran = r.parkiran;
    state.ekskul = r.ekskul.filter((e) => e.aktif !== false);
    state.pembina = r.pembina;
    state.tahunAjaran = (r.tahunAjaran[0] || {}).kode || PROFIL_BAWAAN.tahun_ajaran;
    susunProfil(r.profil[0]);
    susunKelas();
}

function susunProfil(d) {
    state.profil = { ...PROFIL_BAWAAN, tahun_ajaran: state.tahunAjaran };
    if (!d) return;
    state.profil = {
        nama_sekolah: d.nama_sekolah || PROFIL_BAWAAN.nama_sekolah,
        alamat_sekolah: d.alamat || "",
        tempat: d.kota || PROFIL_BAWAAN.tempat,
        kepala_sekolah: d.kepala_sekolah || "",
        kurikulum: d.kurikulum || "",
        tahun_ajaran: state.tahunAjaran,
        profil: d,
    };
}

function muatDemo() {
    state.guru = demoData.guru;
    state.mapel = demoData.mapel;
    state.kelas = demoData.kelas;
    state.jam = demoData.jam;
    state.jadwalSemua = demoData.jadwal;
    state.piket = demoData.piket;
    state.piketUnit = demoKegiatan.piketUnit;
    state.guruUnit = demoKegiatan.guruUnit;
    state.parkiran = demoKegiatan.parkiran;
    state.ekskul = demoKegiatan.ekskul;
    state.pembina = demoKegiatan.pembina;
    state.tahunAjaran = PROFIL_BAWAAN.tahun_ajaran;
    state.profil = { ...PROFIL_BAWAAN, kepala_sekolah: "Mohamad Gunawan, S.Si.", kurikulum: "Yuyun Wahyuni, S.Pd." };
    susunKelas();
}

/* Pilihan awal: parameter URL menang (tautan dari Beranda dan WhatsApp),
   lalu ingatan browser, lalu bawaan. ?guru= lama dari halaman Kegiatan tetap
   dihormati. */
function bacaPilihanAwal() {
    const url = new URLSearchParams(location.search);
    state.sudut = ["guru", "kelas", "hari"].includes(url.get("sudut")) ? url.get("sudut")
        : url.get("kelas") ? "kelas"
        : url.get("guru") ? "guru"
        : ["guru", "kelas", "hari"].includes(ingatan("jadwal.sudut")) ? ingatan("jadwal.sudut") : "guru";
    state.pilihGuru = url.get("guru") || ingatan("jadwal.guru") || ingatan("kegiatan.guru") || null;
    state.pilihKelas = url.get("kelas") || ingatan("jadwal.kelas") || null;
    state.hari = url.get("hari") || null;
    // Semester tidak diingat antar kunjungan: bawaannya semester yang sedang
    // berjalan menurut tanggal, supaya pergantian semester terjadi sendiri.
    state.semester = Number(url.get("semester")) || null;
}

function simpanPilihan() {
    ingat("jadwal.sudut", state.sudut);
    ingat("jadwal.guru", state.pilihGuru);
    ingat("jadwal.kelas", state.pilihKelas);
    // URL ikut pilihan, supaya alamat yang disalin membuka tampilan yang sama.
    const u = new URLSearchParams();
    u.set("sudut", state.sudut);
    if (state.sudut === "guru" && state.pilihGuru) u.set("guru", state.pilihGuru);
    if (state.sudut === "kelas" && state.pilihKelas) u.set("kelas", state.pilihKelas);
    if (state.sudut === "hari" && state.hari) u.set("hari", state.hari);
    if (state.semester !== semesterSekarang()) u.set("semester", state.semester);
    try { history.replaceState(null, "", `${location.pathname}?${u}`); } catch { /* abaikan */ }
}

// =========================================================
// Menyusun matriks
// =========================================================
function semesterAda() {
    return [...new Set(state.jadwalSemua.map(semesterBaris))].sort((a, b) => a - b);
}

/* Kolom = jam pelajaran; jeda istirahat diberi kolom sela tipis. */
function susunKolom() {
    const kolom = [];
    state.jam.forEach((j, i) => {
        const prev = state.jam[i - 1];
        if (prev?.selesai && j.mulai && jam5(prev.selesai) !== jam5(j.mulai)) {
            kolom.push({ sela: true, dari: jam5(prev.selesai), sampai: jam5(j.mulai) });
        }
        kolom.push({ jam: j, jamKe: Number(j.jam_ke) });
    });
    return kolom;
}

/* Kegiatan seorang guru dalam sepekan: yang bersatuan jam pelajaran (KBM,
   piket meja, piket unit) dan yang sesudah bel pulang (parkiran, ekskul). */
function kegiatanGuru(guruId, jadwalSmt) {
    const perJam = [];
    const setelah = [];
    for (const r of jadwalSmt) {
        if (r.guru_id !== guruId) continue;
        const [bg, aksen] = warnaMapel(r.mapel_id);
        perJam.push({ jenis: "kbm", hari: r.hari, jamKe: Number(r.jam_ke), id: r.id, kelasId: r.kelas_id, guruId,
            utama: namaKelas(r.kelas_id), kedua: namaMapel(r.mapel_id), bg, aksen,
            tempat: r.kelas_id, kunci: `kbm|${r.kelas_id}|${r.mapel_id}`,
            judul: `${namaKelas(r.kelas_id)} — ${namaMapel(r.mapel_id)}` });
    }
    for (const p of state.piket) {
        if (p.guru_id !== guruId) continue;
        perJam.push({ jenis: "meja", hari: p.hari, jamKe: Number(p.jam_ke), utama: "Piket Meja", kedua: "Sekolah",
            bg: JENIS.meja.bg, aksen: JENIS.meja.aksen, tempat: "meja", kunci: "meja", judul: JENIS.meja.label });
    }
    for (const u of state.piketUnit) {
        if (u.guru_id !== guruId) continue;
        perJam.push({ jenis: "unit", hari: u.hari, jamKe: Number(u.jam_ke), utama: "Piket Unit", kedua: u.unit || "",
            bg: JENIS.unit.bg, aksen: JENIS.unit.aksen, tempat: `unit|${u.tugas_id}`, kunci: `unit|${u.tugas_id}`,
            judul: `${JENIS.unit.label} — ${u.unit || ""}` });
    }
    for (const p of state.parkiran) {
        if (p.guru_id !== guruId) continue;
        setelah.push({ jenis: "parkiran", hari: p.hari, utama: "Piket Parkiran", kedua: "sesudah bel",
            judul: p.catatan || "Menjaga tempat parkir ±30 menit sesudah bel pulang." });
    }
    for (const e of ekskulGuru(guruId)) {
        setelah.push({ jenis: "ekskul", hari: e.hari, utama: e.nama, kedua: waktuEkskul(e),
            judul: [e.kategori || "Ekstrakurikuler", e.tempat].filter(Boolean).join(" · ") });
    }
    return { perJam, setelah };
}

/* Jam kelompok belajar per tingkat: pada baris rombel, jam itu bukan milik
   rombel — tiap siswa berangkat ke kelompoknya. Ditampilkan sebagai sel
   bergaris berisi nama programnya. Tingkat 0 berarti berlaku semua tingkat. */
function petaJamKelompok(jadwalSmt) {
    const peta = new Map();
    for (const j of jadwalSmt) {
        const k = infoKelas(j.kelas_id);
        if (!k.kelompok) continue;
        const kunci = `${k.tingkat}|${j.hari}|${Number(j.jam_ke)}`;
        if (!peta.has(kunci)) peta.set(kunci, new Set());
        peta.get(kunci).add(k.program || "Kelompok");
    }
    return (tingkat, hari, jk) => {
        const v = new Set([...(peta.get(`0|${hari}|${jk}`) || []), ...(peta.get(`${tingkat}|${hari}|${jk}`) || [])]);
        return v.size ? [...v].sort(urutNama) : null;
    };
}

// =========================================================
// Render
// =========================================================
function render() {
    const smtAda = semesterAda();
    if (![1, 2].includes(state.semester)) state.semester = semesterSekarang();
    const smt = state.semester;
    const jadwalSmt = state.jadwalSemua.filter((j) => semesterBaris(j) === smt);
    const hariAda = HARI_LIST.filter((h) => h !== "Sabtu" || jadwalSmt.some((j) => j.hari === "Sabtu"));
    const hariSkr = hariNyata();
    const sekarang = jamBerjalan();
    const sudut = state.sudut;

    // ---- daftar pilihan & pilihan aktif
    const daftarGuru = state.guru.filter(guruAktif).map((g) => ({ id: g.id, nama: g.nama }));
    const daftarKelas = state.kelas.map((k) => ({ id: k.id, nama: k.nama_kelas, kelompok: infoKelas(k.id).kelompok }))
        .sort((a, b) => (a.kelompok === b.kelompok ? 0 : a.kelompok ? 1 : -1) || state.urutKelas(a.id) - state.urutKelas(b.id));
    const daftar = sudut === "guru" ? daftarGuru : sudut === "kelas" ? daftarKelas : [];
    if (sudut === "guru" && !daftar.some((d) => d.id === state.pilihGuru)) state.pilihGuru = daftar[0]?.id || null;
    if (sudut === "kelas" && !daftar.some((d) => d.id === state.pilihKelas)) state.pilihKelas = daftar[0]?.id || null;
    const pilihId = sudut === "guru" ? state.pilihGuru : state.pilihKelas;
    const iPilih = daftar.findIndex((d) => d.id === pilihId);
    const pilih = daftar[iPilih] || null;
    if (!hariAda.includes(state.hari)) state.hari = hariAda.includes(hariSkr) ? hariSkr : hariAda[0];
    const hariPilih = state.hari;

    // Program kelompok belajar yang ada, dari kelas berjenis kelompok.
    const program = [...new Set(state.kelas.map((k) => infoKelas(k.id)).filter((k) => k.kelompok && k.program).map((k) => k.program))].sort(urutNama);
    const lingkup = program.includes(state.lingkup) ? state.lingkup : "reguler";
    const matriksProgram = sudut === "hari" && lingkup !== "reguler";
    const jamKelompok = petaJamKelompok(jadwalSmt);

    const kolom = susunKolom();
    const kegiatan = sudut === "guru" && pilih ? kegiatanGuru(pilih.id, jadwalSmt) : { perJam: [], setelah: [] };

    // Isi blok menyesuaikan sudut pandang: yang sudah jelas dari judul tidak diulang.
    const blokKbm = (j) => {
        const [bg, aksen] = warnaMapel(j.mapel_id);
        const utama = matriksProgram ? namaPendek(namaGuru(j.guru_id)) : namaMapel(j.mapel_id);
        const kedua = matriksProgram ? namaMapel(j.mapel_id) : namaPendek(namaGuru(j.guru_id));
        return { jenis: "kbm", id: j.id, kelasId: j.kelas_id, guruId: j.guru_id, utama, kedua, bg, aksen,
            tempat: j.kelas_id, kunci: `${j.mapel_id}|${j.guru_id}|${j.kelas_id}`,
            judul: `${namaKelas(j.kelas_id)} — ${namaMapel(j.mapel_id)}\n${namaGuru(j.guru_id)}` };
    };
    const ketRingkas = (isi) => {
        const kel = new Set(isi.map((j) => j.kelas_id));
        const tk = new Set(isi.map((j) => infoKelas(j.kelas_id).tingkat));
        return (tk.size === 1 && !tk.has(0) ? `Kelas ${[...tk][0]} · ` : "") + `${kel.size} kelompok`;
    };

    // ---- baris & isi per (baris, jam)
    let baris, isiDari;
    if (sudut === "guru") {
        baris = hariAda.map((h) => {
            const jp = kegiatan.perJam.filter((k) => k.hari === h);
            const kbm = jp.filter((k) => k.jenis === "kbm").length, lain = jp.length - kbm;
            const st = kegiatan.setelah.filter((s) => s.hari === h).length;
            const sub = [kbm ? `${kbm} JP` : "", lain ? `${lain} jam piket` : "", st ? `${st} setelah KBM` : ""].filter(Boolean).join(" · ") || "—";
            return { kunci: h, label: h, hari: h, aktif: h === hariSkr, sub };
        });
        isiDari = (b, jk) => ({ daftar: kegiatan.perJam.filter((k) => k.hari === b.hari && k.jamKe === jk) });
    } else if (sudut === "kelas") {
        const milik = pilih ? jadwalSmt.filter((j) => j.kelas_id === pilih.id) : [];
        const info = pilih ? infoKelas(pilih.id) : null;
        baris = hariAda.map((h) => ({ kunci: h, label: h, hari: h, kelasId: pilih?.id, aktif: h === hariSkr,
            sub: `${milik.filter((j) => j.hari === h).length} JP` }));
        isiDari = (b, jk) => {
            const prog = info && !info.kelompok ? jamKelompok(info.tingkat, b.hari, jk) : null;
            if (prog) return { kunci: prog };
            return { daftar: milik.filter((j) => j.hari === b.hari && Number(j.jam_ke) === jk).map(blokKbm) };
        };
    } else {
        const hariIni = jadwalSmt.filter((j) => j.hari === hariPilih);
        if (lingkup === "reguler") {
            baris = state.kelas.filter((k) => !infoKelas(k.id).kelompok).map((k) => ({
                kunci: k.id, label: k.nama_kelas, hari: hariPilih, kelasId: k.id, tingkat: infoKelas(k.id).tingkat,
                sub: `${hariIni.filter((j) => j.kelas_id === k.id).length} JP` }));
            for (const p of program) {
                const isi = hariIni.filter((j) => infoKelas(j.kelas_id).program === p);
                if (isi.length) baris.push({ kunci: `grup:${p}`, label: p, hari: hariPilih, grup: p,
                    sub: `${new Set(isi.map((j) => j.kelas_id)).size} kelompok` });
            }
        } else {
            const awalan = new RegExp("^" + lingkup.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[·:-]\\s*", "i");
            baris = state.kelas.filter((k) => infoKelas(k.id).program === lingkup).map((k) => ({
                kunci: k.id, hari: hariPilih, kelasId: k.id, label: k.nama_kelas.replace(awalan, ""),
                sub: `${hariIni.filter((j) => j.kelas_id === k.id).length} JP` }));
        }
        isiDari = (b, jk) => {
            if (b.grup) return { ringkas: hariIni.filter((j) => Number(j.jam_ke) === jk && infoKelas(j.kelas_id).program === b.grup) };
            const prog = lingkup === "reguler" ? jamKelompok(b.tingkat, b.hari, jk) : null;
            if (prog) return { kunci: prog };
            return { daftar: hariIni.filter((j) => j.kelas_id === b.kelasId && Number(j.jam_ke) === jk).map(blokKbm) };
        };
    }

    // ---- susun sel tiap baris, lalu sambungkan jam berurutan yang sama
    const barisHtml = baris.map((b) => {
        const sel = kolom.map((c) => {
            if (c.sela) return c;
            const s = { ...c, ...isiDari(b, c.jamKe) };
            if (s.ringkas) s.sambung = s.ringkas.length ? `grup|${ketRingkas(s.ringkas)}` : null;
            else if (s.kunci) s.sambung = `kunci|${s.kunci.join()}`;
            else s.sambung = s.daftar.length === 1 ? s.daftar[0].kunci : null;
            return s;
        });
        sel.forEach((s, i) => {
            const p = sel[i - 1];
            if (s.sambung && p && !p.sela && p.sambung === s.sambung) { s.kiri = true; p.kanan = true; }
        });
        for (let i = sel.length - 1; i >= 0; i--) sel[i].rentang = sel[i].kanan ? sel[i + 1].rentang + 1 : 1;

        const selHtml = sel.map((s) => {
            if (s.sela) return `<td class="m-sela"></td>`;
            const skr = b.hari === hariSkr && sekarang === s.jamKe ? " sekarang" : "";
            const sambung = (s.kiri ? " dari-kiri" : "") + (s.kanan ? " ke-kanan" : "");
            // Blok awal rangkaian jam berturut-turut menyebut panjangnya, supaya
            // satu blok panjang tidak terbaca sebagai satu jam.
            const jam = !s.kiri && s.rentang > 1 ? `<small class="jam">${s.rentang} jam</small>` : "";
            const gaya = (bg, aksen) => `style="--blok-bg:${bg};--blok-aksen:${aksen};--rentang:${s.rentang}"`;
            if (s.ringkas) {
                if (!s.ringkas.length) return `<td class="m-sel${skr}"></td>`;
                const ket = ketRingkas(s.ringkas);
                const [bg, aksen] = warnaProgram(b.grup);
                return `<td class="m-sel${skr}"><div class="m-blok m-ringkas${sambung}" data-lingkup="${escAttr(b.grup)}" ${gaya(bg, aksen)}
                    title="${escAttr(`Kelompok ${b.grup} · ${ket}\nKlik untuk membuka matriks ${b.grup}`)}">
                    <span class="m-utama">Kelompok ${esc(b.grup)}</span><span class="m-kedua">${esc(ket)}${jam}</span></div></td>`;
            }
            if (s.kunci) return `<td class="m-sel${skr}"><div class="m-blok kunci${sambung}" style="--rentang:${s.rentang}"
                    title="${escAttr(`${s.kunci.join(" · ")} — siswa berangkat ke kelompoknya masing-masing.\nDisusun dari jadwal kelompoknya.`)}">
                    <span class="m-utama">${esc(s.kunci.join(" · "))}</span><span class="m-kedua">jam kelompok${jam}</span></div></td>`;
            if (!s.daftar.length) return `<td class="m-sel kosong${skr}"></td>`;
            const bentrok = sudut === "guru" && new Set(s.daftar.map((k) => k.tempat)).size > 1;
            const banyak = s.daftar.length > 1;
            const jp = jamInfo(s.jamKe);
            const blok = s.daftar.map((k) => {
                const judul = `${b.hari} · Jam ke-${s.jamKe}${jp ? ` (${jam5(jp.mulai)}–${jam5(jp.selesai)})` : ""}\n${k.judul}`
                    + (k.jenis === "kbm" ? (sudut === "guru" ? "\nKlik untuk membuka jadwal kelasnya" : "\nKlik untuk membuka jadwal gurunya") : "");
                const data = k.jenis === "kbm" ? `data-kelas="${escAttr(k.kelasId)}" data-guru="${escAttr(k.guruId)}"` : "";
                return `<div class="m-blok${sambung}${banyak ? " rapat" : ""}${k.jenis === "kbm" ? " bisa-lompat" : ""}" ${data} ${gaya(k.bg, k.aksen)} title="${escAttr(judul)}">
                    <span class="m-utama">${esc(k.utama)}</span><span class="m-kedua">${esc(k.kedua)}${jam}</span></div>`;
            }).join("");
            return `<td class="m-sel${skr}${bentrok ? " bentrok" : ""}">${banyak ? `<div class="m-tumpuk">${blok}</div>` : blok}</td>`;
        }).join("");

        // Kolom "Setelah KBM" hanya pada tampilan per guru; isinya tidak pernah
        // disambung ke kiri karena memang bukan kelanjutan jam pelajaran.
        let akhir = "";
        if (sudut === "guru") {
            const st = kegiatan.setelah.filter((s) => s.hari === b.hari);
            akhir = `<td class="m-sel kg-sel-setelah${st.length ? "" : " kosong"}">` + (st.length ? st.map((s) => {
                const j = JENIS[s.jenis];
                return `<div class="m-blok kg-blok-setelah" style="--blok-bg:${j.bg};--blok-aksen:${j.aksen}" title="${escAttr(`${b.hari} · ${j.label}\n${s.utama} — ${s.kedua}\n${s.judul}`)}">
                    <span class="m-utama">${esc(s.utama)}</span><span class="m-kedua">${esc(s.kedua)}</span></div>`;
            }).join("") : `<span class="kg-tak-ada">—</span>`) + `</td>`;
        }

        return `<tr class="${[b.aktif && "aktif", b.grup && "baris-grup"].filter(Boolean).join(" ")}">
            <th class="m-label" scope="row"><span>${esc(b.label)}</span><small>${esc(b.sub)}</small></th>${selHtml}${akhir}</tr>`;
    }).join("");

    // ---- kepala tabel
    const sorotKolom = sudut !== "hari" || hariPilih === hariSkr;
    const kepala = kolom.map((c) => c.sela
        ? `<th class="m-sela" title="Istirahat ${c.dari}–${c.sampai}"></th>`
        : `<th class="m-jam${sorotKolom && sekarang === c.jamKe ? " sekarang" : ""}">
            <span class="m-jam-ke">${c.jamKe}</span>
            ${c.jam.mulai ? `<span class="m-jam-waktu">${jam5(c.jam.mulai)}–${jam5(c.jam.selesai)}</span>` : ""}
            ${c.jam.keterangan ? `<span class="m-jam-ket">${esc(c.jam.keterangan)}</span>` : ""}</th>`).join("")
        + (sudut === "guru" ? `<th class="m-jam kg-kol-setelah"><span class="m-jam-ke">Setelah KBM</span><span class="m-jam-waktu">sesudah bel pulang</span></th>` : "");
    const nSela = kolom.filter((c) => c.sela).length;
    // Tampilan per guru punya satu kolom lebih; kolom jamnya sedikit dirapatkan
    // supaya kolom Setelah KBM masih terlihat di layar laptop tanpa menggulung.
    const lebarMin = 96 + (kolom.length - nSela) * (sudut === "guru" ? 72 : 76) + nSela * 12 + (sudut === "guru" ? 118 : 0);

    // ---- ringkasan angka & keterangan guru
    let ringkas;
    if (sudut === "guru") {
        const kbm = kegiatan.perJam.filter((k) => k.jenis === "kbm").length;
        const piketJam = kegiatan.perJam.length - kbm;
        ringkas = `${kbm} JP mengajar` + (piketJam ? ` · ${piketJam} jam piket` : "") + (kegiatan.setelah.length ? ` · ${kegiatan.setelah.length} kegiatan setelah KBM` : "");
    } else if (sudut === "kelas") {
        ringkas = `${pilih ? jadwalSmt.filter((j) => j.kelas_id === pilih.id).length : 0} jam per minggu`;
    } else {
        const n = jadwalSmt.filter((j) => j.hari === hariPilih && (lingkup === "reguler" ? !infoKelas(j.kelas_id).kelompok : infoKelas(j.kelas_id).program === lingkup)).length;
        ringkas = `${n} jam hari ${hariPilih}`;
    }
    const g = sudut === "guru" && pilih ? state.guru.find((x) => x.id === pilih.id) : null;
    const metaGuru = g ? [g.mapel_utama && g.mapel_utama !== "-" ? g.mapel_utama : "", g.wali_kelas ? `Wali kelas ${g.wali_kelas}` : "", g.is_staf ? "Staf" : ""].filter(Boolean).join(" · ") : "";

    // ---- legenda (per guru): warna tetap piket & ekskul
    const dipakai = new Set([...kegiatan.perJam, ...kegiatan.setelah].map((k) => k.jenis));
    const legenda = sudut === "guru" ? `<div class="kg-legenda">
        <span class="kg-legenda-item" style="--kg-bg:${WARNA_BLOK[0][0]};--kg-aksen:${WARNA_BLOK[0][1]}">Mengajar — warna per mata pelajaran</span>
        ${Object.entries(JENIS).filter(([k]) => dipakai.has(k)).map(([, v]) =>
            `<span class="kg-legenda-item" style="--kg-bg:${v.bg};--kg-aksen:${v.aksen}">${esc(v.label)}</span>`).join("")}
        <span class="kg-legenda-teks">Kolom terakhir bersatuan jam dinding atau tanpa jam sama sekali — bukan jam pelajaran ke-13.</span>
      </div>` : "";

    const kosong = !state.jadwalSemua.length
        ? `<div class="info-box"><b>Belum ada jadwal tersimpan.</b> Jadwal KBM disusun di Data Induk; tahun ajaran ${esc(state.tahunAjaran)}.</div>`
        : !jadwalSmt.length
        ? `<div class="info-box"><b>Belum ada jadwal semester ${smt}</b> untuk tahun ajaran ${esc(state.tahunAjaran)} di Data Induk.
            ${smtAda.length ? `Yang tersedia: semester ${smtAda.join(" dan ")} — pilih di kotak semester.` : ""}</div>` : "";

    document.getElementById("isi").innerHTML = `
    <div class="page-head">
      <div>
        <h1>Jadwal Kegiatan Sekolah</h1>
        <p>Disusun di Data Induk; halaman ini hanya menampilkan. Tahun ajaran ${esc(state.tahunAjaran)}, semester ${smt} (${smt === 1 ? "Juli–Desember" : "Januari–Juni"}${smt === semesterSekarang() ? ", berjalan" : ""}).</p>
      </div>
      <div class="page-head-actions">
        ${sudut !== "hari" ? `<button type="button" class="btn" id="bUnduh" ${pilih ? "" : "disabled"}>Unduh (xlsx)</button>` : ""}
        <button type="button" class="btn" id="bUnduhSemua">Unduh semua ${sudut === "guru" ? "guru" : "kelas"}</button>
      </div>
    </div>
    ${kosong}
    <div class="card">
      <div class="toolbar jd-bar">
        <div class="seg" role="group" aria-label="Sudut pandang">
          <button type="button" class="${sudut === "guru" ? "on" : ""}" data-sudut="guru">Per guru</button>
          <button type="button" class="${sudut === "kelas" ? "on" : ""}" data-sudut="kelas">Per kelas</button>
          <button type="button" class="${sudut === "hari" ? "on" : ""}" data-sudut="hari">Per hari</button>
        </div>
        ${sudut !== "hari" ? `
        <div class="pilih-nav">
          <button type="button" class="btn btn-nav" id="bSebelum" title="Sebelumnya" ${iPilih <= 0 ? "disabled" : ""}>‹</button>
          <select class="jd-select" id="fPilih" aria-label="${sudut === "guru" ? "Guru" : "Kelas"}">
            ${daftar.map((d) => `<option value="${escAttr(d.id)}" ${d.id === pilihId ? "selected" : ""}>${esc(d.nama)}${d.kelompok ? " (kelompok)" : ""}</option>`).join("")}
          </select>
          <button type="button" class="btn btn-nav" id="bSesudah" title="Berikutnya" ${iPilih < 0 || iPilih >= daftar.length - 1 ? "disabled" : ""}>›</button>
        </div>` : `
        <div class="seg" role="group" aria-label="Hari">
          ${hariAda.map((h) => `<button type="button" class="${h === hariPilih ? "on" : ""}" data-hari="${h}">${h}</button>`).join("")}
        </div>`}
        <select class="jd-select jd-select-auto" id="fSemester" aria-label="Semester">
          ${[1, 2].map((n) => `<option value="${n}" ${smt === n ? "selected" : ""}>${LABEL_SEMESTER[n]}${smtAda.includes(n) ? "" : " (kosong)"}</option>`).join("")}
        </select>
        <div class="toolbar-info">${esc(ringkas)}${metaGuru ? ` <span class="toolbar-meta">· ${esc(metaGuru)}</span>` : ""}</div>
      </div>
      ${sudut === "hari" && program.length ? `
      <div class="toolbar jd-bar">
        <span class="toolbar-label">Tampilkan:</span>
        <div class="seg" role="group" aria-label="Isi matriks">
          <button type="button" class="${lingkup === "reguler" ? "on" : ""}" data-lingkup="reguler">Kelas Reguler</button>
          ${program.map((p) => `<button type="button" class="${lingkup === p ? "on" : ""}" data-lingkup="${escAttr(p)}"><i class="lingkup-titik" style="--titik:${warnaProgram(p)[1]}"></i>${esc(p)}</button>`).join("")}
        </div>
      </div>` : ""}
      ${legenda}
      <div class="matriks-scroll">
        <table class="matriks${sudut === "guru" ? " kg-matriks" : ""}${matriksProgram ? " kelompok" : ""}" style="min-width:${lebarMin}px">
          <thead><tr><th class="m-sudut">${sudut === "hari" ? (matriksProgram ? "Kelompok" : "Kelas") : "Hari"}</th>${kepala}</tr></thead>
          <tbody>${barisHtml || `<tr><td colspan="${kolom.length + 2}" class="empty-state">Belum ada yang bisa ditampilkan.</td></tr>`}</tbody>
        </table>
      </div>
      <div class="table-foot">
        ${sudut === "guru"
            ? `Jam berurutan dengan kegiatan yang sama tampil sebagai satu blok. Sel merah berarti guru terjadwal di dua tempat sekaligus. Klik blok mengajar untuk membuka jadwal kelasnya. Ini <b>pola pekanan</b> yang berlaku sepanjang semester — ketidakhadiran dan guru pengganti pada tanggal tertentu ada di Penugasan Pengganti dan Rekap.`
            : sudut === "kelas"
            ? `Sel bergaris adalah jam kelompok belajar: siswa kelas ini berangkat ke kelompoknya masing-masing. Satu sel berisi lebih dari satu guru pada kelompok Tahsin dan Matematika Dasar — itu pengajaran beregu. Klik blok untuk membuka jadwal gurunya.`
            : `Kelompok belajar diringkas satu baris per program; klik bloknya, atau pilih programnya di <b>Tampilkan</b>, untuk membuka matriks kelompoknya. Klik blok pelajaran untuk membuka jadwal gurunya.`}
      </div>
    </div>`;

    simpanPilihan();
    render.terakhir = { sudut, smt, daftar, iPilih, pilih, hariAda, jadwalSmt, kegiatan, jamKelompok };
}

// ---------- Interaksi ----------
function ganti(perubahan) {
    Object.assign(state, perubahan);
    render();
    const gulung = document.querySelector(".matriks-scroll");
    if (gulung) gulung.scrollTop = 0;
}

function saatKlik(e) {
    const t = render.terakhir;
    if (!t) return;
    const sudutBtn = e.target.closest("[data-sudut]");
    if (sudutBtn) { ganti({ sudut: sudutBtn.dataset.sudut }); return; }
    const hariBtn = e.target.closest("button[data-hari]");
    if (hariBtn) { ganti({ hari: hariBtn.dataset.hari }); return; }
    const lingkupBtn = e.target.closest("[data-lingkup]");
    if (lingkupBtn) { ganti({ lingkup: lingkupBtn.dataset.lingkup }); return; }
    if (e.target.closest("#bSebelum")) { pilihKe(t.daftar[t.iPilih - 1]); return; }
    if (e.target.closest("#bSesudah")) { pilihKe(t.daftar[t.iPilih + 1]); return; }
    if (e.target.closest("#bUnduh")) { unduh([t.pilih]); return; }
    if (e.target.closest("#bUnduhSemua")) {
        unduh(t.sudut === "guru" ? t.daftar
            : state.kelas.filter((k) => !infoKelas(k.id).kelompok).map((k) => ({ id: k.id, nama: k.nama_kelas })),
            t.sudut === "hari" ? "kelas" : t.sudut);
        return;
    }
    // Lompat antar sudut pandang: blok mengajar membuka kelas (dari per guru)
    // atau guru (dari per kelas / per hari) yang bersangkutan.
    const blok = e.target.closest(".bisa-lompat");
    if (blok) {
        if (t.sudut === "guru") ganti({ sudut: "kelas", pilihKelas: blok.dataset.kelas });
        else ganti({ sudut: "guru", pilihGuru: blok.dataset.guru });
    }
}

function pilihKe(d) {
    if (!d) return;
    ganti(render.terakhir.sudut === "guru" ? { pilihGuru: d.id } : { pilihKelas: d.id });
}

function saatUbah(e) {
    if (e.target.id === "fPilih") pilihKe({ id: e.target.value });
    if (e.target.id === "fSemester") ganti({ semester: Number(e.target.value) });
}

// =========================================================
// Unduh xlsx — satu lembar per guru atau per kelas, susunan seperti Data Induk
// =========================================================
let logoCache = null;
async function logo() {
    if (logoCache === null) logoCache = (await ambilLogoBase64("assets/logo-kecil.png")) || false;
    return logoCache || null;
}

async function unduh(daftar, sudut = render.terakhir.sudut) {
    const t = render.terakhir;
    const tombol = document.querySelectorAll("#bUnduh, #bUnduhSemua");
    tombol.forEach((b) => (b.disabled = true));
    try {
        if (!window.ExcelJS) throw new Error("Pustaka ExcelJS belum termuat (periksa koneksi internet), coba muat ulang halaman.");
        const lembar = daftar.filter(Boolean).map((d) => {
            if (sudut === "guru") {
                const k = kegiatanGuru(d.id, t.jadwalSmt);
                return { nama: d.nama, judulSub: `Guru: ${d.nama}`,
                    isi: (h, jk) => k.perJam.filter((x) => x.hari === h && x.jamKe === jk),
                    setelah: (h) => k.setelah.filter((x) => x.hari === h).map((x) => ({ ...x, bg: JENIS[x.jenis].bg })) };
            }
            const info = infoKelas(d.id);
            return { nama: d.nama, judulSub: `Kelas ${d.nama}`,
                isi: (h, jk) => {
                    const prog = !info.kelompok ? t.jamKelompok(info.tingkat, h, jk) : null;
                    if (prog) return { kunci: prog };
                    return t.jadwalSmt.filter((j) => j.kelas_id === d.id && j.hari === h && Number(j.jam_ke) === jk).map((j) => {
                        const [bg] = warnaMapel(j.mapel_id);
                        return { utama: namaMapel(j.mapel_id), kedua: namaGuru(j.guru_id), bg };
                    });
                } };
        });
        const wb = await bukuJadwal({ ExcelJS: window.ExcelJS, lembar, hariList: t.hariAda, jam: state.jam,
            semester: t.smt, pengaturan: state.profil, logoBase64: await logo() });
        const nama = lembar.length === 1
            ? `Jadwal — ${lembar[0].nama.replace(/[\\/:*?"<>|]/g, "-").replace(/\.+$/, "").trim()}.xlsx`
            : `Jadwal — semua ${sudut === "guru" ? "guru" : "kelas"} — semester ${t.smt}.xlsx`;
        await unduhWorkbook(wb, nama);
    } catch (err) {
        laporError("Gagal membuat file Excel", err);
    } finally {
        tombol.forEach((b) => (b.disabled = false));
    }
}

boot();
