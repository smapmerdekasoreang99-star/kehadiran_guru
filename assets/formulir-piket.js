// =====================================================================
// Formulir paraf piket — satu bentuk kertas untuk dua aplikasi.
//
// Berkas ini SALINAN SERUPA di dua repositori:
//   data_induk/assets/   kehadiran_guru/assets/
// Bila diubah di satu tempat, salin ke yang lain:
//
//   md5sum  data_induk/assets/formulir-piket.js  kehadiran_guru/assets/formulir-piket.js
//
// Alasannya sama dengan kop-dokumen.js: ini BENTUK DOKUMEN, dan dokumen
// yang sama harus keluar sama dari mana pun diunduh. Dulu tarif dan nama
// penanda tangan sempat menyimpang diam-diam karena ditulis dua kali;
// formulir yang ditandatangani guru tidak boleh mengalami hal yang sama.
//
// Dipasang sebagai variabel global, bukan modul ES, karena Data Induk
// memakai skrip biasa sedangkan Kehadiran Guru memakai modul. Skrip biasa
// dijalankan lebih dulu, jadi keduanya sama-sama menemukannya di sini.
//
// ---------------------------------------------------------------------
// Kenapa satu lembar per pekan
// ---------------------------------------------------------------------
// Paraf membuktikan kejadian pada sebuah TANGGAL, dan yang memarafnya
// manusia yang memegang kertas. Rentang dua pekan atau lebih dalam satu
// lembar berarti tabel yang tidak muat di satu halaman, kolom yang
// menyempit sampai kotak parafnya tidak bisa dibubuhi, dan orang yang
// salah baris. Karena itu rentang berapa pun dipecah di sini menjadi
// pekan-pekan Senin–Jumat, satu lembar satu pekan, satu halaman cetak.
//
// Lembarnya selalu SEPEKAN PENUH walau rentang yang diminta hanya
// sebagian — memang itu gunanya formulir pekanan. Hari yang di luar
// rentang tetap tercetak, tinggal tidak diparaf bila memang tidak ada
// tugas.
// =====================================================================

(function () {
    "use strict";

    const HARI_KERJA = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"];
    const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
                   "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

    const FONT = "Arial";
    const TIPIS = { style: "thin", color: { argb: "FF9A9A9A" } };
    const GARIS = { top: TIPIS, left: TIPIS, bottom: TIPIS, right: TIPIS };
    const GELAP = "FF12262E";
    const ISI_KEPALA = { type: "pattern", pattern: "solid", fgColor: { argb: GELAP } };
    const ISI_KOSONG = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F2ED" } };
    const ISI_SELANG = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBF9F4" } };

    // Tinggi baris isian: cukup untuk dibubuhi paraf dengan tangan.
    // 34 pt kira-kira 1,2 cm di kertas — sebesar kotak paraf pada daftar
    // hadir yang sudah biasa dipakai sekolah.
    const TINGGI_ISI_LEBAR = 40;     // baris parkiran: muat tanda tangan penuh
    const TINGGI_JAM = 22;           // satu kotak paraf untuk satu jam jaga

    const isoDari = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const keTanggal = (iso) => new Date(iso + "T00:00:00");
    function tglIndo(iso) {
        const d = keTanggal(iso);
        return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
    }
    function tglRingkas(iso) {
        const d = keTanggal(iso);
        return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    }

    /* Rentang tanggal dipecah menjadi pekan-pekan Senin–Jumat. Tiap pekan
       selalu lengkap lima hari, walau rentangnya hanya menyentuh sebagian.
       Mengembalikan [{ senin, jumat, hari: [{ iso, hari }] }]. */
    function pekanDari(awal, akhir) {
        const out = [];
        const sudah = new Set();
        const d = keTanggal(awal);
        const batas = keTanggal(akhir);
        while (d <= batas) {
            const jsHari = d.getDay();
            if (jsHari >= 1 && jsHari <= 5) {
                const senin = new Date(d);
                senin.setDate(d.getDate() - (jsHari - 1));
                const kunci = isoDari(senin);
                if (!sudah.has(kunci)) {
                    sudah.add(kunci);
                    const hari = HARI_KERJA.map((nama, i) => {
                        const t = new Date(senin);
                        t.setDate(senin.getDate() + i);
                        return { iso: isoDari(t), hari: nama };
                    });
                    out.push({ senin: kunci, jumat: hari[4].iso, hari });
                }
            }
            d.setDate(d.getDate() + 1);
        }
        return out;
    }

    /* Nama lembar Excel: maksimal 31 aksara dan tidak boleh memuat : \ / ? * [ ] */
    function namaLembar(teks) {
        return String(teks).replace(/[:\\/?*[\]]/g, "-").slice(0, 31);
    }

    // ---------------------------------------------------------------
    // Potongan-potongan kecil yang dipakai berulang
    // ---------------------------------------------------------------
    function sel(ws, r, c, nilai, opsi) {
        const o = opsi || {};
        const cell = ws.getCell(r, c);
        if (nilai !== undefined && nilai !== null) cell.value = nilai;
        cell.font = { name: FONT, size: o.ukuran || 10, bold: !!o.tebal, italic: !!o.miring,
                      color: { argb: o.warna || "FF221E17" } };
        cell.alignment = { horizontal: o.rata || "left", vertical: o.tegak || "middle", wrapText: !!o.lipat };
        if (!o.tanpaGaris) cell.border = GARIS;
        if (o.isi) cell.fill = o.isi;
        return cell;
    }

    function kepalaSel(ws, r, c, teks, opsi) {
        const o = opsi || {};
        const cell = sel(ws, r, c, teks, { tebal: true, rata: "center", lipat: true,
                                           ukuran: o.ukuran || 10, warna: "FFFFFFFF" });
        cell.fill = ISI_KEPALA;
        return cell;
    }

    /* Blok tanda tangan. Yang menandatangani adalah pejabat yang berwenang
       atas ISI dokumen; Kepala Sekolah mengetahui. Karena itu "Mengetahui,"
       selalu di kiri, dan penanggung jawabnya di kanan sejajar dengan
       tanggal — susunan yang sama dengan berkas rekap Kehadiran Guru. */
    function blokTtd(ws, r, o) {
        const tulis = (baris, kolom, teks, tebal, garisBawah) => {
            const cell = ws.getCell(baris, kolom);
            cell.value = teks;
            cell.font = { name: FONT, size: 10, bold: !!tebal, underline: !!garisBawah };
            cell.alignment = { horizontal: "center", vertical: "middle" };
        };
        tulis(r, o.kolomKiri, "Mengetahui,");
        tulis(r, o.kolomKanan, `${o.tempat || ""}${o.tempat ? ", " : ""}${o.tanggal ? tglIndo(o.tanggal) : "……………………"}`);
        tulis(r + 1, o.kolomKiri, "Kepala Sekolah,");
        tulis(r + 1, o.kolomKanan, o.labelKanan || "Petugas Piket,");
        tulis(r + 5, o.kolomKiri, o.kepala || "……………………", true, true);
        tulis(r + 5, o.kolomKanan, o.namaKanan || "……………………", true, true);
        return r + 7;
    }

    function siapkanCetak(ws, orientasi, barisJudulUlang) {
        ws.pageSetup = {
            paperSize: 9, orientation: orientasi,
            fitToPage: true, fitToWidth: 1, fitToHeight: 0,
            margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
            horizontalCentered: true
        };
        // Baris judul diulang di tiap halaman: daftar yang panjang tetap
        // terbaca di halaman kedua dan ketiga.
        if (barisJudulUlang) ws.pageSetup.printTitlesRow = barisJudulUlang;
        ws.views = [{ showGridLines: false }];
    }

    // ---------------------------------------------------------------
    // Satu lembar formulir paraf untuk satu pekan.
    //
    //   wb        buku kerja ExcelJS
    //   kop       window.KopDokumen
    //   profil    satu baris v_penanda_tangan / profil_dokumen (boleh {})
    //   logo      { buffer } atau { base64 } atau null
    //   jenis     'meja' | 'unit' | 'parkiran'
    //   judul     tulisan besar di bawah identitas sekolah
    //   pekan     { senin, jumat, hari:[{iso,hari}] } — null berarti
    //             formulir kosong, tanggalnya ditulis tangan
    //   baris     meja/unit : [{ nama, unit, jam: { Senin:'1–2', ... } }]
    //             parkiran  : { Senin:'Nama', Selasa:'Nama', ... }
    //   libur     { iso: keterangan } — ditandai supaya tidak salah paraf
    //   ttd       { tempat, tanggal, kepala, labelKanan, namaKanan }
    //
    // Mengembalikan lembar kerjanya.
    // ---------------------------------------------------------------
    function lembarParaf(wb, o) {
        const parkiran = o.jenis === "parkiran";
        const pekan = o.pekan || null;
        const hariPekan = pekan ? pekan.hari : HARI_KERJA.map((h) => ({ iso: null, hari: h }));
        const libur = o.libur || {};

        const ws = wb.addWorksheet(namaLembar(o.namaLembar || "Formulir Paraf"));

        // ---- kolom
        const kiri = parkiran
            ? [["NO", 5], ["HARI", 12], ["TANGGAL", 24], ["NAMA PETUGAS", 34]]
            : o.jenis === "unit"
                ? [["NO", 5], ["NAMA PENANGGUNG JAWAB", 30], ["UNIT", 26]]
                : [["NO", 5], ["NAMA PETUGAS", 34]];
        const lebarHari = 15;
        ws.columns = parkiran
            ? kiri.map(([, w]) => ({ width: w })).concat([{ width: 30 }])
            : kiri.map(([, w]) => ({ width: w })).concat(hariPekan.map(() => ({ width: lebarHari })));
        const KOL = ws.columns.length;

        // ---- kop bersama
        let r = o.kop.kopExcel(ws, {
            wb, logo: o.logo || null, profil: o.profil || {},
            judul: String(o.judul || "").toUpperCase(),
            sub: o.sub || "", kolomAkhir: KOL, font: FONT, warnaGaris: GELAP
        });

        // ---- baris pekan
        const tekspekan = pekan
            ? `Pekan: Senin, ${tglIndo(pekan.senin)}  s.d.  Jumat, ${tglIndo(pekan.jumat)}`
            : "Pekan: ………………………………  s.d.  ………………………………";
        ws.mergeCells(r, 1, r, KOL);
        sel(ws, r, 1, tekspekan, { tebal: true, ukuran: 11, tanpaGaris: true });
        ws.getRow(r).height = 20;
        r += 1;

        // ---- kepala tabel
        const barisKepala = r;
        if (parkiran) {
            [...kiri.map(([t]) => t), "PARAF PETUGAS"].forEach((t, i) => kepalaSel(ws, r, i + 1, t));
            ws.getRow(r).height = 26;
            r += 1;
        } else {
            // Dua baris: nama hari di atas, tanggalnya di bawah. Kolom kiri
            // digabung menurun supaya judulnya tidak tergantung di satu baris.
            kiri.forEach(([t], i) => {
                ws.mergeCells(r, i + 1, r + 1, i + 1);
                kepalaSel(ws, r, i + 1, t);
            });
            hariPekan.forEach((h, i) => {
                const c = kiri.length + i + 1;
                kepalaSel(ws, r, c, h.hari.toUpperCase());
                kepalaSel(ws, r + 1, c, h.iso ? tglRingkas(h.iso) : "……/……", { ukuran: 9 });
                if (h.iso && libur[h.iso]) {
                    ws.getCell(r + 1, c).value = tglRingkas(h.iso) + " · libur";
                }
            });
            ws.getRow(r).height = 22;
            ws.getRow(r + 1).height = 16;
            r += 2;
        }

        // ---- isi
        if (parkiran) {
            hariPekan.forEach((h, i) => {
                const nama = (o.baris || {})[h.hari] || "";
                const kosong = !nama;
                sel(ws, r, 1, i + 1, { rata: "center" });
                sel(ws, r, 2, h.hari, { rata: "center" });
                sel(ws, r, 3, h.iso ? tglIndo(h.iso) : "…………………………", { rata: "center" });
                sel(ws, r, 4, nama || "belum ada petugas", kosong ? { miring: true, warna: "FF8B8173" } : {});
                const parafSel = sel(ws, r, 5, null, {});
                if (kosong || (h.iso && libur[h.iso])) parafSel.fill = ISI_KOSONG;
                if (h.iso && libur[h.iso]) {
                    sel(ws, r, 4, `${nama || "—"} — hari libur`, { miring: true, warna: "FF8B8173" });
                }
                ws.getRow(r).height = TINGGI_ISI_LEBAR;
                r += 1;
            });
        } else {
            (o.baris || []).forEach((b, i) => {
                const jamHari = (h) => {
                    const v = (b.jam || {})[h.hari];
                    return Array.isArray(v) ? v : (v == null || v === "" ? [] : [v]);
                };
                /* Tiap jam jaga mendapat SELNYA SENDIRI, bukan sekadar satu
                   larik di dalam sel bersama. Alasannya sepele tetapi
                   menentukan: Excel hanya bisa menggarisi TEPI sel, tidak
                   bisa menarik garis di tengahnya — jadi tanpa sel
                   tersendiri, dua paraf dalam satu kotak tidak punya
                   pembatas dan tidak ketahuan paraf mana untuk jam mana.
                   Yang hadir jam kedua saja memaraf kotak jam kedua, dan
                   kotak jam pertama tinggal kosong.

                   Satu petugas karena itu menempati sebanyak jam jaga
                   hariannya yang terbanyak pekan itu; nomor dan namanya
                   digabung menurun supaya tetap terbaca sebagai satu orang. */
                const larik = Math.max(1, ...hariPekan.map((h) => jamHari(h).length));
                const rAwal = r, rAkhir = r + larik - 1;

                // Kolom kiri digabung menurun. Garisnya dipasang pada tiap
                // sel dalam rentang gabungan, karena hanya begitu tepi luar
                // gabungan tergambar penuh.
                const kolomKiri = (kolom, nilai, opsi) => {
                    if (larik > 1) ws.mergeCells(rAwal, kolom, rAkhir, kolom);
                    for (let rr = rAwal; rr <= rAkhir; rr++) ws.getCell(rr, kolom).border = GARIS;
                    sel(ws, rAwal, kolom, nilai, Object.assign({ tegak: "middle" }, opsi || {}));
                };
                kolomKiri(1, i + 1, { rata: "center" });
                kolomKiri(2, b.nama);
                if (o.jenis === "unit") kolomKiri(3, b.unit || "—", { lipat: true, ukuran: 9 });

                for (let k = 0; k < larik; k++) {
                    hariPekan.forEach((h, j) => {
                        const kolom = kiri.length + j + 1;
                        const jam = jamHari(h)[k];
                        /* Nomor jamnya kecil dan abu di tepi kiri kotak;
                           sisa ruang di sebelah kanannya tempat memaraf.
                           Kotak tanpa jam diarsir — hari itu memang tidak
                           bertugas, atau jam jaganya lebih sedikit daripada
                           hari tersibuknya. */
                        const cell = sel(ws, r + k, kolom, jam == null ? null : "jam " + jam,
                            { ukuran: 8, warna: "FF8B8173", rata: "left", tegak: "middle" });
                        if (jam == null) cell.fill = ISI_KOSONG;
                        else if (h.iso && libur[h.iso]) cell.fill = ISI_SELANG;
                    });
                    ws.getRow(r + k).height = TINGGI_JAM;
                }
                r += larik;
            });
            if (!(o.baris || []).length) {
                ws.mergeCells(r, 1, r, KOL);
                sel(ws, r, 1, "Belum ada petugas terjadwal.", { miring: true, rata: "center", warna: "FF8B8173" });
                r += 1;
            }
        }

        // ---- keterangan & tanda tangan
        r += 1;
        ws.mergeCells(r, 1, r, KOL);
        sel(ws, r, 1, o.catatan || (parkiran
            ? "Diparaf oleh petugas yang bersangkutan pada hari pelaksanaan. "
              + "Kotak berarsir berarti hari itu belum ada petugasnya."
            : "Diparaf oleh petugas yang bersangkutan pada hari pelaksanaan. Satu kotak "
              + "satu jam jaga, diparaf di sebelah kanan nomor jamnya — jam yang tidak "
              + "dijalankan kotaknya dibiarkan kosong. Kotak berarsir berarti tidak ada "
              + "tugas pada jam itu."),
            { ukuran: 8, miring: true, warna: "FF5E5548", tanpaGaris: true });
        r += 2;

        blokTtd(ws, r, {
            kolomKiri: parkiran ? 3 : 2,
            kolomKanan: KOL,
            tempat: (o.ttd || {}).tempat,
            tanggal: (o.ttd || {}).tanggal,
            kepala: (o.ttd || {}).kepala,
            labelKanan: (o.ttd || {}).labelKanan,
            namaKanan: (o.ttd || {}).namaKanan
        });

        siapkanCetak(ws, parkiran ? "portrait" : "landscape",
            parkiran ? `${barisKepala}:${barisKepala}` : `${barisKepala}:${barisKepala + 1}`);
        return ws;
    }

    window.FormulirPiket = { pekanDari, lembarParaf, namaLembar, tglIndo, tglRingkas, HARI_KERJA };
})();
