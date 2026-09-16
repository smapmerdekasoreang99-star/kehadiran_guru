// =========================================================
// Perhitungan rekap — fungsi murni (tanpa DOM), dipakai scripts/rekap.js
// =========================================================

const HARI_FROM_JS_DAY = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
export const STATUS_ABSEN = ["ST", "STT", "IT", "ITT", "TK", "HTTM"];

// Mata pelajaran yang termasuk TUGAS WALI KELAS (Senin jam 1-2): dihitung terpisah dari jam mengajar
export const MAPEL_WALI_KELAS = ["M08", "M25"]; // M08 = Bimbingan Wali Kelas, M25 = Upacara

// Memisahkan jadwal menjadi { mengajar, wali } dan ketidakhadiran mengikuti jadwalnya
export function pisahWaliKelas(jadwal, ketidakhadiran) {
    const wali = jadwal.filter((j) => MAPEL_WALI_KELAS.includes(j.mapel_id));
    const mengajar = jadwal.filter((j) => !MAPEL_WALI_KELAS.includes(j.mapel_id));
    const idWali = new Set(wali.map((j) => j.id));
    return {
        mengajar, wali,
        ketMengajar: ketidakhadiran.filter((k) => !idWali.has(k.jadwal_id)),
        ketWali: ketidakhadiran.filter((k) => idWali.has(k.jadwal_id)),
    };
}

// Bobot kehadiran per status (kebijakan sekolah): dianggap hadir sekian persen
export const BOBOT_HADIR = { HTTM: 1.0, ST: 0.20, STT: 0.15, IT: 0.10, ITT: 0.05, TK: 0.0 };

export function isoTanggal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Daftar tanggal kerja (Senin-Jumat, bukan libur) dalam rentang, beserta nama harinya
export function hariKerja(awal, akhir, liburSet) {
    const out = [];
    const d = new Date(awal + "T00:00:00");
    const end = new Date(akhir + "T00:00:00");
    while (d <= end) {
        const iso = isoTanggal(d);
        const hari = HARI_FROM_JS_DAY[d.getDay()];
        if (hari !== "Sabtu" && hari !== "Minggu" && !liburSet.has(iso)) out.push({ tanggal: iso, hari });
        d.setDate(d.getDate() + 1);
    }
    return out;
}

// ---------- Rekap kehadiran per guru ----------
// jadwal: [{ id, hari, jam_ke, guru_id }]  ketidakhadiran: [{ jadwal_id, tanggal, guru_id, status }]
export function rekapKehadiran({ jadwal, ketidakhadiran, awal, akhir, liburSet }) {
    const hari = hariKerja(awal, akhir, liburSet);
    const jumlahHari = {};
    for (const h of hari) jumlahHari[h.hari] = (jumlahHari[h.hari] || 0) + 1;
    const tanggalSet = new Set(hari.map((h) => h.tanggal));

    const per = new Map();
    const baris = (gid) => {
        if (!per.has(gid)) per.set(gid, { guru_id: gid, terjadwal: 0, ST: 0, STT: 0, IT: 0, ITT: 0, TK: 0, HTTM: 0 });
        return per.get(gid);
    };
    for (const j of jadwal) {
        const n = jumlahHari[j.hari] || 0;
        if (n) baris(j.guru_id).terjadwal += n;
    }
    for (const k of ketidakhadiran) {
        if (!tanggalSet.has(k.tanggal)) continue; // di luar rentang / hari libur
        const b = baris(k.guru_id);
        if (b[k.status] !== undefined) b[k.status] += 1;
    }
    const hitungBobot = (b) =>
        b.hadirTM + STATUS_ABSEN.reduce((a, st) => a + b[st] * (BOBOT_HADIR[st] ?? 0), 0);
    const hasil = [];
    for (const b of per.values()) {
        const tidakHadir = b.ST + b.STT + b.IT + b.ITT + b.TK;
        const hadirTM = Math.max(0, b.terjadwal - tidakHadir - b.HTTM);
        const row = { ...b, tidakHadir, hadirTM };
        row.hadir = Math.round(hitungBobot(row) * 100) / 100; // jam hadir berbobot
        row.persen = b.terjadwal ? Math.round((row.hadir / b.terjadwal) * 10000) / 100 : null;
        hasil.push(row);
    }
    const total = hasil.reduce((t, r) => {
        for (const k of ["terjadwal", "ST", "STT", "IT", "ITT", "TK", "HTTM", "tidakHadir", "hadirTM"]) t[k] += r[k];
        return t;
    }, { terjadwal: 0, ST: 0, STT: 0, IT: 0, ITT: 0, TK: 0, HTTM: 0, tidakHadir: 0, hadirTM: 0 });
    total.hadir = Math.round(hitungBobot(total) * 100) / 100;
    total.persen = total.terjadwal ? Math.round((total.hadir / total.terjadwal) * 10000) / 100 : null;
    return { baris: hasil, total, jumlahHariKerja: hari.length };
}

// ---------- Rekap guru pengganti ----------
// penugasan: [{ ketidakhadiran_id, guru_pengganti_id, status_pengganti }]
// ketidakhadiran: [{ id, jadwal_id, tanggal, guru_id, status }]  jadwal: [{ id, jam_ke, kelas_id, mapel_id, guru_id }]
export function rekapPengganti({ penugasan, ketidakhadiran, jadwal, awal, akhir }) {
    const kMap = new Map(ketidakhadiran.map((k) => [k.id, k]));
    const jMap = new Map(jadwal.map((j) => [j.id, j]));
    const per = new Map();
    const rincian = [];
    let tanpaPengganti = 0;
    for (const p of penugasan) {
        const k = kMap.get(p.ketidakhadiran_id);
        if (!k || k.tanggal < awal || k.tanggal > akhir) continue;
        const j = jMap.get(k.jadwal_id);
        if (!j) continue;
        if (p.status_pengganti === "TP" || !p.guru_pengganti_id) { tanpaPengganti++; rincian.push({ tanggal: k.tanggal, jam_ke: j.jam_ke, kelas_id: j.kelas_id, mapel_id: j.mapel_id, guru_id: j.guru_id, status: k.status, pengganti_id: null, kode: "TP" }); continue; }
        if (!per.has(p.guru_pengganti_id)) per.set(p.guru_pengganti_id, { guru_id: p.guru_pengganti_id, GT: 0, PT: 0, Inf: 0, total: 0 });
        const b = per.get(p.guru_pengganti_id);
        if (b[p.status_pengganti] !== undefined) b[p.status_pengganti] += 1;
        b.total += 1;
        rincian.push({ tanggal: k.tanggal, jam_ke: j.jam_ke, kelas_id: j.kelas_id, mapel_id: j.mapel_id, guru_id: j.guru_id, status: k.status, pengganti_id: p.guru_pengganti_id, kode: p.status_pengganti });
    }
    rincian.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.jam_ke - b.jam_ke);
    const baris = [...per.values()].sort((a, b) => b.total - a.total);
    const total = baris.reduce((t, r) => ({ GT: t.GT + r.GT, PT: t.PT + r.PT, Inf: t.Inf + r.Inf, total: t.total + r.total }), { GT: 0, PT: 0, Inf: 0, total: 0 });
    return { baris, total, rincian, tanpaPengganti };
}

// ---------- CSV ----------
export function keCSV(header, rows) {
    const esc = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return "\uFEFF" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
}

// =========================================================
// HONOR MENGAJAR (mengacu dokumen Pembiayaan Tendik)
// 4 komponen:
//   1. Honor Mengajar      : tarif menurut masa kerja x jam mengajar (kontrak per minggu)
//   2. Transport Berdiri   : tarif tetap x jam mengajar (kontrak per minggu)
//   3. Insentif Tatap Muka : tarif tetap x jam hadir tatap muka (dari rekap kehadiran)
//   4. Konsumsi Kedatangan : tarif tetap x hari kedatangan
// =========================================================

// Tarif honor per jam menurut masa kerja (tahun). Nilai bawaan dokumen pembiayaan.
export const TARIF_MASA_KERJA_DEFAULT = [
    { min: 0,  max: 1,    tarif: 20000 },
    { min: 2,  max: 4,    tarif: 21000 },
    { min: 5,  max: 7,    tarif: 22000 },
    { min: 8,  max: 10,   tarif: 23000 },
    { min: 11, max: 13,   tarif: 24000 },
    { min: 14, max: 16,   tarif: 25000 },
    { min: 17, max: 19,   tarif: 26000 },
    { min: 20, max: 22,   tarif: 27000 },
    { min: 23, max: 25,   tarif: 28000 },
    { min: 26, max: 999,  tarif: 29000 },
];

export function tarifMenurutMasaKerja(tahun, daftar = TARIF_MASA_KERJA_DEFAULT) {
    if (tahun === null || tahun === undefined) return null;
    const b = daftar.find((x) => tahun >= x.min && tahun <= x.max);
    return b ? b.tarif : null;
}

// Masa kerja penuh (tahun) dari tanggal mulai sampai tanggal akhir periode
export function masaKerjaTahun(tmt, sampai) {
    if (!tmt) return null;
    const a = new Date(tmt + "T00:00:00"), b = new Date(sampai + "T00:00:00");
    if (isNaN(a)) return null;
    let th = b.getFullYear() - a.getFullYear();
    const blm = b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate());
    if (blm) th -= 1;
    return Math.max(0, th);
}

// Hari kedatangan per guru: hari kerja yang guru punya jadwal DAN paling sedikit
// satu jamnya benar-benar hadir tatap muka. Seluruh jam berstatus apa pun
// (termasuk HTTM) berarti hari itu tidak dihitung sebagai hari kedatangan.
export function hitungHariKedatangan({ jadwal, ketidakhadiran, awal, akhir, liburSet }) {
    const hari = hariKerja(awal, akhir, liburSet);
    const absen = new Map(); // "guru|tanggal" -> jumlah jam tanpa tatap muka
    for (const k of ketidakhadiran) {
        const key = `${k.guru_id}|${k.tanggal}`;
        absen.set(key, (absen.get(key) || 0) + 1);
    }
    const jadwalPerHari = new Map(); // "guru|Hari" -> jumlah jam
    for (const j of jadwal) {
        const key = `${j.guru_id}|${j.hari}`;
        jadwalPerHari.set(key, (jadwalPerHari.get(key) || 0) + 1);
    }
    const hasil = new Map();
    for (const h of hari) {
        for (const [key, jumlahJam] of jadwalPerHari) {
            const [gid, namaHari] = key.split("|");
            if (namaHari !== h.hari) continue;
            const tanpaTatapMuka = absen.get(`${gid}|${h.tanggal}`) || 0;
            if (tanpaTatapMuka < jumlahJam) hasil.set(gid, (hasil.get(gid) || 0) + 1);
        }
    }
    return hasil; // Map guru_id -> jumlah hari
}

// Jam mengajar kontrak per minggu (jumlah baris jadwal mingguan per guru)
export function jamKontrakPerMinggu(jadwal) {
    const m = new Map();
    for (const j of jadwal) m.set(j.guru_id, (m.get(j.guru_id) || 0) + 1);
    return m;
}

// tarif: { masaKerja: [...], transport_berdiri, insentif_tm, konsumsi }
// barisKehadiran: hasil rekapKehadiran (untuk jam hadir tatap muka)
// jamTambahan: [{ guru_id, jam, keterangan }] — tugas tambahan di luar jadwal KBM
export function rekapHonorMengajar({ jadwal, ketidakhadiran, barisKehadiran, guruList, awal, akhir, liburSet, tarif, jamTambahan = [] }) {
    const jamKontrak = jamKontrakPerMinggu(jadwal);
    for (const t of jamTambahan) {
        const n = Number(t.jam) || 0;
        if (n) jamKontrak.set(t.guru_id, (jamKontrak.get(t.guru_id) || 0) + n);
    }
    const tambahanMap = new Map(jamTambahan.map((t) => [t.guru_id, t]));
    const hariDatang = hitungHariKedatangan({ jadwal, ketidakhadiran, awal, akhir, liburSet });
    const hadirMap = new Map(barisKehadiran.map((b) => [b.guru_id, b]));

    const baris = [];
    for (const [gid, jam] of jamKontrak) {
        const g = guruList.find((x) => x.id === gid);
        const masaKerja = masaKerjaTahun(g?.tmt_sekolah, akhir);
        const tarifJam = tarifMenurutMasaKerja(masaKerja, tarif.masaKerja) ?? 0;
        const hadirTM = hadirMap.get(gid)?.hadirTM ?? 0;
        const hari = hariDatang.get(gid) || 0;

        const honorGuru  = jam * tarifJam;
        const transport  = jam * tarif.transport_berdiri;
        const insentif   = hadirTM * tarif.insentif_tm;
        const konsumsi   = hari * tarif.konsumsi;
        const tmb = tambahanMap.get(gid);
        baris.push({
            guru_id: gid, nama: g?.nama || gid,
            masaKerja, jam, tarifJam,
            jamTambahan: Number(tmb?.jam) || 0,
            ketTambahan: tmb?.keterangan || "",
            honorGuru, transport,
            jamTM: hadirTM, insentif,
            hariDatang: hari, konsumsi,
            jumlah: honorGuru + transport + insentif + konsumsi,
        });
    }
    baris.sort((a, b) => (b.masaKerja ?? -1) - (a.masaKerja ?? -1) || a.nama.localeCompare(b.nama));
    const total = baris.reduce((t, r) => {
        for (const k of ["jam", "honorGuru", "transport", "jamTM", "insentif", "hariDatang", "konsumsi", "jumlah"]) t[k] += r[k];
        return t;
    }, { jam: 0, honorGuru: 0, transport: 0, jamTM: 0, insentif: 0, hariDatang: 0, konsumsi: 0, jumlah: 0 });
    return { baris, total };
}
