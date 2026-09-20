import { supabaseClient, isSupabaseConfigured } from "../assets/supabase-client.js?v=20260920r";
import { demoData, demoKetidakhadiran, demoPenugasan } from "../assets/demo-data.js?v=20260920r";
import { isUnlocked, initLockUI } from "../assets/auth-gate.js?v=20260920r";
import { terapkanUrutan, peringkatGuru } from "../assets/guru-order.js?v=20260920r";
import { urutkanKelas } from "../assets/kelas-order.js?v=20260920r";
import { rekapKehadiran, rekapWaliPerKomponen, rekapPengganti, isoTanggal, BOBOT_HADIR, pisahWaliKelas } from "../assets/rekap-hitung.js?v=20260920r";
import { bukuKehadiran, bukuPengganti, bukuPiket, unduhWorkbook, ambilLogoBase64 } from "../assets/excel-export.js?v=20260920r";
import { tanggalPanjang } from "../assets/bagikan-wa.js?v=20260920r";

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
    box.innerHTML = `<strong>${konteks}</strong><br>${detail}<button type="button" class="error-close" aria-label="Tutup">×</button>`;
    box.querySelector(".error-close").addEventListener("click", () => box.remove());
}

const STATUS_LABEL = { ST: "Sakit dengan Tugas", STT: "Sakit tanpa Tugas", IT: "Ijin dengan Tugas", ITT: "Ijin tanpa Tugas", TK: "Tanpa Keterangan", HTTM: "Hadir tanpa Tatap Muka" };
const HARI_FROM_JS_DAY = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

// Penyimpanan hari libur di mode pratinjau
const demoLibur = [];
let state = {
    awal: "", akhir: "",
    guru: [], kelas: [], mapel: [], jadwal: [], libur: [],
    ketidakhadiran: [], penugasan: [],
    hasilKehadiran: null, hasilWali: null, hasilPengganti: null, jamWaliDikecualikan: 0,
    saring: "", saringWali: "", viewPengganti: "ringkas",
    profil: null,
    piket: [], hasilPiket: null,
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
        const [{ data: guru }, { data: kelas }, { data: mapel }, { data: jadwal, error: eJ }] = await Promise.all([
            terapkanUrutan(supabaseClient.from("v_guru").select("id, nama, tmt_sekolah, status_aktif, is_staf, insentif_fingerprint")),
            supabaseClient.from("kg_kelas").select("id, nama_kelas, tingkat"),
            supabaseClient.from("kg_mapel").select("id, nama_mapel"),
            supabaseClient.from("kg_jadwal_kbm").select("id, hari, jam_ke, kelas_id, mapel_id, guru_id").order("id").range(0, 999),
        ]);
        if (eJ) { laporError("Gagal memuat jadwal", eJ); return; }
        state.guru = guru || []; state.kelas = urutkanKelas(kelas || []); state.mapel = mapel || [];
        // ambil sisa baris di atas batas 1.000
        state.jadwal = jadwal || [];
        for (let mulai = 1000; state.jadwal.length === mulai; mulai += 1000) {
            const { data, error } = await supabaseClient.from("kg_jadwal_kbm")
                .select("id, hari, jam_ke, kelas_id, mapel_id, guru_id").order("id").range(mulai, mulai + 999);
            if (error) { laporError("Gagal memuat sisa jadwal", error); break; }
            state.jadwal = state.jadwal.concat(data || []);
            if (!data || data.length < 1000) break;
        }
        await muatLibur();
        await muatProfil();
    } else {
        state.guru = demoData.guru; state.kelas = urutkanKelas(demoData.kelas); state.mapel = demoData.mapel; state.jadwal = demoData.jadwal;
        state.libur = demoLibur; state.profil = { ...demoProfil };
    }
    renderLibur();
    await hitungLagi();
}

async function muatLibur() {
    const { data, error } = await supabaseClient.from("kg_hari_libur").select("tanggal, keterangan").order("tanggal");
    if (error) {
        // tabel belum dibuat -> beri tahu, tapi rekap tetap jalan tanpa libur
        laporError("Tabel kg_hari_libur belum ada — jalankan migrasi_hari_libur.sql di Supabase (rekap tetap dihitung tanpa hari libur)", error);
        state.libur = []; return;
    }
    state.libur = data || [];
}

/* Identitas kop berkas Excel dibaca dari Data Induk, tidak lagi disalin ke
   kg_pengaturan. Tahun ajaran pun diambil dari tabel tahun_ajaran yang
   sedang aktif — satu sumber, sehingga kop semua aplikasi tidak bisa lagi
   berbeda tanpa ada yang menyadari. */
async function muatProfil() {
    state.profil = { ...PROFIL_BAWAAN };
    const [{ data: p, error: eP }, { data: ta }] = await Promise.all([
        // Seluruh kolom: kop juga memerlukan npsn, catatan kaki, dan tata letaknya.
        supabaseClient.from("v_penanda_tangan").select("*").limit(1),
        supabaseClient.from("tahun_ajaran").select("kode, aktif").eq("aktif", true).limit(1),
    ]);
    if (eP) { laporError("Profil dokumen tidak terbaca dari Data Induk (kop memakai nilai bawaan)", eP); return; }
    const d = (p || [])[0];
    if (!d) return;
    state.profil = {
        nama_sekolah: d.nama_sekolah || PROFIL_BAWAAN.nama_sekolah,
        alamat_sekolah: d.alamat || "",
        tempat: d.kota || PROFIL_BAWAAN.tempat,
        kepala_sekolah: d.kepala_sekolah || "",
        kurikulum: d.kurikulum || "",
        tahun_ajaran: ((ta || [])[0] || {}).kode || PROFIL_BAWAAN.tahun_ajaran,
        // Baris apa adanya, dipakai penulis kop untuk tata letaknya.
        profil: d,
    };
}

let sedangHitung = false, mintaHitungLagi = false;
async function hitungLagi() {
    if (sedangHitung) { mintaHitungLagi = true; return; }
    sedangHitung = true;
    try {
        do { mintaHitungLagi = false; await hitung(); } while (mintaHitungLagi);
    } finally { sedangHitung = false; }
}

async function hitung() {
    state.awal = document.getElementById("tglAwal").value;
    state.akhir = document.getElementById("tglAkhir").value;
    if (!state.awal || !state.akhir || state.awal > state.akhir) { laporError("Rentang tanggal tidak valid", { message: "Tanggal awal harus sebelum atau sama dengan tanggal akhir." }); return; }

    if (isSupabaseConfigured) {
        const { data: k, error: eK } = await supabaseClient.from("kg_ketidakhadiran_guru").select("id, jadwal_id, tanggal, guru_id, status").gte("tanggal", state.awal).lte("tanggal", state.akhir);
        if (eK) { laporError("Gagal memuat catatan ketidakhadiran", eK); return; }
        state.ketidakhadiran = k || [];
        const ids = state.ketidakhadiran.map((x) => x.id);
        let pen = [];
        for (let i = 0; i < ids.length; i += 200) { // batasi panjang query
            const { data, error } = await supabaseClient.from("kg_penugasan_pengganti").select("ketidakhadiran_id, guru_pengganti_id, status_pengganti").in("ketidakhadiran_id", ids.slice(i, i + 200));
            if (error) { laporError("Gagal memuat penugasan", error); return; }
            pen = pen.concat(data || []);
        }
        state.penugasan = pen;
        await muatPiket();
    } else {
        state.ketidakhadiran = demoKetidakhadiran.filter((x) => x.tanggal >= state.awal && x.tanggal <= state.akhir);
        state.penugasan = demoPenugasan;
        state.piket = [];
    }

    const liburSet = new Set(state.libur.map((l) => l.tanggal));
    const { mengajar, wali, ketMengajar, ketWali } = pisahWaliKelas(state.jadwal, state.ketidakhadiran);
    state.hasilKehadiran = rekapKehadiran({ jadwal: mengajar, ketidakhadiran: ketMengajar, awal: state.awal, akhir: state.akhir, liburSet });
    state.hasilWali = rekapWaliPerKomponen({ jadwal: wali, ketidakhadiran: ketWali, awal: state.awal, akhir: state.akhir, liburSet });
    // pengganti & honor: hanya jam mengajar; jam tugas wali kelas dihitung terpisah (belum ada tarifnya)
    const semuaPengganti = rekapPengganti({ penugasan: state.penugasan, ketidakhadiran: state.ketidakhadiran, jadwal: state.jadwal, awal: state.awal, akhir: state.akhir });
    state.hasilPengganti = rekapPengganti({ penugasan: state.penugasan, ketidakhadiran: ketMengajar, jadwal: mengajar, awal: state.awal, akhir: state.akhir });
    state.jamWaliDikecualikan = semuaPengganti.rincian.length - state.hasilPengganti.rincian.length;
    state.hasilPiket = rekapPiket();
    renderKehadiran(); renderPengganti(); renderPiket();
}

async function muatPiket() {
    const { data, error } = await supabaseClient.from("kg_pelaksanaan_piket")
        .select("tanggal, jenis, guru_id, tugas_id, status, pengganti_id")
        .gte("tanggal", state.awal).lte("tanggal", state.akhir);
    if (error) {
        laporError("Gagal memuat catatan pelaksanaan piket (tab Piket sementara kosong)", error);
        state.piket = []; return;
    }
    state.piket = data || [];
}

// ---------- Rekap pelaksanaan piket ----------
// Yang dihitung "jaga" adalah orang yang benar-benar berjaga hari itu: kalau
// petugas terjadwal digantikan, hari itu masuk ke penggantinya, dan petugas
// terjadwalnya tercatat absen — supaya yang terbaca benar-benar siapa yang
// menjalankan tugasnya. Nilai rupiahnya dihitung di Induk Pembiayaan, bukan
// di sini; halaman ini hanya melaporkan jumlah harinya.
const KUNCI_JENIS = { "Meja Sekolah": "meja", "Unit": "unit", "Parkiran": "parkiran" };

function rekapPiket() {
    const per = new Map();
    const baris = (id) => {
        if (!per.has(id)) per.set(id, { guru_id: id, meja: { jaga: 0, absen: 0 }, unit: { jaga: 0, absen: 0 }, parkiran: { jaga: 0, absen: 0 } });
        return per.get(id);
    };
    for (const c of state.piket) {
        const k = KUNCI_JENIS[c.jenis];
        if (!k) continue;
        if (c.status === "Hadir") baris(c.guru_id)[k].jaga += 1;
        else if (c.status === "Tidak Hadir") baris(c.guru_id)[k].absen += 1;
        else if (c.status === "Digantikan") {
            baris(c.guru_id)[k].absen += 1;
            if (c.pengganti_id) baris(c.pengganti_id)[k].jaga += 1;
        }
    }
    const rows = [...per.values()]
        .map((r) => ({ ...r, nama: namaGuru(r.guru_id) }))
        .sort(urutBaris);
    const total = { meja: { jaga: 0, absen: 0 }, unit: { jaga: 0, absen: 0 }, parkiran: { jaga: 0, absen: 0 } };
    for (const r of rows)
        for (const k of ["meja", "unit", "parkiran"]) { total[k].jaga += r[k].jaga; total[k].absen += r[k].absen; }
    return { baris: rows, total };
}

function renderPiket() {
    const h = state.hasilPiket; if (!h) return;
    const rows = h.baris;
    document.getElementById("kosongPiket").hidden = rows.length > 0;
    document.getElementById("bodyPiket").innerHTML = rows.map((r, i) => `
      <tr>
        <td class="num">${i + 1}</td><td class="nama">${r.nama}</td>
        ${num(r.meja.jaga)}${num(r.meja.absen)}${num(r.unit.jaga)}${num(r.unit.absen)}${num(r.parkiran.jaga)}${num(r.parkiran.absen)}
      </tr>`).join("");
    const t = h.total;
    document.getElementById("footPiket").innerHTML = rows.length ? `
      <tr class="total"><td></td><td>Total (${rows.length} petugas)</td>
        ${num(t.meja.jaga)}${num(t.meja.absen)}${num(t.unit.jaga)}${num(t.unit.absen)}${num(t.parkiran.jaga)}${num(t.parkiran.absen)}
      </tr>` : "";
    document.getElementById("ringkasPiket").textContent =
        `${tanggalPanjang(state.awal)} – ${tanggalPanjang(state.akhir)} · ${state.piket.length} catatan pelaksanaan`;
    document.getElementById("footPiketTeks").textContent =
        `"Jaga" dihitung per hari, termasuk hari saat yang bersangkutan menggantikan orang lain; `
        + `"Absen" adalah hari terjadwal yang tidak dijalankan sendiri. `
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
        <td class="nama">${r.nama}</td>${num(r.terjadwal)}${num(r.hadirTM)}${num(r.HTTM)}${num(r.ST)}${num(r.STT)}${num(r.IT)}${num(r.ITT)}${num(r.TK)}${num(fmt(r.hadir))}${persenCell(r.persen)}
      </tr>`).join("") || `<tr><td colspan="11" class="empty-state">Tidak ada data pada rentang ini.</td></tr>`;
    const t = h.total;
    document.getElementById("footKehadiran").innerHTML = `
      <tr class="total"><td>Total (${h.baris.length} guru)</td>${num(t.terjadwal)}${num(t.hadirTM)}${num(t.HTTM)}${num(t.ST)}${num(t.STT)}${num(t.IT)}${num(t.ITT)}${num(t.TK)}${num(fmt(t.hadir))}${persenCell(t.persen)}</tr>`;
    document.getElementById("ringkasKehadiran").textContent = `${h.jumlahHariKerja} hari kerja · ${tanggalPanjang(state.awal)} – ${tanggalPanjang(state.akhir)}`;
    renderWali();
}

function barisWaliTersaring() {
    const q = state.saringWali.trim().toLowerCase();
    return (state.hasilWali?.baris || []).map((r) => ({ ...r, nama: namaGuru(r.guru_id) }))
        .filter((r) => !q || r.nama.toLowerCase().includes(q));
}

/* Tabel tugas wali kelas, dikelompokkan per komponen.

   Upacara dan Bimbingan Wali Kelas ditampilkan sebagai kelompok terpisah,
   masing-masing dengan subtotalnya sendiri — karena tarif honornya berbeda,
   dan subtotal itulah satu-satunya angka yang boleh dikalikan tarif. Total
   keseluruhan tetap ada di kaki tabel, tetapi hanya untuk melihat beban
   tugasnya, bukan untuk dihitung uangnya. */
function renderWali() {
    const w = state.hasilWali; if (!w) return;
    const rows = barisWaliTersaring();
    const kolomAngka = (r) => num(r.terjadwal) + num(r.hadirTM) + num(r.HTTM) + num(r.ST)
        + num(r.STT) + num(r.IT) + num(r.ITT) + num(r.TK) + num(fmt(r.hadir)) + persenCell(r.persen);

    let html = "";
    for (const g of w.kelompok) {
        const isi = rows.filter((r) => r.komponen === g.kode).sort(urutBaris);
        if (!isi.length) continue;
        html += `<tr class="kel-komponen"><td colspan="12">${g.nama}</td></tr>`;
        html += isi.map((r) => `<tr><td class="nama">${r.nama}</td><td class="komponen-sel">${g.nama}</td>${kolomAngka(r)}</tr>`).join("");
        const s = g.total;
        html += `<tr class="subtotal"><td>Jumlah ${g.nama}</td><td>${isi.length} wali kelas</td>${kolomAngka(s)}</tr>`;
    }
    document.getElementById("bodyWali").innerHTML = html
      || `<tr><td colspan="12" class="empty-state">Tidak ada jam tugas wali kelas pada rentang ini.</td></tr>`;
    const t = w.total;
    document.getElementById("ringkasWali").textContent = `${w.jumlahHariKerja} hari kerja · ${tanggalPanjang(state.awal)} – ${tanggalPanjang(state.akhir)}`;
    document.getElementById("footWali").innerHTML =
      `<tr class="total"><td>Total seluruh tugas wali kelas</td><td></td>${kolomAngka(t)}</tr>`;
}

// ---------- Render pengganti ----------
function renderPengganti() {
    const h = state.hasilPengganti; if (!h) return;
    document.getElementById("tabelRingkas").hidden = state.viewPengganti !== "ringkas";
    document.getElementById("tabelRinci").hidden = state.viewPengganti !== "rinci";
    document.getElementById("bodyRingkas").innerHTML = h.baris.map((r) => `
      <tr><td class="nama">${namaGuru(r.guru_id)}</td>${num(r.GT)}${num(r.PT)}${num(r.Inf)}<td class="num"><strong>${r.total}</strong></td></tr>`).join("")
      || `<tr><td colspan="5" class="empty-state">Belum ada penugasan pada rentang ini.</td></tr>`;
    document.getElementById("footRingkas").innerHTML = `<tr class="total"><td>Total (${h.baris.length} guru pengganti)</td>${num(h.total.GT)}${num(h.total.PT)}${num(h.total.Inf)}<td class="num"><strong>${h.total.total}</strong></td></tr>`;
    document.getElementById("bodyRinci").innerHTML = h.rincian.map((r) => `
      <tr>
        <td>${r.tanggal}</td><td>Jam ke-${r.jam_ke}</td><td><span class="badge-kelas">${namaKelas(r.kelas_id)}</span></td><td class="nama">${namaMapel(r.mapel_id)}</td>
        <td class="nama">${namaGuru(r.guru_id)}</td><td><span class="badge-status badge-${r.status.toLowerCase()}">${r.status}</span></td>
        <td class="nama">${r.pengganti_id ? namaGuru(r.pengganti_id) : "—"}</td><td><span class="badge-tugas badge-${r.kode.toLowerCase()}">${r.kode}</span></td>
      </tr>`).join("") || `<tr><td colspan="8" class="empty-state">Belum ada penugasan pada rentang ini.</td></tr>`;
    document.getElementById("ringkasPengganti").textContent = `${h.total.total} jam digantikan · ${h.tanpaPengganti} jam tanpa pengganti (TP)` + (state.jamWaliDikecualikan ? ` · ${state.jamWaliDikecualikan} jam tugas wali kelas tidak termasuk` : "");
    document.getElementById("footPengganti").textContent = `GT = Guru diTugaskan · PT = Piket diTugaskan · Inf = Infaler · TP = Tidak Perlu Pengganti (tidak masuk hitungan per guru).`;
}

// ---------- Hari libur ----------
function renderLibur() {
    const unlocked = isUnlocked();
    document.getElementById("liburTambah").disabled = !unlocked;
    document.getElementById("bodyLibur").innerHTML = [...state.libur].sort((a, b) => a.tanggal.localeCompare(b.tanggal)).map((l) => `
      <tr><td>${l.tanggal}</td><td>${HARI_FROM_JS_DAY[new Date(l.tanggal + "T00:00:00").getDay()]}</td><td>${l.keterangan || ""}</td>
      <td><button class="btn-danger-text" ${unlocked ? "" : "disabled"} data-hapus="${l.tanggal}">Hapus</button></td></tr>`).join("")
      || `<tr><td colspan="4" class="empty-state">Belum ada hari libur tercatat.</td></tr>`;
    document.querySelectorAll("[data-hapus]").forEach((b) => b.addEventListener("click", () => hapusLibur(b.dataset.hapus)));
}

async function tambahLibur() {
    const tanggal = document.getElementById("liburTanggal").value;
    const keterangan = document.getElementById("liburKeterangan").value || null;
    if (!tanggal) return;
    if (isSupabaseConfigured) {
        const { error } = await supabaseClient.from("kg_hari_libur").upsert({ tanggal, keterangan }, { onConflict: "tanggal" });
        if (error) { laporError("Gagal menyimpan hari libur", error); return; }
        await muatLibur();
    } else {
        const i = demoLibur.findIndex((l) => l.tanggal === tanggal);
        if (i > -1) demoLibur[i].keterangan = keterangan; else demoLibur.push({ tanggal, keterangan });
    }
    document.getElementById("liburKeterangan").value = "";
    renderLibur(); await hitungLagi();
}

async function hapusLibur(tanggal) {
    if (isSupabaseConfigured) {
        const { error } = await supabaseClient.from("kg_hari_libur").delete().eq("tanggal", tanggal);
        if (error) { laporError("Gagal menghapus hari libur", error); return; }
        await muatLibur();
    } else {
        const i = demoLibur.findIndex((l) => l.tanggal === tanggal); if (i > -1) demoLibur.splice(i, 1);
    }
    renderLibur(); await hitungLagi();
}

// ---------- Honor ----------
let logoCache = null;
async function logo() { if (logoCache === null) logoCache = (await ambilLogoBase64("assets/logo-kecil.png")) || false; return logoCache || null; }
const ExcelJSLib = () => { if (!window.ExcelJS) throw new Error("Pustaka ExcelJS belum termuat (periksa koneksi internet), coba muat ulang halaman."); return window.ExcelJS; };
const bungkus = (fn) => async () => { try { await fn(); } catch (err) { laporError("Gagal membuat file Excel", err); } };

const xlsKehadiran = bungkus(async () => {
    const h = state.hasilKehadiran; if (!h) return;
    const wb = await bukuKehadiran({ ExcelJS: ExcelJSLib(), baris: barisKehadiranTersaring(), total: h.total, wali: null, pengaturan: state.profil, awal: state.awal, akhir: state.akhir, jumlahHariKerja: h.jumlahHariKerja, bobot: BOBOT_HADIR, logoBase64: await logo() });
    await unduhWorkbook(wb, `Rekap Kehadiran Guru ${state.awal} sd ${state.akhir}.xlsx`);
});
const xlsWali = bungkus(async () => {
    const w = state.hasilWali; if (!w) return;
    const rows = barisWaliTersaring();
    // Berkasnya mengikuti pemecahan yang sama dengan layarnya: satu bagian
    // per komponen, masing-masing dengan jumlahnya sendiri, karena tarif
    // Upacara berbeda dari tarif Bimbingan Wali Kelas.
    const perKomponen = w.kelompok.map((g) => ({
        nama: g.nama,
        baris: rows.filter((r) => r.komponen === g.kode).sort(urutBaris),
        total: g.total,
    }));
    const wb = await bukuKehadiran({ ExcelJS: ExcelJSLib(), baris: rows, total: w.total, wali: null, perKomponen, judul: "REKAPITULASI KEHADIRAN TUGAS WALI KELAS", namaSheet: "Tugas Wali Kelas", catatan: "Upacara & Bimbingan Wali Kelas, Senin jam 1-2 (terpisah dari jam mengajar). Tarif honor keduanya berbeda, jadi jumlahnya dipisah.", pengaturan: state.profil, awal: state.awal, akhir: state.akhir, jumlahHariKerja: w.jumlahHariKerja, bobot: BOBOT_HADIR, logoBase64: await logo() });
    await unduhWorkbook(wb, `Rekap Tugas Wali Kelas ${state.awal} sd ${state.akhir}.xlsx`);
});
const xlsPengganti = bungkus(async () => {
    const h = state.hasilPengganti; if (!h) return;
    const wb = await bukuPengganti({ ExcelJS: ExcelJSLib(),
        ringkas: h.baris.map((r) => ({ nama: namaGuru(r.guru_id), GT: r.GT, PT: r.PT, Inf: r.Inf, total: r.total })),
        rincian: h.rincian.map((r) => ({ tanggal: r.tanggal, jam_ke: r.jam_ke, kelas: namaKelas(r.kelas_id), mapel: namaMapel(r.mapel_id), guru: namaGuru(r.guru_id), status: r.status, pengganti: r.pengganti_id ? namaGuru(r.pengganti_id) : "", kode: r.kode })),
        tanpaPengganti: h.tanpaPengganti, pengaturan: state.profil, awal: state.awal, akhir: state.akhir, logoBase64: await logo() });
    await unduhWorkbook(wb, `Rekap Guru Pengganti ${state.awal} sd ${state.akhir}.xlsx`);
});
const xlsPiket = bungkus(async () => {
    const h = state.hasilPiket; if (!h) return;
    const wb = await bukuPiket({ ExcelJS: ExcelJSLib(), baris: h.baris, total: h.total,
        pengaturan: state.profil, awal: state.awal, akhir: state.akhir, logoBase64: await logo() });
    await unduhWorkbook(wb, `Rekap Pelaksanaan Piket ${state.awal} sd ${state.akhir}.xlsx`);
});

// ---------- Wiring ----------
try {
    /* Tidak ada lagi tombol Hitung: rekap dihitung ulang begitu rentang
       tanggalnya berubah. Peristiwa "change" dipakai, bukan "input", supaya
       perhitungan baru berjalan setelah tanggalnya selesai dipilih — bukan
       pada tiap ketukan angka.

       Penjaga sedangHitung mencegah dua perhitungan berjalan bersamaan:
       keduanya menulis ke state yang sama, dan yang lebih dulu selesai bisa
       menimpa hasil yang lebih baru sehingga tabel menampilkan rentang
       tanggal yang sudah tidak dipilih lagi. */
    for (const id of ["tglAwal", "tglAkhir"])
        document.getElementById(id).addEventListener("change", hitungLagi);
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
    document.getElementById("liburTambah").addEventListener("click", tambahLibur);
} catch (err) {
    console.error("Ada elemen halaman yang tidak ditemukan — kemungkinan HTML dan JS beda versi. Lakukan hard refresh (Ctrl+Shift+R).", err);
}

boot().catch((err) => console.error("Gagal memuat data halaman:", err));
