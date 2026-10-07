// =========================================================
// Perhitungan rekap — fungsi murni (tanpa DOM), dipakai scripts/rekap.js
// =========================================================

import { semesterTanggal, semesterBaris } from "./semester.js?v=20260921ad";
import { jamDiliburkan } from "./libur.js?v=20261007a";

const HARI_FROM_JS_DAY = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
export const STATUS_ABSEN = ["ST", "IT", "TK", "HTTM"];

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
export const BOBOT_HADIR = { HTTM: 1.0, ST: 0.20, IT: 0.10, TK: 0.0 };

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

/* Rekap tugas wali kelas: SATU baris per orang, dengan Terjadwal dan
   Hadir dirinci per komponen — Upacara dan Bimbingan Wali Kelas.

   Rinciannya perlu karena maknanya berbeda: tidak hadir upacara dan tidak
   hadir bimbingan bukan hal yang sama bagi seorang wali kelas, meskipun
   keduanya sama-sama satu jam. Persentase kehadirannya tetap dihitung
   dari gabungan keduanya (dengan bobot status yang sama seperti rekap
   jam mengajar), karena yang dinilai di sini kinerja.

   Perhitungannya memanggil rekapKehadiran yang sama seperti jam mengajar —
   sekali untuk gabungan, sekali untuk tiap komponen — supaya bobot status
   dan cara menghitung hari kerja tidak mungkin berbeda antar angka. */
export function rekapWali({ jadwal, ketidakhadiran, awal, akhir, liburSet, liburSebagian, kelas }) {
    const gabungan = rekapKehadiran({ jadwal, ketidakhadiran, awal, akhir, liburSet, liburSebagian, kelas });
    const perKode = {};
    for (const k of KOMPONEN_WALI) {
        const jadwalK = jadwal.filter((j) => j.mapel_id === k.mapel);
        const idK = new Set(jadwalK.map((j) => j.id));
        perKode[k.kode] = rekapKehadiran({
            jadwal: jadwalK,
            ketidakhadiran: ketidakhadiran.filter((x) => idK.has(x.jadwal_id)),
            awal, akhir, liburSet, liburSebagian, kelas,
        });
    }
    return gabungWali(gabungan, perKode);
}

// Rekap wali kelas dari jumlah dasar server (kg_rekap): gabungan, Upacara, Bimbingan.
export function rekapWaliDariJumlah(srv, jumlahHariKerja) {
    return gabungWali(rekapDariJumlah(srv.wali, jumlahHariKerja), {
        UPACARA: rekapDariJumlah(srv.upacara, jumlahHariKerja),
        BIMBINGAN: rekapDariJumlah(srv.bimbingan, jumlahHariKerja),
    });
}

// Rincian per komponen (Upacara, Bimbingan) ditempelkan ke rekap gabungan.
function gabungWali(gabungan, perKode) {
    const ambil = (r, gid, medan) =>
        (r.baris.find((b) => b.guru_id === gid) || {})[medan] || 0;
    return {
        ...gabungan,
        baris: gabungan.baris.map((b) => ({
            ...b,
            terjadwalUpacara: ambil(perKode.UPACARA, b.guru_id, 'terjadwal'),
            hadirUpacara: ambil(perKode.UPACARA, b.guru_id, 'hadirTM'),
            terjadwalBimbingan: ambil(perKode.BIMBINGAN, b.guru_id, 'terjadwal'),
            hadirBimbingan: ambil(perKode.BIMBINGAN, b.guru_id, 'hadirTM'),
        })),
        total: {
            ...gabungan.total,
            terjadwalUpacara: perKode.UPACARA.total.terjadwal,
            hadirUpacara: perKode.UPACARA.total.hadirTM,
            terjadwalBimbingan: perKode.BIMBINGAN.total.terjadwal,
            hadirBimbingan: perKode.BIMBINGAN.total.hadirTM,
        },
    };
}

// ---------- Rekap kehadiran per guru ----------
// jadwal: [{ id, hari, jam_ke, kelas_id, guru_id }]  ketidakhadiran: [{ jadwal_id, tanggal, guru_id, status }]
// liburSebagian: baris libur_sebagian; kelas: [{ id, tingkat }] untuk mencocokkan tingkat.
export function rekapKehadiran({ jadwal, ketidakhadiran, awal, akhir, liburSet, liburSebagian = [], kelas = [] }) {
    const hari = hariKerja(awal, akhir, liburSet);
    /* Jam yang diliburkan sebagian ("tanggal|jadwal_id") keluar dari
       terjadwal, dan catatan ketidakhadiran pada jam itu diabaikan — sama
       dengan f_ip_kehadiran_dasar / kg_rekap_dasar di server. */
    const liburJam = jamDiliburkan({ jadwal, hari, libur: liburSebagian, kelas });
    const diliburkan = (k) => liburJam.has(k.tanggal + "|" + k.jadwal_id);
    // Jumlah hari kerja dihitung PER SEMESTER, karena rentangnya boleh
    // melintasi pergantian semester (Desember–Januari): baris jadwal semester 1
    // hanya dikalikan hari-hari semester 1, dan seterusnya.
    const jumlahHari = { 1: {}, 2: {} };
    for (const h of hari) jumlahHari[h.semester][h.hari] = (jumlahHari[h.semester][h.hari] || 0) + 1;
    const tanggalSet = new Set(hari.map((h) => h.tanggal));

    const per = new Map();
    const baris = (gid) => {
        if (!per.has(gid)) per.set(gid, { guru_id: gid, kontrak: 0, terjadwal: 0, ST: 0, IT: 0, TK: 0, HTTM: 0, hariTerjadwal: 0, hariDatang: 0 });
        return per.get(gid);
    };
    /* Kontrak jam = jam per MINGGU menurut jadwal, bukan jumlah jam sepanjang
       rentang — pembanding untuk Terjadwal. Diambil dari semester tanggal
       akhir rentang, karena rentang boleh melintasi pergantian semester dan
       kontrak yang berlaku adalah yang terbaru. */
    const semesterKontrak = semesterTanggal(akhir);
    for (const j of jadwal) {
        if (semesterBaris(j) === semesterKontrak) baris(j.guru_id).kontrak += 1;
        const n = (jumlahHari[semesterBaris(j)] || {})[j.hari] || 0;
        if (n) baris(j.guru_id).terjadwal += n;
    }
    const jadwalId = new Map(jadwal.map((j) => [j.id, j]));
    const liburHari = new Map();   // guru|tanggal -> jam diliburkan
    for (const kunci of liburJam) {
        const [tanggal, jid] = kunci.split("|");
        const gid = jadwalId.get(jid).guru_id;
        baris(gid).terjadwal -= 1;
        const kh = `${gid}|${tanggal}`;
        liburHari.set(kh, (liburHari.get(kh) || 0) + 1);
    }
    for (const k of ketidakhadiran) {
        if (!tanggalSet.has(k.tanggal) || diliburkan(k)) continue; // di luar rentang / hari libur / jam diliburkan
        const b = baris(k.guru_id);
        if (b[k.status] !== undefined) b[k.status] += 1;
    }
    /* Hari terjadwal = hari kerja yang ada jam mengajarnya; hari datang = hari
       terjadwal yang tidak absen pada seluruh jamnya (HTTM dihitung tidak datang).
       Hitungannya sama dengan f_ip_kehadiran_guru di Induk Pembiayaan, dasar
       Konsumsi Kedatangan (29 September 2026). */
    const jamHari = new Map();   // guru|semester|hari -> jam
    for (const j of jadwal) {
        const kunci = `${j.guru_id}|${semesterBaris(j)}|${j.hari}`;
        jamHari.set(kunci, (jamHari.get(kunci) || 0) + 1);
    }
    const absenTanggal = new Map();   // guru|tanggal -> jam tidak hadir (semua status)
    for (const k of ketidakhadiran) {
        if (!tanggalSet.has(k.tanggal) || diliburkan(k)) continue;
        const kunci =`${k.guru_id}|${k.tanggal}`;
        absenTanggal.set(kunci, (absenTanggal.get(kunci) || 0) + 1);
    }
    for (const [kunci, jam] of jamHari) {
        const [gid, sem, namaHari] = kunci.split("|");
        for (const h of hari) {
            if (String(h.semester) !== sem || h.hari !== namaHari) continue;
            // Hari yang seluruh jamnya diliburkan bukan hari terjadwal.
            const sisa = jam - (liburHari.get(`${gid}|${h.tanggal}`) || 0);
            if (sisa <= 0) continue;
            const b = baris(gid);
            b.hariTerjadwal += 1;
            if ((absenTanggal.get(`${gid}|${h.tanggal}`) || 0) < sisa) b.hariDatang += 1;
        }
    }
    return selesaikanRekap([...per.values()], hari.length);
}

/* Rumus akhir rekap dari JUMLAH DASAR per guru — { guru_id, kontrak,
   terjadwal, ST, IT, TK, HTTM, hariTerjadwal, hariDatang } — menjadi jam
   hadir tatap muka, jam hadir berbobot, persentase, dan total. Dipisah dari
   penghitungan jumlahnya (4 Oktober 2026) supaya satu rumus yang sama
   dipakai baik ketika jumlahnya dihitung peramban dari catatan mentah
   (rekapKehadiran) maupun ketika dihitung server (kg_rekap,
   rekapDariJumlah). Isinya tidak berubah dari sebelumnya. */
export function selesaikanRekap(daftar, jumlahHariKerja) {
    const hitungBobot = (b) =>
        b.hadirTM + STATUS_ABSEN.reduce((a, st) => a + b[st] * (BOBOT_HADIR[st] ?? 0), 0);
    const hasil = [];
    for (const b of daftar) {
        const tidakHadir = b.ST + b.IT + b.TK;
        const hadirTM = Math.max(0, b.terjadwal - tidakHadir - b.HTTM);
        const row = { ...b, tidakHadir, hadirTM };
        row.hadir = Math.round(hitungBobot(row) * 100) / 100; // jam hadir berbobot
        row.persen = b.terjadwal ? Math.round((row.hadir / b.terjadwal) * 10000) / 100 : null;
        hasil.push(row);
    }
    const total = hasil.reduce((t, r) => {
        for (const k of ["kontrak", "terjadwal", "ST", "IT", "TK", "HTTM", "tidakHadir", "hadirTM", "hariTerjadwal", "hariDatang"]) t[k] += r[k];
        return t;
    }, { kontrak: 0, terjadwal: 0, ST: 0, IT: 0, TK: 0, HTTM: 0, tidakHadir: 0, hadirTM: 0, hariTerjadwal: 0, hariDatang: 0 });
    total.hadir = Math.round(hitungBobot(total) * 100) / 100;
    total.persen = total.terjadwal ? Math.round((total.hadir / total.terjadwal) * 10000) / 100 : null;
    return { baris: hasil, total, jumlahHariKerja };
}

/* Rekap dari jumlah dasar yang dihitung server (kg_rekap): baris server
   { guru_id, kontrak, terjadwal, st, it, tk, httm, hari_terjadwal,
   hari_datang } diubah ke bentuk yang sama dengan rekapKehadiran, lalu
   lewat selesaikanRekap — rumus yang sama persis. */
export function rekapDariJumlah(baris, jumlahHariKerja) {
    return selesaikanRekap((baris || []).map((r) => ({
        guru_id: r.guru_id, kontrak: r.kontrak, terjadwal: r.terjadwal,
        ST: r.st, IT: r.it, TK: r.tk, HTTM: r.httm,
        hariTerjadwal: r.hari_terjadwal, hariDatang: r.hari_datang,
    })), jumlahHariKerja);
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
