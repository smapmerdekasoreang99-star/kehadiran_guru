// =========================================================
// Ambil seluruh baris sebuah tabel/view Supabase
// =========================================================
// PostgREST memotong hasil di 1.000 baris. Pemotongan itu TIDAK menimbulkan
// error — baris sisanya hanya hilang diam-diam, jadi halaman tampak normal
// padahal isinya kurang. Jadwal KBM satu pekan sudah lewat 1.000 baris, dan
// yang terbuang justru baris yang dimasukkan paling akhir: kelompok Tahsin
// dan Matematika Dasar. Karena itu setiap pembacaan jadwal harus bertahap.
//
// Kuerinya diminta sebagai fungsi, bukan objek jadi, karena builder Supabase
// sekali pakai: setelah di-await ia tidak bisa dipakai lagi untuk halaman
// berikutnya.
// =========================================================

export const BATAS_BARIS = 1000;

export async function ambilSemua(buatKueri) {
    let semua = [];
    for (let mulai = 0; ; mulai += BATAS_BARIS) {
        const { data, error } = await buatKueri().range(mulai, mulai + BATAS_BARIS - 1);
        if (error) return { data: null, error };
        semua = semua.concat(data || []);
        if (!data || data.length < BATAS_BARIS) return { data: semua, error: null };
    }
}
