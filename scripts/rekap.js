import { supabaseClient, isSupabaseConfigured } from "../assets/supabase-client.js?v=20261004a";
import { demoData, demoKetidakhadiran, demoPenugasan } from "../assets/demo-data.js?v=20260921v";
import { isUnlocked, initLockUI } from "../assets/auth-gate.js?v=20260921v";
import { peringkatGuru } from "../assets/guru-order.js?v=20260921v";
import { urutkanKelas, jenisKelas } from "../assets/kelas-order.js?v=20260921v";
import { semesterTanggal, semesterBaris } from "../assets/semester.js?v=20260921ad";
import { mencakup, petaTingkat, namaHari, tanggalLengkap, bulanTahun, bulanPendek, uraianCakupan, uraianJam, waktuJam } from "../assets/libur.js?v=20261007a";
import { muatRujukan } from "../assets/simpanan.js?v=20261004a";
import { rekapKehadiran, rekapWali, rekapPengganti, isoTanggal, hariKerja, BOBOT_HADIR, pisahWaliKelas, rekapDariJumlah, rekapWaliDariJumlah } from "../assets/rekap-hitung.js?v=20261007a";
import { bukuKehadiran, bukuPengganti, bukuPiket, bukuWali, unduhWorkbook, ambilLogoBase64 } from "../assets/excel-export.js?v=20261004b";
import { tanggalPanjang } from "../assets/bagikan-wa.js?v=20260921v";
import { esc, ambilSemua, tombolSibuk, muatExcelJS } from "../assets/aman.js?v=20261004a";

// Halaman ini hanya merekap KEHADIRAN. Seluruh perhitungan uang — honor
// mengajar, honor pengganti, dan transport — pindah ke aplikasi Induk
// Pembiayaan, begitu pula pengaturan tarifnya. Identitas dokumen dibaca dari
// profil_dokumen milik Data Induk, tidak lagi disalin ke kg_pengaturan.
try { initLockUI(() => renderLibur()); } catch (err) { console.error("Gagal memasang tombol kunci:", err); }

function laporError(konteks, error) {
    console.error(konteks, error);
    let box = document.getElementById("errorBanner");
    if (!box) {
        box = document.createElement("div"); box.id = "errorBanner"; box.className = "error-banner";
        const main = document.querySelector("main"); main.insertBefore(box, main.firstChild);
    }
    const detail = error?.message || error?.details || String(error);
    box.innerHTML = `<strong>${esc(konteks)}</strong><br>${esc(detail)}<button type="button" class="error-close" aria-label="Tutup">×</button>`;
    box.querySelector(".error-close").addEventListener("click", () => box.remove());
}

const STATUS_LABEL = { ST: "Sakit dengan Tugas", IT: "Ijin dengan Tugas", TK: "Tanpa Keterangan", HTTM: "Hadir tanpa Tatap Muka" };

// Penyimpanan hari libur di mode pratinjau
const demoLibur = [];
const demoLiburSebagian = [];
let state = {
    awal: "", akhir: "",
    guru: [], kelas: [], mapel: [], jadwal: [], jam: [],
    libur: [],            // kg_hari_libur: seluruh sekolah, sehari penuh
    liburSebagian: [],    // libur_sebagian: tingkat/kelas tertentu dan/atau sebagian jam
    ketidakhadiran: [], penugasan: [],
    hasilKehadiran: null, hasilWali: null, hasilPengganti: null, jamWaliDikecualikan: 0,
    saring: "", saringWali: "", viewPengganti: "ringkas",
    profil: null,
    tambahan: new Map(),   // guru_id -> jam tugas tambahan per minggu
    piket: [], hasilPiket: null,
    jadwalPiket: { meja: [], unitJam: [], unit: [], parkiran: [] },
};

/* Identitas kop berkas Excel, dibaca dari v_penanda_tangan milik Data Induk —
   satu sumber untuk semua aplikasi. Nama Wakasek Kurikulum di sana diturunkan
   dari jabatan aktif di Tugas Guru, bukan diketik ulang. Kuncinya dipetakan ke
   bentuk yang sudah dipakai excel-export.js supaya berkasnya tidak berubah. */
const PROFIL_BAWAAN = {
    nama_sekolah: 'SMA Plus "Merdeka" Soreang',
    alamat_sekolah: "Jl. Citaliktik-Sindang Wargi Soreang Kab. Bandung",
    tahun_ajaran: "2026/2027", tempat: "Soreang",
    kepala_sekolah: "", kurikulum: "",
};
const demoProfil = { ...PROFIL_BAWAAN, kepala_sekolah: "Mohamad Gunawan, S.Si.", kurikulum: "Yuyun Wahyuni, S.Pd." };

const namaGuru = (id) => state.guru.find((g) => g.id === id)?.nama || id;
// Seluruh tabel rekap memakai urutan yang sama dengan daftar guru: masa kerja
// terlama lebih dulu. Baris yang gurunya tidak dikenal jatuh ke belakang.
let _peringkat = null, _peringkatDari = null;
const peringkat = () => {
    if (_peringkatDari !== state.guru) { _peringkatDari = state.guru; _peringkat = peringkatGuru(state.guru); }
    return _peringkat;
};
const urutBaris = (a, b) => {
    const urut = peringkat();
    return urut(a.guru_id) - urut(b.guru_id) || String(a.nama || "").localeCompare(String(b.nama || ""), "id");
};
const namaKelas = (id) => state.kelas.find((k) => k.id === id)?.nama_kelas || id;
const namaMapel = (id) => state.mapel.find((m) => m.id === id)?.nama_mapel || id;

// ---------- Boot ----------
async function boot() {
    document.getElementById("notice").hidden = isSupabaseConfigured;

    // default: awal bulan ini s.d. hari ini (pratinjau: pekan data contoh)
    const now = new Date();
    if (isSupabaseConfigured) {
        state.awal = isoTanggal(new Date(now.getFullYear(), now.getMonth(), 1));
        state.akhir = isoTanggal(now);
    } else { state.awal = "2026-09-14"; state.akhir = "2026-09-18"; }
    document.getElementById("tglAwal").value = state.awal;
    document.getElementById("tglAkhir").value = state.akhir;

    if (isSupabaseConfigured) {
        // Rujukan dari simpanan bersama (seketika bila sudah pernah dibuka);
        // libur, jadwal piket, dan profil diminta serentak, bukan bergiliran —
        // dulu bergiliran, dan tiap giliran adalah satu perjalanan ke Supabase.
        let rujukan;
        try {
            [rujukan] = await Promise.all([
                muatRujukan(supabaseClient,
                    ["guru", "kelas", "mapel", "jadwal", "jam", "piketMeja", "piketUnit", "guruUnit", "parkiran", "profil", "tahunAjaran"],
                    (r) => { terapkanRujukan(r); hitungLagi(); }),
                muatLibur(),
                muatJamTambahan(),
            ]);
        } catch (err) { laporError("Gagal memuat data rujukan", err); return; }
        terapkanRujukan(rujukan);
    } else {
        state.guru = demoData.guru; state.kelas = urutkanKelas(demoData.kelas); state.mapel = demoData.mapel; state.jadwal = demoData.jadwal;
        state.jam = demoData.jam || [];
        state.libur = demoLibur; state.liburSebagian = demoLiburSebagian; state.profil = { ...demoProfil };
    }
    renderLibur();
    await hitungLagi();
}

function terapkanRujukan(r) {
    state.guru = r.guru;
    state.kelas = urutkanKelas(r.kelas);
    state.mapel = r.mapel;
    state.jadwal = r.jadwal;
    state.jam = r.jam || [];
    // Satu baris per JAM jaga untuk meja dan unit: itulah satuan pencatatan.
    // Masa berlaku penugasan unit (unit) dipakai menyaring jadwal jamnya.
    state.jadwalPiket = { meja: r.piketMeja, unitJam: r.piketUnit, unit: r.guruUnit, parkiran: r.parkiran };
    susunProfil(r.profil[0], (r.tahunAjaran[0] || {}).kode);
}

/* Jam Tugas Tambahan per guru (Data Induk → Tugas Guru): jam per minggu yang
   dibayar sebagai jam mengajar tetapi tidak ada di jadwal KBM. Ditampilkan
   sebagai (+n) di samping Kontrak Jam, sama seperti di Honor Mengajar Induk
   Pembiayaan, supaya jam kontrak yang lebih besar dari jadwalnya terbaca
   sebabnya. */
async function muatJamTambahan() {
    const { data, error } = await supabaseClient.from("kg_jam_tambahan").select("guru_id, jam");
    if (error) { laporError("Gagal memuat jam tugas tambahan (penanda (+n) tidak tampil)", error); state.tambahan = new Map(); return; }
    state.tambahan = new Map((data || []).map((t) => [t.guru_id, Number(t.jam) || 0]));
}
const jamTambahan = (gid) => (state.tambahan && state.tambahan.get(gid)) || 0;
const selKontrak = (r) => `<td class="num">${r.kontrak}${jamTambahan(r.guru_id)
    ? ` <small class="satuan-kolom">(+${jamTambahan(r.guru_id)})</small>` : ""}</td>`;

async function muatLibur() {
    const [penuh, sebagian] = await Promise.all([
        supabaseClient.from("kg_hari_libur").select("tanggal, keterangan").order("tanggal"),
        supabaseClient.from("libur_sebagian").select("id, tanggal, tingkat, kelas_id, jam_dari, jam_sampai, keterangan").order("tanggal"),
    ]);
    if (penuh.error) {
        // tabel belum dibuat -> beri tahu, tapi rekap tetap jalan tanpa libur
        laporError("Gagal memuat hari libur (rekap dihitung tanpa hari libur)", penuh.error);
        state.libur = [];
    } else state.libur = penuh.data || [];
    if (sebagian.error) {
        laporError("Gagal memuat libur sebagian — tabel libur_sebagian belum ada di database?", sebagian.error);
        state.liburSebagian = [];
    } else state.liburSebagian = sebagian.data || [];
}

/* Identitas kop berkas Excel dibaca dari Data Induk, tidak lagi disalin ke
   kg_pengaturan. Tahun ajaran pun diambil dari tabel tahun_ajaran yang
   sedang aktif — satu sumber, sehingga kop semua aplikasi tidak bisa lagi
   berbeda tanpa ada yang menyadari. */
function susunProfil(d, kodeTahun) {
    state.profil = { ...PROFIL_BAWAAN };
    if (!d) return;
    state.profil = {
        nama_sekolah: d.nama_sekolah || PROFIL_BAWAAN.nama_sekolah,
        alamat_sekolah: d.alamat || "",
        tempat: d.kota || PROFIL_BAWAAN.tempat,
        kepala_sekolah: d.kepala_sekolah || "",
        kurikulum: d.kurikulum || "",
        tahun_ajaran: kodeTahun || PROFIL_BAWAAN.tahun_ajaran,
        // Baris apa adanya, dipakai penulis kop untuk tata letaknya.
        profil: d,
    };
}

function tandaiPerluHitung() {
    const beda = document.getElementById("tglAwal").value !== state.awal
              || document.getElementById("tglAkhir").value !== state.akhir;
    document.getElementById("perluHitung").hidden = !beda;
    document.getElementById("rekapBtn").classList.toggle("menunggu", beda);
}

let sedangHitung = false, mintaHitungLagi = false;
async function hitungLagi() {
    if (sedangHitung) { mintaHitungLagi = true; return; }
    sedangHitung = true;
    try {
        do { mintaHitungLagi = false; await hitung(); } while (mintaHitungLagi);
    } finally { sedangHitung = false; }
}

/* Jumlah dasar dihitung server (kg_rekap, 4 Oktober 2026): jam kontrak,
   terjadwal, ST/IT/TK/HTTM, hari terjadwal dan hari datang per guru, serta
   jumlah jaga piket — bukan ribuan catatan mentah diunduh lalu dijumlahkan
   di sini. Rumus akhirnya (bobot, persentase, total) tetap rekap-hitung.js
   yang sama. Ketidakhadiran yang diunduh tinggal yang punya penugasan
   pengganti, untuk tab Pengganti dan rinciannya.

   REKAP_SERVER baru dinyalakan setelah hasilnya dibandingkan dengan hitungan
   peramban pada data sungguhan dan sama persis. Bila kg_rekap gagal (mis.
   belum ada di database), halaman kembali ke hitungan peramban. */
const REKAP_SERVER = true;   // dinyalakan 4 Oktober 2026: 9 rentang dibandingkan pada data sungguhan, sama persis

async function hitungDiServer() {
    const [srv, rK] = await Promise.all([
        supabaseClient.rpc("kg_rekap", { p_awal: state.awal, p_akhir: state.akhir }),
        ambilSemua(() => supabaseClient.from("kg_ketidakhadiran_guru")
            .select("id, jadwal_id, tanggal, guru_id, status, kg_penugasan_pengganti!inner(guru_pengganti_id, status_pengganti)")
            .gte("tanggal", state.awal).lte("tanggal", state.akhir).order("id")),
    ]);
    if (srv.error || !srv.data) { console.warn("kg_rekap gagal, kembali ke hitungan peramban:", srv.error); return false; }
    if (rK.error) { laporError("Gagal memuat catatan penugasan pengganti", rK.error); return true; }
    state.ketidakhadiran = rK.data.map(({ kg_penugasan_pengganti, ...k }) => k);
    state.penugasan = rK.data.map((k) => ({ ketidakhadiran_id: k.id, ...k.kg_penugasan_pengganti }));
    state.piketJaga = srv.data.piket || [];
    state.piketCatatan = Number(srv.data.piket_catatan) || 0;

    const liburSet = new Set(state.libur.map((l) => l.tanggal));
    const hari = hariKerja(state.awal, state.akhir, liburSet);
    state.hasilKehadiran = rekapDariJumlah(srv.data.mengajar, hari.length);
    state.hasilWali = rekapWaliDariJumlah(srv.data, hari.length);
    hitungPengganti();
    state.hasilPiket = rekapPiket(hari);
    renderKehadiran(); renderPengganti(); renderPiket();
    return true;
}

// Pengganti: hanya jam mengajar; jam tugas wali kelas dihitung terpisah.
function hitungPengganti() {
    const { mengajar, ketMengajar } = pisahWaliKelas(state.jadwal, state.ketidakhadiran);
    const semuaPengganti = rekapPengganti({ penugasan: state.penugasan, ketidakhadiran: state.ketidakhadiran, jadwal: state.jadwal, awal: state.awal, akhir: state.akhir });
    state.hasilPengganti = rekapPengganti({ penugasan: state.penugasan, ketidakhadiran: ketMengajar, jadwal: mengajar, awal: state.awal, akhir: state.akhir });
    state.jamWaliDikecualikan = semuaPengganti.rincian.length - state.hasilPengganti.rincian.length;
}

// Jumlah jaga Hadir per guru per jenis dari catatan mentah — bentuk yang sama dengan kg_rekap.piket.
function jagaDariCatatan(catatan) {
    const per = new Map();
    for (const c of catatan) {
        if (c.status !== "Hadir") continue;
        const kunci = c.guru_id + "|" + c.jenis;
        if (!per.has(kunci)) per.set(kunci, { guru_id: c.guru_id, jenis: c.jenis, jaga: 0 });
        per.get(kunci).jaga += 1;
    }
    return [...per.values()];
}

async function hitung() {
    state.awal = document.getElementById("tglAwal").value;
    state.akhir = document.getElementById("tglAkhir").value;
    if (!state.awal || !state.akhir || state.awal > state.akhir) { laporError("Rentang tanggal tidak valid", { message: "Tanggal awal harus sebelum atau sama dengan tanggal akhir." }); return; }

    if (isSupabaseConfigured && REKAP_SERVER && await hitungDiServer()) return;

    if (isSupabaseConfigured) {
        // Catatan ketidakhadiran beserta penugasan penggantinya (satu permintaan,
        // relasi satu-satu) dan catatan piket, serentak dan berhalaman: rentang
        // panjang dulu terpotong diam-diam di 1.000 baris, dan penugasan
        // diminta per 200 id secara berurutan sesudahnya.
        const [rK, rP] = await Promise.all([
            ambilSemua(() => supabaseClient.from("kg_ketidakhadiran_guru")
                .select("id, jadwal_id, tanggal, guru_id, status, kg_penugasan_pengganti(guru_pengganti_id, status_pengganti)")
                .gte("tanggal", state.awal).lte("tanggal", state.akhir).order("id")),
            ambilSemua(() => supabaseClient.from("kg_pelaksanaan_piket")
                .select("tanggal, jenis, guru_id, tugas_id, status")
                .gte("tanggal", state.awal).lte("tanggal", state.akhir).order("id")),
        ]);
        if (rK.error) { laporError("Gagal memuat catatan ketidakhadiran", rK.error); return; }
        state.ketidakhadiran = rK.data.map(({ kg_penugasan_pengganti, ...k }) => k);
        state.penugasan = rK.data.filter((k) => k.kg_penugasan_pengganti)
            .map((k) => ({ ketidakhadiran_id: k.id, ...k.kg_penugasan_pengganti }));
        if (rP.error) {
            laporError("Gagal memuat catatan pelaksanaan piket (tab Piket sementara kosong)", rP.error);
            state.piket = [];
        } else state.piket = rP.data;
    } else {
        state.ketidakhadiran = demoKetidakhadiran.filter((x) => x.tanggal >= state.awal && x.tanggal <= state.akhir);
        state.penugasan = demoPenugasan;
        state.piket = [];
    }
    state.piketJaga = jagaDariCatatan(state.piket);
    state.piketCatatan = state.piket.length;

    const liburSet = new Set(state.libur.map((l) => l.tanggal));
    const { mengajar, wali, ketMengajar, ketWali } = pisahWaliKelas(state.jadwal, state.ketidakhadiran);
    const libur = { liburSet, liburSebagian: state.liburSebagian, kelas: state.kelas };
    state.hasilKehadiran = rekapKehadiran({ jadwal: mengajar, ketidakhadiran: ketMengajar, awal: state.awal, akhir: state.akhir, ...libur });
    state.hasilWali = rekapWali({ jadwal: wali, ketidakhadiran: ketWali, awal: state.awal, akhir: state.akhir, ...libur });
    hitungPengganti();
    state.hasilPiket = rekapPiket(hariKerja(state.awal, state.akhir, liburSet));
    renderKehadiran(); renderPengganti(); renderPiket();
}

/* ---------- Rekap pelaksanaan piket ----------

   Dua kolom per jenis piket, dan keduanya menjawab pertanyaan berbeda:

     Terjadwal  berapa banyak orang ini SEHARUSNYA berjaga, menurut jadwal
     Jaga       berapa banyak ia BENAR-BENAR berjaga

   Satuannya mengikuti satuan jadwalnya: JAM pelajaran untuk meja sekolah
   dan unit, HARI untuk parkiran — yang memang bukan per jam pelajaran
   melainkan sekali jaga sesudah bel pulang. Sejak kehadiran piket dicatat
   per jam, guru yang berjaga dua jam dan hadir satu jam terbaca apa adanya:
   terjadwal 2, jaga 1.

   Piket tidak mengenal pengganti, jadi Jaga tidak akan pernah melebihi
   Terjadwal. Selisih di antara keduanya berarti petugasnya tidak hadir,
   atau harinya belum dicatat.

   Nilai rupiahnya dihitung di Induk Pembiayaan, bukan di sini; halaman ini
   hanya melaporkan jumlah harinya. */
const KUNCI_JENIS = { "Meja Sekolah": "meja", "Unit": "unit", "Parkiran": "parkiran" };

/* Persentase per jenis piket: jaga ÷ terjadwal. Tanpa bobot status,
   karena pelaksanaan piket hanya mengenal hadir atau tidak. */
const persenPiket = (x) => x.terjadwal ? Math.round((x.jaga / x.terjadwal) * 10000) / 100 : null;

function rekapPiket(hari) {
    const per = new Map();
    const baris = (id) => {
        if (!per.has(id)) per.set(id, { guru_id: id, meja: { terjadwal: 0, jaga: 0 }, unit: { terjadwal: 0, jaga: 0 }, parkiran: { terjadwal: 0, jaga: 0 } });
        return per.get(id);
    };

    /* Terjadwal dihitung dari JADWALNYA, bukan dari catatan pelaksanaan.
       Kalau dihitung dari catatan, hari yang belum sempat dicatat akan
       hilang tanpa bekas — dan justru selisih antara terjadwal dan jaga
       itulah yang memberitahu masih ada yang belum dicatat. */
    /* kg_piket dan v_jadwal_piket_unit sama-sama menyimpan satu baris per
       JAM, dan itulah satuan yang dihitung di sini — jadi barisnya dihitung
       apa adanya, tidak lagi diringkas menjadi hari. Parkiran tetap per
       hari: satu petugas satu hari, tanpa jam pelajaran. */
    const jamMeja = new Map();       // guru_id -> { hari: jumlah jam }
    for (const p of state.jadwalPiket.meja) {
        if (!jamMeja.has(p.guru_id)) jamMeja.set(p.guru_id, {});
        const per = jamMeja.get(p.guru_id);
        per[p.hari] = (per[p.hari] || 0) + 1;
    }
    const hariParkiran = new Map();
    for (const p of state.jadwalPiket.parkiran) {
        if (!hariParkiran.has(p.guru_id)) hariParkiran.set(p.guru_id, new Set());
        hariParkiran.get(p.guru_id).add(p.hari);
    }
    // Masa berlaku tiap penugasan unit, untuk menyaring jadwal jamnya.
    const masaUnit = new Map((state.jadwalPiket.unit || [])
        .map((t) => [String(t.tugas_id), t]));

    for (const h of hari) {
        for (const [gid, per] of jamMeja) baris(gid).meja.terjadwal += per[h.hari] || 0;
        for (const [gid, hs] of hariParkiran) if (hs.has(h.hari)) baris(gid).parkiran.terjadwal += 1;
        for (const p of state.jadwalPiket.unitJam || []) {
            if (p.hari !== h.hari) continue;
            const t = masaUnit.get(String(p.tugas_id));
            if (t && ((t.mulai && t.mulai > h.tanggal) || (t.selesai && t.selesai < h.tanggal))) continue;
            baris(p.guru_id).unit.terjadwal += 1;
        }
    }

    for (const c of state.piketJaga || []) {
        const k = KUNCI_JENIS[c.jenis];
        if (!k) continue;
        /* Satu baris catatan = satu giliran: satu jam untuk meja dan unit,
           satu hari untuk parkiran. Piket tidak mengenal pengganti, jadi
           yang berjaga selalu petugas yang terjadwal. "Tidak Hadir" tidak
           menambah apa pun — gilirannya tetap terhitung terjadwal tetapi
           tidak dijaga, dan selisih itulah keterangannya. */
        baris(c.guru_id)[k].jaga += c.jaga;
    }
    const rows = [...per.values()]
        .map((r) => ({ ...r, nama: namaGuru(r.guru_id) }))
        .sort(urutBaris);
    const total = { meja: { terjadwal: 0, jaga: 0 }, unit: { terjadwal: 0, jaga: 0 }, parkiran: { terjadwal: 0, jaga: 0 } };
    for (const r of rows)
        for (const k of ["meja", "unit", "parkiran"]) { total[k].terjadwal += r[k].terjadwal; total[k].jaga += r[k].jaga; }
    return { baris: rows, total };
}

const selPiket = (x) => num(x.terjadwal) + num(x.jaga) + persenCell(persenPiket(x));

function renderPiket() {
    const h = state.hasilPiket; if (!h) return;
    const rows = h.baris;
    document.getElementById("kosongPiket").hidden = rows.length > 0;
    document.getElementById("bodyPiket").innerHTML = rows.map((r, i) => `
      <tr>
        <td class="num">${i + 1}</td><td class="nama">${esc(r.nama)}</td>
        ${selPiket(r.meja)}${selPiket(r.unit)}${selPiket(r.parkiran)}
      </tr>`).join("");
    const t = h.total;
    document.getElementById("footPiket").innerHTML = rows.length ? `
      <tr class="total"><td></td><td>Total (${rows.length} petugas)</td>
        ${selPiket(t.meja)}${selPiket(t.unit)}${selPiket(t.parkiran)}
      </tr>` : "";
    document.getElementById("ringkasPiket").textContent =
        `${tanggalPanjang(state.awal)} – ${tanggalPanjang(state.akhir)} · ${state.piketCatatan || 0} catatan pelaksanaan`;
    document.getElementById("footPiketTeks").textContent =
        `Satuannya mengikuti jadwalnya: Meja Sekolah dan Unit dihitung per JAM pelajaran, `
        + `Parkiran per HARI jaga — parkiran memang bukan jam pelajaran, melainkan sekali jaga `
        + `sesudah bel pulang. "Terjadwal" dihitung dari jadwal piket pada hari kerja dalam `
        + `rentang ini, di luar hari libur; "Jaga" adalah yang benar-benar dijalankan; `
        + `"% Kehadiran" = Jaga ÷ Terjadwal. Piket tidak mengenal pengganti, jadi selisih antara `
        + `keduanya berarti petugasnya tidak hadir, atau gilirannya belum dicatat. `
        + `Nilai rupiahnya dihitung di aplikasi Induk Pembiayaan.`;
}

// ---------- Render kehadiran ----------
const num = (v) => `<td class="num">${v}</td>`;
const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ","));
const persenCell = (p) => p === null ? `<td class="num">—</td>` : `<td class="num"><span class="persen ${p >= 95 ? "baik" : p >= 85 ? "sedang" : "rendah"}">${p.toFixed(2).replace(".", ",")}%</span></td>`;

function barisKehadiranTersaring() {
    const q = state.saring.trim().toLowerCase();
    return state.hasilKehadiran.baris
        .map((r) => ({ ...r, nama: namaGuru(r.guru_id) }))
        .filter((r) => !q || r.nama.toLowerCase().includes(q))
        .sort(urutBaris);
}

function renderKehadiran() {
    const h = state.hasilKehadiran; if (!h) return;
    const rows = barisKehadiranTersaring();
    document.getElementById("bodyKehadiran").innerHTML = rows.map((r) => `
      <tr>
        <td class="nama">${esc(r.nama)}</td>${selKontrak(r)}${num(r.hariTerjadwal)}${num(r.hariDatang)}${num(r.terjadwal)}${num(r.hadirTM)}${num(r.HTTM)}${num(r.ST)}${num(r.IT)}${num(r.TK)}${num(fmt(r.hadir))}${persenCell(r.persen)}
      </tr>`).join("") || `<tr><td colspan="12" class="empty-state">Tidak ada data pada rentang ini.</td></tr>`;
    const t = h.total;
    document.getElementById("footKehadiran").innerHTML = `
      <tr class="total"><td>Total (${h.baris.length} guru)</td><td class="num">${t.kontrak}${(() => { const s = h.baris.reduce((a, r) => a + jamTambahan(r.guru_id), 0); return s ? ` <small class="satuan-kolom">(+${s})</small>` : ""; })()}</td>${num(t.hariTerjadwal)}${num(t.hariDatang)}${num(t.terjadwal)}${num(t.hadirTM)}${num(t.HTTM)}${num(t.ST)}${num(t.IT)}${num(t.TK)}${num(fmt(t.hadir))}${persenCell(t.persen)}</tr>`;
    document.getElementById("ringkasKehadiran").textContent = `${h.jumlahHariKerja} hari kerja · ${tanggalPanjang(state.awal)} – ${tanggalPanjang(state.akhir)}`;
    renderWali();
    tandaiPerluHitung();
}

function barisWaliTersaring() {
    const q = state.saringWali.trim().toLowerCase();
    return (state.hasilWali?.baris || []).map((r) => ({ ...r, nama: namaGuru(r.guru_id) }))
        .filter((r) => !q || r.nama.toLowerCase().includes(q)).sort(urutBaris);
}

/* Upacara dan Bimbingan Wali Kelas masing-masing punya kolom Terjadwal
   dan Hadir, karena tidak hadir upacara dan tidak hadir bimbingan bukan
   hal yang sama bagi seorang wali kelas. Persentasenya satu, dari
   gabungan keduanya: yang diukur di sini kinerja, bukan uang, dan untuk
   itu keduanya sama beratnya. Pemisahan menurut tarif dikerjakan Induk
   Pembiayaan. */
const selWali = (r) => num(r.terjadwalUpacara) + num(fmt(r.hadirUpacara))
    + num(r.terjadwalBimbingan) + num(fmt(r.hadirBimbingan)) + persenCell(r.persen);

function renderWali() {
    const w = state.hasilWali; if (!w) return;
    const rows = barisWaliTersaring();
    document.getElementById("bodyWali").innerHTML = rows.map((r) => `
      <tr><td class="nama">${esc(r.nama)}</td>${selWali(r)}</tr>`).join("")
      || `<tr><td colspan="6" class="empty-state">Tidak ada jam tugas wali kelas pada rentang ini.</td></tr>`;
    const t = w.total;
    document.getElementById("ringkasWali").textContent =
        `${w.jumlahHariKerja} hari kerja · ${tanggalPanjang(state.awal)} – ${tanggalPanjang(state.akhir)}`;
    /* Satuannya perlu dikatakan. Tiap wali kelas terjadwal 1 jam Upacara dan
       1 jam Bimbingan tiap Senin, jadi angka di sini menumpuk mengikuti
       banyaknya Senin dalam rentang — dua Senin berarti 4 jam. Induk
       Pembiayaan menampilkan 1 jam, karena di sana satuannya per minggu.
       Keduanya benar; yang membingungkan hanya karena sama-sama disebut "jam". */
    document.getElementById("footWaliTeks").textContent =
        "Terjadwal dihitung sepanjang rentang tanggal: tiap wali kelas 1 jam Upacara dan 1 jam "
        + "Bimbingan setiap Senin, jadi dua Senin berarti 2 jam di tiap kolom. Di aplikasi Induk "
        + "Pembiayaan angkanya per minggu (1 jam), karena honornya dibayarkan bulanan atas dasar jam "
        + "kontrak itu — bukan dikalikan banyaknya pekan. Ketidakhadiran yang berstatus (sakit, ijin, "
        + "HTTM) tidak masuk kolom Hadir, tetapi tetap dihitung berbobot pada % Kehadiran.";
    document.getElementById("footWali").innerHTML = `<tr class="total"><td>Total (${w.baris.length} wali kelas)</td>${selWali(t)}</tr>`;
}

// ---------- Render pengganti ----------
function renderPengganti() {
    const h = state.hasilPengganti; if (!h) return;
    document.getElementById("tabelRingkas").hidden = state.viewPengganti !== "ringkas";
    document.getElementById("tabelRinci").hidden = state.viewPengganti !== "rinci";
    document.getElementById("bodyRingkas").innerHTML = h.baris.map((r) => `
      <tr><td class="nama">${esc(namaGuru(r.guru_id))}</td>${num(r.GT)}${num(r.PT)}${num(r.Inf)}<td class="num"><strong>${r.total}</strong></td></tr>`).join("")
      || `<tr><td colspan="5" class="empty-state">Belum ada penugasan pada rentang ini.</td></tr>`;
    document.getElementById("footRingkas").innerHTML = `<tr class="total"><td>Total (${h.baris.length} guru pengganti)</td>${num(h.total.GT)}${num(h.total.PT)}${num(h.total.Inf)}<td class="num"><strong>${h.total.total}</strong></td></tr>`;
    document.getElementById("bodyRinci").innerHTML = h.rincian.map((r) => `
      <tr>
        <td>${esc(r.tanggal)}</td><td>Jam ke-${esc(r.jam_ke)}</td><td><span class="badge-kelas">${esc(namaKelas(r.kelas_id))}</span></td><td class="nama">${esc(namaMapel(r.mapel_id))}</td>
        <td class="nama">${esc(namaGuru(r.guru_id))}</td><td><span class="badge-status badge-${esc(r.status.toLowerCase())}">${esc(r.status)}</span></td>
        <td class="nama">${r.pengganti_id ? esc(namaGuru(r.pengganti_id)) : "—"}</td><td><span class="badge-tugas badge-${esc(r.kode.toLowerCase())}">${esc(r.kode)}</span></td>
      </tr>`).join("") || `<tr><td colspan="8" class="empty-state">Belum ada penugasan pada rentang ini.</td></tr>`;
    document.getElementById("ringkasPengganti").textContent = `${h.total.total} jam digantikan · ${h.tanpaPengganti} jam tanpa pengganti (TP)` + (state.jamWaliDikecualikan ? ` · ${state.jamWaliDikecualikan} jam tugas wali kelas tidak termasuk` : "");
    document.getElementById("footPengganti").textContent = `GT = Guru diTugaskan · PT = Piket diTugaskan · Inf = Infaler · TP = Tidak Perlu Pengganti (tidak masuk hitungan per guru).`;
}

// ---------- Hari libur ----------
/* Dua macam libur dicatat dari satu formulir:
     seluruh sekolah + sehari penuh  -> kg_hari_libur (libur penuh)
     selain itu                      -> libur_sebagian, satu baris per tanggal
   Rentang tanggal disimpan per hari sekolah (Sabtu–Minggu dilewati), lalu
   di daftar dikelompokkan lagi menjadi satu entri bila berurutan dan
   isinya sama. */
const el = (id) => document.getElementById(id);
const TINGKAT = [10, 11, 12];
const BATAS_HARI = 62;   // rentang lebih panjang dari ini hampir pasti salah ketik
const formLibur = { cakupan: "sekolah", tingkat: new Set(), kelas: new Set(), waktu: "penuh", jamDari: null, jamSampai: null, jangkar: null };
let saringLibur = "semua";
let liburBaru = new Set();   // kunci entri yang baru disimpan, disorot sebentar

const hariSekolah = (iso) => { const g = new Date(iso + "T00:00:00").getDay(); return g >= 1 && g <= 5; };
function hariSekolahBerikut(iso) {
    const d = new Date(iso + "T00:00:00");
    do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6);
    return isoTanggal(d);
}
const daftarJam = () => (state.jam && state.jam.length ? state.jam.map((j) => Number(j.jam_ke))
    : Array.from({ length: 12 }, (_, i) => i + 1));
const jamMulai = (n) => String((state.jam || []).find((j) => Number(j.jam_ke) === n)?.mulai || "").slice(0, 5).replace(":", ".");

// Tanggal-tanggal hari sekolah dari isian Dari/Sampai.
function tanggalFormLibur() {
    const dari = el("liburDari").value;
    const sampaiIsi = el("liburSampai").value;
    if (!dari) return { dari: "", sampai: "", daftar: [], terlalu: false };
    const sampai = sampaiIsi && sampaiIsi > dari ? sampaiIsi : dari;
    const daftar = [];
    const d = new Date(dari + "T00:00:00"), akhir = new Date(sampai + "T00:00:00");
    let n = 0;
    while (d <= akhir && n++ < 400) { const iso = isoTanggal(d); if (hariSekolah(iso)) daftar.push(iso); d.setDate(d.getDate() + 1); }
    return { dari, sampai, daftar, terlalu: daftar.length > BATAS_HARI };
}

// Calon catatan dari isian formulir (belum tentu sah).
function calonLibur() {
    const f = formLibur;
    return {
        tingkat: f.cakupan === "tingkat" ? [...f.tingkat].sort((a, b) => a - b) : null,
        kelas_id: f.cakupan === "kelas" ? state.kelas.filter((k) => f.kelas.has(k.id)).map((k) => k.id) : null,
        jam_dari: f.waktu === "sebagian" ? f.jamDari : null,
        jam_sampai: f.waktu === "sebagian" ? f.jamSampai : null,
        keterangan: el("liburKeterangan").value.trim() || null,
    };
}

function periksaFormLibur() {
    const t = tanggalFormLibur(), f = formLibur, c = calonLibur();
    const penuh = f.cakupan === "sekolah" && f.waktu === "penuh";
    const sudahPenuh = new Set(state.libur.map((l) => l.tanggal));
    const tanggal = penuh ? t.daftar : t.daftar.filter((d) => !sudahPenuh.has(d));
    let pesan = "";
    if (!t.dari) pesan = "Pilih tanggal libur.";
    else if (!t.daftar.length) pesan = "Tidak ada hari sekolah (Senin–Jumat) pada tanggal itu.";
    else if (t.terlalu) pesan = `Rentang ${t.daftar.length} hari sekolah terlalu panjang — paling banyak ${BATAS_HARI}.`;
    else if (f.cakupan === "tingkat" && !f.tingkat.size) pesan = "Pilih minimal satu tingkat.";
    else if (f.cakupan === "kelas" && !f.kelas.size) pesan = "Pilih minimal satu kelas.";
    else if (f.waktu === "sebagian" && f.jamDari == null) pesan = "Pilih jam yang ditiadakan pada deretan jam.";
    else if (!tanggal.length) pesan = "Semua tanggal itu sudah tercatat libur penuh.";
    return { ok: !pesan, pesan, penuh, tanggal, lewati: t.daftar.length - tanggal.length, t, c };
}

// Jam pelajaran (jadwal) yang akan ditiadakan, untuk ringkasan dampak.
function dampakLibur(cek) {
    const tingkat = petaTingkat(state.kelas);
    let jam = 0; const guru = new Set();
    for (const d of cek.tanggal) {
        const hari = namaHari(d), smt = semesterTanggal(d);
        for (const j of state.jadwal) {
            if (j.hari !== hari || semesterBaris(j) !== smt) continue;
            if (!cek.penuh && !mencakup(cek.c, j, tingkat)) continue;
            jam++; guru.add(j.guru_id);
        }
    }
    return { jam, guru: guru.size };
}

function renderPilihTingkat() {
    const box = el("liburPilihTingkat");
    box.hidden = formLibur.cakupan !== "tingkat";
    if (box.hidden) return;
    box.innerHTML = TINGKAT.map((t) => {
        const kls = state.kelas.filter((k) => Number(k.tingkat) === t);
        const rombel = kls.filter((k) => jenisKelas(k) === "reguler").length;
        const md = kls.length - rombel;
        const on = formLibur.tingkat.has(t);
        return `<button type="button" class="tingkat-kartu${on ? " aktif" : ""}" aria-pressed="${on}" data-tingkat="${t}">
            <span class="tingkat-angka">${t}</span>
            <span class="tingkat-label">Tingkat ${t}</span>
            <span class="tingkat-isi">${rombel} rombel${md ? ` · ${md} MD` : ""}</span>
          </button>`;
    }).join("");
    box.querySelectorAll("[data-tingkat]").forEach((b) => b.addEventListener("click", () => {
        const t = Number(b.dataset.tingkat);
        formLibur.tingkat.has(t) ? formLibur.tingkat.delete(t) : formLibur.tingkat.add(t);
        renderFormLibur();
    }));
}

function grupKelas() {
    const grup = TINGKAT.map((t) => ({ judul: `Tingkat ${t}`, kelas: state.kelas.filter((k) => Number(k.tingkat) === t && jenisKelas(k) !== "tahsin") }));
    grup.push({ judul: "Tahsin", kelas: state.kelas.filter((k) => jenisKelas(k) === "tahsin") });
    const sudah = new Set(grup.flatMap((g) => g.kelas.map((k) => k.id)));
    grup.push({ judul: "Lainnya", kelas: state.kelas.filter((k) => !sudah.has(k.id)) });
    return grup.filter((g) => g.kelas.length);
}

function renderPilihKelas() {
    const box = el("liburPilihKelas");
    box.hidden = formLibur.cakupan !== "kelas";
    if (box.hidden) return;
    const grup = grupKelas();
    box.innerHTML = grup.map((g, i) => {
        const semua = g.kelas.every((k) => formLibur.kelas.has(k.id));
        return `<div class="kelas-grup">
            <div class="kelas-grup-kepala"><span>${esc(g.judul)}</span>
              <button type="button" class="kelas-semua" data-grup="${i}">${semua ? "Lepas semua" : "Pilih semua"}</button></div>
            <div class="kelas-chips">${g.kelas.map((k) => {
                const on = formLibur.kelas.has(k.id);
                return `<button type="button" class="kelas-chip${on ? " aktif" : ""}" aria-pressed="${on}" data-kelas="${esc(k.id)}">${esc(k.nama_kelas)}</button>`;
            }).join("")}</div>
          </div>`;
    }).join("") || `<p class="libur-hint">Daftar kelas belum termuat.</p>`;
    box.querySelectorAll("[data-kelas]").forEach((b) => b.addEventListener("click", () => {
        const id = b.dataset.kelas;
        formLibur.kelas.has(id) ? formLibur.kelas.delete(id) : formLibur.kelas.add(id);
        renderFormLibur();
    }));
    box.querySelectorAll("[data-grup]").forEach((b) => b.addEventListener("click", () => {
        const g = grup[Number(b.dataset.grup)];
        const semua = g.kelas.every((k) => formLibur.kelas.has(k.id));
        for (const k of g.kelas) semua ? formLibur.kelas.delete(k.id) : formLibur.kelas.add(k.id);
        renderFormLibur();
    }));
}

function renderJamStrip() {
    const f = formLibur;
    el("liburPilihJam").hidden = f.waktu !== "sebagian";
    if (f.waktu !== "sebagian") return;
    el("liburJamStrip").innerHTML = daftarJam().map((n) => {
        const dalam = f.jamDari != null && n >= f.jamDari && n <= f.jamSampai;
        const ujung = dalam && (n === f.jamDari || n === f.jamSampai);
        return `<button type="button" class="jam-sel${dalam ? " dalam" : ""}${ujung ? " ujung" : ""}${f.jangkar === n ? " jangkar" : ""}"
            aria-pressed="${dalam}" data-jam="${n}" title="Jam ke-${n}${jamMulai(n) ? " · mulai " + jamMulai(n) : ""}">
            <span class="jam-no">${n}</span><span class="jam-mulai">${esc(jamMulai(n))}</span></button>`;
    }).join("");
    el("liburJamStrip").querySelectorAll("[data-jam]").forEach((b) => b.addEventListener("click", () => {
        const n = Number(b.dataset.jam);
        if (f.jangkar == null) { f.jamDari = f.jamSampai = n; f.jangkar = n; }
        else { f.jamDari = Math.min(f.jangkar, n); f.jamSampai = Math.max(f.jangkar, n); f.jangkar = null; }
        renderFormLibur();
    }));
    const waktu = f.jamDari != null ? waktuJam(f.jamDari, f.jamSampai, state.jam) : "";
    el("liburJamInfo").innerHTML = f.jamDari == null
        ? "Klik jam pertama yang ditiadakan, lalu jam terakhirnya."
        : f.jangkar != null
            ? `<b>Jam ke-${f.jamDari}</b> dipilih. Klik jam terakhir untuk membuat rentang — atau biarkan untuk satu jam saja.`
            : `<b>${esc(uraianJam({ jam_dari: f.jamDari, jam_sampai: f.jamSampai }))}</b>${waktu ? ` · ${esc(waktu)}` : ""} ditiadakan. Klik jam lain untuk memilih ulang.`;
}

function renderInfoTanggal() {
    const t = tanggalFormLibur();
    const info = el("liburTanggalInfo");
    info.classList.remove("peringatan");
    if (!t.dari) { info.textContent = 'Kosongkan "Sampai" untuk satu hari saja. Sabtu–Minggu dilewati.'; return; }
    if (t.dari === t.sampai) {
        info.textContent = tanggalLengkap(t.dari) + (hariSekolah(t.dari) ? "" : " — bukan hari sekolah");
        info.classList.toggle("peringatan", !hariSekolah(t.dari));
        return;
    }
    info.textContent = `${t.daftar.length} hari sekolah · ${tanggalLengkap(t.dari)} s.d. ${tanggalLengkap(t.sampai)}`;
    info.classList.toggle("peringatan", !t.daftar.length || t.terlalu);
}

function renderRingkasLibur() {
    const cek = periksaFormLibur();
    const box = el("liburRingkas");
    el("liburTambah").disabled = !cek.ok || !isUnlocked();
    if (!cek.t.dari) {
        box.className = "libur-ringkas kosong";
        box.innerHTML = `<span class="ringkas-label">Ringkasan</span><p class="ringkas-kalimat">Isi tanggal untuk melihat ringkasan dan dampaknya pada jadwal.</p>`;
        return;
    }
    const subjek = cek.penuh ? "Seluruh sekolah" : uraianCakupan(cek.c, namaKelas, 6);
    const rentangJam = cek.c.jam_dari != null ? waktuJam(cek.c.jam_dari, cek.c.jam_sampai, state.jam) : "";
    const waktu = formLibur.waktu === "penuh" ? "sehari penuh"
        : cek.c.jam_dari == null ? "pada jam yang belum dipilih"
        : uraianJam(cek.c).replace("Jam", "jam") + (rentangJam ? ` (${rentangJam})` : "");
    const kapan = cek.t.dari === cek.t.sampai ? tanggalLengkap(cek.t.dari)
        : `${tanggalLengkap(cek.t.dari)} s.d. ${tanggalLengkap(cek.t.sampai)}`;
    const d = cek.tanggal.length ? dampakLibur(cek) : { jam: 0, guru: 0 };
    box.className = "libur-ringkas " + (cek.penuh ? "jenis-penuh" : "jenis-sebagian");
    box.innerHTML = `
      <span class="ringkas-label">${cek.penuh ? "Libur penuh" : "Libur sebagian"}</span>
      <p class="ringkas-kalimat"><b>${esc(subjek)}</b> libur <b>${esc(waktu)}</b>, ${esc(kapan)}.</p>
      <div class="ringkas-angka">
        <div><strong>${cek.tanggal.length}</strong><span>hari sekolah</span></div>
        <div><strong>${d.jam}</strong><span>jam pelajaran ditiadakan</span></div>
        <div><strong>${d.guru}</strong><span>guru terdampak</span></div>
      </div>
      <p class="ringkas-catatan">${cek.penuh
        ? "Tanggal ini keluar dari hari kerja — juga bagi staf dan piket."
        : "Hari tetap dihitung hari kerja; staf dan piket berjalan seperti biasa."}${cek.lewati ? ` ${cek.lewati} tanggal sudah libur penuh dan dilewati.` : ""}</p>
      ${cek.ok ? "" : `<p class="ringkas-kurang">${esc(cek.pesan)}</p>`}`;
}

function renderFormLibur() {
    const f = formLibur;
    for (const b of el("liburCakupan").querySelectorAll("button")) {
        const on = b.dataset.cakupan === f.cakupan;
        b.classList.toggle("aktif", on); b.setAttribute("aria-checked", on);
    }
    for (const b of el("liburWaktu").querySelectorAll("button")) {
        const on = b.dataset.waktu === f.waktu;
        b.classList.toggle("aktif", on); b.setAttribute("aria-checked", on);
    }
    renderPilihTingkat(); renderPilihKelas(); renderJamStrip(); renderInfoTanggal();
    el("liburCakupanInfo").textContent =
        f.cakupan === "sekolah" ? "Semua rombel dan kelompok belajar."
        : f.cakupan === "tingkat" ? (f.tingkat.size ? `${f.tingkat.size} tingkat dipilih — termasuk kelompok Matematika Dasar tingkat itu.` : "Pilih satu tingkat atau lebih.")
        : (f.kelas.size ? `${f.kelas.size} kelas dipilih.` : "Pilih satu kelas atau lebih.");
    renderRingkasLibur();
}

function kosongkanFormLibur() {
    Object.assign(formLibur, { cakupan: "sekolah", tingkat: new Set(), kelas: new Set(), waktu: "penuh", jamDari: null, jamSampai: null, jangkar: null });
    el("liburDari").value = ""; el("liburSampai").value = ""; el("liburKeterangan").value = "";
    el("liburSampai").min = "";
    renderFormLibur();
}

/* Entri daftar: libur penuh dan libur sebagian, tanggal berurutan (hari
   sekolah berikutnya) dengan isi yang sama digabung menjadi satu entri. */
function entriLibur() {
    const satu = [
        ...state.libur.map((l) => ({ jenis: "penuh", tanggal: l.tanggal, keterangan: l.keterangan || "", l: {}, kunci: "p|" + l.tanggal })),
        ...state.liburSebagian.map((l) => ({ jenis: "sebagian", tanggal: l.tanggal, keterangan: l.keterangan || "", l, kunci: "s|" + l.id })),
    ];
    const sidik = (x) => [x.jenis, x.keterangan, JSON.stringify([...(x.l.tingkat || [])].sort()),
        JSON.stringify([...(x.l.kelas_id || [])].sort()), x.l.jam_dari ?? "", x.l.jam_sampai ?? ""].join("§");
    satu.sort((a, b) => sidik(a).localeCompare(sidik(b)) || a.tanggal.localeCompare(b.tanggal));
    const grup = [];
    for (const x of satu) {
        const g = grup[grup.length - 1];
        if (g && g.sidik === sidik(x) && hariSekolahBerikut(g.akhir) === x.tanggal) { g.akhir = x.tanggal; g.anggota.push(x); continue; }
        grup.push({ sidik: sidik(x), jenis: x.jenis, awal: x.tanggal, akhir: x.tanggal, keterangan: x.keterangan, l: x.l, anggota: [x] });
    }
    return grup.sort((a, b) => a.awal.localeCompare(b.awal) || (a.jenis === "penuh" ? -1 : 1));
}

function kotakTanggal(g) {
    const a = new Date(g.awal + "T00:00:00"), z = new Date(g.akhir + "T00:00:00");
    const satuHari = g.awal === g.akhir;
    const bulan = a.getMonth() === z.getMonth() ? bulanPendek(g.awal) : `${bulanPendek(g.awal)}–${bulanPendek(g.akhir)}`;
    return `<div class="libur-tgl" aria-hidden="true">
        <span class="tgl-hari">${satuHari ? namaHari(g.awal).slice(0, 3) : g.anggota.length + " hari"}</span>
        <span class="tgl-angka">${a.getDate()}${satuHari ? "" : `<small>–${z.getDate()}</small>`}</span>
        <span class="tgl-bulan">${bulan}</span>
      </div>`;
}

let entriTampil = [];
function renderLibur() {
    const unlocked = isUnlocked();
    el("liburFieldset").disabled = !unlocked;
    el("liburTerkunci").hidden = unlocked;

    entriTampil = entriLibur().filter((g) => saringLibur === "semua" || g.jenis === saringLibur);
    const hariIni = isoTanggal(new Date());
    el("liburJumlah").textContent = `${state.libur.length} hari libur penuh · ${state.liburSebagian.length} hari libur sebagian`;
    for (const b of el("liburSaring").querySelectorAll("button")) {
        const on = b.dataset.saring === saringLibur;
        b.classList.toggle("aktif", on); b.setAttribute("aria-checked", on);
    }

    let bulanSebelum = "", html = "";
    entriTampil.forEach((g, i) => {
        const bulan = bulanTahun(g.awal);
        if (bulan !== bulanSebelum) { html += `<h4 class="libur-bulan">${esc(bulan)}</h4>`; bulanSebelum = bulan; }
        const lewat = g.akhir < hariIni;
        const baru = g.anggota.some((x) => liburBaru.has(x.kunci));
        const tanggalTeks = g.awal === g.akhir ? tanggalLengkap(g.awal)
            : `${tanggalLengkap(g.awal)} s.d. ${tanggalLengkap(g.akhir)}`;
        const rentangJam = g.l.jam_dari != null ? waktuJam(g.l.jam_dari, g.l.jam_sampai, state.jam) : "";
        html += `
        <article class="libur-item libur-${g.jenis}${lewat ? " lewat" : ""}${baru ? " baru" : ""}">
          ${kotakTanggal(g)}
          <div class="libur-isi">
            <div class="libur-judul">${esc(g.keterangan || (g.jenis === "penuh" ? "Libur sekolah" : "Libur sebagian"))}</div>
            <div class="libur-kapan">${esc(tanggalTeks)}</div>
            <div class="libur-tag">
              <span class="tag tag-cakupan">${esc(g.jenis === "penuh" ? "Seluruh sekolah" : uraianCakupan(g.l, namaKelas))}</span>
              <span class="tag tag-jam">${esc(g.jenis === "penuh" ? "Sehari penuh" : uraianJam(g.l))}${rentangJam ? ` · ${esc(rentangJam)}` : ""}</span>
            </div>
          </div>
          <button type="button" class="libur-hapus" ${unlocked ? "" : "disabled"} data-hapus="${i}" aria-label="Hapus libur ${esc(tanggalTeks)}">Hapus</button>
        </article>`;
    });
    el("daftarLibur").innerHTML = html || `<div class="libur-kosong">
        <strong>${saringLibur === "semua" ? "Belum ada libur tercatat" : "Tidak ada libur jenis ini"}</strong>
        <span>Libur yang dicatat lewat formulir akan tampil di sini, dikelompokkan per bulan.</span></div>`;
    el("daftarLibur").querySelectorAll("[data-hapus]").forEach((b) => b.addEventListener("click", () => konfirmasiHapus(b)));
    renderFormLibur();
}

// Hapus dua langkah: klik pertama meminta kepastian, klik kedua menghapus.
function konfirmasiHapus(b) {
    if (!b.classList.contains("yakin")) {
        b.classList.add("yakin"); b.textContent = "Yakin hapus?";
        setTimeout(() => { if (b.isConnected) { b.classList.remove("yakin"); b.textContent = "Hapus"; } }, 4000);
        return;
    }
    tombolSibuk(b, () => hapusLibur(entriTampil[Number(b.dataset.hapus)]));
}

async function simpanLibur() {
    const cek = periksaFormLibur();
    if (!cek.ok || !isUnlocked()) { renderRingkasLibur(); return; }
    let baru;
    if (cek.penuh) {
        const baris = cek.tanggal.map((tanggal) => ({ tanggal, keterangan: cek.c.keterangan }));
        if (isSupabaseConfigured) {
            const { error } = await supabaseClient.from("kg_hari_libur").upsert(baris, { onConflict: "tanggal" });
            if (error) { laporError("Gagal menyimpan hari libur", error); return; }
        } else {
            for (const r of baris) {
                const i = demoLibur.findIndex((l) => l.tanggal === r.tanggal);
                if (i > -1) demoLibur[i].keterangan = r.keterangan; else demoLibur.push(r);
            }
        }
        baru = baris.map((r) => "p|" + r.tanggal);
    } else {
        const baris = cek.tanggal.map((tanggal) => ({ tanggal, ...cek.c }));
        if (isSupabaseConfigured) {
            const { data, error } = await supabaseClient.from("libur_sebagian").insert(baris).select("id");
            if (error) { laporError("Gagal menyimpan libur sebagian", error); return; }
            baru = (data || []).map((r) => "s|" + r.id);
        } else {
            const ditambah = baris.map((r) => ({ id: "demo-" + Math.random().toString(36).slice(2), ...r }));
            demoLiburSebagian.push(...ditambah);
            baru = ditambah.map((r) => "s|" + r.id);
        }
    }
    if (isSupabaseConfigured) await muatLibur();
    liburBaru = new Set(baru);
    setTimeout(() => { liburBaru = new Set(); }, 2500);
    kosongkanFormLibur();
    renderLibur(); await hitungLagi();
}

async function hapusLibur(g) {
    if (!g) return;
    const tanggal = g.anggota.map((x) => x.tanggal);
    const ids = g.anggota.map((x) => x.l.id).filter(Boolean);
    if (isSupabaseConfigured) {
        const { error } = g.jenis === "penuh"
            ? await supabaseClient.from("kg_hari_libur").delete().in("tanggal", tanggal)
            : await supabaseClient.from("libur_sebagian").delete().in("id", ids);
        if (error) { laporError("Gagal menghapus libur", error); return; }
        await muatLibur();
    } else if (g.jenis === "penuh") {
        for (let i = demoLibur.length - 1; i >= 0; i--) if (tanggal.includes(demoLibur[i].tanggal)) demoLibur.splice(i, 1);
    } else {
        for (let i = demoLiburSebagian.length - 1; i >= 0; i--) if (ids.includes(demoLiburSebagian[i].id)) demoLiburSebagian.splice(i, 1);
    }
    renderLibur(); await hitungLagi();
}

function pasangFormLibur() {
    el("liburForm").addEventListener("submit", (e) => { e.preventDefault(); tombolSibuk(el("liburTambah"), simpanLibur); });
    el("liburBersihkan").addEventListener("click", kosongkanFormLibur);
    for (const id of ["liburDari", "liburSampai"]) el(id).addEventListener("input", renderFormLibur);
    el("liburDari").addEventListener("change", () => {
        // "Sampai" yang lebih awal dari "Dari" tidak masuk akal: dikosongkan.
        if (el("liburSampai").value && el("liburSampai").value < el("liburDari").value) el("liburSampai").value = "";
        el("liburSampai").min = el("liburDari").value;
        renderFormLibur();
    });
    el("liburKeterangan").addEventListener("input", renderRingkasLibur);
    el("liburCakupan").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { formLibur.cakupan = b.dataset.cakupan; renderFormLibur(); }));
    el("liburWaktu").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { formLibur.waktu = b.dataset.waktu; renderFormLibur(); }));
    el("liburSaring").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { saringLibur = b.dataset.saring; renderLibur(); }));
}

// ---------- Honor ----------
let logoCache = null;
async function logo() { if (logoCache === null) logoCache = (await ambilLogoBase64("assets/logo-kecil.png")) || false; return logoCache || null; }
const ExcelJSLib = () => muatExcelJS();   // dimuat saat pertama kali mengunduh, bukan saat halaman dibuka
const bungkus = (fn) => async () => { try { await fn(); } catch (err) { laporError("Gagal membuat file Excel", err); } };

const xlsKehadiran = bungkus(async () => {
    const h = state.hasilKehadiran; if (!h) return;
    // Jam tambahan ikut ke berkas sebagai teks "20 (+1)" pada kolom kontrak.
    const baris = barisKehadiranTersaring().map((r) => ({ ...r, tambahan: jamTambahan(r.guru_id) }));
    const wb = await bukuKehadiran({ ExcelJS: await ExcelJSLib(), baris, total: { ...h.total, tambahan: baris.reduce((a, r) => a + r.tambahan, 0) }, wali: null, pengaturan: state.profil, awal: state.awal, akhir: state.akhir, jumlahHariKerja: h.jumlahHariKerja, bobot: BOBOT_HADIR, logoBase64: await logo() });
    await unduhWorkbook(wb, `Rekap Kehadiran Guru ${state.awal} sd ${state.akhir}.xlsx`);
});
const xlsWali = bungkus(async () => {
    const w = state.hasilWali; if (!w) return;
    const wb = await bukuWali({ ExcelJS: await ExcelJSLib(), baris: barisWaliTersaring(), total: w.total, pengaturan: state.profil, awal: state.awal, akhir: state.akhir, jumlahHariKerja: w.jumlahHariKerja, bobot: BOBOT_HADIR, logoBase64: await logo() });
    await unduhWorkbook(wb, `Rekap Tugas Wali Kelas ${state.awal} sd ${state.akhir}.xlsx`);
});
const xlsPengganti = bungkus(async () => {
    const h = state.hasilPengganti; if (!h) return;
    const wb = await bukuPengganti({ ExcelJS: await ExcelJSLib(),
        ringkas: h.baris.map((r) => ({ nama: namaGuru(r.guru_id), GT: r.GT, PT: r.PT, Inf: r.Inf, total: r.total })),
        rincian: h.rincian.map((r) => ({ tanggal: r.tanggal, jam_ke: r.jam_ke, kelas: namaKelas(r.kelas_id), mapel: namaMapel(r.mapel_id), guru: namaGuru(r.guru_id), status: r.status, pengganti: r.pengganti_id ? namaGuru(r.pengganti_id) : "", kode: r.kode })),
        tanpaPengganti: h.tanpaPengganti, pengaturan: state.profil, awal: state.awal, akhir: state.akhir, logoBase64: await logo() });
    await unduhWorkbook(wb, `Rekap Guru Pengganti ${state.awal} sd ${state.akhir}.xlsx`);
});
const xlsPiket = bungkus(async () => {
    const h = state.hasilPiket; if (!h) return;
    const wb = await bukuPiket({ ExcelJS: await ExcelJSLib(), baris: h.baris, total: h.total,
        pengaturan: state.profil, awal: state.awal, akhir: state.akhir, logoBase64: await logo() });
    await unduhWorkbook(wb, `Rekap Pelaksanaan Piket ${state.awal} sd ${state.akhir}.xlsx`);
});

// ---------- Wiring ----------
try {
    document.getElementById("rekapBtn").addEventListener("click", hitungLagi);

    /* Bahaya sebuah tombol Hitung: sesudah tanggalnya diubah tetapi
       tombolnya belum ditekan, angka di layar masih milik rentang yang
       lama — sementara tanggal di atasnya sudah menunjukkan rentang baru.
       Tidak ada apa pun yang memberitahu bahwa keduanya tidak cocok, dan
       angka itu bisa terlanjur disalin atau diunduh.

       Karena itu perubahan tanggal menyalakan penanda "Rentang berubah"
       di sebelah tombolnya, dan penanda itu baru padam setelah rekapnya
       benar-benar dihitung ulang. */
    for (const id of ["tglAwal", "tglAkhir"])
        document.getElementById(id).addEventListener("change", tandaiPerluHitung);
    document.querySelectorAll(".rekap-tab").forEach((b) => b.addEventListener("click", () => {
        document.querySelectorAll(".rekap-tab").forEach((x) => x.classList.toggle("active", x === b));
        for (const t of ["kehadiran", "pengganti", "wali", "piket", "libur"]) document.getElementById("tab-" + t).hidden = b.dataset.tab !== t;
    }));
    document.querySelectorAll("#tab-pengganti .day-tabs button").forEach((b) => b.addEventListener("click", () => {
        state.viewPengganti = b.dataset.view;
        document.querySelectorAll("#tab-pengganti .day-tabs button").forEach((x) => x.classList.toggle("active", x === b));
        renderPengganti();
    }));
    document.getElementById("cariKehadiran").addEventListener("input", (e) => { state.saring = e.target.value; renderKehadiran(); });
    document.getElementById("cariWali").addEventListener("input", (e) => { state.saringWali = e.target.value; renderWali(); });
    document.getElementById("xlsKehadiran").addEventListener("click", xlsKehadiran);
    document.getElementById("xlsPengganti").addEventListener("click", xlsPengganti);
    document.getElementById("xlsWali").addEventListener("click", xlsWali);
    document.getElementById("xlsPiket").addEventListener("click", xlsPiket);
    pasangFormLibur();
} catch (err) {
    console.error("Ada elemen halaman yang tidak ditemukan — kemungkinan HTML dan JS beda versi. Lakukan hard refresh (Ctrl+Shift+R).", err);
}

boot().catch((err) => console.error("Gagal memuat data halaman:", err));
