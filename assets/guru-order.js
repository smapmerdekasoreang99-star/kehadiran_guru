// =========================================================
// Urutan daftar guru — Sistem Guru Pengganti
// =========================================================
// Kebiasaan sekolah: daftar guru disusun menurut masa kerja, yang paling lama
// lebih dulu. Dasarnya kolom guru.tmt_sekolah — masa kerja di sekolah lain
// tidak diakui (keputusan yayasan), jadi TMT sekolah itulah satu-satunya
// ukuran masa kerja di seluruh aplikasi.
//
// Dua hal yang ditangani di sini supaya tidak ditulis ulang di tiap halaman:
//   * guru yang TMT-nya belum diisi ditaruh paling akhir, bukan di depan
//     (string kosong akan selalu menang bila dibandingkan apa adanya);
//   * TMT yang sama dipakai beberapa guru, jadi selalu ada pemecah seri nama.

export function urutGuru(a, b) {
    const ta = a?.tmt_sekolah || "";
    const tb = b?.tmt_sekolah || "";
    if (ta !== tb) {
        if (!ta) return 1;
        if (!tb) return -1;
        return ta < tb ? -1 : 1;     // TMT lebih awal = masa kerja lebih lama
    }
    return String(a?.nama || "").localeCompare(String(b?.nama || ""), "id");
}

export const urutkanGuru = (daftar) => [...(daftar || [])].sort(urutGuru);

// Peringkat menurut daftar guru yang sudah urut. Dipakai daftar turunan —
// rekap, petugas piket, saran pengganti — supaya mengikuti urutan yang sama
// tanpa harus ikut membawa kolom TMT ke mana-mana.
export function peringkatGuru(daftarGuru) {
    const posisi = new Map();
    urutkanGuru(daftarGuru).forEach((g, i) => posisi.set(g.id, i));
    return (guruId) => (posisi.has(guruId) ? posisi.get(guruId) : Number.MAX_SAFE_INTEGER);
}

// Untuk query PostgREST: .order(...KOLOM_URUT_1).order(...KOLOM_URUT_2)
export const terapkanUrutan = (q) =>
    q.order("tmt_sekolah", { nullsFirst: false }).order("nama");
