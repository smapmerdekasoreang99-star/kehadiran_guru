// =========================================================
// Kegiatan & Tugas Guru — halaman baca saja
// =========================================================
// Satu guru, satu pekan, seluruh kegiatannya. Halaman ini TIDAK mengubah apa
// pun: semua yang tampil di sini disusun di Data Induk (jadwal KBM, jadwal
// piket, tugas guru) atau di Absensi Ekskul (jadwal latihan). Karena itu tidak
// ada gerbang PIN maupun tombol tambah/ubah — satu tempat mengubah, banyak
// tempat membaca.
//
// Yang membedakannya dari halaman Jadwal KBM ada dua:
//
//   1. Kolomnya bukan 12 jam pelajaran saja, melainkan 12 + satu kolom
//      "Setelah KBM". Kolom terakhir itu menampung kegiatan yang memang
//      terjadi sesudah bel pulang dan satuannya bukan jam pelajaran:
//      piket parkiran (tanpa jam sama sekali) dan ekstrakurikuler (jam
//      dinding). Menyatukannya ke jam ke-13 akan berbohong tentang satuannya,
//      jadi kolomnya dipisah dengan garis tegas dan diberi label sendiri.
//
//   2. Warna blok menyatakan JENIS KEGIATAN, bukan mata pelajaran. Di halaman
//      ini yang dibandingkan adalah "sedang mengerjakan apa", bukan "mapel
//      apa" — kalau warnanya per mapel, matriks ini hanya menjadi salinan
//      halaman Jadwal KBM.
// =========================================================

import { supabaseClient, isSupabaseConfigured } from "../assets/supabase-client.js?v=20260921v";
import { demoData, demoKegiatan } from "../assets/demo-data.js?v=20260921v";
import { terapkanUrutan, peringkatGuru } from "../assets/guru-order.js?v=20260921v";
import { bukuKegiatanGuru, unduhWorkbook, ambilLogoBase64 } from "../assets/excel-export.js?v=20260921v";

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
const HARI_PENDEK = { Senin: "Sen", Selasa: "Sel", Rabu: "Rab", Kamis: "Kam", Jumat: "Jum" };

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const jam5 = (t) => String(t || "").slice(0, 5);

/* Enam jenis kegiatan, enam warna tetap — bukan palet berputar. Setiap warna
   di halaman ini berarti satu jenis pekerjaan dan tidak pernah dipakai ulang
   untuk maksud lain, sesuai aturan "warna selalu berarti sesuatu" di
   assets/dasar.css. Tiga yang pertama bersatuan jam pelajaran, tiga terakhir
   tidak. */
const JENIS = {
    kbm:      { label: "Mengajar (KBM)",   bg: "#F3E6C4", aksen: "#A87D1E" },
    meja:     { label: "Piket meja sekolah", bg: "#DCEBE3", aksen: "#3F7A5C" },
    unit:     { label: "Piket unit",       bg: "#DDE7F1", aksen: "#3D6A93" },
    parkiran: { label: "Piket parkiran",   bg: "#F6E3CF", aksen: "#B0662A" },
    ekskul:   { label: "Ekskul & pembinaan", bg: "#E9E0F0", aksen: "#71508F" },
    lain:     { label: "Tugas lain",       bg: "#E4E1DA", aksen: "#6E6455" },
};
/* Pasangan peran ↔ kategori kegiatan (Pembina Ekskul ↔ Ekstrakurikuler, dan
   seterusnya) dibaca dari kolom `jenis_tugas.kategori_ekskul`, bukan ditulis
   ulang di sini. Peta itu dulu hidup sebagai daftar tetap di berkas ini
   sekaligus sebagai nama yang ditanam di tiga tempat di database; sejak
   pembinaan OSIS dan Tahfidz ikut ke Absensi Ekskul, seluruhnya dipusatkan ke
   satu kolom. Menambah peran pembinaan keempat kelak tidak lagi menyentuh
   berkas ini. */
const kategoriEkskul = (jenis) => infoJenis(jenis)?.kategori_ekskul || null;

// ---------- State ----------
let state = {
    guru: [], kelas: [], mapel: [], jam: [],
    jadwal: [], piket: [], piketUnit: [], guruUnit: [], parkiran: [],
    tugas: [], jenisTugas: [], ekskul: [], pembina: [],
    profil: null, tahunAjaran: "",
    q: "", guruId: null,
    hasil: null,            // hasil hitung untuk guru terpilih (dipakai ulang oleh unduhan)
};

const PROFIL_BAWAAN = {
    nama_sekolah: 'SMA Plus "Merdeka" Soreang',
    alamat_sekolah: "Jl. Citaliktik-Sindang Wargi Soreang Kab. Bandung",
    tahun_ajaran: "2026/2027", tempat: "Soreang",
    kepala_sekolah: "", kurikulum: "",
};

const cariGuru = (id) => state.guru.find((g) => g.id === id) || null;

// Sama persis dengan penilaian "aktif" di halaman Jadwal KBM: kolomnya pernah
// berisi teks, angka, maupun boolean, dan ketiganya harus terbaca sama.
function guruAktif(g) {
    const v = g?.status_aktif;
    if (v === undefined || v === null) return true;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
    return /^(aktif|active|y|ya|true|1)$/i.test(String(v).trim());
}

const namaKelas = (id) => state.kelas.find((k) => k.id === id)?.nama_kelas || id;
const namaMapel = (id) => state.mapel.find((m) => m.id === id)?.nama_mapel || id;
const infoJenis = (nama) => state.jenisTugas.find((j) => j.nama === nama) || null;

// Rombel dirujuk lewat kelas: kg_kelas menyimpan rombel_id, jadi nama kelasnya
// bisa dicari tanpa membaca tabel rombel yang bukan bagian kontrak halaman ini.
const namaRombel = (rombelId) =>
    state.kelas.find((k) => k.rombel_id && k.rombel_id === rombelId)?.nama_kelas || null;

// ---------- Boot ----------
async function boot() {
    document.getElementById("notice").hidden = isSupabaseConfigured;
    pasangPencarian();
    document.getElementById("unduhBtn").addEventListener("click", unduhXlsx);

    try {
        if (isSupabaseConfigured) await muatSupabase();
        else muatDemo();
    } catch (err) {
        laporError("Data kegiatan guru gagal dimuat", err);
        return;
    }
    pulihkanPilihan();
}

async function muatSupabase() {
    const [
        { data: guru, error: eGuru },
        { data: kelas }, { data: mapel }, { data: jam },
        { data: jadwal }, { data: piket }, { data: piketUnit },
        { data: guruUnit }, { data: parkiran },
        { data: jenisTugas }, { data: ekskul }, { data: pembina },
        { data: profil }, { data: ta },
    ] = await Promise.all([
        terapkanUrutan(supabaseClient.from("v_guru").select("id, nama, status_aktif, tmt_sekolah, mapel_utama, wali_kelas, is_piket, is_staf")),
        supabaseClient.from("kg_kelas").select("id, nama_kelas, tingkat, rombel_id"),
        supabaseClient.from("kg_mapel").select("id, nama_mapel"),
        supabaseClient.from("kg_jam_pelajaran").select("jam_ke, mulai, selesai, keterangan").order("jam_ke"),
        supabaseClient.from("kg_jadwal_kbm").select("id, hari, jam_ke, kelas_id, mapel_id, guru_id"),
        supabaseClient.from("kg_piket").select("guru_id, hari, jam_ke"),
        supabaseClient.from("v_jadwal_piket_unit").select("tugas_id, guru_id, guru, unit, hari, jam_ke"),
        supabaseClient.from("v_guru_unit").select("tugas_id, guru_id, nama, unit, jam_per_minggu, mulai, selesai"),
        supabaseClient.from("v_piket_parkiran").select("hari, urutan_hari, guru_id, nama, catatan"),
        supabaseClient.from("jenis_tugas").select("nama, perlu_rombel, perlu_jabatan, piket_sekolah, tambah_jam_mengajar, jam_unit, urutan, aktif, penjelasan, kategori_ekskul").order("urutan"),
        supabaseClient.from("ae_ekskul").select("id, nama, pembina_id, hari, jam_mulai, jam_selesai, tempat, aktif, kategori"),
        supabaseClient.from("ae_pembina_aman").select("id, nama, id_guru, status"),
        supabaseClient.from("v_penanda_tangan").select("*").limit(1),
        supabaseClient.from("tahun_ajaran").select("kode, aktif").eq("aktif", true).limit(1),
    ]);
    if (eGuru) throw eGuru;

    state.guru = guru || [];
    state.kelas = kelas || [];
    state.mapel = mapel || [];
    state.jam = jam || [];
    state.jadwal = jadwal || [];
    state.piket = piket || [];
    state.piketUnit = piketUnit || [];
    state.guruUnit = guruUnit || [];
    state.parkiran = parkiran || [];
    state.jenisTugas = jenisTugas || [];
    state.ekskul = (ekskul || []).filter((e) => e.aktif !== false);
    state.pembina = pembina || [];
    state.tahunAjaran = ((ta || [])[0] || {}).kode || PROFIL_BAWAAN.tahun_ajaran;

    // Tugas guru disaring ke tahun ajaran aktif, supaya peran tahun lalu tidak
    // ikut terbaca sebagai tanggung jawab yang masih berjalan.
    const { data: tugas, error: eTugas } = await supabaseClient
        .from("guru_tugas")
        .select("id, guru_id, jenis, rombel_id, jabatan, jam_tambahan_mengajar, keterangan, aktif, tahun_ajaran")
        .eq("aktif", true).eq("tahun_ajaran", state.tahunAjaran);
    if (eTugas) throw eTugas;
    state.tugas = tugas || [];

    susunProfil((profil || [])[0]);
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
    // Data contoh kelas belum memuat rombel_id; di mode pratinjau id kelas
    // sekaligus menjadi id rombelnya, supaya rincian Wali Kelas tetap terbaca.
    state.kelas = demoData.kelas.map((k) => ({ ...k, rombel_id: k.rombel_id || k.id }));
    state.mapel = demoData.mapel;
    state.jam = demoData.jam;
    state.jadwal = demoData.jadwal;
    state.piket = demoData.piket;
    state.piketUnit = demoKegiatan.piketUnit;
    state.guruUnit = demoKegiatan.guruUnit;
    state.parkiran = demoKegiatan.parkiran;
    state.tugas = demoKegiatan.tugas;
    state.jenisTugas = demoKegiatan.jenisTugas;
    state.ekskul = demoKegiatan.ekskul;
    state.pembina = demoKegiatan.pembina;
    state.tahunAjaran = PROFIL_BAWAAN.tahun_ajaran;
    state.profil = { ...PROFIL_BAWAAN, kepala_sekolah: "Mohamad Gunawan, S.Si.", kurikulum: "Yuyun Wahyuni, S.Pd." };
}

// Guru terakhir yang dilihat diingat per browser — kenyamanan saja, jadi
// kegagalannya diabaikan dan halaman tetap terbuka dalam keadaan kosong.
function pulihkanPilihan() {
    let id = null;
    try { id = new URLSearchParams(location.search).get("guru") || localStorage.getItem("kegiatan.guru"); } catch { /* abaikan */ }
    if (id && cariGuru(id)) pilih(id);
}

// =========================================================
// Menghitung kegiatan seorang guru
// =========================================================
function hitung(guruId) {
    const g = cariGuru(guruId);
    const perJam = [];      // kegiatan bersatuan jam pelajaran
    const setelah = [];     // kegiatan sesudah bel pulang

    for (const r of state.jadwal) {
        if (r.guru_id !== guruId) continue;
        perJam.push({ jenis: "kbm", hari: r.hari, jamKe: Number(r.jam_ke),
            utama: namaKelas(r.kelas_id), kedua: namaMapel(r.mapel_id),
            kunci: `kbm|${r.kelas_id}|${r.mapel_id}` });
    }
    for (const p of state.piket) {
        if (p.guru_id !== guruId) continue;
        perJam.push({ jenis: "meja", hari: p.hari, jamKe: Number(p.jam_ke),
            utama: "Piket Meja", kedua: "Sekolah", kunci: "meja" });
    }
    for (const u of state.piketUnit) {
        if (u.guru_id !== guruId) continue;
        perJam.push({ jenis: "unit", hari: u.hari, jamKe: Number(u.jam_ke),
            utama: "Piket Unit", kedua: u.unit || "", kunci: `unit|${u.tugas_id}` });
    }
    for (const p of state.parkiran) {
        if (p.guru_id !== guruId) continue;
        setelah.push({ jenis: "parkiran", hari: p.hari, utama: "Piket Parkiran",
            kedua: "sesudah bel", judul: p.catatan || "Menjaga tempat parkir ±30 menit sesudah bel pulang." });
    }
    for (const e of ekskulGuru(guruId)) {
        // Kategori ikut dibawa, bukan dicari ulang dari nama: dua kegiatan bisa
        // bernama sama pada hari berbeda, dan data lama boleh jadi belum
        // berkategori — bawaan kolomnya 'Ekstrakurikuler'.
        setelah.push({ jenis: "ekskul", hari: e.hari, utama: e.nama,
            kedua: waktuEkskul(e), kategori: e.kategori || "Ekstrakurikuler",
            judul: [e.kategori, e.tempat].filter(Boolean).join(" · ") });
    }

    const barisTugas = susunTugas(guruId, perJam, setelah);
    return { guru: g, perJam, setelah, tugas: barisTugas };
}

// Ekskul yang dibina guru ini. Tautannya lewat ae_pembina.id_guru — pelatih
// dari luar sekolah tidak punya id_guru, jadi memang tidak muncul di sini.
function ekskulGuru(guruId) {
    const idPembina = new Set(state.pembina.filter((p) => p.id_guru === guruId).map((p) => p.id));
    if (!idPembina.size) return [];
    return state.ekskul.filter((e) => idPembina.has(e.pembina_id));
}

function waktuEkskul(e) {
    if (!e.jam_mulai) return "jam belum diisi";
    return `${jam5(e.jam_mulai)}–${jam5(e.jam_selesai)}`;
}

/* ---------- Daftar tugas & tanggung jawab ----------
   Baris pertama selalu "Mengajar (KBM)" walaupun bukan baris guru_tugas:
   mengajar adalah tugas pokok, dan daftar tanggung jawab yang tidak
   menyebutkannya akan terbaca seolah guru itu hanya mengurus hal lain.
   Sesudahnya baris guru_tugas menurut urutan jenis yang ditetapkan Data
   Induk, lalu tugas terjadwal yang tidak punya baris guru_tugas sama sekali
   (piket meja dan parkiran memang ditentukan oleh jadwalnya, bukan oleh
   baris tugas). */
function susunTugas(guruId, perJam, setelah) {
    const baris = [];
    const jamKbm = perJam.filter((k) => k.jenis === "kbm");
    const g = cariGuru(guruId);

    baris.push({
        tugas: "Mengajar (KBM)",
        rincian: g?.mapel_utama && g.mapel_utama !== "-" ? g.mapel_utama : "—",
        jadwal: ringkasJam(jamKbm),
        jam: jamKbm.length,
        satuan: "JP",
        ket: "Tugas pokok. Jadwalnya disusun di Jadwal KBM.",
        jenisWarna: "kbm",
    });

    const jamMeja = perJam.filter((k) => k.jenis === "meja");
    let adaPeranPiket = false;
    const ekskulTerpakai = new Set();

    const tugasUrut = [...state.tugas.filter((t) => t.guru_id === guruId)]
        .sort((a, b) => (infoJenis(a.jenis)?.urutan ?? 99) - (infoJenis(b.jenis)?.urutan ?? 99)
            || String(a.jenis).localeCompare(b.jenis));

    for (const t of tugasUrut) {
        const info = infoJenis(t.jenis);
        const b = { tugas: t.jenis, rincian: rincianTugas(t, info), ket: t.keterangan || "",
            penjelasan: info?.penjelasan || "", jam: null, satuan: "", jadwal: [], jenisWarna: "lain" };

        // Jam piket meja sengaja TIDAK ditempelkan ke baris perannya. "Wali
        // Kelas 10-1 · Sen jam 1–2" akan terbaca seolah tugas wali kelasnya
        // berlangsung Senin jam 1–2, padahal itu jam piketnya. Piket meja
        // mendapat barisnya sendiri di bawah, dan penanda ini hanya mencatat
        // bahwa perannya memang mengandung kewajiban piket.
        if (info?.piket_sekolah) {
            adaPeranPiket = true;
            b.kosongTeks = `Piket ${info.piket_sekolah.toLowerCase()}`;
        }

        if (info?.jam_unit) {
            const jamUnit = perJam.filter((k) => k.jenis === "unit" && k.kunci === `unit|${t.id}`);
            const unit = state.guruUnit.find((u) => String(u.tugas_id) === String(t.id));
            b.jadwal = ringkasJam(jamUnit);
            b.jam = jamUnit.length || unit?.jam_per_minggu || null;
            b.satuan = "jam";
            b.jenisWarna = "unit";
            b.kosongTeks = jamUnit.length ? "" : "Belum dijadwalkan";
        } else if (kategoriEkskul(t.jenis)) {
            const sesi = setelah.filter((s) => s.jenis === "ekskul"
                && s.kategori === kategoriEkskul(t.jenis));
            sesi.forEach((s) => ekskulTerpakai.add(s));
            b.jadwal = sesi.map((s) => ({ hari: s.hari, teks: `${s.utama} ${s.kedua}` }));
            b.satuan = "";
            b.jenisWarna = "ekskul";
            b.kosongTeks = sesi.length ? "" : "Belum dijadwalkan";
        } else if (info?.tambah_jam_mengajar) {
            b.jam = Number(t.jam_tambahan_mengajar) || null;
            b.satuan = "JP";
            b.kosongTeks = b.kosongTeks || "Tanpa jadwal tetap";
        } else {
            b.kosongTeks = b.kosongTeks || "Tanpa jadwal tetap";
        }
        baris.push(b);
    }

    /* Piket meja sekolah selalu menjadi barisnya sendiri, karena penentunya
       memang jadwal piket — bukan baris tugas. Barisnya tetap dimunculkan
       walaupun jamnya kosong, asalkan perannya mengandung kewajiban piket:
       ada wali kelas yang tidak kebagian giliran karena jam mengajarnya sudah
       padat, dan itu justru hal yang perlu terlihat. */
    if (jamMeja.length || adaPeranPiket) {
        baris.push({ tugas: "Piket Meja Sekolah", rincian: "—", jadwal: ringkasJam(jamMeja),
            jam: jamMeja.length || null, satuan: "jam", jenisWarna: "meja",
            kosongTeks: jamMeja.length ? "" : "Tidak kebagian giliran",
            ket: adaPeranPiket
                ? "Dasarnya jadwal piket di Data Induk → Piket & Honor, bukan baris tugas."
                : "Terjadwal piket meja sekolah, tetapi belum ada baris tugas di Data Induk → Tugas Guru." });
    }

    // Pembinaan yang jadwalnya ada di Absensi Ekskul tetapi perannya belum
    // dicatat di Tugas Guru. Sama alasannya dengan piket meja di atas:
    // kegiatannya nyata berjalan, jadi tidak boleh hilang dari daftar.
    const ekskulLepas = setelah.filter((s) => s.jenis === "ekskul" && !ekskulTerpakai.has(s));
    if (ekskulLepas.length) {
        baris.push({ tugas: "Pembinaan (Absensi Ekskul)", rincian: "—",
            jadwal: ekskulLepas.map((s) => ({ hari: s.hari, teks: `${s.utama} ${s.kedua}` })),
            jam: null, satuan: "", jenisWarna: "ekskul",
            ket: "Terjadwal sebagai pembina di Absensi Ekskul, tetapi belum ada baris tugas di Data Induk → Tugas Guru." });
    }

    const parkir = setelah.filter((s) => s.jenis === "parkiran");
    if (parkir.length) {
        baris.push({ tugas: "Piket Parkiran", rincian: "—",
            jadwal: parkir.map((p) => ({ hari: p.hari, teks: "sesudah bel pulang" })),
            jam: parkir.length, satuan: "hari", jenisWarna: "parkiran",
            ket: "Satuannya hari, bukan jam pelajaran — sekali jaga ±30 menit sesudah bel pulang." });
    }

    return baris.map((b, i) => ({ ...b, no: i + 1 }));
}

/* Rincian tugas: kelas untuk wali kelas, jabatan untuk yang lain. Bila rombel
   tidak ketemu lewat kg_kelas, dipakai kode wali kelas dari v_guru — kolom itu
   memang sudah menautkan guru ke rombelnya, jadi rinciannya tidak pernah
   kosong hanya karena satu tautan tidak terbaca. */
function rincianTugas(t, info) {
    const dariRombel = t.rombel_id ? namaRombel(t.rombel_id) : null;
    if (dariRombel) return dariRombel;
    if (info?.perlu_rombel) return cariGuru(t.guru_id)?.wali_kelas || "kelas belum diisi";
    if (t.jabatan) return t.jabatan;
    return "—";
}

/* Deretan jam diringkas menjadi rentang per hari: "Sen 1–4", bukan
   "Sen 1, Sen 2, Sen 3, Sen 4". Sebelas jam piket yang ditulis satu-satu
   membuat kolom Jadwal lebih panjang daripada seluruh tabelnya. */
function ringkasJam(daftar) {
    const perHari = new Map();
    for (const k of daftar) {
        if (!perHari.has(k.hari)) perHari.set(k.hari, new Set());
        perHari.get(k.hari).add(k.jamKe);
    }
    const hasil = [];
    for (const hari of HARI_LIST) {
        const jam = perHari.get(hari);
        if (!jam) continue;
        hasil.push({ hari, teks: `jam ${rentangAngka([...jam])}` });
    }
    return hasil;
}

function rentangAngka(angka) {
    const urut = [...angka].sort((a, b) => a - b);
    const potong = [];
    let awal = urut[0], akhir = urut[0];
    for (let i = 1; i <= urut.length; i++) {
        if (urut[i] === akhir + 1) { akhir = urut[i]; continue; }
        potong.push(awal === akhir ? `${awal}` : `${awal}–${akhir}`);
        awal = akhir = urut[i];
    }
    return potong.join(", ");
}

// =========================================================
// Render
// =========================================================
function pilih(guruId) {
    state.guruId = guruId;
    state.q = cariGuru(guruId)?.nama || "";
    document.getElementById("cariGuru").value = state.q;
    document.getElementById("cariClear").hidden = false;
    document.getElementById("cariSaran").hidden = true;
    try { localStorage.setItem("kegiatan.guru", guruId); } catch { /* abaikan */ }

    state.hasil = hitung(guruId);
    document.getElementById("belumPilih").hidden = true;
    document.getElementById("isi").hidden = false;
    document.getElementById("unduhBtn").disabled = false;
    renderKepala();
    renderTugas();
    renderLegenda();
    renderMatriks();
}

function kosongkan() {
    state.guruId = null; state.q = ""; state.hasil = null;
    try { localStorage.removeItem("kegiatan.guru"); } catch { /* abaikan */ }
    document.getElementById("cariGuru").value = "";
    document.getElementById("cariClear").hidden = true;
    document.getElementById("cariSaran").hidden = true;
    document.getElementById("belumPilih").hidden = false;
    document.getElementById("isi").hidden = true;
    document.getElementById("unduhBtn").disabled = true;
}

function renderKepala() {
    const { guru, perJam, setelah } = state.hasil;
    document.getElementById("kgNama").textContent = guru?.nama || state.guruId;

    const meta = [];
    if (guru?.mapel_utama && guru.mapel_utama !== "-") meta.push(esc(guru.mapel_utama));
    if (guru?.wali_kelas) meta.push(`Wali kelas ${esc(guru.wali_kelas)}`);
    if (guru?.is_staf) meta.push("Staf");
    if (guru && !guruAktif(guru)) meta.push(`<b>${esc(guru.status_aktif)}</b>`);
    meta.push(`Tahun ajaran ${esc(state.profil?.tahun_ajaran || state.tahunAjaran)}`);
    document.getElementById("kgMeta").innerHTML = meta.join(" · ");

    const n = (jenis) => perJam.filter((k) => k.jenis === jenis).length;
    const angka = [
        { nilai: n("kbm"), satuan: "JP mengajar" },
        { nilai: n("meja"), satuan: "jam piket meja" },
        { nilai: n("unit"), satuan: "jam piket unit" },
        { nilai: setelah.length, satuan: "kegiatan setelah KBM" },
    ].filter((a) => a.nilai > 0);
    document.getElementById("kgAngka").innerHTML = angka.length
        ? angka.map((a) => `<div class="kg-angka-item"><b>${a.nilai}</b><span>${esc(a.satuan)}</span></div>`).join("")
        : `<div class="kg-angka-item kg-angka-nol"><span>Belum ada kegiatan terjadwal</span></div>`;
}

function renderTugas() {
    const baris = state.hasil.tugas;
    document.getElementById("tugasBody").innerHTML = baris.map((b) => {
        const jadwal = b.jadwal?.length
            ? b.jadwal.map((j) => `<span class="kg-chip" style="--kg-bg:${JENIS[b.jenisWarna].bg};--kg-aksen:${JENIS[b.jenisWarna].aksen}">
                 <b>${esc(HARI_PENDEK[j.hari] || j.hari)}</b> ${esc(j.teks)}</span>`).join("")
            : `<span class="kg-chip kg-chip-kosong">${esc(b.kosongTeks || "—")}</span>`;
        const jam = b.jam ? `${b.jam}${b.satuan ? " " + esc(b.satuan) : ""}` : "—";
        const judul = b.penjelasan ? ` title="${escAttr(b.penjelasan)}"` : "";
        return `<tr>
            <td class="kg-no">${b.no}</td>
            <td class="kg-tugas-nama"${judul}><span class="kg-titik" style="--kg-aksen:${JENIS[b.jenisWarna].aksen}"></span>${esc(b.tugas)}${b.penjelasan ? '<span class="kg-info">ⓘ</span>' : ""}</td>
            <td>${esc(b.rincian)}</td>
            <td class="kg-jadwal">${jadwal}</td>
            <td class="kg-jam angka">${esc(jam)}</td>
            <td class="kg-ket">${esc(b.ket || "")}</td>
          </tr>`;
    }).join("");

    const belum = baris.filter((b) => b.kosongTeks === "Belum dijadwalkan").length;
    document.getElementById("tugasFoot").innerHTML =
        `${baris.length} tugas &amp; tanggung jawab pada tahun ajaran ${esc(state.profil?.tahun_ajaran || state.tahunAjaran)}. `
        + `Seluruhnya disusun di <b>Data Induk &rarr; Tugas Guru</b> dan <b>Piket &amp; Honor</b>; halaman ini hanya membacanya. `
        + (belum ? `<b>${belum} tugas belum punya jadwal</b> — harinya memang belum ditetapkan, jadi tidak muncul di matriks di bawah.` : "");
}

function renderLegenda() {
    const dipakai = new Set([...state.hasil.perJam, ...state.hasil.setelah].map((k) => k.jenis));
    document.getElementById("legenda").innerHTML =
        Object.entries(JENIS).filter(([k]) => dipakai.has(k)).map(([k, v]) =>
            `<span class="kg-legenda-item" style="--kg-bg:${v.bg};--kg-aksen:${v.aksen}">${esc(v.label)}</span>`).join("")
        + `<span class="kg-legenda-teks">Kolom terakhir bersatuan jam dinding atau tanpa jam sama sekali — bukan jam pelajaran ke-13.</span>`;
}

function renderMatriks() {
    const { perJam, setelah } = state.hasil;

    // Kolom = jam pelajaran; jeda antar-jam (istirahat) diberi kolom sela tipis,
    // sama seperti matriks Jadwal KBM supaya keduanya terbaca dengan kebiasaan
    // yang sama.
    const jamList = state.jam.length ? state.jam : [];
    const kolom = [];
    jamList.forEach((j, i) => {
        const prev = jamList[i - 1];
        if (prev?.selesai && j.mulai && jam5(prev.selesai) !== jam5(j.mulai)) {
            kolom.push({ sela: true, dari: jam5(prev.selesai), sampai: jam5(j.mulai) });
        }
        kolom.push({ jam: j, jamKe: Number(j.jam_ke) });
    });

    const isi = new Map();
    for (const k of perJam) {
        const kunci = `${k.hari}|${k.jamKe}`;
        if (!isi.has(kunci)) isi.set(kunci, []);
        isi.get(kunci).push(k);
    }
    const isiSetelah = new Map();
    for (const s of setelah) {
        if (!isiSetelah.has(s.hari)) isiSetelah.set(s.hari, []);
        isiSetelah.get(s.hari).push(s);
    }

    const html = [];
    html.push(`<thead><tr><th class="m-sudut">Hari</th>`);
    for (const c of kolom) {
        if (c.sela) { html.push(`<th class="m-sela" title="Istirahat ${c.dari}–${c.sampai}"></th>`); continue; }
        html.push(`<th class="m-jam">
            <span class="m-jam-ke">${c.jamKe}</span>
            ${c.jam.mulai ? `<span class="m-jam-waktu">${jam5(c.jam.mulai)}–${jam5(c.jam.selesai)}</span>` : ""}
            ${c.jam.keterangan ? `<span class="m-jam-ket">${esc(c.jam.keterangan)}</span>` : ""}
          </th>`);
    }
    html.push(`<th class="m-jam kg-kol-setelah">
        <span class="m-jam-ke">Setelah KBM</span>
        <span class="m-jam-waktu">sesudah bel pulang</span>
      </th>`);
    html.push(`</tr></thead><tbody>`);

    for (const hari of HARI_LIST) {
        // Sel disiapkan dulu supaya jam berurutan dengan kegiatan yang sama
        // bisa disambung menjadi satu blok panjang.
        const sel = kolom.map((c) => {
            if (c.sela) return c;
            const daftar = isi.get(`${hari}|${c.jamKe}`) || [];
            return { ...c, daftar, sambung: daftar.length === 1 ? daftar[0].kunci : null };
        });
        sel.forEach((s, i) => {
            const prev = sel[i - 1];
            if (s.sambung && prev && !prev.sela && prev.sambung === s.sambung && prev.jamKe === s.jamKe - 1) {
                s.dariKiri = true;
                prev.keKanan = true;
            }
        });
        for (let i = sel.length - 1; i >= 0; i--) {
            sel[i].rentang = sel[i].keKanan ? sel[i + 1].rentang + 1 : 1;
        }

        const jamHari = perJam.filter((k) => k.hari === hari).length;
        const setelahHari = isiSetelah.get(hari) || [];
        const sub = jamHari || setelahHari.length
            ? [jamHari ? `${jamHari} jam` : "", setelahHari.length ? `${setelahHari.length} setelah KBM` : ""].filter(Boolean).join(" · ")
            : "tidak ada kegiatan";
        html.push(`<tr><th scope="row" class="m-label"><span>${hari}</span><small>${esc(sub)}</small></th>`);

        for (const s of sel) {
            if (s.sela) { html.push(`<td class="m-sela"></td>`); continue; }
            if (!s.daftar.length) { html.push(`<td class="m-sel kosong"></td>`); continue; }
            html.push(`<td class="m-sel">`);
            if (s.daftar.length > 1) html.push(`<div class="m-tumpuk">`);
            for (const k of s.daftar) {
                const j = JENIS[k.jenis];
                const judul = `${k.hari} · jam ke-${k.jamKe}\n${j.label}\n${k.utama}${k.kedua ? " — " + k.kedua : ""}`;
                const kelasBlok = ["m-blok", s.dariKiri && "dari-kiri", s.keKanan && "ke-kanan",
                    s.daftar.length > 1 && "rapat"].filter(Boolean).join(" ");
                html.push(`<div class="${kelasBlok}" style="--blok-bg:${j.bg};--blok-aksen:${j.aksen};--rentang:${s.rentang}" title="${escAttr(judul)}">
                    <span class="m-utama">${esc(k.utama)}</span>
                    <span class="m-kedua">${esc(k.kedua)}</span>
                  </div>`);
            }
            if (s.daftar.length > 1) html.push(`</div>`);
            html.push(`</td>`);
        }

        // Kolom "Setelah KBM": isinya tidak pernah disambung ke kiri, karena
        // memang bukan kelanjutan jam pelajaran.
        html.push(`<td class="m-sel kg-sel-setelah${setelahHari.length ? "" : " kosong"}">`);
        for (const s of setelahHari) {
            const j = JENIS[s.jenis];
            const judul = [`${s.hari} · ${j.label}`, `${s.utama}${s.kedua ? " — " + s.kedua : ""}`, s.judul].filter(Boolean).join("\n");
            html.push(`<div class="m-blok kg-blok-setelah" style="--blok-bg:${j.bg};--blok-aksen:${j.aksen}" title="${escAttr(judul)}">
                <span class="m-utama">${esc(s.utama)}</span>
                <span class="m-kedua">${esc(s.kedua)}</span>
              </div>`);
        }
        if (!setelahHari.length) html.push(`<span class="kg-tak-ada">—</span>`);
        html.push(`</td></tr>`);
    }
    html.push(`</tbody>`);

    const table = document.getElementById("matriks");
    table.innerHTML = html.join("");
    const nSela = kolom.filter((c) => c.sela).length;
    table.style.minWidth = `${88 + (kolom.length - nSela) * 72 + nSela * 12 + 150}px`;

    const total = perJam.length;
    document.getElementById("matriksFoot").innerHTML =
        `${total} jam pelajaran terpakai dalam sepekan, ditambah ${setelah.length} kegiatan sesudah bel pulang. `
        + `Blok yang menyambung berarti jam berurutan dengan kegiatan yang sama. `
        + `Ini <b>pola pekanan</b> yang berlaku sepanjang semester — ketidakhadiran dan guru pengganti pada tanggal tertentu ada di halaman Penugasan Pengganti dan Rekap.`;
}

// =========================================================
// Pencarian guru
// =========================================================
function sorot(teks, q) {
    const i = teks.toLowerCase().indexOf(q);
    if (i < 0) return esc(teks);
    return `${esc(teks.slice(0, i))}<mark>${esc(teks.slice(i, i + q.length))}</mark>${esc(teks.slice(i + q.length))}`;
}

function renderSaran() {
    const box = document.getElementById("cariSaran");
    const q = state.q.trim().toLowerCase();
    if (!q || state.guruId) { box.hidden = true; return; }

    // Angka di bawah nama membantu memilih orang yang benar saat ada dua nama
    // mirip — sekaligus memperlihatkan lebih dulu siapa yang jadwalnya kosong.
    const jamGuru = new Map();
    for (const r of state.jadwal) jamGuru.set(r.guru_id, (jamGuru.get(r.guru_id) || 0) + 1);
    const tugasGuru = new Map();
    for (const t of state.tugas) tugasGuru.set(t.guru_id, (tugasGuru.get(t.guru_id) || 0) + 1);

    const urut = peringkatGuru(state.guru);
    const hits = state.guru
        .filter((g) => guruAktif(g) && g.nama.toLowerCase().includes(q))
        .sort((a, b) => urut(a.id) - urut(b.id))
        .slice(0, 8);

    if (!hits.length) {
        box.innerHTML = `<div class="suggest-empty">Tidak ada guru yang cocok dengan "${esc(state.q)}"</div>`;
    } else {
        box.innerHTML = hits.map((g) => {
            const meta = [`${jamGuru.get(g.id) || 0} JP/minggu`, `${tugasGuru.get(g.id) || 0} tugas`];
            if (g.mapel_utama && g.mapel_utama !== "-") meta.unshift(g.mapel_utama);
            return `<button type="button" class="suggest-item" data-guru="${escAttr(g.id)}">
                <span class="suggest-nama">${sorot(g.nama, q)}</span>
                <span class="suggest-meta">${esc(meta.join(" · "))}</span>
              </button>`;
        }).join("");
        box.querySelectorAll(".suggest-item").forEach((b) =>
            b.addEventListener("mousedown", (e) => { e.preventDefault(); pilih(b.dataset.guru); })
        );
    }
    box.hidden = false;
}

function pasangPencarian() {
    const input = document.getElementById("cariGuru");
    input.addEventListener("input", () => {
        state.guruId = null;
        state.q = input.value;
        document.getElementById("cariClear").hidden = !input.value;
        if (!input.value) kosongkan();
        renderSaran();
    });
    input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") kosongkan();
        if (e.key === "Enter") {
            const first = document.querySelector("#cariSaran .suggest-item");
            if (first) pilih(first.dataset.guru);
        }
    });
    input.addEventListener("focus", renderSaran);
    input.addEventListener("blur", () => setTimeout(() => (document.getElementById("cariSaran").hidden = true), 120));
    document.getElementById("cariClear").addEventListener("click", kosongkan);
}

// =========================================================
// Unduh xlsx — satu lembar, susunannya sama dengan layar
// =========================================================
let logoCache = null;
async function logo() {
    if (logoCache === null) logoCache = (await ambilLogoBase64("assets/logo-kecil.png")) || false;
    return logoCache || null;
}

async function unduhXlsx() {
    if (!state.hasil) return;
    const tombol = document.getElementById("unduhBtn");
    tombol.disabled = true;
    try {
        if (!window.ExcelJS) throw new Error("Pustaka ExcelJS belum termuat (periksa koneksi internet), coba muat ulang halaman.");
        const wb = await bukuKegiatanGuru({
            ExcelJS: window.ExcelJS,
            guru: state.hasil.guru,
            tugas: state.hasil.tugas,
            perJam: state.hasil.perJam,
            setelah: state.hasil.setelah,
            jam: state.jam,
            hariList: HARI_LIST,
            jenis: JENIS,
            pengaturan: state.profil,
            logoBase64: await logo(),
        });
        // Gelar di akhir nama ("S.Pd.") membuat berkasnya bernama "…S.Pd..xlsx";
        // titik penutupnya dibuang supaya namanya wajar dibaca.
        const nama = String(state.hasil.guru?.nama || state.guruId)
            .replace(/[\\/:*?"<>|]/g, "-").replace(/\.+$/, "").trim();
        await unduhWorkbook(wb, `Kegiatan dan Tugas — ${nama}.xlsx`);
    } catch (err) {
        laporError("Gagal membuat file Excel", err);
    } finally {
        tombol.disabled = false;
    }
}

boot();
