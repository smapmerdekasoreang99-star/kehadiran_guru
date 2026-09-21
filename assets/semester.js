// =========================================================
// Semester — diturunkan dari tanggal
// =========================================================
// Database tidak menyimpan "semester berjalan": tabel tahun_ajaran hanya
// punya kode, tanggal mulai, tanggal selesai, dan penanda aktif. Yang
// bersemester adalah barisnya sendiri — jadwal_kbm.semester — jadi setiap
// halaman yang bekerja per tanggal harus tahu tanggal itu jatuh di semester
// berapa, supaya jadwal semester lain tidak ikut terbaca.
//
// Aturannya mengikuti kalender pendidikan: Juli–Desember semester 1,
// Januari–Juni semester 2. Batasnya diambil 1 Januari karena tidak pernah ada
// hari sekolah di antara akhir semester 1 dan awal semester 2 — libur
// semester selalu melintasi pergantian tahun — jadi tanggal sekolah mana pun
// jatuh ke semester yang benar.
// =========================================================

export const semesterTanggal = (iso) => (Number(String(iso).slice(5, 7)) >= 7 ? 1 : 2);

export function semesterSekarang() {
    return new Date().getMonth() + 1 >= 7 ? 1 : 2;
}

// Baris jadwal tanpa kolom semester (data contoh, data lama) dianggap semester 1.
export const semesterBaris = (baris) => Number(baris?.semester) || 1;

export const LABEL_SEMESTER = { 1: "Semester 1 · Juli–Desember", 2: "Semester 2 · Januari–Juni" };
