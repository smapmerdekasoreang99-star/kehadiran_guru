// =========================================================
// Ekspor Excel — Sistem Guru Pengganti
// Memakai ExcelJS (global window.ExcelJS di browser, atau disuntikkan di Node untuk uji).
// Gaya: hemat tinta — tanpa blok warna, garis tipis, kepala tabel abu sangat muda, logo kecil.
// =========================================================

const BULAN_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const THIN = { style: "thin", color: { argb: "FF7A7A7A" } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const HEAD_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
const FONT = "Arial";

function tglIndo(iso) {
    const d = new Date(iso + "T00:00:00");
    return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

// "BULAN : AGUSTUS 2026" bila rentang tepat satu bulan penuh; selain itu "PERIODE : 1 – 15 Agustus 2026"
export function labelPeriode(awal, akhir) {
    const a = new Date(awal + "T00:00:00"), b = new Date(akhir + "T00:00:00");
    const akhirBulan = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate();
    if (a.getDate() === 1 && b.getDate() === akhirBulan && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
        return `BULAN : ${BULAN_ID[a.getMonth()].toUpperCase()} ${a.getFullYear()}`;
    }
    return `PERIODE : ${tglIndo(awal)} – ${tglIndo(akhir)}`;
}

// ---------- Terbilang (Bahasa Indonesia) ----------
const SATUAN = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
function terbilangInner(n) {
    n = Math.floor(n);
    if (n < 12) return SATUAN[n];
    if (n < 20) return terbilangInner(n - 10) + " Belas";
    if (n < 100) return (terbilangInner(Math.floor(n / 10)) + " Puluh " + terbilangInner(n % 10)).trim();
    if (n < 200) return ("Seratus " + terbilangInner(n - 100)).trim();
    if (n < 1000) return (terbilangInner(Math.floor(n / 100)) + " Ratus " + terbilangInner(n % 100)).trim();
    if (n < 2000) return ("Seribu " + terbilangInner(n - 1000)).trim();
    if (n < 1e6) return (terbilangInner(Math.floor(n / 1000)) + " Ribu " + terbilangInner(n % 1000)).trim();
    if (n < 1e9) return (terbilangInner(Math.floor(n / 1e6)) + " Juta " + terbilangInner(n % 1e6)).trim();
    return (terbilangInner(Math.floor(n / 1e9)) + " Miliar " + terbilangInner(n % 1e9)).trim();
}
export function terbilang(n) {
    if (!n) return "Nol Rupiah";
    return terbilangInner(n).replace(/\s+/g, " ").trim() + " Rupiah";
}

// ---------- Kop surat bersama ----------
function tulisKop(ws, { ExcelJS, wb, logoBase64, pengaturan, judul, sub, kolomTerakhir }) {
    if (logoBase64) {
        const imgId = wb.addImage({ base64: logoBase64, extension: "png" });
        // penjangkaran dua sel (twoCellAnchor): paling luas didukung penampil (Excel, LibreOffice, Google Sheets, WPS)
        ws.addImage(imgId, { tl: { col: 0.1, row: 0.1 }, br: { col: 1.12, row: 2.7 }, editAs: "oneCell" });
    }
    // Nama & alamat sekolah rata kiri, mulai kolom C (di samping logo); judul tetap di tengah
    ws.getCell(1, 2).value = pengaturan.nama_sekolah;
    ws.getCell(1, 2).font = { name: FONT, size: 12, bold: true };
    ws.getCell(2, 2).value = pengaturan.alamat_sekolah;
    ws.getCell(2, 2).font = { name: FONT, size: 9 };
    ws.mergeCells(1, 2, 1, kolomTerakhir); ws.mergeCells(2, 2, 2, kolomTerakhir);
    // indentasi agar teks mulai tepat di sebelah kanan logo (logo menjorok ke awal kolom B)
    ws.getCell(1, 2).alignment = { horizontal: "left", vertical: "bottom", indent: 2 };
    ws.getCell(2, 2).alignment = { horizontal: "left", vertical: "top", indent: 2 };
    ws.getCell(4, 1).value = judul;
    ws.getCell(4, 1).font = { name: FONT, size: 12, bold: true };
    ws.getCell(5, 1).value = sub || "";
    ws.getCell(5, 1).font = { name: FONT, size: 10 };
    for (const r of [4, 5]) { ws.mergeCells(r, 1, r, kolomTerakhir); ws.getCell(r, 1).alignment = { horizontal: "center", vertical: "middle" }; }
    ws.getRow(1).height = 24; ws.getRow(2).height = 16; ws.getRow(3).height = 12;
    return 6; // baris berikutnya yang kosong
}

function kepalaTabel(ws, baris, labels, opsi = {}) {
    labels.forEach((t, i) => {
        const c = ws.getCell(baris, i + 1);
        c.value = t; c.font = { name: FONT, size: 10, bold: true };
        c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        c.border = BORDER; c.fill = HEAD_FILL;
    });
    ws.getRow(baris).height = opsi.tinggi || 24;
}

function selData(ws, r, c, v, opsi = {}) {
    const cell = ws.getCell(r, c);
    cell.value = v;
    cell.font = { name: FONT, size: 10, bold: !!opsi.bold };
    cell.alignment = { horizontal: opsi.align || (typeof v === "number" ? "right" : "left"), vertical: "middle", wrapText: !!opsi.wrap };
    cell.border = BORDER;
    if (opsi.fmt) cell.numFmt = opsi.fmt;
    if (opsi.fill) cell.fill = HEAD_FILL;
    return cell;
}

function pengaturanCetak(ws, orientasi = "portrait") {
    ws.pageSetup = { paperSize: 9, orientation: orientasi, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }, horizontalCentered: true };
    ws.views = [{ showGridLines: false }];
}

function blokTandaTangan(ws, baris, { pengaturan, tanggal, kolomKiri, kolomKanan, kolomTerakhir }) {
    const tgl = `${pengaturan.tempat}, ${tglIndo(tanggal)}`;
    const set = (r, c, v, bold = false) => { const cell = ws.getCell(r, c); cell.value = v; cell.font = { name: FONT, size: 10, bold }; cell.alignment = { horizontal: "center" }; };
    set(baris, kolomKanan, tgl);
    set(baris + 1, kolomKiri, "Kepala Sekolah,"); set(baris + 1, kolomKanan, "Bendahara,");
    set(baris + 6, kolomKiri, pengaturan.kepala_sekolah, true); set(baris + 6, kolomKanan, pengaturan.bendahara, true);
    ws.getCell(baris + 6, kolomKiri).font = { name: FONT, size: 10, bold: true, underline: true };
    ws.getCell(baris + 6, kolomKanan).font = { name: FONT, size: 10, bold: true, underline: true };
    return baris + 8;
}

async function ambilLogoBase64(url) {
    try {
        const res = await fetch(url); const blob = await res.blob();
        return await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result.split(",")[1]); fr.readAsDataURL(blob); });
    } catch { return null; }
}

// =========================================================
// 1. HONOR / TRANSPORT GURU PENGGANTI (format keuangan)
// =========================================================
// baris: [{ nama, PT, GT, Inf }]  tarif: { PT, GT, Inf }
export async function bukuHonor({ ExcelJS, baris, tarif, pengaturan, awal, akhir, logoBase64 }) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Honor Pengganti");
    const KOL = 11; // A..K
    ws.columns = [{ width: 5 }, { width: 34 }, { width: 6 }, { width: 13 }, { width: 6 }, { width: 13 }, { width: 6 }, { width: 13 }, { width: 17 }, { width: 19 }, { width: 19 }];

    let r = tulisKop(ws, { ExcelJS, wb, logoBase64, pengaturan, judul: "DAFTAR PENERIMAAN TRANSPORT GURU PENGGANTI", sub: `TAHUN AJARAN ${pengaturan.tahun_ajaran}`, kolomTerakhir: KOL });
    ws.getCell(r, 9).value = labelPeriode(awal, akhir); ws.getCell(r, 9).font = { name: FONT, size: 10, bold: true }; ws.mergeCells(r, 9, r, KOL);
    r += 1;

    kepalaTabel(ws, r, ["NO", "NAMA", "PT", "HONOR", "GT", "HONOR", "INF", "HONOR", "JUMLAH", "TANDA TANGAN", ""]);
    ws.mergeCells(r, 10, r, 11);
    r += 1;

    const RP = '"Rp" #,##0';
    let tot = { PT: 0, GT: 0, Inf: 0, jumlah: 0 };
    baris.forEach((b, i) => {
        const jumlah = b.PT * tarif.PT + b.GT * tarif.GT + b.Inf * tarif.Inf;
        tot.PT += b.PT; tot.GT += b.GT; tot.Inf += b.Inf; tot.jumlah += jumlah;
        selData(ws, r, 1, i + 1, { align: "center" });
        selData(ws, r, 2, b.nama);
        selData(ws, r, 3, b.PT, { align: "center" }); selData(ws, r, 4, tarif.PT, { fmt: "#,##0" });
        selData(ws, r, 5, b.GT, { align: "center" }); selData(ws, r, 6, tarif.GT, { fmt: "#,##0" });
        selData(ws, r, 7, b.Inf, { align: "center" }); selData(ws, r, 8, tarif.Inf, { fmt: "#,##0" });
        selData(ws, r, 9, jumlah, { fmt: RP, bold: true });
        // tanda tangan bergantian kiri/kanan seperti format asli
        const kiri = i % 2 === 0;
        selData(ws, r, 10, kiri ? `${i + 1}. ……………………` : "", { align: "left" });
        selData(ws, r, 11, kiri ? "" : `${i + 1}. ……………………`, { align: "left" });
        ws.getRow(r).height = 30;
        r += 1;
    });
    // jumlah
    selData(ws, r, 1, "JUMLAH", { bold: true, align: "center", fill: true }); ws.mergeCells(r, 1, r, 2);
    selData(ws, r, 3, tot.PT, { bold: true, align: "center", fill: true }); selData(ws, r, 4, tot.PT * tarif.PT, { fmt: RP, bold: true, fill: true });
    selData(ws, r, 5, tot.GT, { bold: true, align: "center", fill: true }); selData(ws, r, 6, tot.GT * tarif.GT, { fmt: RP, bold: true, fill: true });
    selData(ws, r, 7, tot.Inf, { bold: true, align: "center", fill: true }); selData(ws, r, 8, tot.Inf * tarif.Inf, { fmt: RP, bold: true, fill: true });
    selData(ws, r, 9, tot.jumlah, { fmt: RP, bold: true, fill: true });
    selData(ws, r, 10, "", { fill: true }); selData(ws, r, 11, "", { fill: true });
    ws.mergeCells(r, 10, r, 11);
    r += 1;
    selData(ws, r, 1, "Terbilang:", { bold: true }); ws.mergeCells(r, 1, r, 2);
    selData(ws, r, 3, terbilang(tot.jumlah), { wrap: true }); ws.mergeCells(r, 3, r, KOL);
    ws.getCell(r, 3).font = { name: FONT, size: 10, italic: true };
    ws.getRow(r).height = 22;
    r += 2;

    r = blokTandaTangan(ws, r, { pengaturan, tanggal: akhir, kolomKiri: 2, kolomKanan: 9, kolomTerakhir: KOL });

    // keterangan tarif
    ws.getCell(r, 2).value = "Keterangan:"; ws.getCell(r, 2).font = { name: FONT, size: 9, bold: true };
    const ket = [["PT", "Piket yang ditugaskan", tarif.PT], ["GT", "Guru yang ditugaskan", tarif.GT], ["Inf", "Infaler yang ditugaskan", tarif.Inf]];
    ket.forEach(([k, l, t], i) => {
        ws.getCell(r + 1 + i, 2).value = `${k} = ${l}`; ws.getCell(r + 1 + i, 2).font = { name: FONT, size: 9 };
        ws.getCell(r + 1 + i, 4).value = t; ws.getCell(r + 1 + i, 4).numFmt = RP; ws.getCell(r + 1 + i, 4).font = { name: FONT, size: 9 };
    });

    pengaturanCetak(ws, "portrait");
    ws.pageSetup.printTitlesRow = "7:7";
    return wb;
}

// =========================================================
// 2. REKAP KEHADIRAN GURU
// =========================================================
// baris: [{ nama, terjadwal, hadirTM, HTTM, ST, STT, IT, ITT, TK, hadir, persen }]
export async function bukuKehadiran({ ExcelJS, baris, total, wali, pengaturan, awal, akhir, jumlahHariKerja, bobot, logoBase64, judul, namaSheet, catatan }) {
    const wb = new ExcelJS.Workbook();
    tulisSheetKehadiran(wb, namaSheet || "Kehadiran Guru", judul || "REKAPITULASI KEHADIRAN GURU (JAM MENGAJAR)", baris, total, { ExcelJS, pengaturan, awal, akhir, jumlahHariKerja, bobot, logoBase64,
        catatan: catatan ?? "Upacara dan Bimbingan Wali Kelas (Senin jam 1-2) tidak termasuk; direkap terpisah." });
    if (wali) tulisSheetKehadiran(wb, "Tugas Wali Kelas", "REKAPITULASI KEHADIRAN TUGAS WALI KELAS", wali.baris, wali.total, { ExcelJS, pengaturan, awal, akhir, jumlahHariKerja, bobot, logoBase64,
        catatan: "Upacara & Bimbingan Wali Kelas, Senin jam 1-2." });
    return wb;
}

function tulisSheetKehadiran(wb, namaSheet, judul, baris, total, { ExcelJS, pengaturan, awal, akhir, jumlahHariKerja, bobot, logoBase64, catatan }) {
    const ws = wb.addWorksheet(namaSheet);
    const KOL = 12;
    ws.columns = [{ width: 5 }, { width: 34 }, { width: 10 }, { width: 8 }, { width: 7 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 10 }, { width: 10 }];
    let r = tulisKop(ws, { ExcelJS, wb, logoBase64, pengaturan, judul, sub: `${labelPeriode(awal, akhir).replace(" :", ":")}  ·  ${jumlahHariKerja} hari kerja`, kolomTerakhir: KOL });
    kepalaTabel(ws, r, ["NO", "NAMA GURU", "TERJADWAL (JP)", "HADIR", "HTTM", "ST", "STT", "IT", "ITT", "TK", "HADIR (BOBOT)", "% HADIR"], { tinggi: 30 });
    r += 1;
    baris.forEach((b, i) => {
        selData(ws, r, 1, i + 1, { align: "center" }); selData(ws, r, 2, b.nama);
        [b.terjadwal, b.hadirTM, b.HTTM, b.ST, b.STT, b.IT, b.ITT, b.TK].forEach((v, j) => selData(ws, r, 3 + j, v, { align: "center" }));
        selData(ws, r, 11, b.hadir, { fmt: "0.00", align: "center" });
        selData(ws, r, 12, b.persen === null ? "" : b.persen / 100, { fmt: "0.00%", align: "center", bold: true });
        ws.getRow(r).height = 30;
        r += 1;
    });
    selData(ws, r, 1, "JUMLAH", { bold: true, align: "center", fill: true }); ws.mergeCells(r, 1, r, 2);
    [total.terjadwal, total.hadirTM, total.HTTM, total.ST, total.STT, total.IT, total.ITT, total.TK].forEach((v, j) => selData(ws, r, 3 + j, v, { align: "center", bold: true, fill: true }));
    selData(ws, r, 11, total.hadir, { fmt: "0.00", align: "center", bold: true, fill: true });
    selData(ws, r, 12, total.persen === null ? "" : total.persen / 100, { fmt: "0.00%", align: "center", bold: true, fill: true });
    r += 2;
    ws.getCell(r, 1).value = `Bobot kehadiran: HTTM ${bobot.HTTM * 100}% · ST ${bobot.ST * 100}% · STT ${bobot.STT * 100}% · IT ${bobot.IT * 100}% · ITT ${bobot.ITT * 100}% · TK ${bobot.TK * 100}%.  % Hadir = (Hadir + jumlah berbobot) ÷ Terjadwal.  ${catatan || ""}`;
    ws.getCell(r, 1).font = { name: FONT, size: 8, italic: true }; ws.mergeCells(r, 1, r, KOL);
    r += 2;
    blokTandaTangan(ws, r, { pengaturan, tanggal: akhir, kolomKiri: 2, kolomKanan: 10, kolomTerakhir: KOL });
    pengaturanCetak(ws, "portrait");
    ws.pageSetup.printTitlesRow = "6:6";
}

// =========================================================
// 3. REKAP GURU PENGGANTI (ringkas + rincian)
// =========================================================
export async function bukuPengganti({ ExcelJS, ringkas, rincian, tanpaPengganti, pengaturan, awal, akhir, logoBase64 }) {
    const wb = new ExcelJS.Workbook();
    // Sheet 1: per guru pengganti
    const ws = wb.addWorksheet("Per Guru Pengganti");
    ws.columns = [{ width: 5 }, { width: 34 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 11 }];
    let r = tulisKop(ws, { ExcelJS, wb, logoBase64, pengaturan, judul: "REKAPITULASI GURU PENGGANTI", sub: labelPeriode(awal, akhir).replace(" :", ":"), kolomTerakhir: 6 });
    kepalaTabel(ws, r, ["NO", "NAMA GURU PENGGANTI", "GT", "PT", "INF", "TOTAL (JP)"]); r += 1;
    let tot = { GT: 0, PT: 0, Inf: 0, total: 0 };
    ringkas.forEach((b, i) => {
        selData(ws, r, 1, i + 1, { align: "center" }); selData(ws, r, 2, b.nama);
        selData(ws, r, 3, b.GT, { align: "center" }); selData(ws, r, 4, b.PT, { align: "center" }); selData(ws, r, 5, b.Inf, { align: "center" });
        selData(ws, r, 6, b.total, { align: "center", bold: true });
        tot.GT += b.GT; tot.PT += b.PT; tot.Inf += b.Inf; tot.total += b.total;
        ws.getRow(r).height = 30; r += 1;
    });
    selData(ws, r, 1, "JUMLAH", { bold: true, align: "center", fill: true }); ws.mergeCells(r, 1, r, 2);
    [tot.GT, tot.PT, tot.Inf, tot.total].forEach((v, j) => selData(ws, r, 3 + j, v, { align: "center", bold: true, fill: true }));
    r += 2;
    ws.getCell(r, 1).value = `GT = Guru diTugaskan · PT = Piket diTugaskan · Inf = Infaler.  Jam tanpa pengganti (TP): ${tanpaPengganti}.`;
    ws.getCell(r, 1).font = { name: FONT, size: 8, italic: true }; ws.mergeCells(r, 1, r, 6);
    pengaturanCetak(ws, "portrait");
    ws.pageSetup.printTitlesRow = "6:6";

    // Sheet 2: rincian
    const wr = wb.addWorksheet("Rincian per Jam");
    wr.columns = [{ width: 5 }, { width: 13 }, { width: 8 }, { width: 14 }, { width: 22 }, { width: 30 }, { width: 8 }, { width: 30 }, { width: 8 }];
    let q = tulisKop(wr, { ExcelJS, wb, logoBase64, pengaturan, judul: "RINCIAN PENUGASAN GURU PENGGANTI", sub: labelPeriode(awal, akhir).replace(" :", ":"), kolomTerakhir: 9 });
    kepalaTabel(wr, q, ["NO", "TANGGAL", "JAM KE", "KELAS", "MATA PELAJARAN", "GURU TIDAK HADIR", "KET", "GURU PENGGANTI", "STATUS"]); q += 1;
    rincian.forEach((b, i) => {
        selData(wr, q, 1, i + 1, { align: "center" }); selData(wr, q, 2, tglIndo(b.tanggal), { align: "center" });
        selData(wr, q, 3, b.jam_ke, { align: "center" }); selData(wr, q, 4, b.kelas, { align: "center" });
        selData(wr, q, 5, b.mapel); selData(wr, q, 6, b.guru); selData(wr, q, 7, b.status, { align: "center" });
        selData(wr, q, 8, b.pengganti || "—"); selData(wr, q, 9, b.kode, { align: "center" });
        wr.getRow(q).height = 30; q += 1;
    });
    pengaturanCetak(wr, "landscape");
    wr.pageSetup.printTitlesRow = "6:6";
    return wb;
}

// ---------- Unduh di browser ----------
export async function unduhWorkbook(wb, namaFile) {
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = namaFile; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

export { ambilLogoBase64 };
