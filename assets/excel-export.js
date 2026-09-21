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

/* Penjaga: bila assets/kop-dokumen.js tidak termuat, unduhan gagal dengan
   pesan yang bisa ditindaklanjuti, bukan "undefined". */
function kopBersama() {
  if (!window.KopDokumen) throw new Error(
    'Berkas assets/kop-dokumen.js belum termuat, sehingga kop dokumen tidak bisa dibuat. '
    + 'Muat ulang halaman; bila tetap gagal, laporkan ke operator.');
  return window.KopDokumen;
}

/* ---------- Kop surat bersama ----------
   Susunan dan letaknya tidak ditentukan di sini melainkan di
   assets/kop-dokumen.js — berkas yang sama persis di keempat aplikasi dan
   membaca tata letak yang diatur operator di Data Induk → Profil Dokumen.
   Dimuat sebagai skrip biasa di rekap.html, jadi tersedia sebagai
   window.KopDokumen sebelum modul ini dijalankan. */
function tulisKop(ws, { ExcelJS, wb, logoBase64, pengaturan, judul, sub, kolomTerakhir }) {
    return kopBersama().kopExcel(ws, {
        wb,
        logo: logoBase64 ? { base64: logoBase64 } : null,
        // profil = baris v_penanda_tangan apa adanya; bila belum terbaca,
        // disusun dari nilai bawaan supaya kop tetap terbentuk.
        profil: pengaturan.profil || { nama_sekolah: pengaturan.nama_sekolah,
                                       alamat: pengaturan.alamat_sekolah,
                                       kota: pengaturan.tempat },
        judul, sub: sub || "",
        kolomAkhir: kolomTerakhir,
        font: FONT
    });
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

/* Blok tanda tangan. Aturannya: yang menandatangani adalah pejabat yang
   berwenang atas ISI dokumen — untuk aplikasi ini Wakasek Kurikulum, karena
   kehadiran guru adalah ranah kurikulum — dan Kepala Sekolah mengetahui.
   Karena itu "Mengetahui," selalu di kiri di atas Kepala Sekolah, dan
   pejabat penanggung jawabnya di kanan sejajar dengan tanggal. */
function blokTandaTangan(ws, baris, { pengaturan, tanggal, kolomKiri, kolomKanan, kolomTerakhir }) {
    const tgl = `${pengaturan.tempat}, ${tglIndo(tanggal)}`;
    const set = (r, c, v, bold = false) => { const cell = ws.getCell(r, c); cell.value = v; cell.font = { name: FONT, size: 10, bold }; cell.alignment = { horizontal: "center" }; };
    set(baris, kolomKiri, "Mengetahui,");
    set(baris, kolomKanan, tgl);
    set(baris + 1, kolomKiri, "Kepala Sekolah,");
    set(baris + 1, kolomKanan, "Wakasek Kurikulum,");
    set(baris + 6, kolomKiri, pengaturan.kepala_sekolah || "……………………", true);
    set(baris + 6, kolomKanan, pengaturan.kurikulum || "……………………", true);
    ws.getCell(baris + 6, kolomKiri).font = { name: FONT, size: 10, bold: true, underline: true };
    ws.getCell(baris + 6, kolomKanan).font = { name: FONT, size: 10, bold: true, underline: true };
    return baris + 8;
}

async function ambilLogoBase64(url) {
    // Mencoba beberapa nama berkas: logo-kecil.png lebih ringan, logo.png sebagai cadangan.
    const kandidat = [url, "assets/logo.png"];
    for (const u of kandidat) {
        try {
            const res = await fetch(u);
            if (!res.ok) continue;                          // 404 dsb. -> coba kandidat berikutnya
            const blob = await res.blob();
            if (!blob.type.startsWith("image/")) continue;   // bukan gambar (mis. halaman error)
            const b64 = await new Promise((ok, gagal) => {
                const fr = new FileReader();
                fr.onload = () => ok(fr.result.split(",")[1]);
                fr.onerror = gagal;
                fr.readAsDataURL(blob);
            });
            if (b64) return b64;
        } catch { /* coba kandidat berikutnya */ }
    }
    console.error("Logo tidak dapat dimuat — periksa berkas assets/logo-kecil.png dan assets/logo.png di server.");
    return null;
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
    const tulisAngka = (b, opsi = {}) => {
        [b.terjadwal, b.hadirTM, b.HTTM, b.ST, b.STT, b.IT, b.ITT, b.TK]
            .forEach((v, j) => selData(ws, r, 3 + j, v, { align: "center", ...opsi }));
        selData(ws, r, 11, b.hadir, { fmt: "0.00", align: "center", ...opsi });
        selData(ws, r, 12, b.persen === null || b.persen === undefined ? "" : b.persen / 100,
                { fmt: "0.00%", align: "center", bold: true, ...opsi });
    };
    baris.forEach((b, i) => {
        selData(ws, r, 1, i + 1, { align: "center" }); selData(ws, r, 2, b.nama);
        tulisAngka(b);
        ws.getRow(r).height = 30;
        r += 1;
    });
    selData(ws, r, 1, "JUMLAH", { bold: true, align: "center", fill: true }); ws.mergeCells(r, 1, r, 2);
    tulisAngka(total, { bold: true, fill: true });
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

// =========================================================
// 4. PELAKSANAAN PIKET
// =========================================================
// baris: [{ nama, meja:{terjadwal,jaga}, unit:{terjadwal,jaga}, parkiran:{terjadwal,jaga} }]
// Hanya jumlah hari. Nilai rupiahnya dihitung di Induk Pembiayaan, supaya
// tarif dan cara menghitungnya hanya ada di satu tempat.
export async function bukuPiket({ ExcelJS, baris, total, pengaturan, awal, akhir, logoBase64 }) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Pelaksanaan Piket");
    const KOL = 8;
    ws.columns = [{ width: 5 }, { width: 34 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }];
    let r = tulisKop(ws, { ExcelJS, wb, logoBase64, pengaturan,
        judul: "REKAPITULASI PELAKSANAAN TUGAS PIKET",
        sub: labelPeriode(awal, akhir).replace(" :", ":"), kolomTerakhir: KOL });

    kepalaTabel(ws, r, ["NO", "NAMA",
                        "MEJA SEKOLAH TERJADWAL (JAM)", "MEJA SEKOLAH JAGA (JAM)",
                        "UNIT TERJADWAL (JAM)", "UNIT JAGA (JAM)",
                        "PARKIRAN TERJADWAL (HARI)", "PARKIRAN JAGA (HARI)"], { tinggi: 34 });
    r += 1;
    baris.forEach((b, i) => {
        selData(ws, r, 1, i + 1, { align: "center" });
        selData(ws, r, 2, b.nama);
        [b.meja.terjadwal, b.meja.jaga, b.unit.terjadwal, b.unit.jaga, b.parkiran.terjadwal, b.parkiran.jaga]
            .forEach((v, j) => selData(ws, r, 3 + j, v, { align: "center" }));
        r += 1;
    });
    selData(ws, r, 1, "JUMLAH", { bold: true, align: "center", fill: true }); ws.mergeCells(r, 1, r, 2);
    [total.meja.terjadwal, total.meja.jaga, total.unit.terjadwal, total.unit.jaga, total.parkiran.terjadwal, total.parkiran.jaga]
        .forEach((v, j) => selData(ws, r, 3 + j, v, { align: "center", bold: true, fill: true }));
    r += 2;
    ws.getCell(r, 1).value = 'Satuannya mengikuti jadwalnya: Meja Sekolah dan Unit dihitung per JAM pelajaran, '
        + 'Parkiran per HARI jaga — parkiran memang bukan jam pelajaran, melainkan sekali jaga sesudah bel pulang. '
        + '"Jaga" adalah giliran yang benar-benar dijalankan; piket tidak mengenal pengganti, jadi selisihnya '
        + 'berarti petugasnya tidak hadir atau gilirannya belum dicatat.';
    ws.getCell(r, 1).font = { name: FONT, size: 8, italic: true }; ws.mergeCells(r, 1, r, KOL);
    r += 2;
    blokTandaTangan(ws, r, { pengaturan, tanggal: akhir, kolomKiri: 2, kolomKanan: 8, kolomTerakhir: KOL });
    pengaturanCetak(ws, "landscape");
    ws.pageSetup.printTitlesRow = "6:6";


    return wb;
}

// =========================================================
// 5. KEGIATAN & TUGAS SEORANG GURU (satu lembar)
// =========================================================
// Susunannya sama dengan layar: daftar tugas di atas, matriks pekanan di
// bawah, dalam satu sheet supaya bisa dicetak satu lembar dan diserahkan
// kepada gurunya sebagai peta tugasnya sepekan.
//
// PENGECUALIAN GAYA: berkas ini umumnya "hemat tinta — tanpa blok warna",
// tetapi matriks di sini memuat LIMA jenis tugas dalam satu kisi, dan warna
// adalah satu-satunya yang membedakannya tanpa menambah kolom keterangan yang
// justru memakan ruang. Ronanya sangat muda dan sama persis dengan warna di
// layar, sehingga lembar cetak dan halaman web terbaca sebagai benda yang sama.
const HARI_PENDEK_XLS = { Senin: "Sen", Selasa: "Sel", Rabu: "Rab", Kamis: "Kam", Jumat: "Jum" };
const jam5xls = (t) => String(t || "").slice(0, 5);

// Membagi KOL kolom sempit menjadi beberapa kolom tabel selebar bobotnya.
// Matriks memerlukan satu kolom per jam pelajaran, sedangkan tabel tugas hanya
// enam kolom — keduanya harus hidup di sheet yang sama, dan lebar kolom di
// Excel berlaku untuk seluruh sheet, bukan per tabel.
function rentangKolom(bobot, kol) {
    const total = bobot.reduce((a, b) => a + b, 0);
    const hasil = [];
    let mulai = 1, dipakai = 0;
    bobot.forEach((b, i) => {
        dipakai += b;
        const sisaKolom = bobot.length - 1 - i;      // kolom yang masih harus kebagian minimal satu
        const akhir = i === bobot.length - 1 ? kol
            : Math.min(kol - sisaKolom, Math.max(mulai, Math.round((dipakai / total) * kol)));
        hasil.push([mulai, akhir]);
        mulai = akhir + 1;
    });
    return hasil;
}

function judulBagian(ws, baris, teks, kolomTerakhir) {
    const c = ws.getCell(baris, 1);
    c.value = teks;
    c.font = { name: FONT, size: 11, bold: true };
    c.alignment = { horizontal: "left", vertical: "middle" };
    ws.mergeCells(baris, 1, baris, kolomTerakhir);
    ws.getRow(baris).height = 20;
    return baris + 1;
}

function selGabung(ws, baris, [dari, sampai], nilai, opsi = {}) {
    const cell = selData(ws, baris, dari, nilai, opsi);
    if (sampai > dari) {
        for (let c = dari + 1; c <= sampai; c++) {
            const k = ws.getCell(baris, c);
            k.border = BORDER;
            if (opsi.fill) k.fill = HEAD_FILL;
        }
        ws.mergeCells(baris, dari, baris, sampai);
    }
    return cell;
}

export async function bukuKegiatanGuru({ ExcelJS, guru, tugas, perJam, setelah, jam, hariList, jenis, pengaturan, logoBase64 }) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Kegiatan & Tugas");

    const jamList = (jam || []).slice().sort((a, b) => Number(a.jam_ke) - Number(b.jam_ke));
    const KOL = 1 + jamList.length + 1;               // label + jam pelajaran + "Setelah KBM"
    ws.columns = [{ width: 13 }, ...jamList.map(() => ({ width: 9 })), { width: 24 }];

    const sub = [guru?.mapel_utama && guru.mapel_utama !== "-" ? guru.mapel_utama : "",
                 guru?.wali_kelas ? `Wali Kelas ${guru.wali_kelas}` : "",
                 `Tahun Ajaran ${pengaturan.tahun_ajaran || ""}`].filter(Boolean).join("  ·  ");
    let r = tulisKop(ws, { ExcelJS, wb, logoBase64, pengaturan,
        judul: "KEGIATAN & TUGAS GURU DALAM SEPEKAN",
        sub: String(guru?.nama || "").toUpperCase() + (sub ? `  ·  ${sub}` : ""),
        kolomTerakhir: KOL });

    // ---------- A. Tugas & tanggung jawab ----------
    r = judulBagian(ws, r, "A. TUGAS & TANGGUNG JAWAB", KOL);
    const span = rentangKolom([1, 3, 3, 3, 1, 3], KOL);
    ["NO", "TUGAS", "RINCIAN", "JADWAL", "JAM/PEKAN", "KETERANGAN"]
        .forEach((t, i) => selGabung(ws, r, span[i], t, { bold: true, align: "center", fill: true, wrap: true }));
    ws.getRow(r).height = 22;
    r += 1;

    for (const b of tugas) {
        const jadwal = b.jadwal && b.jadwal.length
            ? b.jadwal.map((j) => `${HARI_PENDEK_XLS[j.hari] || j.hari} ${j.teks}`).join("; ")
            : (b.kosongTeks || "—");
        const jamTeks = b.jam ? `${b.jam}${b.satuan ? " " + b.satuan : ""}` : "—";
        selGabung(ws, r, span[0], b.no, { align: "center" });
        selGabung(ws, r, span[1], b.tugas, { bold: true, wrap: true });
        selGabung(ws, r, span[2], b.rincian || "—", { wrap: true });
        selGabung(ws, r, span[3], jadwal, { wrap: true });
        selGabung(ws, r, span[4], jamTeks, { align: "center" });
        selGabung(ws, r, span[5], b.ket || "", { wrap: true });
        ws.getRow(r).height = 26;
        r += 1;
    }
    r += 1;

    // ---------- B. Matriks pekanan ----------
    r = judulBagian(ws, r, "B. KEGIATAN DALAM SEPEKAN", KOL);
    const barisKepala = r;
    kepalaTabel(ws, r, ["HARI", ...jamList.map((j) => String(j.jam_ke)), "SETELAH KBM"], { tinggi: 30 });
    r += 1;
    // Baris kedua kepala: pukul berapa jam itu. Tanpa ini angka 1–12 tidak
    // memberi tahu waktunya, dan lembar ini sering dibaca orang yang tidak
    // hafal pembagian jam pelajaran.
    selData(ws, r, 1, "Pukul", { align: "center", bold: true, fill: true });
    jamList.forEach((j, i) => selData(ws, r, 2 + i,
        j.mulai ? `${jam5xls(j.mulai)}\n${jam5xls(j.selesai)}` : "", { align: "center", wrap: true, fill: true }));
    selData(ws, r, KOL, "sesudah bel pulang", { align: "center", wrap: true, fill: true });
    ws.getRow(r).height = 26;
    r += 1;

    const warna = (kunciJenis) => {
        const w = jenis[kunciJenis];
        if (!w) return null;
        return { type: "pattern", pattern: "solid",
                 fgColor: { argb: "FF" + String(w.bg).replace("#", "").toUpperCase() } };
    };

    for (const hari of hariList) {
        const perJamHari = perJam.filter((k) => k.hari === hari);
        selData(ws, r, 1, hari, { bold: true, align: "center" });

        // Jam berurutan dengan kegiatan yang sama digabung menjadi satu sel,
        // persis seperti blok panjang di layar.
        let i = 0;
        while (i < jamList.length) {
            const isi = perJamHari.filter((k) => k.jamKe === Number(jamList[i].jam_ke));
            if (!isi.length) { selData(ws, r, 2 + i, "", { align: "center" }); i += 1; continue; }
            const teks = isi.map((k) => [k.utama, k.kedua].filter(Boolean).join("\n")).join(" / ");
            const kunci = isi.length === 1 ? isi[0].kunci : null;
            let j = i + 1;
            while (kunci && j < jamList.length) {
                const lanjut = perJamHari.filter((k) => k.jamKe === Number(jamList[j].jam_ke));
                if (lanjut.length !== 1 || lanjut[0].kunci !== kunci) break;
                j += 1;
            }
            const cell = selData(ws, r, 2 + i, teks, { align: "center", wrap: true });
            cell.font = { name: FONT, size: 8 };
            const f = warna(isi[0].jenis);
            for (let c = 2 + i; c <= 1 + j; c++) {
                ws.getCell(r, c).border = BORDER;
                if (f) ws.getCell(r, c).fill = f;
            }
            if (j > i + 1) ws.mergeCells(r, 2 + i, r, 1 + j);
            i = j;
        }

        const setelahHari = setelah.filter((s) => s.hari === hari);
        const selAkhir = selData(ws, r, KOL,
            setelahHari.length ? setelahHari.map((s) => `${s.utama} (${s.kedua})`).join("\n") : "—",
            { align: "center", wrap: true });
        selAkhir.font = { name: FONT, size: 8 };
        if (setelahHari.length === 1) {
            const f = warna(setelahHari[0].jenis);
            if (f) selAkhir.fill = f;
        }
        ws.getRow(r).height = 34;
        r += 1;
    }

    r += 1;
    ws.getCell(r, 1).value = 'Kolom terakhir BUKAN jam ke-13. Isinya kegiatan sesudah bel pulang yang satuannya bukan '
        + 'jam pelajaran: piket parkiran (sekali jaga, tanpa jam) serta ekstrakurikuler dan pembinaan (jam dinding). '
        + 'Yang tertulis di sini adalah POLA PEKANAN yang berlaku sepanjang semester — ketidakhadiran dan guru '
        + 'pengganti pada tanggal tertentu direkap terpisah. Seluruh jadwal dan tugas disusun di Data Induk; '
        + 'lembar ini hanya membacanya.';
    ws.getCell(r, 1).font = { name: FONT, size: 8, italic: true };
    ws.getCell(r, 1).alignment = { wrapText: true, vertical: "top" };
    ws.mergeCells(r, 1, r + 1, KOL);
    r += 3;

    blokTandaTangan(ws, r, { pengaturan, tanggal: new Date().toISOString().slice(0, 10),
        kolomKiri: 2, kolomKanan: Math.max(3, KOL - 3), kolomTerakhir: KOL });
    pengaturanCetak(ws, "landscape");
    ws.pageSetup.printTitlesRow = `${barisKepala}:${barisKepala}`;
    return wb;
}
