// =========================================================
// Pengurutan kelas bersama — dipakai semua droplist & urutan baris tabel.
// Kelas reguler dulu (X, XI, XII; nomor urut alami), lalu kelompok Matematika
// Dasar (MD10-1, MD11-2, …; per tingkat lalu nomor), lalu kelompok Tahsin
// (tingkat 0) mengikuti urutan jenjang: Mahir -> Pratahsin -> Qolqolah -> Harokat.
// =========================================================

const URUTAN_TAHSIN = ["Mahir", "Pratahsin", "Qolqolah", "Harokat"];

// "reguler" | "md" (kelompok Matematika Dasar) | "tahsin" (kelompok Tahsin)
export function jenisKelas(k) {
    const nama = k.nama_kelas || k.id || "";
    if (Number(k.tingkat) === 0 || /^tahsin/i.test(nama) || /^TH-/i.test(k.id || "")) return "tahsin";
    if (/^MD\s*\d/i.test(nama)) return "md";
    return "reguler";
}

function kunciKelas(k) {
    const nama = k.nama_kelas || k.id || "";
    const tingkat = Number(k.tingkat);
    if (jenisKelas(k) === "tahsin") {
        const jenjang = URUTAN_TAHSIN.findIndex((j) => nama.toLowerCase().includes(j.toLowerCase()));
        const nomor = parseInt((nama.match(/(\d+)\s*$/) || [])[1] || "0", 10);
        return [2, jenjang < 0 ? 99 : jenjang, nomor, nama];
    }
    const md = nama.match(/^MD\s*(\d+)/i);
    if (md) {
        const nomor = parseInt((nama.match(/(\d+)\s*$/) || [])[1] || "0", 10);
        return [1, tingkat || Number(md[1]), nomor, nama];
    }
    // reguler: tingkat (10/11/12) bila ada, kalau tidak tebak dari awalan romawi
    let t = tingkat;
    if (!t) {
        const m = nama.match(/^(XII|XI|X)\b/i);
        t = m ? { X: 10, XI: 11, XII: 12 }[m[1].toUpperCase()] : 50;
    }
    const nomor = parseInt((nama.match(/(\d+)\s*$/) || [])[1] || "0", 10);
    return [0, t, nomor, nama];
}

function bandingKunci(a, b) {
    for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) continue;
        return typeof a[i] === "number" ? a[i] - b[i] : String(a[i]).localeCompare(String(b[i]));
    }
    return 0;
}

// Mengembalikan salinan daftar kelas yang sudah terurut
export function urutkanKelas(daftar) {
    return [...daftar].sort((a, b) => bandingKunci(kunciKelas(a), kunciKelas(b)));
}

// Peta id -> nomor urut, untuk mengurutkan baris tabel berdasarkan kelas
export function indeksKelas(daftar) {
    const map = new Map();
    urutkanKelas(daftar).forEach((k, i) => map.set(k.id, i));
    return (id) => (map.has(id) ? map.get(id) : 9999);
}
