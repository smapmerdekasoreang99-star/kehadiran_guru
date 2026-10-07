// =========================================================
// Libur sebagian — aturan bersama (tanpa DOM)
// =========================================================
//
// Dua macam libur:
//   kg_hari_libur   seluruh sekolah, sehari penuh. Tanggalnya keluar dari
//                   hari kerja — guru, staf, dan piket.
//   libur_sebagian  hanya tingkat/kelas tertentu dan/atau sebagian jam.
//                   Hari itu tetap hari kerja; yang hilang hanya jam
//                   pelajaran yang tercakup.
//
// Aturan cakupan di sini SAMA dengan fungsi f_libur_jadwal di database
// (database/supabase/migrations/20261007113132_...). Bila salah satu diubah,
// ubah keduanya.

import { semesterBaris } from "./semester.js?v=20260921ad";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const ada = (a) => Array.isArray(a) && a.length > 0;

/* Konteks pencocokan: tingkat tiap kelas, dan rombel asal anggota tiap
   kelompok (kg_kelompok_rombel: [{ kelompok_id, rombel_kelas_id }]). */
export function konteksLibur(kelas, kelompokRombel) {
    const tingkat = new Map((kelas || []).map((k) => [k.id, Number(k.tingkat)]));
    const anggota = new Map();
    for (const r of kelompokRombel || []) {
        if (!anggota.has(r.kelompok_id)) anggota.set(r.kelompok_id, []);
        anggota.get(r.kelompok_id).push(r.rombel_kelas_id);
    }
    return { tingkat, anggota };
}

// Kelas tercakup karena dirinya sendiri: dipilih langsung, tingkatnya dipilih, atau tanpa batas kelas.
function cocokLangsung(l, kelasId, ktx) {
    if (ada(l.kelas_id)) return l.kelas_id.includes(kelasId);
    if (ada(l.tingkat)) return l.tingkat.includes(ktx.tingkat.get(kelasId));
    return true;
}

/* Apakah satu baris jadwal (j: { kelas_id, jam_ke }) tercakup satu catatan
   libur sebagian. Kelompok (Tahsin, Matematika Dasar) juga tercakup bila
   SELURUH rombel asal anggotanya tercakup — kelompok campuran kelas 11 dan
   12 tetap berjalan bila hanya kelas 12 yang libur. */
export function mencakup(l, j, ktx) {
    if (l.jam_dari != null && (j.jam_ke < l.jam_dari || j.jam_ke > l.jam_sampai)) return false;
    if (cocokLangsung(l, j.kelas_id, ktx)) return true;
    const rombel = ktx.anggota.get(j.kelas_id);
    return !!rombel && rombel.length > 0 && rombel.every((id) => cocokLangsung(l, id, ktx));
}

/* Jam pelajaran yang diliburkan: Set "tanggal|jadwal_id", hanya pada hari
   kerja (hari: [{ tanggal, hari, semester }]) dan jadwal semester tanggal itu. */
export function jamDiliburkan({ jadwal, hari, libur, kelas, kelompokRombel }) {
    const out = new Set();
    if (!ada(libur)) return out;
    const ktx = konteksLibur(kelas, kelompokRombel);
    const perTanggal = new Map();
    for (const l of libur) {
        if (!perTanggal.has(l.tanggal)) perTanggal.set(l.tanggal, []);
        perTanggal.get(l.tanggal).push(l);
    }
    for (const h of hari) {
        const ls = perTanggal.get(h.tanggal);
        if (!ls) continue;
        for (const j of jadwal) {
            if (j.hari !== h.hari || semesterBaris(j) !== h.semester) continue;
            if (ls.some((l) => mencakup(l, j, ktx))) out.add(h.tanggal + "|" + j.id);
        }
    }
    return out;
}

// ---------- Uraian untuk layar ----------

export const namaHari = (iso) => HARI[new Date(iso + "T00:00:00").getDay()];
export const tanggalLengkap = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
};
export const bulanTahun = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return `${BULAN[d.getMonth()]} ${d.getFullYear()}`;
};
export const bulanPendek = (iso) => BULAN[new Date(iso + "T00:00:00").getMonth()].slice(0, 3);

export const labelTingkat = (t) => `Tingkat ${t}`;

// "Seluruh sekolah" · "Tingkat 12" · "Tingkat 10 & 11" · "Kelas 10-1, 10-2 +3"
export function uraianCakupan(l, namaKelas, batas = 4) {
    if (ada(l.kelas_id)) {
        const nama = l.kelas_id.map(namaKelas);
        const lebih = nama.length - batas;
        return "Kelas " + nama.slice(0, batas).join(", ") + (lebih > 0 ? ` +${lebih} lainnya` : "");
    }
    if (ada(l.tingkat)) {
        const t = [...l.tingkat].sort((a, b) => a - b);
        return "Tingkat " + (t.length === 1 ? t[0] : t.slice(0, -1).join(", ") + " & " + t[t.length - 1]);
    }
    return "Seluruh sekolah";
}

// "Sehari penuh" · "Jam ke-5" · "Jam ke-5 s.d. 12"
export function uraianJam(l) {
    if (l.jam_dari == null) return "Sehari penuh";
    return l.jam_dari === l.jam_sampai ? `Jam ke-${l.jam_dari}` : `Jam ke-${l.jam_dari} s.d. ${l.jam_sampai}`;
}

// Rentang waktu jam pelajaran, mis. "10.15–14.30", dari daftar kg_jam_pelajaran.
export function waktuJam(dari, sampai, daftarJam) {
    const a = (daftarJam || []).find((j) => Number(j.jam_ke) === Number(dari));
    const b = (daftarJam || []).find((j) => Number(j.jam_ke) === Number(sampai));
    if (!a || !b) return "";
    const rapi = (t) => String(t || "").slice(0, 5).replace(":", ".");
    return `${rapi(a.mulai)}–${rapi(b.selesai)}`;
}
