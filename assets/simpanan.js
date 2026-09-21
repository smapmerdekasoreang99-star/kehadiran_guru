// =========================================================
// Simpanan bersama data rujukan — Sistem Guru Pengganti
// =========================================================
// Data rujukan — guru, kelas, mata pelajaran, jam pelajaran, jadwal KBM
// sepekan, jadwal piket, ekskul, profil sekolah — dibaca hampir
// setiap halaman, dan isinya berubah paling-paling beberapa kali dalam satu
// semester. Tidak satu pun diubah dari aplikasi ini; penyusunnya Data Induk
// dan Absensi Ekskul. Yang berubah setiap hari — ketidakhadiran, penugasan
// pengganti, pelaksanaan piket, hari libur — sengaja TIDAK ada di sini dan
// selalu diminta segar. Sebelum berkas ini ada, tiap halaman
// memintanya ulang ke Supabase dari nol setiap kali dibuka; jadi berpindah
// dari Kegiatan ke Rekap sama beratnya dengan membuka aplikasi pertama kali.
//
// Yang lambat bukan kuerinya (v_guru: 4 milidetik di server) dan bukan
// sambungannya (35 milidetik), melainkan perjalanan satu permintaan lewat
// lapisan API Supabase, yang dari sekolah terukur 0,6 sampai 48 detik untuk
// permintaan yang sama persis. Satu-satunya obat untuk perjalanan yang tidak
// bisa dipercepat adalah tidak melakukan perjalanan itu.
//
// Cara kerjanya — "pakai yang ada, perbarui di belakang":
//   1. Halaman meminta rujukan yang dibutuhkannya. Bila semuanya sudah ada di
//      simpanan browser, halaman langsung menggambar dari situ — tanpa
//      menunggu jaringan sama sekali.
//   2. Di belakang layar versi terbarunya tetap diminta ke Supabase. Bila ada
//      yang berbeda, halaman diberi tahu lewat saatBerubah() dan menggambar
//      ulang; bila sama, tidak terjadi apa-apa.
//   3. Bila ada rujukan yang belum pernah tersimpan (kunjungan pertama), yang
//      itu ditunggu seperti biasa, lalu disimpan untuk kunjungan berikutnya.
//
// Ukurannya kecil: seluruhnya sekitar 114 KB (jadwal 100 KB di antaranya),
// dua persen dari jatah localStorage. Simpanan yang gagal ditulis atau
// terbaca — penyimpanan penuh, mode penyamaran — tidak menjatuhkan apa pun:
// halaman kembali berjalan lewat jaringan seperti dulu.
//
// Tidak ada halaman di aplikasi ini yang mengubah rujukan — Jadwal KBM pun
// kini hanya menampilkan. Bila kelak ada yang menulis, panggil
// segarkanRujukan() sesudahnya supaya simpanan langsung mengikuti.
// =========================================================

import { terapkanUrutan } from "./guru-order.js?v=20260921v";

const AWALAN = "kg.rujukan.v2.";   // v2: kelas membawa jenis & mapel_id

// Kolom yang diambil adalah GABUNGAN kebutuhan seluruh halaman — sesuai
// kontrak di database/kontrak/kehadiran_guru.sql — supaya satu simpanan
// melayani semuanya. Menambah kolom di sini berarti menaikkan awalan kunci
// di atas, supaya simpanan lama yang kekurangan kolom tidak terbaca lagi.
const RUJUKAN = {
    guru:   (sb) => terapkanUrutan(sb.from("v_guru")
                .select("id, nama, status_aktif, mapel_utama, wali_kelas, is_piket, tmt_sekolah, is_staf, insentif_fingerprint")),
    kelas:  (sb) => sb.from("kg_kelas").select("id, nama_kelas, tingkat, rombel_id, jenis, mapel_id"),
    mapel:  (sb) => sb.from("kg_mapel").select("id, nama_mapel, rumpun_mapel").order("nama_mapel"),
    jam:    (sb) => sb.from("kg_jam_pelajaran").select("jam_ke, mulai, selesai, keterangan").order("jam_ke"),
    jadwal: (sb) => ambilJadwalSepekan(sb),
    // Jadwal piket tiga jenis, disusun di Data Induk → Piket & Honor.
    piketMeja: (sb) => sb.from("kg_piket").select("guru_id, hari, jam_ke"),
    piketUnit: (sb) => sb.from("v_jadwal_piket_unit").select("tugas_id, guru_id, guru, unit, hari, jam_ke"),
    guruUnit:  (sb) => sb.from("v_guru_unit").select("tugas_id, guru_id, nama, unit, jam_per_minggu, mulai, selesai"),
    parkiran:  (sb) => sb.from("v_piket_parkiran").select("hari, urutan_hari, guru_id, nama, catatan"),
    // Milik Absensi Ekskul; dibaca untuk kolom "Setelah KBM" di Kegiatan.
    ekskul:  (sb) => sb.from("ae_ekskul").select("id, nama, pembina_id, hari, jam_mulai, jam_selesai, tempat, aktif, kategori"),
    pembina: (sb) => sb.from("ae_pembina_aman").select("id, nama, id_guru, status"),
    // Identitas dokumen dan tahun ajaran aktif, milik Data Induk. Keduanya
    // larik satu baris — bentuk yang sama dengan rujukan lain, supaya
    // muatRujukan tidak perlu mengenal pengecualian.
    profil:      (sb) => sb.from("v_penanda_tangan").select("*").limit(1),
    tahunAjaran: (sb) => sb.from("tahun_ajaran").select("kode, aktif").eq("aktif", true).limit(1),
};

// PostgREST memotong hasil di 1.000 baris tanpa error — baris sisanya hilang
// diam-diam. Jadwal sepekan sudah 1.040 baris, dan yang terbuang justru yang
// dimasukkan paling akhir (kelompok Tahsin dan Matematika Dasar). Dua halaman
// pertama diminta serentak, bukan berurutan, supaya kasus lazim — sedikit di
// atas seribu — selesai dalam satu perjalanan; baru bila halaman kedua pun
// penuh, halaman berikutnya diminta satu per satu.
const BATAS = 1000;
async function ambilJadwalSepekan(sb) {
    const halaman = (mulai) => sb.from("kg_jadwal_kbm")
        .select("id, hari, jam_ke, kelas_id, mapel_id, guru_id").order("id")
        .range(mulai, mulai + BATAS - 1);
    const [satu, dua] = await Promise.all([halaman(0), halaman(BATAS)]);
    if (satu.error) return satu;
    if (dua.error) return dua;
    let semua = (satu.data || []).concat(dua.data || []);
    for (let mulai = 2 * BATAS; (dua.data || []).length === BATAS && semua.length === mulai; mulai += BATAS) {
        const { data, error } = await halaman(mulai);
        if (error) return { data: null, error };
        semua = semua.concat(data || []);
        if (!data || data.length < BATAS) break;
    }
    return { data: semua, error: null };
}

// ---------- Simpanan browser ----------
function baca(nama) {
    try {
        const isi = JSON.parse(localStorage.getItem(AWALAN + nama) || "null");
        return Array.isArray(isi?.data) ? isi.data : null;
    } catch { return null; }
}

function tulis(nama, data) {
    try { localStorage.setItem(AWALAN + nama, JSON.stringify({ waktu: Date.now(), data })); }
    catch { /* penyimpanan penuh atau ditolak — abaikan, jaringan tetap ada */ }
}

const sama = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- Jaringan ----------
async function ambil(sb, nama) {
    const { data, error } = await RUJUKAN[nama](sb);
    if (error) throw Object.assign(new Error(`${nama}: ${error.message || error}`), { asal: error, rujukan: nama });
    return data || [];
}

async function ambilBanyak(sb, daftar) {
    const hasil = {};
    const semua = await Promise.all(daftar.map((n) => ambil(sb, n)));
    daftar.forEach((n, i) => { hasil[n] = semua[i]; tulis(n, semua[i]); });
    return hasil;
}

// =========================================================
// muatRujukan(sb, ["guru", "kelas", ...], saatBerubah)
// =========================================================
// Mengembalikan { guru, kelas, ... } — dari simpanan bila lengkap (seketika),
// dari jaringan bila ada yang belum tersimpan. saatBerubah(rujukanBaru)
// dipanggil belakangan bila pembaruan di latar mendapati isi yang berbeda;
// halaman menggunakannya untuk menggambar ulang. Kegagalan pembaruan di latar
// tidak dilaporkan ke layar: halaman sudah punya data yang bisa dipakai, dan
// yang gagal itu hanya usaha memperbaruinya.
export async function muatRujukan(sb, daftar, saatBerubah) {
    const hasil = {};
    const belumAda = [];
    for (const n of daftar) {
        const d = baca(n);
        if (d) hasil[n] = d; else belumAda.push(n);
    }

    if (belumAda.length) {
        Object.assign(hasil, await ambilBanyak(sb, belumAda));
    }

    // Yang tadi dibaca dari simpanan diperbarui di latar.
    const dariSimpanan = daftar.filter((n) => !belumAda.includes(n));
    if (dariSimpanan.length) {
        ambilBanyak(sb, dariSimpanan).then((baru) => {
            const berubah = dariSimpanan.filter((n) => !sama(baru[n], hasil[n]));
            if (!berubah.length) return;
            for (const n of berubah) hasil[n] = baru[n];
            if (typeof saatBerubah === "function") saatBerubah({ ...hasil }, berubah);
        }).catch((err) => console.warn("Pembaruan rujukan di latar gagal:", err?.message || err));
    }

    return hasil;
}

// Dipanggil sesudah halaman ini sendiri mengubah salah satu rujukan: ambil
// versi terbaru dari jaringan, simpan, kembalikan. Ditunggu, bukan di latar,
// karena yang memanggil memang sedang ingin melihat hasil perubahannya.
export async function segarkanRujukan(sb, nama) {
    const data = await ambil(sb, nama);
    tulis(nama, data);
    return data;
}
