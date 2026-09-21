// =========================================================
// Perhitungan rekap — fungsi murni (tanpa DOM), dipakai scripts/rekap.js
// =========================================================

import { semesterTanggal, semesterBaris } from "./semester.js?v=20260921ad";

const HARI_FROM_JS_DAY = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
export const STATUS_ABSEN = ["ST", "STT", "IT", "ITT", "TK", "HTTM"];

/* Mata pelajaran yang termasuk TUGAS WALI KELAS (Senin jam 1-2): dihitung
   terpisah dari jam mengajar.

   Di rekap ini keduanya DIGABUNG, karena yang diukur di sini adalah
   kehadiran untuk penilaian kinerja — bukan uang. Pemisahan menurut tarif
   memang perlu, tetapi tempatnya di Induk Pembiayaan, yang memang
   mengenal besaran honor tiap komponen.

   Kode komponennya tetap dicatat di sini supaya keterkaitannya dengan
   Induk Pembiayaan (v_komponen_guru, f_ip_honor_wali_kelas) tidak hilang
   dari pandangan bila kelak perlu dipisah. */
export const KOMPONEN_WALI = [
    { mapel: "M25", kode: "UPACARA",   nama: "Upacara" },
    { mapel: "M08", kode: "BIMBINGAN", nama: "Bimbingan Wali Kelas" },
];
export const MAPEL_WALI_KELAS = KOMPONEN_WALI.map((k) => k.mapel);

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
        if (hari !== "Sabtu" && hari !== "Minggu" && !liburSet.has(iso)) out.push({ tanggal: iso, hari, semester: semesterTanggal(iso) });
        d.setDate(d.getDate() + 1);
    }
    return out;
}

/* Rekap tugas wali kelas: SATU baris per orang, tetapi kehadirannya
   disertai rincian Upacara dan Bimbingan.

   Yang dinilai di aplikasi ini kinerja, jadi angka yang dipakai tetap
   gabungan keduanya. Rinciannya disertakan karena maknanya berbeda:
   tidak hadir upacara dan tidak hadir bimbingan bukan hal yang sama bagi
   seorang wali kelas, meskipun keduanya sama-sama satu jam.

   Perhitungannya memanggil rekapKehadiran yang sama seperti jam mengajar —
   sekali untuk gabungan, sekali untuk tiap komponen — supaya bobot status
   dan cara menghitung hari kerja tidak mungkin berbeda antar angka. */
export function rekapWali({ jadwal, ketidakhadiran, awal, akhir, liburSet }) {
    const gabungan = rekapKehadiran({ jadwal, ketidakhadiran, awal, akhir, liburSet });
    const perKode = {};
    for (const k of KOMPONEN_WALI) {
        const jadwalK = jadwal.filter((j) => j.mapel_id === k.mapel);
        const idK = new Set(jadwalK.map((j) => j.id));
        perKode[k.kode] = rekapKehadiran({
            jadwal: jadwalK,
            ketidakhadiran: ketidakhadiran.filter((x) => idK.has(x.jadwal_id)),
            awal, akhir, liburSet,
        });
    }
    const ambil = (r, gid, medan) =>
        (r.baris.find((b) => b.guru_id === gid) || {})[medan] || 0;
    return {
        ...gabungan,
        baris: gabungan.baris.map((b) => ({
            ...b,
            hadirUpacara: ambil(perKode.UPACARA, b.guru_id, 'hadirTM'),
            hadirBimbingan: ambil(perKode.BIMBINGAN, b.guru_id, 'hadirTM'),
        })),
        total: {
            ...gabungan.total,
            hadirUpacara: perKode.UPACARA.total.hadirTM,
            hadirBimbingan: perKode.BIMBINGAN.total.hadirTM,
        },
    };
}

// ---------- Rekap kehadiran per guru ----------
// jadwal: [{ id, hari, jam_ke, guru_id }]  ketidakhadiran: [{ jadwal_id, tanggal, guru_id, status }]
export function rekapKehadiran({ jadwal, ketidakhadiran, awal, akhir, liburSet }) {
    const hari = hariKerja(awal, akhir, liburSet);
    // Jumlah hari kerja dihitung PER SEMESTER, karena rentangnya boleh
    // melintasi pergantian semester (Desember–Januari): baris jadwal semester 1
    // hanya dikalikan hari-hari semester 1, dan seterusnya.
    const jumlahHari = { 1: {}, 2: {} };
    for (const h of hari) jumlahHari[h.semester][h.hari] = (jumlahHari[h.semester][h.hari] || 0) + 1;
    const tanggalSet = new Set(hari.map((h) => h.tanggal));

    const per = new Map();
    const baris = (gid) => {
        if (!per.has(gid)) per.set(gid, { guru_id: gid, terjadwal: 0, ST: 0, STT: 0, IT: 0, ITT: 0, TK: 0, HTTM: 0 });
        return per.get(gid);
    };
    for (const j of jadwal) {
        const n = (jumlahHari[semesterBaris(j)] || {})[j.hari] || 0;
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
// Perhitungan honor mengajar pernah ada di berkas ini. Sejak pembiayaan
// dipindahkan ke aplikasi Induk Pembiayaan, rumusnya tinggal satu tempat:
// fungsi f_ip_honor_mengajar di database. Sengaja tidak ditinggalkan salinan
// di sini — dua salinan pasti menyimpang begitu salah satunya diperbaiki,
// dan untuk angka yang dibayarkan itu berarti dua dokumen resmi yang berbeda.
// =========================================================
