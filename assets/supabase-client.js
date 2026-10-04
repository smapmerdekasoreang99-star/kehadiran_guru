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

/* Batas waktu permintaan (4 Oktober 2026). Jaringan sekolah kadang macet di
   tengah jalan; tanpa batas, halaman menunggu selamanya — tabel tidak muncul,
   tombol tidak bereaksi, tanpa pesan apa pun. Sekarang permintaan yang tidak
   dijawab dalam BATAS_WAKTU dihentikan dan pesannya tampil seperti galat
   biasa.

   Pembacaan (GET, dan fungsi baca kg_rekap) dicoba sekali lagi bila
   sambungannya putus, waktunya habis, atau server sibuk (502/503/504).
   Penyimpanan (POST/PATCH/DELETE) TIDAK PERNAH diulang sendiri: bisa saja
   sudah tersimpan di server walaupun jawabannya tidak sampai, dan
   mengulangnya bisa menyimpan dua kali. Pesannya meminta memeriksa dulu. */
const BATAS_WAKTU = 30000;
const RPC_BACA = ["/rest/v1/rpc/kg_rekap"];
const jeda = (ms) => new Promise((s) => setTimeout(s, ms));

async function fetchBerbatas(input, init = {}) {
    const alamat = String(typeof input === "string" ? input : input?.url || "");
    const metode = String(init.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();
    const baca = metode === "GET" || metode === "HEAD" || RPC_BACA.some((r) => alamat.includes(r));
    for (let coba = 0; ; coba++) {
        const henti = new AbortController();
        const jam = setTimeout(() => henti.abort(), BATAS_WAKTU);
        // Pembatalan dari pemanggil (bila ada) tetap dihormati.
        if (init.signal) {
            if (init.signal.aborted) henti.abort();
            else init.signal.addEventListener("abort", () => henti.abort(), { once: true });
        }
        try {
            const r = await fetch(input, { ...init, signal: henti.signal });
            if (baca && coba === 0 && [502, 503, 504].includes(r.status)) { await jeda(1500); continue; }
            return r;
        } catch (err) {
            if (init.signal?.aborted) throw err;
            if (baca && coba === 0) { await jeda(1500); continue; }
            const habis = err?.name === "AbortError";
            throw Object.assign(new Error(baca
                ? (habis ? `Server tidak menjawab dalam ${BATAS_WAKTU / 1000} detik.` : "Sambungan internet terputus.")
                  + " Periksa jaringan lalu coba lagi."
                : (habis ? "Server terlalu lama menjawab saat menyimpan." : "Sambungan terputus saat menyimpan.")
                  + " Perubahan mungkin sudah tersimpan — muat ulang halaman ini dan periksa sebelum mengulang."),
                { name: habis ? "Waktu habis" : "Sambungan terputus" });
        } finally { clearTimeout(jam); }
    }
}

export const supabaseClient = isSupabaseConfigured
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch: fetchBerbatas } })
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
