// =========================================================
// Pembantu bersama: escape HTML, pengambilan berhalaman, tombol sibuk
// =========================================================
// Dibuat 4 Oktober 2026 dari temuan audit:
//
// 1. Nama guru, nama kelas, dan keterangan hari libur bisa ditulis siapa pun
//    yang memegang kunci anon. Halaman yang menyisipkannya ke innerHTML
//    tanpa di-escape menjalankan skrip sisipan di peramban operator. Semua
//    teks dari database (dan dari simpanan localStorage, yang sama tidak
//    terpercayanya) harus lewat esc() — termasuk di dalam atribut.
// 2. PostgREST memotong jawaban di 1.000 baris tanpa error. Catatan piket,
//    ketidakhadiran, dan kehadiran staf per rentang mudah melewati itu;
//    baris sisanya hilang diam-diam, total jadi kurang, dan penyimpanan yang
//    membandingkan dengan data terbaca bisa salah. ambilSemua() mengambil
//    semuanya per halaman, seperti jadwal di simpanan.js.
// 3. Pada jaringan lambat, tombol simpan yang masih bisa diketuk saat
//    menunggu membuat simpanan ganda. tombolSibuk() menonaktifkannya sampai
//    selesai.
// =========================================================

export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const BATAS = 1000;   // sama dengan max_rows PostgREST di project ini

// buatKueri: fungsi yang mengembalikan kueri supabase-js BARU dengan urutan
// yang pasti (mis. .order("id")) — tanpa urutan, halaman bisa tumpang tindih.
// Dua halaman pertama diminta serentak supaya kasus lazim (sedikit di atas
// seribu) tetap satu perjalanan jaringan.
export async function ambilSemua(buatKueri) {
    const halaman = (mulai) => buatKueri().range(mulai, mulai + BATAS - 1);
    const [satu, dua] = await Promise.all([halaman(0), halaman(BATAS)]);
    if (satu.error) return { data: null, error: satu.error };
    if (dua.error) return { data: null, error: dua.error };
    let semua = (satu.data || []).concat(dua.data || []);
    if ((satu.data || []).length < BATAS) return { data: satu.data || [], error: null };
    for (let mulai = 2 * BATAS; (dua.data || []).length === BATAS && semua.length === mulai; mulai += BATAS) {
        const { data, error } = await halaman(mulai);
        if (error) return { data: null, error };
        semua = semua.concat(data || []);
        if (!data || data.length < BATAS) break;
    }
    return { data: semua, error: null };
}

/* Pustaka Excel dimuat saat dipakai, bukan saat halaman dibuka (4 Oktober
   2026): ExcelJS (~250 KB terkompresi) dan SheetJS (~300 KB) dulu menahan
   tampilan setiap halaman yang memuatnya, padahal hanya dipakai ketika
   tombol unduh/unggah ditekan. Dimuat sekali, dengan Subresource Integrity
   — isinya harus persis berkas yang sudah diperiksa, jadi CDN yang disusupi
   tidak bisa menjalankan kode di halaman. Bila versinya diganti, hash-nya
   ikut diganti. SheetJS 0.20.3 di-host sendiri (assets/vendor/): versi 0.18.5
   dari cdnjs punya celah prototype pollution (CVE-2023-30533) dan ReDoS
   (CVE-2024-22363), padahal ia membaca berkas unggahan; cdnjs tidak pernah
   menerbitkan versi sesudahnya. */
const pustakaDimuat = {};
function muatPustaka(src, integrity, nama, pesan) {
    if (window[nama]) return Promise.resolve(window[nama]);
    if (!pustakaDimuat[src]) pustakaDimuat[src] = new Promise((selesai, gagal) => {
        const sc = document.createElement("script");
        sc.src = src;
        sc.integrity = integrity;
        sc.crossOrigin = "anonymous";
        sc.onload = () => (window[nama] ? selesai(window[nama]) : gagal(new Error(pesan)));
        sc.onerror = () => { delete pustakaDimuat[src]; sc.remove(); gagal(new Error(pesan)); };
        document.head.appendChild(sc);
    });
    return pustakaDimuat[src];
}
export const muatExcelJS = () => muatPustaka(
    "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js",
    "sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz",
    "ExcelJS", "Pustaka pembuat Excel gagal dimuat. Periksa sambungan internet, lalu coba lagi.");
export const muatXLSX = () => muatPustaka(
    "assets/vendor/xlsx-0.20.3.full.min.js",
    "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT",
    "XLSX", "Pembaca Excel (SheetJS) gagal dimuat. Periksa sambungan internet, lalu coba lagi.");

// Jalankan fn dengan tombol dinonaktifkan sampai selesai (berhasil atau gagal).
// Ketukan kedua selama menunggu diabaikan.
export async function tombolSibuk(tombol, fn) {
    if (tombol && tombol.disabled) return;
    if (tombol) tombol.disabled = true;
    try { return await fn(); }
    finally { if (tombol) tombol.disabled = false; }
}
