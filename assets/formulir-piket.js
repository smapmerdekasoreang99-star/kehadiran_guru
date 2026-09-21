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
// Satu lembar kosong untuk sepekan, bukan lembar bertanggal
// ---------------------------------------------------------------------
// Lembarnya sengaja TIDAK bertanggal: baris "Pekan: ___ s.d. ___" dan
// kolom tanggal tiap hari dibiarkan kosong untuk ditulis tangan. Dengan
// begitu sekali unduh, sekali cetak, lalu diperbanyak dengan mesin
// fotokopi untuk pekan-pekan berikutnya — yang berubah tiap pekan memang
// cuma tanggalnya, sedangkan jadwal piketnya tetap.
//
// Karena itu tidak ada pemecahan rentang menjadi pekan-pekan di sini:
// dulu rentang sebulan menghasilkan empat lembar, dan begitu tanggalnya
// dikosongkan keempatnya menjadi lembar yang sama persis.
//
// Bentuknya tetap satu pekan Senin–Jumat dalam satu halaman cetak, karena
// itulah satuan yang dipakai memasang dan mengumpulkannya.
// =====================================================================

(function () {
    "use strict";

    const HARI_KERJA = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"];
    const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
                   "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

    const FONT = "Arial";
    const TIPIS = { style: "thin", color: { argb: "FF9A9A9A" } };
    const TEBAL = { style: "medium", color: { argb: "FF5E5548" } };
    const GARIS = { top: TIPIS, left: TIPIS, bottom: TIPIS, right: TIPIS };
    const GELAP = "FF12262E";
    /* Kepala tabel berlatar TIPIS, bukan gelap. Blok gelap selebar halaman
       menghabiskan tinta tanpa menambah keterbacaan apa pun — tulisan tebal
       dan garis bawah yang tegas sudah cukup membedakannya dari isi. */
    const ISI_KEPALA = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE8DD" } };
    const ISI_KOSONG = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEBE1" } };

    // Tinggi baris isian: cukup untuk dibubuhi paraf dengan tangan.
    // 34 pt kira-kira 1,2 cm di kertas — sebesar kotak paraf pada daftar
    // hadir yang sudah biasa dipakai sekolah.
    const TINGGI_ISI_LEBAR = 40;     // baris parkiran: muat tanda tangan penuh
    /* Satu kotak paraf. 15 pt kira-kira 0,53 cm — cukup untuk dibubuhi
       paraf, dan itulah ukuran terbesar yang masih membuat sepekan penuh
       muat di satu lembar, dengan sisa sekitar 1 cm untuk pertumbuhan.
       Lebih lega berarti tumpah ke halaman kedua. */
    const TINGGI_JAM = 15;

    const keTanggal = (iso) => new Date(iso + "T00:00:00");
    function tglIndo(iso) {
        const d = keTanggal(iso);
        return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
    }
    /* "Dra. Siti Aminah, M.Pd." -> "Siti Aminah". Kotak paraf harus memuat
       nama DAN ruang untuk membubuhkan paraf di sebelahnya; gelar di depan
       dan di belakang memakan ruang itu tanpa membantu siapa pun mengenali
       namanya sendiri. Aturannya sama dengan yang dipakai di layar. */
    function namaPendek(nama) {
        let n = String(nama || "").split(",")[0];
        n = n.replace(/^((dra?s?|dr|h|hj|ir|prof|kh|ust|ustadz|ustadzah)\.?\s+)+/i, "").trim();
        const kata = n.split(/\s+/);
        return kata.length > 2 ? kata.slice(0, 2).join(" ") : n;
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
                                           ukuran: o.ukuran || 10 });
        cell.fill = ISI_KEPALA;
        // Garis bawah tegas menggantikan latar gelap sebagai pemisah kepala
        // tabel dari isinya.
        cell.border = Object.assign({}, cell.border, { bottom: TEBAL });
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
        /* Ruang membubuhkan tanda tangan: tiga baris bila lega, dua bila
           lembarnya dikejar muat satu halaman. Dua baris masih sekitar 1 cm,
           cukup untuk tanda tangan yang tidak melebar. */
        const jarak = o.rapat ? 3 : 5;
        tulis(r + jarak, o.kolomKiri, o.kepala || "……………………", true, true);
        tulis(r + jarak, o.kolomKanan, o.namaKanan || "……………………", true, true);
        return r + jarak + 2;
    }

    function siapkanCetak(ws, orientasi, barisJudulUlang, rapat) {
        ws.pageSetup = {
            paperSize: 9, orientation: orientasi,
            fitToPage: true, fitToWidth: 1, fitToHeight: 0,
            /* Tepi dirapatkan pada lembar yang dikejar muat satu halaman.
               Satu sentimeter margin yang dihemat berarti dua kotak paraf
               lagi yang tidak tumpah ke halaman berikutnya. */
            margins: rapat
                ? { left: 0.25, right: 0.25, top: 0.2, bottom: 0.2, header: 0.1, footer: 0.1 }
                : { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
            horizontalCentered: true
        };
        // Baris judul diulang di tiap halaman: daftar yang panjang tetap
        // terbaca di halaman kedua dan ketiga.
        if (barisJudulUlang) ws.pageSetup.printTitlesRow = barisJudulUlang;
        ws.views = [{ showGridLines: false }];
    }

    // ---------------------------------------------------------------
    // Satu lembar formulir paraf: sepekan Senin–Jumat, tanpa tanggal.
    //
    //   wb        buku kerja ExcelJS
    //   kop       window.KopDokumen
    //   profil    satu baris v_penanda_tangan / profil_dokumen (boleh {})
    //   logo      { buffer } atau { base64 } atau null
    //   jenis     'meja' | 'unit' | 'parkiran'
    //   judul     tulisan besar di bawah identitas sekolah
    //   baris     meja/unit : [{ nama, unit, jam: { Senin:[1,2], ... } }]
    //             parkiran  : { Senin:'Nama', Selasa:'Nama', ... }
    //   ttd       { tempat, tanggal, kepala, labelKanan, namaKanan }
    //
    // Mengembalikan lembar kerjanya.
    // ---------------------------------------------------------------
    function lembarParaf(wb, o) {
        const parkiran = o.jenis === "parkiran";
        const hariPekan = HARI_KERJA;

        const ws = wb.addWorksheet(namaLembar(o.namaLembar || "Formulir Paraf"));

        /* Meja dan unit disusun menurut WAKTU: baris jam pelajaran, kolom
           hari. Dulu disusun menurut orang — satu baris satu petugas — dan
           sepekan piket meja sekolah menghabiskan tiga sampai empat halaman,
           karena tiap petugas memerlukan sebanyak jam tersibuknya. Padahal
           pada satu jam paling banyak dua orang berjaga bersamaan, jadi
           disusun menurut jamnya seluruh pekan cukup 23 larik dan muat satu
           lembar.

           Yang dikorbankan: nama seseorang tersebar di beberapa sel, jadi
           lembar ini tidak bisa dipakai menjumlahkan paraf satu orang sekali
           lihat. Itu memang bukan tugasnya — yang menghitung aplikasinya,
           yang sudah merekap per jam per orang; kertas ini membuktikan. */
        /* Tiap hari dua kolom: nama tercetak, dan di sebelah kanannya kolom
           kosong tempat memaraf. Dulu keduanya berbagi satu sel — namanya di
           tepi kiri, paraf menumpang di ruang sisanya — dan tidak ada garis
           yang menyatakan sampai mana nama berakhir dan dari mana paraf
           dimulai. Dengan dua kolom, kotak parafnya benar-benar kotak, dan
           dua petugas pada satu jam otomatis mendapat dua kotak. */
        const LEBAR_NAMA = 17, LEBAR_PARAF = 10;
        const kiri = parkiran
            ? [["NO", 5], ["HARI", 12], ["TANGGAL", 24], ["NAMA PETUGAS", 34]]
            // Jamnya cukup nomornya. Waktu mulai membuat kolomnya melebar dan
            // tidak menjawab apa pun — yang memaraf sudah berada di jamnya.
            : [["JAM", 7]];
        ws.columns = parkiran
            ? kiri.map(([, w]) => ({ width: w })).concat([{ width: 30 }])
            : kiri.map(([, w]) => ({ width: w })).concat(
                hariPekan.flatMap(() => [{ width: LEBAR_NAMA }, { width: LEBAR_PARAF }]));
        const KOL = ws.columns.length;
        // Kolom pertama hari ke-i (nama); parafnya selalu di sebelah kanannya.
        const kolomHari = (i) => kiri.length + i * 2 + 1;

        /* Pekannya ikut di baris subjudul kop, bukan baris tersendiri:
           barisnya sendiri memakan 0,7 cm, dan 0,7 cm itu setara satu kotak
           paraf lagi yang muat di halaman yang sama. Isiannya dikosongkan
           untuk ditulis tangan — lihat catatan di kepala berkas ini. */
        const tekspekan = "Pekan: ………………………………  s.d.  ………………………………";

        // ---- kop bersama
        let r = o.kop.kopExcel(ws, {
            wb, logo: o.logo || null, profil: o.profil || {},
            judul: String(o.judul || "").toUpperCase(),
            sub: [o.sub, tekspekan].filter(Boolean).join("   ·   "),
            kolomAkhir: KOL, font: FONT, warnaGaris: GELAP
        });

        // ---- kepala tabel
        const barisKepala = r;
        if (parkiran) {
            [...kiri.map(([t]) => t), "PARAF PETUGAS"].forEach((t, i) => kepalaSel(ws, r, i + 1, t));
            ws.getRow(r).height = 26;
            r += 1;
        } else {
            // Satu baris saja: hari dan tanggalnya digabung, melintasi kolom
            // nama dan kolom parafnya. Tiap baris yang dihemat di sini
            // menjadi satu kotak paraf lagi yang muat.
            kepalaSel(ws, r, 1, kiri[0][0]);
            hariPekan.forEach((h, i) => {
                const c = kolomHari(i);
                ws.mergeCells(r, c, r, c + 1);
                // Tanggalnya dikosongkan untuk ditulis tangan: lembar ini
                // diperbanyak dengan fotokopi untuk pekan-pekan berikutnya.
                kepalaSel(ws, r, c, `${h.toUpperCase()}   ……/……`);
                kepalaSel(ws, r, c + 1, null);
            });
            ws.getRow(r).height = 20;
            r += 1;
        }

        // ---- isi
        if (parkiran) {
            hariPekan.forEach((h, i) => {
                const nama = (o.baris || {})[h] || "";
                const kosong = !nama;
                sel(ws, r, 1, i + 1, { rata: "center" });
                sel(ws, r, 2, h, { rata: "center" });
                sel(ws, r, 3, "…………………………", { rata: "center" });
                sel(ws, r, 4, nama || "belum ada petugas", kosong ? { miring: true, warna: "FF8B8173" } : {});
                const parafSel = sel(ws, r, 5, null, {});
                if (kosong) parafSel.fill = ISI_KOSONG;
                ws.getRow(r).height = TINGGI_ISI_LEBAR;
                r += 1;
            });
        } else {
            /* Dibalik dari daftar per petugas menjadi peta per giliran:
               slot["Senin|3"] = [nama, ...]. Urutan namanya mengikuti urutan
               daftar yang diserahkan pemanggil — masa kerja terlama lebih
               dulu, seperti seluruh daftar guru di sistem ini. */
            const slot = new Map();
            const jamAda = new Set();
            for (const b of o.baris || []) {
                for (const hari of Object.keys(b.jam || {})) {
                    const v = b.jam[hari];
                    for (const j of Array.isArray(v) ? v : [v]) {
                        if (j == null || j === "") continue;
                        jamAda.add(Number(j));
                        const k = hari + "|" + Number(j);
                        if (!slot.has(k)) slot.set(k, []);
                        slot.get(k).push(b.nama);
                    }
                }
            }
            const daftarJam = [...jamAda].sort((a, b) => a - b);

            for (const j of daftarJam) {
                const isi = hariPekan.map((h) => slot.get(h + "|" + j) || []);
                // Tinggi baris jam ini = sebanyak petugas pada hari terpadat.
                const larik = Math.max(1, ...isi.map((x) => x.length));
                const rAwal = r, rAkhir = r + larik - 1;

                // Kolom jam digabung menurun melintasi lariknya.
                if (larik > 1) ws.mergeCells(rAwal, 1, rAkhir, 1);
                for (let rr = rAwal; rr <= rAkhir; rr++) ws.getCell(rr, 1).border = GARIS;
                sel(ws, rAwal, 1, "ke-" + j, { rata: "center", tegak: "middle", tebal: true });

                for (let k = 0; k < larik; k++) {
                    hariPekan.forEach((h, i) => {
                        const nama = isi[i][k];
                        const c = kolomHari(i);
                        const namaSel = sel(ws, r + k, c, nama == null ? null : namaPendek(nama),
                            { ukuran: 9, rata: "left", tegak: "middle" });
                        const parafSel = sel(ws, r + k, c + 1, null, {});
                        /* Sel yang memang tidak akan diparaf diberi latar
                           tipis: pada jam itu hari itu tidak ada yang
                           berjaga. Putih berarti menunggu paraf — jadi yang
                           kosong dan putih ketahuan sebagai yang terlewat. */
                        if (nama == null) { namaSel.fill = ISI_KOSONG; parafSel.fill = ISI_KOSONG; }
                    });
                    ws.getRow(r + k).height = TINGGI_JAM;
                }

                /* Garis tebal memisahkan jam, garis tipis memisahkan dua
                   petugas di dalam jam yang sama — supaya sekilas terlihat
                   paraf mana milik jam mana. */
                for (let c = 1; c <= KOL; c++) {
                    const cell = ws.getCell(rAwal, c);
                    cell.border = Object.assign({}, cell.border, { top: TEBAL });
                }
                r += larik;
            }
            if (!daftarJam.length) {
                ws.mergeCells(r, 1, r, KOL);
                sel(ws, r, 1, "Belum ada jam piket terjadwal.", { miring: true, rata: "center", warna: "FF8B8173" });
                r += 1;
            }
            for (let c = 1; c <= KOL; c++) {
                const cell = ws.getCell(r - 1, c);
                cell.border = Object.assign({}, cell.border, { bottom: TEBAL });
            }
        }

        // ---- keterangan & tanda tangan
        ws.mergeCells(r, 1, r, KOL);
        sel(ws, r, 1, o.catatan || (parkiran
            ? "Diparaf oleh petugas yang bersangkutan pada hari pelaksanaan. "
              + "Kotak berarsir berarti hari itu belum ada petugasnya."
            : "Diparaf oleh petugas yang bersangkutan pada hari pelaksanaan, pada kotak "
              + "kosong di sebelah kanan namanya sendiri. Satu kotak satu jam jaga — jam "
              + "yang tidak dijalankan kotaknya dibiarkan kosong. Kotak berlatar abu tidak "
              + "perlu diisi: pada jam itu memang tidak ada yang berjaga."),
            { ukuran: 8, miring: true, warna: "FF5E5548", tanpaGaris: true });
        ws.getRow(r).height = 14;
        r += 1;

        // Keterangan unit: namanya saja yang muat di kotak, unitnya di sini.
        if (o.jenis === "unit") {
            const daftar = (o.baris || []).filter((b) => b.unit)
                .map((b) => `${namaPendek(b.nama)} — ${b.unit}`).join(" · ");
            if (daftar) {
                ws.mergeCells(r, 1, r, KOL);
                sel(ws, r, 1, daftar, { ukuran: 8, warna: "FF5E5548", tanpaGaris: true, lipat: true });
                ws.getRow(r).height = 20;
                r += 1;
            }
        }

        blokTtd(ws, r, {
            kolomKiri: parkiran ? 3 : 2,
            kolomKanan: KOL,
            rapat: !parkiran,
            tempat: (o.ttd || {}).tempat,
            tanggal: (o.ttd || {}).tanggal,
            kepala: (o.ttd || {}).kepala,
            labelKanan: (o.ttd || {}).labelKanan,
            namaKanan: (o.ttd || {}).namaKanan
        });

        siapkanCetak(ws, parkiran ? "portrait" : "landscape",
            `${barisKepala}:${barisKepala}`, !parkiran);
        return ws;
    }

    window.FormulirPiket = { lembarParaf, namaLembar };
})();
