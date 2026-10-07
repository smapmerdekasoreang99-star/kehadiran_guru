// =====================================================================
// Kop dokumen bersama — satu tata letak untuk seluruh aplikasi.
//
// Berkas ini SALINAN SERUPA di empat repositori:
//   data_induk/assets/  kehadiran_guru/assets/
//   absen_ekskul/assets/  induk_pembiayaan/assets/
// Bila diubah di satu tempat, salin ke tiga tempat lainnya. (Aplikasi
// dipisah menjadi repositori sendiri-sendiri supaya bisa di-deploy
// terpisah; berkas bersama karena itu disalin, seperti style.css.)
//
// Letaknya diatur operator di Data Induk → Profil Dokumen, disimpan di
// profil_dokumen.tata_letak, dan dibaca dari view v_penanda_tangan.
//
// SATUANNYA PIKSEL dari sudut kiri-atas daerah cetak.
//
// Alasannya penting. Excel memakai dua satuan yang berbeda dan mudah
// tertukar: lebar kolom dihitung dalam satuan lebar aksara (±7 px),
// sedangkan indentasi dalam tingkat (±10 px). Mencampur keduanya pernah
// membuat tulisan kop terdorong jauh ke kanan. Karena itu semua
// perhitungan di sini dilakukan dalam piksel, dan penerjemahan ke satuan
// Excel terjadi di satu tempat saja — dua tetapan di bawah ini.
//
// ---------------------------------------------------------------------
// Kenapa seluruh isinya dibungkus
// ---------------------------------------------------------------------
// Berkas ini skrip biasa, bukan modul, jadi setiap nama di dalamnya dulu
// menjadi nama GLOBAL — sepanggung dengan app.js yang dimuat sesudahnya.
// Di Data Induk itu berakhir buruk: app.js punya `tempatkan(siswaId,
// kode)` untuk memindahkan siswa antar rombel, namanya sama dengan
// `tempatkan(lebarKolomPx, x)` di sini, dan karena app.js dimuat
// belakangan, dialah yang menang. Akibatnya kopExcel memanggil fungsi
// pemindah siswa, menerima sebuah Promise, dan seluruh unduhan xlsx di
// Data Induk mati dengan pesan "A Cell needs a Row" — pesan yang tidak
// menyebut-nyebut nama maupun berkas yang sebenarnya bertabrakan.
//
// Pembungkus ini menutup kemungkinan itu untuk SELAMANYA, bukan hanya
// untuk satu nama: yang keluar dari sini cuma window.KopDokumen, dan
// keempat aplikasi memang hanya memakainya lewat nama itu. Isinya
// sengaja tidak ikut digeser masuk supaya perubahannya tetap terbaca
// sebagai dua baris, bukan sebagai berkas yang ditulis ulang.
// =====================================================================

(function () {
"use strict";

/* Satuan lebar kolom Excel → piksel. ExcelJS menulis angka lebar APA
   ADANYA ke berkas, dan Excel menampilkannya ±7 px per satuan (Calibri
   11). Tambahan +5 px hanya berlaku bila lebarnya diketik di Excel —
   memakainya di sini membuat kolom "No." (lebar 5) dikira 40 px padahal
   35 px, sehingga tulisan kop jatuh tepat di bawah tepi logo (7 Oktober
   2026). */
const PX_KOLOM  = w => Math.round(w * 7);
const PX_INDENT = 10;               // satu tingkat indentasi → piksel
const PT_PX     = 0.75;             // poin (tinggi baris Excel) → piksel

const px2pt = px => Math.max(1, Math.round(px * PT_PX));
const pt2px = pt => pt / PT_PX;

// Tinggi baris yang lapang untuk tulisan sebesar `ukuran` poin.
const tinggiTeksPx = ukuran => pt2px(Math.round(ukuran * 1.7));

/* Sekali geser terkecil yang masih bisa diwujudkan Excel. Pratinjau di
   Profil Dokumen membulatkan ke kelipatan ini supaya yang terlihat di
   layar sama dengan yang keluar di berkas — ketelitiannya ±5 px. */
const LANGKAH_GESER = PX_INDENT;

// Sela terkecil antara logo dan tulisan kop, supaya tidak berdempetan.
const JARAK_LOGO = 4;

/* Lebar satu spasi dalam piksel untuk huruf `pt` poin (Calibri: 0,226 em).
   Huruf lain (Arial dsb.) spasinya lebih lebar, jadi taksiran ini aman. */
const pxSpasi = pt => pt * 96 / 72 * 0.226;

const TATA_LETAK_BAWAAN = {
    logo:  { tampil: true, x: 4, y: 3, ukuran: 52 },
    teks:  { x: 60, y: 0, rata: 'kiri', ukuranNama: 13, ukuranAlamat: 9 },
    judul: { rata: 'tengah', ukuran: 12 },
    garis: true,
    kaki:  { tampil: true, rata: 'tengah' }
};

const angka = (nilai, bawaan, min, maks) => {
    const n = Number(nilai);
    if (!Number.isFinite(n)) return bawaan;
    return Math.min(maks, Math.max(min, Math.round(n)));
};
const rata = (nilai, bawaan) =>
    ['kiri', 'tengah', 'kanan'].includes(nilai) ? nilai : bawaan;

/* Nilai dari database boleh tidak lengkap, salah ketik, atau berasal dari
   versi aplikasi yang lebih lama. Semuanya dikembalikan ke rentang yang
   masuk akal di sini, sekali, supaya penulis dokumen di bawah tidak perlu
   lagi memeriksa apa pun. */
function tataLetak(sumber) {
    const s = (sumber && typeof sumber === 'object') ? sumber : {};
    const L = s.logo || {}, T = s.teks || {}, J = s.judul || {}, K = s.kaki || {};
    return {
        logo: {
            tampil: L.tampil !== false,
            x:      angka(L.x, 4, 0, 400),
            y:      angka(L.y, 3, 0, 200),
            ukuran: angka(L.ukuran, 52, 20, 140)
        },
        teks: {
            x:            angka(T.x, 60, 0, 900),
            y:            angka(T.y, 0, 0, 200),
            rata:         rata(T.rata, 'kiri'),
            ukuranNama:   angka(T.ukuranNama, 13, 8, 28),
            ukuranAlamat: angka(T.ukuranAlamat, 9, 6, 20)
        },
        judul: { rata: rata(J.rata, 'tengah'), ukuran: angka(J.ukuran, 12, 8, 24) },
        garis: s.garis !== false,
        kaki:  { tampil: K.tampil !== false, rata: rata(K.rata, 'tengah') }
    };
}

/* Piksel `x` → kolom Excel mana, dan berapa tingkat indentasi di dalamnya.
   Inilah satu-satunya tempat piksel bertemu satuan Excel. Ketelitiannya
   sebatas satu tingkat indentasi (±10 px) — itu sebabnya pratinjau di
   Profil Dokumen ikut dibulatkan 10 px, supaya yang terlihat di layar
   sama dengan yang keluar di berkas. */
function tempatkan(lebarKolomPx, x) {
    let batas = 0;
    for (let i = 0; i < lebarKolomPx.length; i++) {
        const sebelum = batas;
        batas += lebarKolomPx[i];
        if (batas > x || i === lebarKolomPx.length - 1) {
            return { kolom: i + 1, indent: Math.max(0, Math.round((x - sebelum) / PX_INDENT)) };
        }
    }
    return { kolom: 1, indent: 0 };
}

const bersih = daftar => daftar.filter(t => t !== null && t !== undefined && String(t).trim() !== '');

/* Baris keterangan di bawah nama sekolah — paling banyak dua. Isian yang
   kosong dibuang, sehingga sekolah tanpa NPSN tidak mendapat pemisah
   menggantung, dan baris kedua tidak muncul sama sekali selama telepon,
   surel, dan laman belum diisi. */
function barisIdentitas(p) {
    const q = p || {};
    return bersih([
        bersih([q.alamat, q.kota, q.npsn ? 'NPSN ' + q.npsn : '']).join('  ·  '),
        bersih([q.telepon ? 'Telp. ' + q.telepon : '', q.email, q.laman]).join('  ·  ')
    ]);
}

/* Susunan baris kop beserta tinggi dan jarak dari atas, dalam piksel.
   Dipakai DUA kali: oleh penulis Excel di bawah, dan oleh pratinjau seret
   di halaman Profil Dokumen. Sengaja satu fungsi — kalau pratinjau
   menghitungnya sendiri, cepat atau lambat keduanya akan berbeda dan
   operator menggeser sesuatu yang tidak sesuai dengan hasil cetaknya. */
function susunanKop(t, profil, judul, sub) {
    const baris = [];
    let atas = 0;
    const tambah = (kunci, px) => { baris.push({ kunci, px, atas }); atas += px; return baris.length; };

    if (t.teks.y > 0) tambah('jarakAtas', t.teks.y);
    const rNama     = tambah('nama', tinggiTeksPx(t.teks.ukuranNama));
    const identitas = barisIdentitas(profil);
    const rIdentitas = identitas.map(() => tambah('identitas', tinggiTeksPx(t.teks.ukuranAlamat)));

    /* Logo bisa lebih tinggi daripada dua baris tulisan. Bila begitu, satu
       baris pengganjal disisipkan supaya judul tidak tertimpa — persis
       setinggi kekurangannya, tidak lebih. */
    const bawahLogo = t.logo.tampil ? t.logo.y + t.logo.ukuran : 0;
    if (bawahLogo > atas) tambah('jarakLogo', bawahLogo - atas);

    const rJudul = judul ? tambah('judul', tinggiTeksPx(t.judul.ukuran)) : 0;
    const rSub   = sub   ? tambah('sub',   tinggiTeksPx(10)) : 0;
    const rGaris = t.garis ? tambah('garis', 8) : 0;
    // Satu baris renggang sebelum tabel, supaya kepala tabel tidak
    // menempel pada garis pembatas kop.
    tambah('jarakBawah', 10);

    /* Logo tidak boleh menimpa tulisan.

       Di Excel gambar SELALU digambar di atas sel — tidak ada cara
       menaruhnya di belakang tulisan. (Yang bisa di belakang hanya "latar
       lembar", dan itu diulang-ulang memenuhi halaman serta tidak bisa
       ditempatkan.) Jadi satu-satunya cara agar logo tidak menimpa
       tulisan adalah memastikan keduanya tidak pernah bertemu.

       Dihitung di sini supaya berlaku sama untuk berkas Excel, gambar
       PNG, dan pratinjau seret — termasuk untuk tata letak yang terlanjur
       tersimpan bertindih sebelum aturan ini ada.

       Hanya berlaku pada tulisan rata kiri; pada rata tengah/kanan
       letaknya ditentukan lebar halaman, bukan oleh teks.x. Judul dan
       subjudul tidak perlu diperiksa karena baris pengganjal di atas
       sudah menjamin keduanya berada di bawah logo. */
    let teksMinX = 0;
    if (t.logo.tampil && t.teks.rata === 'kiri') {
        const atasTeks = baris[rNama - 1].atas;
        const akhir = rIdentitas.length ? baris[rIdentitas[rIdentitas.length - 1] - 1] : baris[rNama - 1];
        const bawahTeks = akhir.atas + akhir.px;
        const bertindihTegak = t.logo.y < bawahTeks && (t.logo.y + t.logo.ukuran) > atasTeks;
        if (bertindihTegak) teksMinX = t.logo.x + t.logo.ukuran + JARAK_LOGO;
    }

    return { baris, tinggi: atas, identitas, teksMinX,
             teksX: Math.max(t.teks.x, teksMinX),
             indeks: { nama: rNama, identitas: rIdentitas, judul: rJudul, sub: rSub, garis: rGaris } };
}

// ---------------------------------------------------------------------
// Kop untuk berkas Excel (ExcelJS).
//
//   ws          lembar kerja, kolomnya sudah diatur lebarnya
//   wb          buku kerja (untuk menyisipkan logo)
//   logo        { buffer } atau { base64 } — boleh null
//   profil      satu baris v_penanda_tangan
//   judul, sub  tulisan di bawah identitas sekolah
//   kolomAkhir  kolom terakhir tabel, untuk penggabungan sel
//
// Mengembalikan nomor baris kosong pertama sesudah kop.
// ---------------------------------------------------------------------
function kopExcel(ws, opsi) {
    const { wb, logo = null, profil = {}, judul = '', sub = '', kolomAkhir = 1 } = opsi;
    const font = opsi.font || 'Calibri';
    const warnaGaris = opsi.warnaGaris || 'FF808080';
    const t = tataLetak(profil.tata_letak);

    const KOL = Math.max(1, kolomAkhir);
    const lebarKolomPx = [];
    for (let i = 1; i <= KOL; i++) lebarKolomPx.push(PX_KOLOM((ws.getColumn(i).width) || 10));

    const { baris, identitas, indeks, teksX, teksMinX } = susunanKop(t, profil, judul, sub);
    const { nama: rNama, identitas: rIdentitas, judul: rJudul, sub: rSub, garis: rGaris } = indeks;

    baris.forEach((b, i) => { ws.getRow(i + 1).height = px2pt(b.px); });

    // --- Logo ---------------------------------------------------------
    if (t.logo.tampil && logo) {
        try {
            const id = wb.addImage(logo.buffer ? { buffer: logo.buffer, extension: 'png' }
                                               : { base64: logo.base64, extension: 'png' });
            /* Letaknya dalam piksel (EMU: 9525 per piksel) dari kolom dan
               baris tempat sudutnya jatuh. Dulu dinyatakan sebagai pecahan
               kolom pertama, padahal ExcelJS menerjemahkan pecahan itu
               dengan skala lain, dan logo yang x-nya melewati kolom pertama
               jadi salah tempat. */
            const sudut = (ukuranPx, p) => {
                let i = 0;
                while (i < ukuranPx.length - 1 && p >= ukuranPx[i]) { p -= ukuranPx[i]; i++; }
                return { i, sisa: Math.round(Math.max(0, p) * 9525) };
            };
            const kol = sudut(lebarKolomPx, t.logo.x);
            const brs = sudut(baris.map(b => b.px), t.logo.y);
            ws.addImage(id, {
                tl:  { nativeCol: kol.i, nativeColOff: kol.sisa, nativeRow: brs.i, nativeRowOff: brs.sisa },
                ext: { width: t.logo.ukuran, height: t.logo.ukuran }
            });
        } catch (e) { /* tanpa logo pun berkasnya tetap terbentuk */ }
    }

    // --- Tulisan ------------------------------------------------------
    // teksX, bukan t.teks.x: bila logonya menghalangi, tulisannya digeser
    // ke kanan logo supaya tidak tertimpa. Lihat susunanKop di atas.
    const tempat = tempatkan(lebarKolomPx, teksX);

    /* Bila logo menjorok ke kolom tempat tulisan dimulai, jaraknya dibuat
       dengan SPASI di depan tulisan, bukan indentasi. Indentasi ditampilkan
       berbeda-beda: Excel ±9–10 px per tingkat, LibreOffice dan WPS lain
       lagi, Google Sheets mengabaikannya sama sekali — sedangkan logo
       selalu tepat di pikselnya. Spasi ikut ukuran huruf di aplikasi mana
       pun, jadi tulisan pasti berada di kanan logo. Satu spasi cadangan
       untuk tepi sel dan pembulatan. */
    let kiriKolom = 0;
    for (let i = 0; i < tempat.kolom - 1; i++) kiriKolom += lebarKolomPx[i];
    const terhalangLogo = teksMinX > 0 && kiriKolom < teksMinX;
    const depan = ukuran => terhalangLogo
        ? ' '.repeat(Math.ceil((teksX - kiriKolom) / pxSpasi(ukuran)) + 1) : '';

    const tulis = (r, teks, ukuran, tebal, perataan, diKop) => {
        if (!r) return;
        const tengah = perataan === 'tengah', kanan = perataan === 'kanan';
        const kolomMulai = (tengah || kanan) ? 1 : tempat.kolom;
        const kiri = !tengah && !kanan && diKop;
        if (kolomMulai < KOL) ws.mergeCells(r, kolomMulai, r, KOL);
        const c = ws.getCell(r, kolomMulai);
        c.value = kiri && teks ? depan(ukuran) + teks : teks;
        c.font = { name: font, size: ukuran, bold: !!tebal };
        c.alignment = {
            horizontal: tengah ? 'center' : (kanan ? 'right' : 'left'),
            vertical: 'middle',
            indent: (tengah || kanan || (kiri && terhalangLogo)) ? 0 : tempat.indent
        };
    };

    tulis(rNama, profil.nama_sekolah || '', t.teks.ukuranNama, true, t.teks.rata, true);
    rIdentitas.forEach((r, i) => tulis(r, identitas[i], t.teks.ukuranAlamat, false, t.teks.rata, true));
    tulis(rJudul,  judul,                     t.judul.ukuran,      true,  t.judul.rata);
    tulis(rSub,    sub,                       10,                  false, t.judul.rata);

    if (rGaris) {
        for (let k = 1; k <= KOL; k++) {
            ws.getCell(rGaris, k).border = { bottom: { style: 'medium', color: { argb: warnaGaris } } };
        }
    }
    return baris.length + 1;
}

/* Catatan kaki. Dipisah dari kopExcel karena letaknya bergantung pada
   panjang tabel, yang baru diketahui pemanggilnya. */
function kakiExcel(ws, r, opsi) {
    const { profil = {}, kolomAkhir = 1 } = opsi;
    const t = tataLetak(profil.tata_letak);
    if (!t.kaki.tampil || !profil.catatan_kaki) return r;
    const KOL = Math.max(1, kolomAkhir);
    if (KOL > 1) ws.mergeCells(r, 1, r, KOL);
    const c = ws.getCell(r, 1);
    c.value = profil.catatan_kaki;
    c.font = { name: opsi.font || 'Calibri', size: 8, italic: true, color: { argb: 'FF808080' } };
    c.alignment = { horizontal: t.kaki.rata === 'kiri' ? 'left'
                              : t.kaki.rata === 'kanan' ? 'right' : 'center' };
    return r + 1;
}

// ---------------------------------------------------------------------
// Blok tanda tangan untuk Excel (28 September 2026) — satu aturan untuk
// semua unduhan, supaya proporsional terhadap lebar kop di atasnya.
//
// Dulu tiap pengunduh menaruh tulisan tanda tangan di SATU kolom pilihan
// (mis. kolom B dan E). Karena lebar kolom berbeda-beda, jarak blok kanan
// ke tepi kanan kop tidak sama dengan jarak blok kiri ke tepi kiri —
// tampak berat sebelah. Di sini lebar kolom sebenarnya dihitung, lalu:
//   1 blok  → di kanan, selebar ±40 % kop;
//   2 blok  → kiri dan kanan dengan lebar hampir SAMA (±25–48 % kop),
//             masing-masing menempel tepi, jadi jaraknya ke tepi simetris;
//   3 blok  → kiri dan kanan simetris seperti di atas, satu di tengah.
// Tulisan tiap blok digabung selebar rentangnya dan dirata tengah.
// Baris atas tiap blok disejajarkan (yang lebih pendek diberi baris
// kosong sebelum jabatan), lalu ruang tanda tangan, lalu nama.
//
//   kolomAwal, kolomAkhir  rentang kop / bingkai (bawaan 1 s.d. 1)
//   blok   [{ atas: ['Mengetahui,', 'Kepala Sekolah,'], nama, nip }]
//          baris atas boleh string atau { teks, tebal }
//   ruang  jumlah baris kosong untuk tanda tangan (bawaan 4)
//   font, ukuran
//
// Mengembalikan nomor baris kosong sesudah blok.
// ---------------------------------------------------------------------
function rentangTtd(lebar, n) {
    const N = lebar.length, W = lebar.reduce((a, b) => a + b, 0);
    const kiri = k => lebar.slice(0, k).reduce((a, b) => a + b, 0);       // lebar kolom 1..k
    const kanan = k => lebar.slice(N - k).reduce((a, b) => a + b, 0);     // lebar k kolom terakhir
    if (n === 1) {
        let k = 1;
        while (k < N && kanan(k) < W * 0.4) k++;
        return [[N - k + 1, N]];
    }
    if (N < 2) return Array.from({ length: n }, () => [1, 1]);
    const bawah = n === 3 ? 0.22 : 0.25, atas = n === 3 ? 0.36 : 0.48, sasaran = n === 3 ? 0.3 : 0.38;
    let terbaik = null;
    for (let a = 1; a < N; a++) {
        for (let b = 1; a + b <= N - (n === 3 ? 1 : 0); b++) {
            const wl = kiri(a), wr = kanan(b);
            const sah = wl >= W * bawah && wl <= W * atas && wr >= W * bawah && wr <= W * atas;
            const nilai = Math.abs(wl - wr) * 3 + Math.abs(wl - W * sasaran) + Math.abs(wr - W * sasaran) + (sah ? 0 : W * 10);
            if (!terbaik || nilai < terbaik.nilai) terbaik = { a, b, nilai };
        }
    }
    const L = [1, terbaik.a], R = [N - terbaik.b + 1, N];
    return n === 3 ? [L, [terbaik.a + 1, N - terbaik.b], R] : [L, R];
}

function ttdExcel(ws, r, opsi) {
    const awal = Math.max(1, opsi.kolomAwal || 1);
    const akhir = Math.max(awal, opsi.kolomAkhir || awal);
    const font = opsi.font || 'Calibri', ukuran = opsi.ukuran || 10;
    const ruang = opsi.ruang == null ? 4 : opsi.ruang;
    const blok = (opsi.blok || []).filter(Boolean).slice(0, 3);
    if (!blok.length) return r;

    const lebar = [];
    for (let k = awal; k <= akhir; k++) lebar.push(PX_KOLOM(ws.getColumn(k).width || 10));
    const rentang = rentangTtd(lebar, blok.length).map(([x, y]) => [x + awal - 1, y + awal - 1]);

    // Baris atas disejajarkan: yang lebih pendek diberi baris kosong sebelum baris terakhirnya (jabatan).
    const tinggi = Math.max(...blok.map(b => (b.atas || []).length));
    const atasRata = blok.map(b => {
        const a = (b.atas || []).slice();
        while (a.length < tinggi) a.splice(Math.max(0, a.length - 1), 0, '');
        return a;
    });

    const tulis = (baris, [k1, k2], isi, gaya) => {
        if (k2 > k1) { try { ws.mergeCells(baris, k1, baris, k2); } catch (e) { /* sudah tergabung */ } }
        const c = ws.getCell(baris, k1);
        c.value = isi;
        c.font = Object.assign({ name: font, size: ukuran }, gaya || {});
        c.alignment = { horizontal: 'center', vertical: 'middle' };
    };
    blok.forEach((b, i) => {
        atasRata[i].forEach((baris, j) => {
            const teks = typeof baris === 'string' ? baris : (baris && baris.teks) || '';
            if (teks) tulis(r + j, rentang[i], teks, typeof baris === 'object' && baris.tebal ? { bold: true } : null);
        });
        const rNama = r + tinggi + ruang;
        tulis(rNama, rentang[i], b.nama || '……………………', { bold: true, underline: true });
        if (b.nip) tulis(rNama + 1, rentang[i], b.nip, { size: ukuran - 1 });
    });
    const adaNip = blok.some(b => b.nip);
    return r + tinggi + ruang + 1 + (adaNip ? 1 : 0) + 1;
}

// ---------------------------------------------------------------------
// Kop untuk gambar PNG (kanvas). Di sini piksel berarti piksel — tidak
// ada penerjemahan satuan sama sekali, jadi hasilnya tepat.
//
//   g        konteks 2d
//   logo     HTMLImageElement atau null
//   padding  tepi kiri daerah isi; tata letak dihitung dari situ
//
// Mengembalikan ordinat y tepat di bawah kop.
// ---------------------------------------------------------------------
function kopKanvas(g, opsi) {
    const { logo = null, profil = {}, judul = '', sub = '', padding = 0, lebar = 0 } = opsi;
    const t = tataLetak(profil.tata_letak);
    const tinta = opsi.tinta || '#241F17';
    const redup = opsi.redup || '#6B6252';
    const warnaGaris = opsi.warnaGaris || '#C99A2E';

    // Susunan barisnya sama persis dengan berkas Excel — memakai fungsi
    // yang sama — sehingga gambar PNG dan xlsx tidak bisa berbeda.
    const { baris, identitas, indeks, tinggi, teksX } = susunanKop(t, profil, judul, sub);
    const ambil = n => (n ? baris[n - 1] : null);

    // Ukuran poin di Excel disepadankan dengan piksel di kanvas, supaya
    // keduanya tampak sama besar.
    const pxNama   = Math.round(pt2px(t.teks.ukuranNama));
    const pxAlamat = Math.round(pt2px(t.teks.ukuranAlamat));
    const pxJudul  = Math.round(pt2px(t.judul.ukuran));

    // Kanvas menggambar tulisan dari garis dasarnya, bukan dari atasnya.
    const garisDasar = (b, pxFont) => b.atas + b.px / 2 + pxFont * 0.36;

    const kananIsi = lebar - padding;
    const mendatar = perataan => ({
        x: perataan === 'tengah' ? (padding + kananIsi) / 2
         : perataan === 'kanan'  ? kananIsi
         : padding + teksX,
        rata: perataan === 'tengah' ? 'center' : perataan === 'kanan' ? 'right' : 'left'
    });

    const teks = mendatar(t.teks.rata);
    g.textAlign = teks.rata;
    g.fillStyle = tinta;
    g.font = `bold ${pxNama}px Georgia, serif`;
    g.fillText(profil.nama_sekolah || '', teks.x, garisDasar(ambil(indeks.nama), pxNama));

    g.fillStyle = redup;
    g.font = `${pxAlamat}px Arial, sans-serif`;
    indeks.identitas.forEach((n, i) => {
        g.fillText(identitas[i], teks.x, garisDasar(ambil(n), pxAlamat));
    });

    const kepala = mendatar(t.judul.rata);
    g.textAlign = kepala.rata;
    if (indeks.judul) {
        g.fillStyle = tinta;
        g.font = `bold ${pxJudul}px Arial, sans-serif`;
        g.fillText(judul, kepala.x, garisDasar(ambil(indeks.judul), pxJudul));
    }
    if (indeks.sub) {
        g.fillStyle = redup;
        g.font = '13px Arial, sans-serif';
        g.fillText(sub, kepala.x, garisDasar(ambil(indeks.sub), 13));
    }

    if (indeks.garis) {
        const b = ambil(indeks.garis);
        g.strokeStyle = warnaGaris;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(padding, b.atas + b.px - 2);
        g.lineTo(kananIsi, b.atas + b.px - 2);
        g.stroke();
    }

    /* Logo digambar TERAKHIR, sesudah tulisan. Bukan selera, melainkan
       menyamakan diri dengan Excel: di sana gambar selalu berada di atas
       sel dan tidak bisa ditaruh di belakang tulisan. Kalau di kanvas
       logonya digambar lebih dulu, gambar PNG dan berkas xlsx akan berbeda
       justru pada satu hal yang paling kelihatan. Bertindihnya sendiri
       sudah dicegah di susunanKop; ini untuk berjaga kalau toh terjadi. */
    if (t.logo.tampil && logo) {
        g.drawImage(logo, padding + t.logo.x, t.logo.y, t.logo.ukuran, t.logo.ukuran);
    }

    g.textAlign = 'left';
    return tinggi + 8;
}

/* Tinggi kop di kanvas, supaya pemanggil bisa menghitung tinggi gambar
   sebelum menggambarnya. Memakai susunan yang sama dengan kopKanvas, jadi
   keduanya tidak mungkin berselisih. */
function tinggiKopKanvas(profil, judul = 'x', sub = 'x') {
    const t = tataLetak(profil && profil.tata_letak);
    return susunanKop(t, profil, judul, sub).tinggi + 8;
}

/* Dipasang sebagai variabel global, bukan modul ES, karena dua aplikasi
   (Data Induk dan Induk Pembiayaan) memakai skrip biasa sedangkan dua
   lainnya memakai modul. Skrip biasa dijalankan lebih dulu daripada
   modul, jadi keduanya sama-sama menemukannya di sini. */
window.KopDokumen = {
    TATA_LETAK_BAWAAN, LANGKAH_GESER,
    tataLetak, susunanKop, barisIdentitas,
    kopExcel, kakiExcel, ttdExcel, kopKanvas, tinggiKopKanvas
};

})();
