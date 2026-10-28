/* Pembuat Panduan Kehadiran Guru (15 Okt 2026) — mesin sama dengan Tryout_Guru & absen_ekskul/alat/buat-panduan.js
   ---------------------------------------------------------------
   Satu sumber isi (ISI di bawah) → dua berkas di akar proyek, dibuka lewat tombol 📘 Panduan di bilah samping:
     Panduan_Kehadiran_Guru.pdf   (dicetak Chrome/Edge tanpa jendela, lewat DevTools Protocol)
     Panduan_Kehadiran_Guru.docx  (paket npm "docx")
   Jalankan dari akar proyek (paket docx dipinjam dari Tryout_Guru, tidak perlu node_modules di sini):
     NODE_PATH=../Tryout_Guru/node_modules node alat/buat-panduan.js
   Ubah isi panduan di sini bila tampilan atau aturan aplikasi berubah, lalu jalankan ulang. */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), { spawn } = require("child_process");

const SUBJUDUL = "Mencatat ketidakhadiran, menugaskan pengganti, piket, kehadiran staf, dan rekap", UNTUK = "petugas piket, Wakasek Kurikulum, Tata Usaha/operator, dan pimpinan";
const AKAR = path.join(__dirname, ".."), NAMA = "Panduan_Kehadiran_Guru";
const JUDUL = "Panduan Kehadiran Guru", VERSI = "15 Oktober 2026", MEREK = "KEHADIRAN GURU · SMA PLUS MERDEKA SOREANG";

/* ================= Isi panduan =================
   Blok: H1/H2/H3 (judul, dinomori otomatis), P (paragraf), UL/OL (daftar), TB (tabel: kepala, baris, lebar relatif),
   KOTAK (jenis: info | saran | awas | bahaya), STAT (kotak angka contoh). Teks boleh memakai **tebal**. */
const H1 = s => ({ t: "h1", s }), H2 = s => ({ t: "h2", s }), H3 = s => ({ t: "h3", s }), P = s => ({ t: "p", s });
const UL = (...a) => ({ t: "ul", a }), OL = (...a) => ({ t: "ol", a });
const TB = (kepala, baris, lebar) => ({ t: "tb", kepala, baris, lebar: lebar || kepala.map(() => 1) });
const KOTAK = (jenis, judul, ...isi) => ({ t: "kotak", jenis, judul, isi });
const STAT = (ket, ...a) => ({ t: "stat", a, ket });

const ISI = [
  /* ============================ 1 ============================ */
  H1("Mengenal Kehadiran Guru"),
  P("Kehadiran Guru (di layar disebut **Sistem Guru Pengganti**) adalah aplikasi web sekolah untuk mencatat guru yang tidak hadir pada jam pelajarannya, menugaskan guru pengganti, mencatat pelaksanaan piket dan kehadiran staf, lalu menyusun rekap kehadiran. Hasilnya dibaca aplikasi **Induk Pembiayaan** untuk menghitung honor, transport, dan kompensasi."),
  P("Panduan ini untuk **petugas piket** (mencatat ketidakhadiran dan pengganti setiap hari), **Wakasek Kurikulum** (memantau dan menandatangani rekap), **Tata Usaha / operator** (kehadiran staf dan fingerprint), serta **pimpinan dan bendahara** (membaca rekap)."),
  H2("Alur kerja harian"),
  OL("**Pagi**: di **Ketidakhadiran Guru**, pilih tanggal hari ini, tandai jam pelajaran guru yang tidak hadir beserta status dan tugas untuk siswa.",
    "**Segera sesudahnya**: di **Penugasan Pengganti**, tetapkan pengganti tiap jam kosong (pakai rekomendasi), lalu **Bagikan ke WA** ke grup guru.",
    "**Sepanjang pekan**: catat **Pelaksanaan Piket**; Tata Usaha mencatat atau mengunggah **Kehadiran Staf**.",
    "**Akhir bulan**: buka **Rekapitulasi Kehadiran**, periksa, unduh, dan tanda tangani. Induk Pembiayaan memakai data yang sama."),
  H2("Menu aplikasi"),
  TB(["Menu", "Isi", "Perlu PIN?"], [
    ["**Beranda**", "Kartu pintas ke semua menu.", "Tidak"],
    ["**Jadwal Kegiatan**", "Jadwal tetap sekolah per guru, per kelas, per hari; unduh Excel. Hanya untuk dilihat.", "Tidak"],
    ["**Ketidakhadiran Guru**", "Menandai jam pelajaran yang gurunya tidak hadir.", "Ya, untuk mencatat"],
    ["**Penugasan Pengganti**", "Menetapkan pengganti tiap jam kosong; bagikan ke WhatsApp.", "Ya, untuk mencatat (bagikan ke WA: tidak)"],
    ["**Pelaksanaan Piket**", "Kehadiran petugas piket meja, unit, dan parkiran; formulir paraf.", "Ya, untuk mencatat"],
    ["**Kehadiran Staf**", "Kehadiran tenaga kependidikan; unggah fingerprint; rekap hari dan jam hadir.", "Ya, untuk mencatat"],
    ["**Rekapitulasi Kehadiran**", "Rekap guru, pengganti, wali kelas, piket; mencatat hari libur.", "Hanya untuk tab Hari Libur"],
  ], [1.7, 3.5, 1.5]),
  KOTAK("awas", "Di HP, menu samping tidak tampil",
    "Pada layar sempit, bilah menu kiri disembunyikan; yang tersisa logo sekolah dan tombol **📘 Panduan**. Pindah halaman lewat **kartu di Beranda** atau tombol kembali peramban. Untuk pekerjaan panjang (rekap, fingerprint), lebih nyaman memakai komputer."),
  H2("Sumber data"),
  P("Guru, kelas, mata pelajaran, jam pelajaran, jadwal KBM, jadwal piket, tugas guru, jam kerja staf, dan kop dokumen **semuanya diambil dari aplikasi Data Induk**. Aplikasi ini tidak mengubahnya. Bila jadwal atau nama salah, perbaiki di Data Induk; perubahan terlihat di sini paling lambat **15 menit** kemudian (atau muat ulang halaman)."),

  /* ============================ 2 ============================ */
  H1("PIN Edit"),
  P("Tidak ada login nama pengguna. Siapa pun yang membuka alamat aplikasi **bisa melihat** data. Untuk **mencatat, mengubah, atau menghapus**, buka kunci sekali dengan **PIN edit** bersama yang diberikan Wakasek Kurikulum."),
  OL("Klik **🔒 Buka Kunci Edit** di kanan atas halaman (Ketidakhadiran, Penugasan, Piket, Staf, atau Rekapitulasi).",
    "Ketik **PIN**, lalu **Konfirmasi**. Bila salah muncul \"PIN salah, coba lagi.\"",
    "Tombol berubah menjadi **🔓 Edit aktif — klik untuk kunci lagi**. Semua halaman di tab peramban itu kini bisa diisi."),
  P("Kunci terbuka selama **tab peramban** masih terbuka. Klik tombolnya lagi untuk mengunci, atau tutup tab. Selama terkunci, tombol aksi tetap tampak tetapi tidak bisa diklik."),
  KOTAK("awas", "Jaga PIN",
    "PIN edit dipakai bersama oleh petugas piket dan kurikulum — jangan dibagikan kepada siswa atau orang luar. Di komputer bersama, kunci lagi setelah selesai.",
    "Rincian kehadiran **Kepala Sekolah** di Kehadiran Staf memakai PIN khusus tersendiri yang diminta setiap kali dibuka."),

  /* ============================ 3 ============================ */
  H1("Jadwal Kegiatan"),
  P("Menampilkan seluruh jadwal tetap sekolah tahun ajaran aktif. Jadwal **disusun di Data Induk**; halaman ini hanya untuk dilihat dan diunduh."),
  TB(["Tampilan", "Isi"], [
    ["**Per guru**", "Satu baris per hari, kolom jam pelajaran ke-1 sampai ke-12, ditambah kolom **Setelah KBM** (kegiatan sesudah bel pulang, mis. ekskul). Pindah guru dengan ‹ › atau daftar pilihan."],
    ["**Per kelas**", "Jadwal satu kelas. Sel bergaris = jam kelompok belajar (mis. Tahsin, Matematika Dasar)."],
    ["**Per hari**", "Semua kelas pada satu hari. Pilih hari Senin–Jumat (Sabtu bila ada jadwal)."],
  ], [1.2, 4.8]),
  UL("Pilih **Semester 1 · Juli–Desember** atau **Semester 2 · Januari–Juni**.",
    "Warna sel: warna per mata pelajaran untuk mengajar; hijau-toska **Piket meja sekolah**, biru **Piket unit**, oranye **Piket parkiran**, ungu **Ekskul & pembinaan**. **Sel merah** = guru terjadwal di dua tempat sekaligus (bentrok) — laporkan ke penyusun jadwal di Data Induk.",
    "Klik blok mengajar untuk berpindah: dari jadwal guru ke jadwal kelasnya, atau sebaliknya.",
    "**Unduh** (yang sedang tampil) atau **Unduh semua guru** / **Unduh semua kelas**: Excel berkop, bertanda tangan Kepala Sekolah dan Wakasek Kurikulum."),

  /* ============================ 4 ============================ */
  H1("Ketidakhadiran Guru"),
  H2("Mencatat guru yang tidak hadir"),
  OL("Buka **Ketidakhadiran Guru**, pilih **Tanggal** (bawaannya hari ini). Tabel menampilkan semua jam pelajaran hari itu.",
    "Ketik nama di **Cari nama guru…** (atau saring per kelas) untuk menampilkan jam guru tersebut saja.",
    "Klik **Tandai Tidak Hadir** pada salah satu jamnya. Dialog **Catat Ketidakhadiran** terbuka.",
    "Pilih **Status** dan tulis **Keterangan** (tugas untuk siswa).",
    "Pada catatan pertama guru itu hari itu, centang **Terapkan ke semua … jam pelajaran … hari ini** sudah tercentang — biarkan bila guru absen sehari penuh.",
    "Klik **Simpan**."),
  TB(["Status", "Arti", "Bobot di rekap"], [
    ["**ST**", "Sakit dengan Tugas", "20%"],
    ["**IT**", "Ijin dengan Tugas", "10%"],
    ["**TK**", "Tanpa Keterangan (isian keterangan disembunyikan)", "0%"],
    ["**HTTM**", "Hadir tanpa Tatap Muka (guru hadir, tetapi tidak bertatap muka dengan kelas pada jam itu)", "100%"],
  ], [1, 3.6, 1.4]),
  P("Setelah satu guru dipilih lewat pencarian, muncul tombol **Tandai semua … jam tidak hadir** untuk mencatat seluruh jamnya sekaligus."),
  H2("Mengubah dan membatalkan"),
  UL("**Ubah**: mengganti status atau keterangan satu jam.",
    "**Batalkan**: menghapus catatan jam itu (guru dianggap hadir). Bila jam itu sudah punya pengganti, aplikasi bertanya dulu karena **penugasannya ikut terhapus** — guru pengganti mungkin sudah diberi tahu, jadi kabari mereka."),
  H2("Hari libur"),
  P("Pada **libur penuh**, tabel tidak tampil (\"Hari libur — …\"). Pada **libur sebagian**, jam yang diliburkan bertanda **Libur** dan tidak bisa ditandai. Hari libur dicatat di **Rekapitulasi Kehadiran → Hari Libur** (bagian 8). Sabtu–Minggu tidak punya jadwal KBM."),

  /* ============================ 5 ============================ */
  H1("Penugasan Guru Pengganti"),
  P("Halaman ini menampilkan setiap jam yang gurunya dicatat tidak hadir pada tanggal terpilih. Tidak termasuk jam ke-8 (Tahsin) serta Upacara & Bimbingan Wali Kelas."),
  H2("Menugaskan pengganti"),
  OL("Pilih **Tanggal**. Jam yang belum diurus bertanda merah **Belum ditugaskan**.",
    "Klik **Tugaskan**. Di bagian **Rekomendasi** aplikasi mengusulkan guru yang sedang tidak mengajar pada jam itu:",
    "Klik salah satu usulan (atau pilih manual di **Guru Pengganti**). **Status** terisi otomatis sesuai jenis usulan; periksa lagi.",
    "Bila perlu isi **Catatan** (mis. \"sudah dikonfirmasi via grup WA piket\"), lalu **Simpan Penugasan**."),
  TB(["Usulan", "Siapa", "Status"], [
    ["**Piket**", "Guru piket meja pada jam itu yang tidak sedang mengajar.", "PT — Piket diTugaskan"],
    ["**Infaler**", "Guru dengan mata pelajaran utama yang sama, sedang kosong.", "Inf — Infaler"],
    ["**Serumpun**", "Guru serumpun mata pelajaran (maks. 5 usulan).", "GT — Guru diTugaskan"],
  ], [1.1, 3.4, 1.8]),
  P("Bila kelas cukup diberi tugas tanpa didampingi, klik **Tidak perlu** (status **TP — Tidak Perlu Pengganti**). Penugasan bisa diganti dengan **Ubah** atau dihapus dengan **Batalkan** (tanpa konfirmasi)."),
  KOTAK("info", "Team teaching",
    "Bila mapel diajar berpasangan, di bawah nama guru tertulis \"Berpasangan dengan … — hadir/juga tidak hadir\". Bila pasangannya hadir, biasanya cukup pilih **Tidak perlu**."),
  H2("Membagikan ke grup WhatsApp"),
  OL("Klik **📤 Bagikan ke WA** (tidak perlu PIN).",
    "Isi **Catatan untuk grup** bila perlu (bawaannya \"PT piket keliling dulu\").",
    "Pilih **📤 Bagikan gambar ke WhatsApp…** (di HP langsung membuka WhatsApp), atau **Unduh gambar**, **Salin teks**, **Buka WhatsApp (teks)**."),
  P("Yang ikut dibagikan hanya penugasan GT, PT, dan Inf. Jam berstatus TP dan yang belum ditugaskan tidak ikut. Warna kepala gambar menandakan beban hari itu: hijau (lega) sampai merah tua (genting)."),
  KOTAK("saran", "Tugaskan semua dulu, baru bagikan",
    "Info di dialog menyebut berapa jam yang belum ditugaskan. Selesaikan dulu, lalu bagikan sekali saja supaya grup tidak menerima beberapa versi."),

  /* ============================ 6 ============================ */
  H1("Pelaksanaan Piket"),
  P("Mencatat apakah petugas piket benar-benar berjaga. Setiap catatan ikut terhitung di Induk Pembiayaan. Jadwal piket diatur di **Data Induk → Jadwal Piket**; penjaga unit di **Data Induk → Tugas Guru** (jenis \"Diperbantukan\")."),
  TB(["Tab", "Bentuk", "Satuan"], [
    ["**Piket Meja Sekolah**", "Baris = tanggal, kolom = jam pelajaran.", "jam"],
    ["**Piket Unit**", "Penjaga unit (mis. Lab, Perpustakaan); kolom **tanpa jam** untuk yang belum punya jam jaga.", "jam"],
    ["**Piket Parkiran**", "Baris = pekan, kolom Senin–Jumat (±30 menit sesudah bel pulang).", "hari"],
  ], [1.6, 3.6, 0.8]),
  H2("Mencatat"),
  OL("Pilih rentang **Dari … sampai …** atau pakai **◀ / Pekan ini / ▶**.",
    "Ketuk pita nama petugas. Pita putih bergaris putus-putus = **belum dicatat**.",
    "Bila perlu, tulis **Catatan** lebih dulu (mis. datang terlambat, tukar hari).",
    "Pilih **Hadir**, **Tidak Hadir**, atau **HTTM** (tidak menjaga karena penugasan) — **pilihan langsung tersimpan**. Centang \"Berlaku untuk seluruh … jam jaganya hari ini\" mencatat semua jamnya sekaligus; lepas bila hanya jam ini yang berbeda."),
  P("Warna pita: **hijau** hadir, **merah** tidak hadir. Pita bergaris titik emas = tercatat tetapi tidak ada di jadwal tanggal itu."),
  H2("Mencatat cepat dan formulir paraf"),
  UL("**Simpan … yang belum tercatat** mengisi semua giliran yang belum dicatat dalam rentang sebagai **Hadir** (hari libur dilewati). Pakai setelah yang tidak hadir ditandai lebih dulu.",
    "**Batalkan … catatan dalam rentang ini** mengembalikan semuanya menjadi \"belum dicatat\". Tidak bisa dikembalikan — harus dicatat ulang.",
    "**Unduh formulir paraf** (tanpa PIN): lembar kosong sepekan berkop untuk difotokopi dan diparaf petugas. Formulir meja/unit ditandatangani Wakasek Kurikulum; parkiran oleh Wakasek Kesiswaan."),
  KOTAK("info", "Piket tidak mengenal pengganti",
    "Bila petugas berhalangan, jaganya memang tidak berjalan dan dicatat **Tidak Hadir**. Bila tidak menjaga karena **penugasan**, catat **HTTM**: dihitung hadir untuk **persentase kehadiran** (yang ikut menentukan persentase wali kelas / koordinator unit), tetapi **transport piket hanya untuk yang benar-benar berjaga**. Di Rekap, kolom Jaga menyebut \"+n HTTM\" dan % Kehadiran = (Jaga + HTTM) ÷ Terjadwal. Besaran kompensasi dihitung di Induk Pembiayaan."),

  /* ============================ 7 ============================ */
  H1("Kehadiran Staf"),
  P("Untuk tenaga kependidikan dengan pola honor **bulanan + insentif kedatangan** atau **upah harian** (diatur di Data Induk → Tugas Guru), serta Kepala Sekolah. Jam kerja tiap orang mengikuti **Jam Kerja Staf** di Data Induk."),
  H2("Mencatat manual"),
  OL("Pilih rentang (bawaannya pekan ini, Senin–Sabtu; paling banyak 62 hari).",
    "Di tab **Catat kehadiran**, ketuk sel orang dan tanggal.",
    "Isi **Jam masuk** dan **Jam pulang** bila perlu, tulis **Catatan**, lalu pilih **Hadir**, atau bila tidak hadir pilih keterangannya: **Tanpa Keterangan**, **Ijin**, atau **Sakit**. Bila tidak ke sekolah karena penugasan, pilih **HTTM**."),
  TB(["Keterangan", "Nilai untuk persentase kehadiran"], [
    ["Hadir", "Jam ketentuan dikurangi menit terlambat dan pulang cepat"],
    ["Ijin", "**10 %** jam ketentuan hari itu"],
    ["Sakit", "**20 %** jam ketentuan hari itu"],
    ["Tanpa Keterangan", "0"],
    ["HTTM (penugasan)", "**100 %** jam ketentuan; tetapi tanpa konsumsi dan insentif di Induk Pembiayaan, dan tidak dihitung tidak hadir"],
  ], [2.5, 3.5]),
  H2("Hadir sebagian: alasan terlambat, pulang cepat, dan keluar di tengah hari"),
  P("Bila staf hadir tetapi sebagian hari tidak di tempat karena alasan sah, catat **Hadir** dengan jam sungguhannya, lalu di dialog yang sama isi:"),
  UL("**Alasan datang** — untuk menit antara jam masuk ketentuan dan jam datang (mis. HTTM di pagi hari, baru masuk pukul 10.00).",
    "**Alasan pulang** — untuk menit antara jam pulang dan jam pulang ketentuan (mis. ijin pulang pukul 11.00).",
    "**Keluar di tengah hari** — jam keluar, jam kembali, dan alasannya, bila staf scan masuk dan pulang tetapi di tengah hari keluar lalu kembali."),
  P("Pilihan alasan: Tanpa keterangan, Ijin (10 %), Sakit (20 %), HTTM (100 %). Menit beralasan **tidak dihitung terlambat / pulang cepat** dan diberi bobot untuk persentase kehadiran. **Jam hadir** — dasar insentif kedatangan di Induk Pembiayaan — tetap jam sungguhan (menit keluar dikurangkan); **konsumsi tetap penuh**. Ijin, Sakit, atau HTTM di tengah hari tetap **wajib scan saat masuk dan pulang**. Sel yang memakai alasan atau jeda bertanda °."),
  P("Bobot Ijin, Sakit, dan HTTM **hanya untuk persentase kehadiran (kinerja)**, tidak untuk pembiayaan. Induk Pembiayaan tetap memakai **Jam hadir** dan **Hadir** yang sungguhan."),
  P("Sel bergaris merah = hari libur kerja orang itu (tetap bisa diisi untuk lembur). Garis bawah emas = masuk lebih lambat dari ketentuan. Tombol **Simpan … yang belum tercatat** bekerja seperti di Piket. **Batalkan … catatan dalam rentang ini** menghapus SEMUA catatan pada rentang yang tampil, termasuk rekaman fingerprint; aplikasi menampilkan siapa saja yang terkena dan meminta Anda **mengetik jumlah catatannya** sebelum menghapus."),
  H2("Mengunggah rekaman fingerprint"),
  OL("Ekspor rekaman dari mesin fingerprint ke **.xls/.xlsx** (kolom **No. ID**, **Tanggal**, **Scan Masuk**, **Scan Pulang**; **Nama** dan **Absent** bila ada). Contoh bentuknya: **unduh template (xlsx)**. Bila hasil ekspor mesin berbentuk lain, **unduh prompt ChatGPT (.txt)** membantu mengubahnya.",
    "Klik **Unggah fingerprint**, pilih berkasnya.",
    "Di pratinjau, cocokkan setiap **No. ID** mesin dengan nama guru/staf (atau **Abaikan**). Tebakan dari nama bertanda \"tebakan dari nama — periksa\"; pasangan dari unggahan sebelumnya diingat.",
    "Biarkan **Timpa juga catatan yang dicatat manual…** tidak tercentang, kecuali memang ingin menggantinya.",
    "Klik **Simpan rekaman … orang** dan baca ringkasannya."),
  TB(["Isi baris di berkas", "Dicatat sebagai"], [
    ["Scan masuk dan pulang", "**Hadir** beserta jam masuk/pulang"],
    ["Hanya satu scan, sampai pertengahan jam kerja", "**Hadir**; dianggap scan datang, jam pulang diasumsikan = jam datang + setengah jam kerja (ditandai *). Kekurangan menitnya terhadap ketentuan dianggap **tanpa keterangan (0 %)**"],
    ["Hanya satu scan, sesudah pertengahan jam kerja", "**Hadir**; dianggap scan pulang, jam masuk diasumsikan = jam pulang − setengah jam kerja (ditandai *). Kekurangan menitnya terhadap ketentuan dianggap **tanpa keterangan (0 %)**"],
    ["Absent = True tanpa scan", "**Tanpa Keterangan** (kecuali hari libur); ubah menjadi Ijin atau Sakit bila ada keterangannya"],
    ["Tanpa scan dan tanpa Absent", "Dilewati"],
  ], [2.5, 3.5]),
  H2("Rekap hari hadir dan koreksi"),
  P("Tab **Rekap hari hadir** menampilkan hari kerja, hadir, tanpa keterangan, ijin, sakit, HTTM, menit terlambat, menit pulang cepat, jam terjadwal, jam hadir, bobot ijin/sakit/HTTM, dan % hadir. % hadir = (jam hadir + bobot ijin/sakit/HTTM) ÷ jam terjadwal. Kolom HTTM menghitung hari penugasan. **Rincian** membuka jejak hitung per tanggal (bisa diunduh)."),
  UL("Saat kunci terbuka, angka **Hadir**, **Jam terjadwal**, dan **Jam hadir** bisa dikoreksi tangan (format jam:menit, mis. 152:30). Nilai koreksi tampil emas dengan tanda *; kosongkan untuk kembali ke hitungan.",
    "Koreksi hanya berlaku untuk **rentang tanggal yang persis sama** — biasakan merekap per bulan penuh.",
    "Kepala Sekolah bawaannya **dianggap hadir penuh (100%)**; rinciannya hanya bisa dibuka dengan PIN khusus Kepala Sekolah."),

  /* ============================ 8 ============================ */
  H1("Rekapitulasi Kehadiran"),
  P("Pilih rentang **Dari … sampai …** (bawaannya awal bulan sampai hari ini), lalu klik **Hitung**. Bila tanggal diubah tanpa **Hitung**, muncul tanda **Rentang berubah**. Rekap satu bulan penuh berjudul \"BULAN : …\" di berkas unduhan."),
  H2("Tab rekap"),
  TB(["Tab", "Isi"], [
    ["**Kehadiran Guru**", "Per guru: Kontrak Jam ((+n) = jam tugas tambahan), Hari Terjadwal, Hari Datang, Jam Terjadwal, Jam Hadir, HTTM, ST, IT, TK, Bobot Hadir, % Kehadiran."],
    ["**Guru Pengganti**", "**Per guru pengganti** (jumlah jam GT, PT, Inf) dan **Rincian per jam**."],
    ["**Wali Kelas**", "Upacara dan Bimbingan Wali Kelas (Senin jam 1–2): terjadwal, hadir, %."],
    ["**Piket**", "Meja (jam), Unit (jam), Parkiran (hari): terjadwal, jaga, %."],
    ["**Hari Libur**", "Mencatat dan melihat hari libur (perlu PIN)."],
  ], [1.4, 4.6]),
  STAT("Contoh: guru 24 jam terjadwal sebulan — 20 jam hadir, 2 jam ST, 2 jam IT", ["20", "Jam Hadir"], ["+0,4", "20% × 2 ST"], ["+0,2", "10% × 2 IT"], ["86%", "20,6 ÷ 24"]),
  P("**Bobot Hadir** = Jam Hadir + HTTM + 20% ST + 10% IT; **% Kehadiran** = Bobot Hadir ÷ Jam Terjadwal. Warna persen: hijau ≥95%, emas ≥85%, merah di bawahnya. Upacara dan Bimbingan Wali Kelas dihitung terpisah di tab Wali Kelas."),
  P("Setiap tab punya tombol unduh Excel berkop (kop dan nama penanda tangan dari **Data Induk → Profil Dokumen**), bertanda tangan Kepala Sekolah dan Wakasek Kurikulum."),
  H2("Mencatat hari libur"),
  OL("Buka tab **Hari Libur** dan buka kunci edit.",
    "**Tanggal**: isi **Dari** (dan **Sampai** bila lebih dari sehari; Sabtu–Minggu dilewati).",
    "**Berlaku untuk**: **Seluruh sekolah**, **Tingkat tertentu**, atau **Kelas tertentu**.",
    "**Waktu**: **Sehari penuh**, atau **Sebagian jam** (klik jam awal lalu jam akhir).",
    "Tulis **Keterangan** (mis. Maulid Nabi, PAS kelas 10–11), periksa **Ringkasan**, lalu **Simpan libur**."),
  TB(["Jenis", "Akibatnya"], [
    ["**Libur penuh** (seluruh sekolah, sehari penuh)", "Hari itu keluar dari hari kerja guru, staf, dan piket."],
    ["**Libur sebagian** (tingkat/kelas tertentu atau sebagian jam)", "Hanya jam yang tercakup yang ditiadakan dari rekap guru. Staf dan piket tetap berjalan."],
  ], [2.4, 3.6]),
  P("Hapus libur dengan **Hapus** lalu **Yakin hapus?** (klik dua kali)."),
  KOTAK("awas", "Catat libur sebelum rekap",
    "Libur yang belum dicatat membuat jam-jam itu terhitung sebagai jam terjadwal — persentase kehadiran guru turun tanpa sebab. Catat libur nasional dan kegiatan sekolah di awal bulan."),

  /* ============================ 9 ============================ */
  H1("Masalah Umum"),
  TB(["Keadaan / pesan", "Yang dilakukan"], [
    ["Tombol tidak bisa diklik", "Kunci belum dibuka: klik **🔒 Buka Kunci Edit**."],
    ["Server tidak menjawab dalam 30 detik / Sambungan internet terputus", "Periksa jaringan, lalu coba lagi."],
    ["Server terlalu lama menjawab saat menyimpan / Sambungan terputus saat menyimpan", "Perubahan **mungkin sudah tersimpan**. Muat ulang halaman dan periksa dulu sebelum mengulang, supaya tidak tercatat dua kali."],
    ["Jadwal atau nama guru tidak sesuai", "Perbaiki di Data Induk; tunggu ±15 menit atau muat ulang halaman."],
    ["Persentase kehadiran terlalu rendah", "Periksa apakah hari libur sudah dicatat dan tombol **Hitung** sudah ditekan."],
    ["Pustaka pembuat Excel gagal dimuat", "Unduhan Excel butuh internet; coba lagi."],
    ["Berkas fingerprint: Baris judul kolom tidak ditemukan", "Unggah hasil ekspor mesin (per baris tanggal), bukan matriks rekap; bandingkan dengan template."],
    ["Tampilan aneh setelah aplikasi diperbarui", "Muat ulang paksa: **Ctrl+Shift+R** (komputer) atau tarik layar ke bawah (HP)."],
  ], [2.6, 3.4]),
  H2("Istilah"),
  TB(["Istilah", "Arti"], [
    ["**KBM / JP**", "Kegiatan belajar mengajar / jam pelajaran."],
    ["**ST, IT, TK, HTTM**", "Status ketidakhadiran (bagian 4)."],
    ["**GT, PT, Inf, TP**", "Status penugasan pengganti (bagian 5)."],
    ["**Kontrak Jam**", "Jam mengajar per pekan menurut jadwal KBM; (+n) jam tugas tambahan."],
    ["**Hari Datang**", "Hari terjadwal ketika guru tidak absen di semua jamnya."],
    ["**Diperbantukan**", "Guru yang bertugas menjaga unit (Lab, Perpustakaan, dsb.)."],
    ["**Pola honor**", "bulanan, bulanan + insentif kedatangan, atau upah harian (dari Data Induk)."],
    ["**Setelah KBM**", "Kolom jadwal untuk kegiatan sesudah bel pulang."],
  ], [1.6, 4.4]),
];

/* ================= Penomoran judul ================= */
(function nomori() { const n = [0, 0, 0];
  ISI.forEach(b => { if (!/^h[123]$/.test(b.t)) return; const k = +b.t[1] - 1; n[k]++; for (let i = k + 1; i < 3; i++) n[i] = 0;
    b.no = k === 0 ? `${n[0]}.` : n.slice(0, k + 1).join("."); b.id = "b" + n.slice(0, k + 1).join("-"); }); })();
const DAFTAR = ISI.filter(b => b.t === "h1" || b.t === "h2");

/* ================= HTML untuk PDF ================= */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sebaris = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
const WARNA_KOTAK = { info: ["#2F7FD8", "#E8F1FC"], saran: ["#2E9E5B", "#E7F5EC"], awas: ["#C98A12", "#FDF4E1"], bahaya: ["#D9534F", "#FBE9E8"] };
function htmlBlok(b) {
  if (b.t === "h1") return `<h1 id="${b.id}">${b.no} ${sebaris(b.s)}</h1>`;
  if (b.t === "h2") return `<h2 id="${b.id}">${b.no} ${sebaris(b.s)}</h2>`;
  if (b.t === "h3") return `<h3 id="${b.id}">${b.no} ${sebaris(b.s)}</h3>`;
  if (b.t === "p") return `<p>${sebaris(b.s)}</p>`;
  if (b.t === "ul" || b.t === "ol") return `<${b.t}>${b.a.map(x => `<li>${sebaris(x)}</li>`).join("")}</${b.t}>`;
  if (b.t === "tb") { const tot = b.lebar.reduce((a, x) => a + x, 0);
    return `<table><colgroup>${b.lebar.map(w => `<col style="width:${(w / tot * 100).toFixed(1)}%">`).join("")}</colgroup><thead><tr>${b.kepala.map(k => `<th>${sebaris(k)}</th>`).join("")}</tr></thead>
      <tbody>${b.baris.map(r => `<tr>${r.map((c, i) => `<td${i === 0 ? ' class="pertama"' : ""}>${sebaris(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`; }
  if (b.t === "kotak") { const [w, l] = WARNA_KOTAK[b.jenis];
    return `<div class="kotak" style="border-color:${w};background:${l}"><div class="kotak-judul" style="color:${w}">${sebaris(b.judul)}</div>${b.isi.map(x => `<p>${sebaris(x)}</p>`).join("")}</div>`; }
  if (b.t === "stat") return `<div class="stat">${b.a.map(([a, k]) => `<div><b>${esc(a)}</b><span>${esc(k)}</span></div>`).join("")}</div><p class="stat-ket">${esc(b.ket)}</p>`;
  throw new Error("Blok tidak dikenal: " + b.t);
}
function buatHTML() {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${JUDUL}</title><style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Calibri, "Segoe UI", Carlito, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #1F2633; }
  b { font-weight: 700; }
  .sampul { height: 247mm; display: flex; flex-direction: column; justify-content: center; break-after: page; }
  .sampul .atas { font-size: 11pt; font-weight: 700; letter-spacing: .08em; color: #8F6B1A; }
  .sampul h1 { break-before: auto; font-size: 34pt; color: #1D2A3A; margin: 10px 0 6px; border: 0; padding: 0; }
  .sampul .sub { font-size: 15pt; color: #33445A; }
  .sampul .garis { height: 4px; background: linear-gradient(90deg, #1D2A3A 0 70%, #F2B92E 70%); margin: 34px 0 22px; border-radius: 2px; }
  .sampul ul { margin: 8px 0 0; } .sampul .kaki { margin-top: 70px; color: #556070; font-size: 9.5pt; }
  .daftar { break-after: page; } .daftar h1 { break-before: auto; }
  .daftar a { color: inherit; text-decoration: none; display: block; padding: 3px 0; border-bottom: 1px dotted #C9D2DE; }
  .daftar .d1 { font-weight: 700; margin-top: 8px; } .daftar .d2 { padding-left: 18px; color: #33445A; }
  h1 { break-before: page; font-size: 19pt; color: #1D2A3A; margin: 0 0 12px; padding-bottom: 6px; border-bottom: 2.5px solid #1D2A3A; }
  h2 { font-size: 13.5pt; color: #1D2A3A; margin: 20px 0 6px; break-after: avoid; }
  h3 { font-size: 11.5pt; color: #2F6FB8; margin: 14px 0 4px; break-after: avoid; }
  p { margin: 0 0 8px; } ul, ol { margin: 0 0 10px; padding-left: 22px; } li { margin: 0 0 4px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 14px; font-size: 9.5pt; }
  th { background: #1D2A3A; color: #fff; text-align: left; padding: 6px 8px; font-weight: 700; }
  td { padding: 6px 8px; border-bottom: 1px solid #D5DCE6; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #F6F8FB; } tr { break-inside: avoid; } td.pertama { font-weight: 400; }
  .kotak { border-left: 5px solid; border-radius: 4px; padding: 10px 14px; margin: 8px 0 14px; break-inside: avoid; font-size: 9.8pt; }
  .kotak-judul { font-weight: 700; margin-bottom: 3px; } .kotak p { margin: 0 0 4px; }
  .stat { display: flex; gap: 6px; margin: 8px 0 2px; break-inside: avoid; }
  .stat div { flex: 1; background: #EEF2F7; border-radius: 6px; padding: 8px 6px; text-align: center; }
  .stat b { display: block; font-size: 17pt; color: #1D2A3A; line-height: 1.1; } .stat span { font-size: 8.5pt; color: #556070; }
  .stat-ket { text-align: center; font-size: 8.5pt; font-style: italic; color: #8A93A3; margin-bottom: 12px; }
  </style></head><body>
  <section class="sampul"><div class="atas">${MEREK}</div><h1>${JUDUL}</h1>
    <div class="sub">${SUBJUDUL}</div><div class="garis"></div>
    <p>Isi panduan ini:</p><ul>${ISI.filter(b => b.t === "h1").map(b => `<li><b>${esc(b.s)}</b></li>`).join("")}</ul>
    <div class="kaki">Untuk: ${UNTUK}<br>Versi: ${VERSI} (sesuai tampilan aplikasi per tanggal tersebut)</div></section>
  <section class="daftar"><h1>Daftar Isi</h1>${DAFTAR.map(b => `<a class="d${b.t[1]}" href="#${b.id}">${b.no} ${sebaris(b.s)}</a>`).join("")}</section>
  ${ISI.map(htmlBlok).join("\n")}
  </body></html>`;
}

/* ================= Cetak PDF lewat Chrome/Edge (DevTools Protocol) ================= */
function cariPeramban() {
  const calon = [process.env.CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  const ada = calon.find(p => p && fs.existsSync(p)); if (!ada) throw new Error("Chrome/Edge tidak ditemukan. Atur variabel CHROME ke lokasi chrome.exe."); return ada;
}
const tunggu = ms => new Promise(r => setTimeout(r, ms));
async function cetakPDF(berkasHTML, keluaran) {
  const port = 9300 + Math.floor(Math.random() * 500), profil = fs.mkdtempSync(path.join(os.tmpdir(), "panduan-"));
  const p = spawn(cariPeramban(), ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${profil}`, "about:blank"], { stdio: "ignore" });
  try {
    let daftar;
    for (let i = 0; i < 100 && !daftar; i++) { try { daftar = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch (e) { await tunggu(150); } }
    const hal = daftar && daftar.find(x => x.type === "page"); if (!hal) throw new Error("Peramban tidak merespons.");
    const ws = new WebSocket(hal.webSocketDebuggerUrl); await new Promise((ok, gagal) => { ws.onopen = ok; ws.onerror = gagal; });
    let id = 0; const janji = new Map(), acara = [];
    ws.onmessage = m => { const x = JSON.parse(m.data); if (x.id && janji.has(x.id)) { janji.get(x.id)(x); janji.delete(x.id); } else if (x.method) acara.push(x.method); };
    const kirim = (method, params = {}) => new Promise(ok => { const k = ++id; janji.set(k, ok); ws.send(JSON.stringify({ id: k, method, params })); });
    await kirim("Page.enable");
    await kirim("Page.navigate", { url: "file:///" + berkasHTML.replace(/\\/g, "/") });
    for (let i = 0; i < 100 && !acara.includes("Page.loadEventFired"); i++) await tunggu(100);
    await kirim("Runtime.evaluate", { expression: "document.fonts.ready.then(() => 1)", awaitPromise: true });
    const gaya = "font-family:Calibri,'Segoe UI',sans-serif;font-size:8px;color:#8A93A3;width:100%;padding:0 18mm;";
    const opsi = { printBackground: true, displayHeaderFooter: true, paperWidth: 8.27, paperHeight: 11.69, marginTop: 0.75, marginBottom: 0.7, marginLeft: 0.71, marginRight: 0.71,
      headerTemplate: `<div style="${gaya}text-align:right">${JUDUL}</div>`,
      footerTemplate: `<div style="${gaya}text-align:center">Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></div>`,
      generateDocumentOutline: true, generateTaggedPDF: true };
    let r = await kirim("Page.printToPDF", opsi);
    if (r.error) { delete opsi.generateDocumentOutline; delete opsi.generateTaggedPDF; r = await kirim("Page.printToPDF", opsi); }   // Chrome lama
    if (r.error) throw new Error(r.error.message);
    fs.writeFileSync(keluaran, Buffer.from(r.result.data, "base64")); ws.close();
  } finally { p.kill(); await tunggu(400); try { fs.rmSync(profil, { recursive: true, force: true }); } catch (e) { /* biarkan */ } }
}

/* ================= Word (.docx) ================= */
async function buatDOCX(keluaran) {
  const D = require("docx");
  const LEBAR = 9638;   // lebar isi A4 dengan margin 2 cm (twip)
  const lari = (s, o = {}) => String(s).split(/(\*\*.+?\*\*)/).filter(Boolean).map(x => /^\*\*.+\*\*$/.test(x) ? new D.TextRun({ text: x.slice(2, -2), bold: true, ...o }) : new D.TextRun({ text: x, ...o }));
  const par = (s, o = {}, r = {}) => new D.Paragraph({ children: lari(s, r), spacing: { after: 120 }, ...o });
  const garis = { style: D.BorderStyle.SINGLE, size: 4, color: "D5DCE6" }, kosong = { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const sel = (isi, lebar, o = {}) => new D.TableCell({ width: { size: lebar, type: D.WidthType.DXA }, margins: { top: 70, bottom: 70, left: 110, right: 110 }, children: isi, ...o });
  let nomorDaftar = 0;
  const blok = b => {
    if (b.t === "h1") return [new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, pageBreakBefore: true, children: lari(`${b.no} ${b.s}`) })];
    if (b.t === "h2") return [new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, children: lari(`${b.no} ${b.s}`) })];
    if (b.t === "h3") return [new D.Paragraph({ heading: D.HeadingLevel.HEADING_3, children: lari(`${b.no} ${b.s}`) })];
    if (b.t === "p") return [par(b.s)];
    if (b.t === "ul") return b.a.map(x => par(x, { bullet: { level: 0 }, spacing: { after: 60 } }));
    if (b.t === "ol") { const n = ++nomorDaftar; return b.a.map(x => par(x, { numbering: { reference: "angka", level: 0, instance: n }, spacing: { after: 60 } })); }
    if (b.t === "tb") { const tot = b.lebar.reduce((a, x) => a + x, 0), w = b.lebar.map(x => Math.round(x / tot * LEBAR));
      return [new D.Table({ width: { size: LEBAR, type: D.WidthType.DXA }, columnWidths: w,
        borders: { top: garis, bottom: garis, left: kosong, right: kosong, insideHorizontal: garis, insideVertical: kosong },
        rows: [new D.TableRow({ tableHeader: true, cantSplit: true, children: b.kepala.map((k, i) => sel([par(k, { spacing: { after: 0 } }, { bold: true, color: "FFFFFF", size: 19 })], w[i], { shading: { type: D.ShadingType.CLEAR, color: "auto", fill: "1D2A3A" } })) }),
          ...b.baris.map((r, j) => new D.TableRow({ cantSplit: true, children: r.map((c, i) => sel([par(c, { spacing: { after: 0 } }, { size: 19 })], w[i], j % 2 ? { shading: { type: D.ShadingType.CLEAR, color: "auto", fill: "F6F8FB" } } : {})) }))] }),
        new D.Paragraph({ spacing: { after: 120 }, children: [] })]; }
    if (b.t === "kotak") { const [w, l] = WARNA_KOTAK[b.jenis].map(x => x.slice(1));
      return [new D.Table({ width: { size: LEBAR, type: D.WidthType.DXA }, columnWidths: [LEBAR],
        borders: { top: kosong, bottom: kosong, right: kosong, left: { style: D.BorderStyle.SINGLE, size: 30, color: w }, insideHorizontal: kosong, insideVertical: kosong },
        rows: [new D.TableRow({ cantSplit: true, children: [sel([par(b.judul, { spacing: { after: 40 } }, { bold: true, color: w, size: 20 }), ...b.isi.map(x => par(x, { spacing: { after: 40 } }, { size: 19 }))], LEBAR,
          { shading: { type: D.ShadingType.CLEAR, color: "auto", fill: l }, margins: { top: 120, bottom: 120, left: 200, right: 160 } })] })] }),
        new D.Paragraph({ spacing: { after: 120 }, children: [] })]; }
    if (b.t === "stat") { const w = Math.floor(LEBAR / b.a.length), putih = { style: D.BorderStyle.SINGLE, size: 24, color: "FFFFFF" };
      return [new D.Table({ width: { size: LEBAR, type: D.WidthType.DXA }, columnWidths: b.a.map(() => w),
        borders: { top: putih, bottom: putih, left: putih, right: putih, insideHorizontal: putih, insideVertical: putih },
        rows: [new D.TableRow({ cantSplit: true, children: b.a.map(([a, k]) => sel([
          new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ text: a, bold: true, size: 34, color: "1D2A3A" })] }),
          new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ text: k, size: 16, color: "556070" })] })], w, { shading: { type: D.ShadingType.CLEAR, color: "auto", fill: "EEF2F7" } })) })] }),
        new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { before: 40, after: 160 }, children: [new D.TextRun({ text: b.ket, italics: true, size: 16, color: "8A93A3" })] })]; }
    throw new Error("Blok tidak dikenal: " + b.t);
  };
  const sampul = [
    new D.Paragraph({ spacing: { before: 3200, after: 120 }, children: [new D.TextRun({ text: MEREK, bold: true, size: 22, color: "8F6B1A" })] }),
    new D.Paragraph({ spacing: { after: 120 }, children: [new D.TextRun({ text: JUDUL, bold: true, size: 64, color: "1D2A3A" })] }),
    new D.Paragraph({ spacing: { after: 400 }, border: { bottom: { style: D.BorderStyle.SINGLE, size: 24, color: "1D2A3A", space: 18 } },
      children: [new D.TextRun({ text: SUBJUDUL, size: 30, color: "33445A" })] }),
    par("Isi panduan ini:"),
    ...ISI.filter(b => b.t === "h1").map(b => par(`**${b.s}**`, { bullet: { level: 0 }, spacing: { after: 40 } })),
    new D.Paragraph({ spacing: { before: 1400, after: 0 }, children: [new D.TextRun({ text: "Untuk: " + UNTUK, size: 19, color: "556070" })] }),
    new D.Paragraph({ children: [new D.TextRun({ text: `Versi: ${VERSI} (sesuai tampilan aplikasi per tanggal tersebut)`, size: 19, color: "556070" })] }),
  ];
  const daftarIsi = [new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, children: [new D.TextRun("Daftar Isi")] }),
    ...DAFTAR.map(b => new D.Paragraph({ spacing: { after: 50, before: b.t === "h1" ? 140 : 0 }, indent: { left: b.t === "h1" ? 0 : 360 },
      children: lari(`${b.no} ${b.s}`, { bold: b.t === "h1", color: b.t === "h1" ? "1F2633" : "33445A" }) }))];
  const kepala = new D.Header({ children: [new D.Paragraph({ alignment: D.AlignmentType.RIGHT, children: [new D.TextRun({ text: JUDUL, size: 16, color: "8A93A3" })] })] });
  const kaki = new D.Footer({ children: [new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ children: ["Halaman ", D.PageNumber.CURRENT], size: 16, color: "8A93A3" })] })] });
  const halaman = { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } };
  const doc = new D.Document({
    creator: "Kehadiran Guru", title: JUDUL, description: SUBJUDUL,
    styles: { default: { document: { run: { font: "Calibri", size: 21, color: "1F2633" }, paragraph: { spacing: { line: 276 } } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 36, bold: true, color: "1D2A3A" },
          paragraph: { spacing: { before: 0, after: 200 }, border: { bottom: { style: D.BorderStyle.SINGLE, size: 18, color: "1D2A3A", space: 6 } } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 27, bold: true, color: "1D2A3A" }, paragraph: { spacing: { before: 320, after: 100 }, keepNext: true } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 23, bold: true, color: "2F6FB8" }, paragraph: { spacing: { before: 220, after: 80 }, keepNext: true } }] },
    numbering: { config: [{ reference: "angka", levels: [{ level: 0, format: D.LevelFormat.DECIMAL, text: "%1.", alignment: D.AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
    sections: [{ properties: halaman, children: sampul },
      { properties: halaman, headers: { default: kepala }, footers: { default: kaki }, children: [...daftarIsi, ...ISI.flatMap(blok)] }],
  });
  fs.writeFileSync(keluaran, await D.Packer.toBuffer(doc));
}

(async () => {
  const html = path.join(os.tmpdir(), NAMA + ".html"); fs.writeFileSync(html, buatHTML());
  if (process.argv.includes("--html")) { fs.copyFileSync(html, path.join(AKAR, NAMA + ".html")); console.log("HTML →", NAMA + ".html"); }
  await cetakPDF(html, path.join(AKAR, NAMA + ".pdf")); console.log("PDF  →", NAMA + ".pdf");
  await buatDOCX(path.join(AKAR, NAMA + ".docx")); console.log("DOCX →", NAMA + ".docx");
})().catch(e => { console.error("Gagal:", e.message); process.exit(1); });
