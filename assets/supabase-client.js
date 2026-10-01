// =========================================================
// Koneksi Supabase — Aplikasi Guru Pengganti
// SMA Plus Merdeka Soreang
// =========================================================
// Isi dua nilai di bawah ini dengan kredensial project Supabase Anda
// (Project Settings -> API -> Project URL & anon public key).
// Selama masih diisi placeholder, aplikasi otomatis berjalan
// dalam MODE PRATINJAU memakai data contoh, tanpa terhubung ke database.

const SUPABASE_URL = "https://xgtoneyvzfvfbidicotq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_rjHVGT0ULc03TC2ljIytSA_2X54xzR1";

export const isSupabaseConfigured =
    !SUPABASE_URL.startsWith("ISI_") && !SUPABASE_ANON_KEY.startsWith("ISI_");

export const supabaseClient = isSupabaseConfigured
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// Penjaga project Supabase Tryout/Matdas: paket gratis di-pause bila 7 hari
// tanpa permintaan. Perangkat yang membuka aplikasi ini mengirim satu
// permintaan teringan (tka_ping) ke sana, paling sering sekali per 12 jam.
// Gagal diabaikan; tidak memengaruhi aplikasi ini.
(function jagaTryout() {
    const URL_TRYOUT = "https://jzxcnfetpjkltjjbglxz.supabase.co";
    const KUNCI_TRYOUT = "sb_publishable_9pl5IOJl-Vx0KEnHtCs3nA_ioZOkacq";
    try {
        if (Date.now() - (+localStorage.getItem("jaga_tryout") || 0) < 12 * 3600e3) return;
        localStorage.setItem("jaga_tryout", String(Date.now()));
    } catch (e) { /* penyimpanan diblokir: tetap kirim */ }
    fetch(URL_TRYOUT + "/rest/v1/rpc/tka_ping", {
        method: "POST", body: "{}",
        headers: { "Content-Type": "application/json", apikey: KUNCI_TRYOUT, Authorization: "Bearer " + KUNCI_TRYOUT },
    }).catch(() => {});
})();
