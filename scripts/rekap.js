import { supabaseClient, isSupabaseConfigured } from "../assets/supabase-client.js?v=20260914h";
import { demoData, demoKetidakhadiran, demoPenugasan } from "../assets/demo-data.js?v=20260914h";
import { isUnlocked, initLockUI } from "../assets/auth-gate.js?v=20260914h";
import { urutkanKelas } from "../assets/kelas-order.js?v=20260914h";
import { rekapKehadiran, rekapPengganti, isoTanggal, BOBOT_HADIR, pisahWaliKelas } from "../assets/rekap-hitung.js?v=20260914h";
import { bukuHonor, bukuKehadiran, bukuPengganti, unduhWorkbook, ambilLogoBase64, terbilang } from "../assets/excel-export.js?v=20260914h";
import { tanggalPanjang } from "../assets/bagikan-wa.js?v=20260914h";

try { initLockUI(() => { renderLibur(); renderPengaturan(); }); } catch (err) { console.error("Gagal memasang tombol kunci:", err); }

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
    saring: "", viewPengganti: "ringkas",
    pengaturan: null,
};

const PENGATURAN_DEFAULT = {
    tarif_PT: "6000", tarif_GT: "9000", tarif_Inf: "12000",
    nama_sekolah: 'SMA Plus "Merdeka" Soreang', alamat_sekolah: "Jl. Citaliktik-Sindang Wargi Soreang Kab. Bandung",
    tahun_ajaran: "2026/2027", tempat: "Soreang", kepala_sekolah: "", bendahara: "",
};
const FIELD_PENGATURAN = { tarif_PT: "pTarifPT", tarif_GT: "pTarifGT", tarif_Inf: "pTarifInf", nama_sekolah: "pNamaSekolah", alamat_sekolah: "pAlamat", tahun_ajaran: "pTahunAjaran", tempat: "pTempat", kepala_sekolah: "pKepsek", bendahara: "pBendahara" };
const demoPengaturan = { ...PENGATURAN_DEFAULT, kepala_sekolah: "Mohamad Gunawan, S.Si.", bendahara: "Dra. Ida Susana" };
const tarif = () => ({ PT: Number(state.pengaturan.tarif_PT) || 0, GT: Number(state.pengaturan.tarif_GT) || 0, Inf: Number(state.pengaturan.tarif_Inf) || 0 });

const namaGuru = (id) => state.guru.find((g) => g.id === id)?.nama || id;
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
            supabaseClient.from("kg_guru").select("id, nama").order("nama"),
            supabaseClient.from("kg_kelas").select("id, nama_kelas, tingkat"),
            supabaseClient.from("kg_mapel").select("id, nama_mapel"),
            supabaseClient.from("kg_jadwal_kbm").select("id, hari, jam_ke, kelas_id, mapel_id, guru_id"),
        ]);
        if (eJ) { laporError("Gagal memuat jadwal", eJ); return; }
        state.guru = guru || []; state.kelas = urutkanKelas(kelas || []); state.mapel = mapel || []; state.jadwal = jadwal || [];
        await muatLibur();
        await muatPengaturan();
    } else {
        state.guru = demoData.guru; state.kelas = urutkanKelas(demoData.kelas); state.mapel = demoData.mapel; state.jadwal = demoData.jadwal;
        state.libur = demoLibur; state.pengaturan = { ...demoPengaturan };
    }
    renderLibur(); renderPengaturan();
    await hitung();
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

async function muatPengaturan() {
    state.pengaturan = { ...PENGATURAN_DEFAULT };
    const { data, error } = await supabaseClient.from("kg_pengaturan").select("kunci, nilai");
    if (error) { laporError("Tabel kg_pengaturan belum ada — jalankan migrasi_pengaturan.sql (sementara memakai tarif & identitas bawaan)", error); return; }
    for (const r of data || []) state.pengaturan[r.kunci] = r.nilai;
}

function renderPengaturan() {
    if (!state.pengaturan) return;
    for (const [k, id] of Object.entries(FIELD_PENGATURAN)) document.getElementById(id).value = state.pengaturan[k] ?? "";
    const unlocked = isUnlocked();
    for (const id of Object.values(FIELD_PENGATURAN)) document.getElementById(id).disabled = !unlocked;
    document.getElementById("pengaturanSimpan").disabled = !unlocked;
    document.getElementById("pengaturanStatus").textContent = unlocked ? "" : "Buka kunci untuk mengubah.";
}

async function simpanPengaturan() {
    const baru = {};
    for (const [k, id] of Object.entries(FIELD_PENGATURAN)) baru[k] = document.getElementById(id).value.trim();
    if (isSupabaseConfigured) {
        const rows = Object.entries(baru).map(([kunci, nilai]) => ({ kunci, nilai }));
        const { error } = await supabaseClient.from("kg_pengaturan").upsert(rows, { onConflict: "kunci" });
        if (error) { laporError("Gagal menyimpan pengaturan", error); return; }
    }
    state.pengaturan = { ...state.pengaturan, ...baru };
    document.getElementById("pengaturanStatus").textContent = "Tersimpan ✓";
    setTimeout(() => (document.getElementById("pengaturanStatus").textContent = ""), 2000);
    renderHonor();
}

// ---------- Hitung ----------
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
    } else {
        state.ketidakhadiran = demoKetidakhadiran.filter((x) => x.tanggal >= state.awal && x.tanggal <= state.akhir);
        state.penugasan = demoPenugasan;
    }

    const liburSet = new Set(state.libur.map((l) => l.tanggal));
    const { mengajar, wali, ketMengajar, ketWali } = pisahWaliKelas(state.jadwal, state.ketidakhadiran);
    state.hasilKehadiran = rekapKehadiran({ jadwal: mengajar, ketidakhadiran: ketMengajar, awal: state.awal, akhir: state.akhir, liburSet });
    state.hasilWali = rekapKehadiran({ jadwal: wali, ketidakhadiran: ketWali, awal: state.awal, akhir: state.akhir, liburSet });
    // pengganti & honor: hanya jam mengajar; jam tugas wali kelas dihitung terpisah (belum ada tarifnya)
    const semuaPengganti = rekapPengganti({ penugasan: state.penugasan, ketidakhadiran: state.ketidakhadiran, jadwal: state.jadwal, awal: state.awal, akhir: state.akhir });
    state.hasilPengganti = rekapPengganti({ penugasan: state.penugasan, ketidakhadiran: ketMengajar, jadwal: mengajar, awal: state.awal, akhir: state.akhir });
    state.jamWaliDikecualikan = semuaPengganti.rincian.length - state.hasilPengganti.rincian.length;
    renderKehadiran(); renderPengganti(); renderHonor();
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
        .sort((a, b) => a.nama.localeCompare(b.nama));
}

function renderKehadiran() {
    const h = state.hasilKehadiran; if (!h) return;
    const rows = barisKehadiranTersaring();
    document.getElementById("bodyKehadiran").innerHTML = rows.map((r) => `
      <tr>
        <td>${r.nama}</td>${num(r.terjadwal)}${num(r.hadirTM)}${num(r.HTTM)}${num(r.ST)}${num(r.STT)}${num(r.IT)}${num(r.ITT)}${num(r.TK)}${num(fmt(r.hadir))}${persenCell(r.persen)}
      </tr>`).join("") || `<tr><td colspan="11" class="empty-state">Tidak ada data pada rentang ini.</td></tr>`;
    const t = h.total;
    document.getElementById("footKehadiran").innerHTML = `
      <tr class="total"><td>Total (${h.baris.length} guru)</td>${num(t.terjadwal)}${num(t.hadirTM)}${num(t.HTTM)}${num(t.ST)}${num(t.STT)}${num(t.IT)}${num(t.ITT)}${num(t.TK)}${num(fmt(t.hadir))}${persenCell(t.persen)}</tr>`;
    document.getElementById("ringkasKehadiran").textContent = `${h.jumlahHariKerja} hari kerja · ${tanggalPanjang(state.awal)} – ${tanggalPanjang(state.akhir)}`;
    renderWali();
}

function barisWaliTersaring() {
    const q = state.saring.trim().toLowerCase();
    return (state.hasilWali?.baris || []).map((r) => ({ ...r, nama: namaGuru(r.guru_id) }))
        .filter((r) => !q || r.nama.toLowerCase().includes(q)).sort((a, b) => a.nama.localeCompare(b.nama));
}

function renderWali() {
    const w = state.hasilWali; if (!w) return;
    const rows = barisWaliTersaring();
    document.getElementById("bodyWali").innerHTML = rows.map((r) => `
      <tr><td>${r.nama}</td>${num(r.terjadwal)}${num(r.hadirTM)}${num(r.HTTM)}${num(r.ST)}${num(r.STT)}${num(r.IT)}${num(r.ITT)}${num(r.TK)}${num(fmt(r.hadir))}${persenCell(r.persen)}</tr>`).join("")
      || `<tr><td colspan="11" class="empty-state">Tidak ada jam tugas wali kelas pada rentang ini.</td></tr>`;
    const t = w.total;
    document.getElementById("footWali").innerHTML = `<tr class="total"><td>Total (${w.baris.length} wali kelas)</td>${num(t.terjadwal)}${num(t.hadirTM)}${num(t.HTTM)}${num(t.ST)}${num(t.STT)}${num(t.IT)}${num(t.ITT)}${num(t.TK)}${num(fmt(t.hadir))}${persenCell(t.persen)}</tr>`;
}

// ---------- Render pengganti ----------
function renderPengganti() {
    const h = state.hasilPengganti; if (!h) return;
    document.getElementById("tabelRingkas").hidden = state.viewPengganti !== "ringkas";
    document.getElementById("tabelRinci").hidden = state.viewPengganti !== "rinci";
    document.getElementById("bodyRingkas").innerHTML = h.baris.map((r) => `
      <tr><td>${namaGuru(r.guru_id)}</td>${num(r.GT)}${num(r.PT)}${num(r.Inf)}<td class="num"><strong>${r.total}</strong></td></tr>`).join("")
      || `<tr><td colspan="5" class="empty-state">Belum ada penugasan pada rentang ini.</td></tr>`;
    document.getElementById("footRingkas").innerHTML = `<tr class="total"><td>Total (${h.baris.length} guru pengganti)</td>${num(h.total.GT)}${num(h.total.PT)}${num(h.total.Inf)}<td class="num"><strong>${h.total.total}</strong></td></tr>`;
    document.getElementById("bodyRinci").innerHTML = h.rincian.map((r) => `
      <tr>
        <td>${r.tanggal}</td><td>Jam ke-${r.jam_ke}</td><td><span class="badge-kelas">${namaKelas(r.kelas_id)}</span></td><td>${namaMapel(r.mapel_id)}</td>
        <td>${namaGuru(r.guru_id)}</td><td><span class="badge-status badge-${r.status.toLowerCase()}">${r.status}</span></td>
        <td>${r.pengganti_id ? namaGuru(r.pengganti_id) : "—"}</td><td><span class="badge-tugas badge-${r.kode.toLowerCase()}">${r.kode}</span></td>
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
    renderLibur(); await hitung();
}

async function hapusLibur(tanggal) {
    if (isSupabaseConfigured) {
        const { error } = await supabaseClient.from("kg_hari_libur").delete().eq("tanggal", tanggal);
        if (error) { laporError("Gagal menghapus hari libur", error); return; }
        await muatLibur();
    } else {
        const i = demoLibur.findIndex((l) => l.tanggal === tanggal); if (i > -1) demoLibur.splice(i, 1);
    }
    renderLibur(); await hitung();
}

// ---------- Honor ----------
const rp = (v) => "Rp " + Math.round(v).toLocaleString("id-ID");

function barisHonor() {
    const h = state.hasilPengganti; if (!h) return [];
    return h.baris.map((r) => ({ nama: namaGuru(r.guru_id), PT: r.PT, GT: r.GT, Inf: r.Inf }))
        .sort((a, b) => a.nama.localeCompare(b.nama));
}

function renderHonor() {
    if (!state.hasilPengganti || !state.pengaturan) return;
    const t = tarif(); const rows = barisHonor();
    let tot = { PT: 0, GT: 0, Inf: 0, jumlah: 0 };
    document.getElementById("bodyHonor").innerHTML = rows.map((b, i) => {
        const jumlah = b.PT * t.PT + b.GT * t.GT + b.Inf * t.Inf;
        tot.PT += b.PT; tot.GT += b.GT; tot.Inf += b.Inf; tot.jumlah += jumlah;
        return `<tr><td class="num">${i + 1}</td><td>${b.nama}</td>${num(b.PT)}${num(rp(t.PT))}${num(b.GT)}${num(rp(t.GT))}${num(b.Inf)}${num(rp(t.Inf))}<td class="num"><strong>${rp(jumlah)}</strong></td></tr>`;
    }).join("") || `<tr><td colspan="9" class="empty-state">Belum ada penugasan pada rentang ini.</td></tr>`;
    document.getElementById("footHonor").innerHTML = `<tr class="total"><td colspan="2">JUMLAH (${rows.length} guru)</td>${num(tot.PT)}${num(rp(tot.PT * t.PT))}${num(tot.GT)}${num(rp(tot.GT * t.GT))}${num(tot.Inf)}${num(rp(tot.Inf * t.Inf))}<td class="num"><strong>${rp(tot.jumlah)}</strong></td></tr>`;
    document.getElementById("ringkasHonor").textContent = `${tanggalPanjang(state.awal)} – ${tanggalPanjang(state.akhir)} · tarif PT ${rp(t.PT)} · GT ${rp(t.GT)} · Inf ${rp(t.Inf)} per jam`;
    document.getElementById("footHonorTeks").textContent = `Terbilang: ${terbilang(tot.jumlah)}. Tarif diubah di tab Pengaturan.` + (state.jamWaliDikecualikan ? ` Penggantian tugas wali kelas (Upacara/Bimbingan) sebanyak ${state.jamWaliDikecualikan} jam tidak termasuk — honornya dihitung terpisah.` : "");
}

// ---------- Ekspor Excel ----------
let logoCache = null;
async function logo() { if (logoCache === null) logoCache = (await ambilLogoBase64("assets/logo-kecil.png")) || false; return logoCache || null; }
const ExcelJSLib = () => { if (!window.ExcelJS) throw new Error("Pustaka ExcelJS belum termuat (periksa koneksi internet), coba muat ulang halaman."); return window.ExcelJS; };
const bungkus = (fn) => async () => { try { await fn(); } catch (err) { laporError("Gagal membuat file Excel", err); } };

const xlsKehadiran = bungkus(async () => {
    const h = state.hasilKehadiran; if (!h) return;
    const wb = await bukuKehadiran({ ExcelJS: ExcelJSLib(), baris: barisKehadiranTersaring(), total: h.total, wali: { baris: barisWaliTersaring(), total: state.hasilWali.total }, pengaturan: state.pengaturan, awal: state.awal, akhir: state.akhir, jumlahHariKerja: h.jumlahHariKerja, bobot: BOBOT_HADIR, logoBase64: await logo() });
    await unduhWorkbook(wb, `Rekap Kehadiran Guru ${state.awal} sd ${state.akhir}.xlsx`);
});
const xlsPengganti = bungkus(async () => {
    const h = state.hasilPengganti; if (!h) return;
    const wb = await bukuPengganti({ ExcelJS: ExcelJSLib(),
        ringkas: h.baris.map((r) => ({ nama: namaGuru(r.guru_id), GT: r.GT, PT: r.PT, Inf: r.Inf, total: r.total })),
        rincian: h.rincian.map((r) => ({ tanggal: r.tanggal, jam_ke: r.jam_ke, kelas: namaKelas(r.kelas_id), mapel: namaMapel(r.mapel_id), guru: namaGuru(r.guru_id), status: r.status, pengganti: r.pengganti_id ? namaGuru(r.pengganti_id) : "", kode: r.kode })),
        tanpaPengganti: h.tanpaPengganti, pengaturan: state.pengaturan, awal: state.awal, akhir: state.akhir, logoBase64: await logo() });
    await unduhWorkbook(wb, `Rekap Guru Pengganti ${state.awal} sd ${state.akhir}.xlsx`);
});
const xlsHonor = bungkus(async () => {
    if (!state.hasilPengganti) return;
    const wb = await bukuHonor({ ExcelJS: ExcelJSLib(), baris: barisHonor(), tarif: tarif(), pengaturan: state.pengaturan, awal: state.awal, akhir: state.akhir, logoBase64: await logo() });
    await unduhWorkbook(wb, `Honor Guru Pengganti ${state.awal} sd ${state.akhir}.xlsx`);
});

// ---------- Wiring ----------
try {
    document.getElementById("rekapBtn").addEventListener("click", hitung);
    document.querySelectorAll(".rekap-tab").forEach((b) => b.addEventListener("click", () => {
        document.querySelectorAll(".rekap-tab").forEach((x) => x.classList.toggle("active", x === b));
        for (const t of ["kehadiran", "pengganti", "honor", "libur", "pengaturan"]) document.getElementById("tab-" + t).hidden = b.dataset.tab !== t;
    }));
    document.querySelectorAll("#tab-pengganti .day-tabs button").forEach((b) => b.addEventListener("click", () => {
        state.viewPengganti = b.dataset.view;
        document.querySelectorAll("#tab-pengganti .day-tabs button").forEach((x) => x.classList.toggle("active", x === b));
        renderPengganti();
    }));
    document.getElementById("cariKehadiran").addEventListener("input", (e) => { state.saring = e.target.value; renderKehadiran(); });
    document.getElementById("xlsKehadiran").addEventListener("click", xlsKehadiran);
    document.getElementById("xlsPengganti").addEventListener("click", xlsPengganti);
    document.getElementById("xlsHonor").addEventListener("click", xlsHonor);
    document.getElementById("pengaturanSimpan").addEventListener("click", simpanPengaturan);
    document.getElementById("liburTambah").addEventListener("click", tambahLibur);
} catch (err) {
    console.error("Ada elemen halaman yang tidak ditemukan — kemungkinan HTML dan JS beda versi. Lakukan hard refresh (Ctrl+Shift+R).", err);
}

boot().catch((err) => console.error("Gagal memuat data halaman:", err));
