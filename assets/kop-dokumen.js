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
// =====================================================================

const PX_KOLOM  = w => w * 7 + 5;   // satuan lebar kolom Excel → piksel
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

    const { baris, identitas, indeks, teksX } = susunanKop(t, profil, judul, sub);
    const { nama: rNama, identitas: rIdentitas, judul: rJudul, sub: rSub, garis: rGaris } = indeks;

    baris.forEach((b, i) => { ws.getRow(i + 1).height = px2pt(b.px); });

    // --- Logo ---------------------------------------------------------
    if (t.logo.tampil && logo) {
        try {
            const id = wb.addImage(logo.buffer ? { buffer: logo.buffer, extension: 'png' }
                                               : { base64: logo.base64, extension: 'png' });
            // Letaknya dinyatakan sebagai pecahan kolom dan baris pertama.
            ws.addImage(id, {
                tl:  { col: t.logo.x / lebarKolomPx[0], row: t.logo.y / baris[0].px },
                ext: { width: t.logo.ukuran, height: t.logo.ukuran }
            });
        } catch (e) { /* tanpa logo pun berkasnya tetap terbentuk */ }
    }

    // --- Tulisan ------------------------------------------------------
    // teksX, bukan t.teks.x: bila logonya menghalangi, tulisannya digeser
    // ke kanan logo supaya tidak tertimpa. Lihat susunanKop di atas.
    const tempat = tempatkan(lebarKolomPx, teksX);
    const tulis = (r, teks, ukuran, tebal, perataan) => {
        if (!r) return;
        const tengah = perataan === 'tengah', kanan = perataan === 'kanan';
        const kolomMulai = (tengah || kanan) ? 1 : tempat.kolom;
        if (kolomMulai < KOL) ws.mergeCells(r, kolomMulai, r, KOL);
        const c = ws.getCell(r, kolomMulai);
        c.value = teks;
        c.font = { name: font, size: ukuran, bold: !!tebal };
        c.alignment = {
            horizontal: tengah ? 'center' : (kanan ? 'right' : 'left'),
            vertical: 'middle',
            indent: (tengah || kanan) ? 0 : tempat.indent
        };
    };

    tulis(rNama, profil.nama_sekolah || '', t.teks.ukuranNama, true, t.teks.rata);
    rIdentitas.forEach((r, i) => tulis(r, identitas[i], t.teks.ukuranAlamat, false, t.teks.rata));
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
    kopExcel, kakiExcel, kopKanvas, tinggiKopKanvas
};
