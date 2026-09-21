// =========================================================
// Pelaksanaan Piket — Guru Pengganti SMA Plus Merdeka Soreang
// =========================================================
// Halaman ini hanya mencatat PELAKSANAAN. Penugasannya ada di tempat lain:
//   Meja Sekolah : tabel piket (Data Induk → Piket & Honor)
//   Unit         : piket_unit + guru_tugas "Diperbantukan" (Data Induk)
//   Parkiran     : tabel piket_parkiran (Data Induk → Piket & Honor)
// Semua catatan masuk ke satu tabel kg_pelaksanaan_piket dengan pembeda
// kolom `jenis`, karena bentuk datanya sama: satu petugas, satu tanggal,
// hadir atau tidak.
//
// Bentuk layarnya sengaja dibuat sama dengan matriks jadwal piket di Data
// Induk — orang yang sama memakai kedua halaman itu, dan dulu keduanya
// menampilkan hal yang sama dengan dua bentuk berbeda: di sana matriks
// berpita nama, di sini tabel berisi kotak pilihan. Sekarang keduanya
// matriks, dan yang berbeda hanya artinya: di Data Induk pita berarti
// "terjadwal", di sini warnanya berarti "hadir atau tidak".
//
// Sumbu matriksnya:
//   Meja & Unit : baris = tanggal, kolom = jam pelajaran
//   Parkiran    : baris = pekan,   kolom = Senin–Jumat  (parkiran per hari,
//                 bukan per jam, jadi kolom jam tidak ada artinya di situ)

import { supabaseClient, isSupabaseConfigured } from "../assets/supabase-client.js?v=20260920w";
import { demoData } from "../assets/demo-data.js?v=20260920w";
import { isUnlocked, initLockUI } from "../assets/auth-gate.js?v=20260920w";
import { terapkanUrutan, peringkatGuru } from "../assets/guru-order.js?v=20260920w";

try {
    initLockUI(() => render());
} catch (err) {
    console.error("Gagal memasang tombol kunci:", err);
}

function laporError(konteks, error) {
    console.error(konteks, error);
    let box = document.getElementById("errorBanner");
    if (!box) {
        box = document.createElement("div");
        box.id = "errorBanner";
        box.className = "error-banner";
        const main = document.querySelector("main");
        main.insertBefore(box, main.firstChild);
    }
    const detail = error?.message || error?.details || String(error);
    box.innerHTML = `<strong>${konteks}</strong><br>${detail}<button type="button" class="error-close" aria-label="Tutup">×</button>`;
    box.querySelector(".error-close").addEventListener("click", () => box.remove());
}

const HARI_LIST = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"];
const HARI_FROM_JS_DAY = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const HARI_PENDEK = { Senin: "Sen", Selasa: "Sel", Rabu: "Rab", Kamis: "Kam", Jumat: "Jum" };
const JENIS = { meja: "Meja Sekolah", unit: "Unit", parkiran: "Parkiran" };
const BULAN_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
                  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/* Batas jumlah hari kerja yang digambar sekaligus. Bukan aturan sekolah,
   hanya penjaga: rentang setahun berarti ribuan pita di satu tabel, dan
   halaman yang macet lebih merepotkan daripada rentang yang dipersempit. */
const MAKS_HARI = 200;

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const jam5 = (t) => String(t || "").slice(0, 5);

function todayISO() {
    return isoDari(new Date());
}
function isoDari(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function tglIndo(iso) {
    const d = new Date(iso + "T00:00:00");
    return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}
function tglPendek(iso) {
    const d = new Date(iso + "T00:00:00");
    return `${d.getDate()} ${BULAN_PENDEK[d.getMonth()]}`;
}

// "Dra. Siti Aminah, M.Pd." -> "Siti Aminah" — sel matriks sempit, nama lengkap ada di tooltip.
function namaPendek(nama) {
    let n = String(nama || "").split(",")[0];
    n = n.replace(/^((dra?s?|dr|h|hj|ir|prof|kh|ust|ustadz|ustadzah)\.?\s+)+/i, "").trim();
    const kata = n.split(/\s+/);
    return kata.length > 2 ? kata.slice(0, 2).join(" ") : n;
}

// "jam ke-1, 2, 3" ditulis "1–3" bila berurutan, supaya keterangannya pendek.
function ringkasJam(jam) {
    const urut = [...new Set(jam)].sort((a, b) => a - b);
    if (!urut.length) return "";
    if (urut.length > 1 && urut[urut.length - 1] - urut[0] === urut.length - 1)
        return `${urut[0]}–${urut[urut.length - 1]}`;
    return urut.join(", ");
}

let state = {
    // Bawaannya hari ini, awal dan akhir sama — sehari, seperti sebelumnya.
    // Mode pratinjau memakai tanggal contoh karena data contohnya hanya Senin.
    awal: isSupabaseConfigured ? todayISO() : "2026-09-14",
    akhir: isSupabaseConfigured ? todayISO() : "2026-09-14",
    tab: "meja",
    guru: [],
    jam: [],              // jam pelajaran, untuk kolom matriks
    jadwalMeja: [],       // kg_piket: { guru_id, hari, jam_ke }
    jadwalUnit: [],       // v_jadwal_piket_unit: { tugas_id, guru_id, guru, unit, hari, jam_ke }
    tugasUnit: [],        // v_guru_unit: penugasan unit + masa berlakunya
    parkiran: [],         // v_piket_parkiran: { hari, guru_id, nama, catatan }
    catatan: [],          // kg_pelaksanaan_piket dalam rentang
    libur: new Map(),     // tanggal -> keterangan
    hari: [],             // [{ iso, hari }] hari kerja dalam rentang
};

const namaGuru = (id) => state.guru.find((g) => g.id === id)?.nama || id;

// Satu baris catatan dikenali dari tanggal + jenis + petugas + unit.
// tugas_id hanya dipakai jenis Unit; di luar itu selalu null.
function cariCatatan(tanggal, jenis, guruId, tugasId = null) {
    return state.catatan.find((c) => c.tanggal === tanggal && c.jenis === jenis
        && c.guru_id === guruId && (c.tugas_id ?? null) === (tugasId ?? null));
}

// Seluruh catatan satu jenis dalam rentang yang sedang dibuka. Sengaja
// dihitung dari state.catatan, bukan dari pita yang tampil: bila jadwal
// piketnya diubah SESUDAH pelaksanaannya dicatat, catatan petugas lama
// tetap ada di database walau namanya tidak lagi muncul di matriks. Kalau
// dihitung dari matriks, catatan itu tertinggal dan diam-diam ikut
// terhitung di Induk Pembiayaan.
const catatanJenis = (tab) => state.catatan.filter((c) => c.jenis === JENIS[tab]);

// ---------- Boot ----------
async function boot() {
    document.getElementById("notice").hidden = isSupabaseConfigured;

    if (isSupabaseConfigured) {
        const [guru, jam] = await Promise.all([
            terapkanUrutan(supabaseClient.from("v_guru").select("id, nama, status_aktif, tmt_sekolah")),
            supabaseClient.from("kg_jam_pelajaran").select("jam_ke, mulai, selesai, keterangan").order("jam_ke"),
        ]);
        if (guru.error) { laporError("Gagal memuat data guru", guru.error); return; }
        state.guru = guru.data || [];
        state.jam = jam.data || [];
    } else {
        state.guru = demoData.guru.map((g) => ({ ...g, status_aktif: "Aktif" }));
        state.jam = demoData.jam || [];
    }

    const awal = document.getElementById("tglAwal");
    const akhir = document.getElementById("tglAkhir");
    awal.value = state.awal;
    akhir.value = state.akhir;
    for (const el of [awal, akhir]) {
        el.addEventListener("change", async () => {
            state.awal = awal.value;
            state.akhir = akhir.value;
            await muatRentang();
        });
    }

    document.querySelectorAll(".rekap-tab").forEach((b) => b.addEventListener("click", () => {
        state.tab = b.dataset.tab;
        document.querySelectorAll(".rekap-tab").forEach((x) => x.classList.toggle("active", x === b));
        for (const t of ["meja", "unit", "parkiran"]) document.getElementById("tab-" + t).hidden = b.dataset.tab !== t;
        render();
    }));

    for (const tab of ["meja", "unit", "parkiran"]) {
        document.getElementById(idSimpan(tab)).addEventListener("click", () => simpanBelumTercatat(tab));
        document.getElementById(idBatal(tab)).addEventListener("click", () => batalkanSemua(tab));
    }

    pasangModal();
    await muatRentang();
}

/* Hari kerja dalam rentang. Sabtu dan Minggu dibuang di sini, bukan di
   tempat menggambar: tidak ada piket pada kedua hari itu, dan roster
   parkiran pun hanya mengenal Senin–Jumat. */
function hariKerja(awal, akhir) {
    const out = [];
    const d = new Date(awal + "T00:00:00");
    const batas = new Date(akhir + "T00:00:00");
    while (d <= batas && out.length < MAKS_HARI) {
        const hari = HARI_FROM_JS_DAY[d.getDay()];
        if (HARI_LIST.includes(hari)) out.push({ iso: isoDari(d), hari });
        d.setDate(d.getDate() + 1);
    }
    return out;
}

async function muatRentang() {
    const card = document.getElementById("mainCard");
    const pesan = document.getElementById("pesanRentang");
    const liburBox = document.getElementById("liburNotice");
    const label = document.getElementById("rentangLabel");

    const tampilkanPesan = (teks) => {
        pesan.textContent = teks;
        pesan.hidden = false;
        liburBox.hidden = true;
        card.hidden = true;
        state.hari = [];
    };

    if (!state.awal || !state.akhir) { tampilkanPesan("Pilih tanggal mulai dan tanggal akhir."); label.textContent = "—"; return; }
    if (state.akhir < state.awal) {
        label.textContent = "—";
        tampilkanPesan("Tanggal akhir lebih awal daripada tanggal mulai. Tukar keduanya dahulu.");
        return;
    }

    state.hari = hariKerja(state.awal, state.akhir);
    label.textContent = state.hari.length === 1
        ? HARI_PENDEK[state.hari[0].hari] + ", " + tglPendek(state.hari[0].iso)
        : `${state.hari.length} hari kerja`;

    if (!state.hari.length) {
        tampilkanPesan("Tidak ada hari kerja dalam rentang ini. Piket hanya Senin–Jumat.");
        return;
    }
    if (state.hari.length >= MAKS_HARI) {
        tampilkanPesan(`Rentangnya terlalu panjang — baru ${MAKS_HARI} hari kerja pertama yang bisa digambar sekaligus. `
            + "Persempit rentangnya, misalnya satu bulan.");
        return;
    }

    pesan.hidden = true;
    card.hidden = false;

    if (isSupabaseConfigured) {
        const [meja, unitJadwal, unitTugas, parkiran, catatan, libur] = await Promise.all([
            supabaseClient.from("kg_piket").select("guru_id, hari, jam_ke"),
            supabaseClient.from("v_jadwal_piket_unit").select("tugas_id, guru_id, guru, unit, hari, jam_ke"),
            supabaseClient.from("v_guru_unit").select("tugas_id, guru_id, nama, unit, jam_per_minggu, mulai, selesai"),
            supabaseClient.from("v_piket_parkiran").select("hari, guru_id, nama, catatan"),
            supabaseClient.from("kg_pelaksanaan_piket")
                .select("id, tanggal, jenis, guru_id, tugas_id, status, catatan")
                .gte("tanggal", state.awal).lte("tanggal", state.akhir),
            supabaseClient.from("kg_hari_libur").select("tanggal, keterangan")
                .gte("tanggal", state.awal).lte("tanggal", state.akhir),
        ]);
        for (const [konteks, r] of [["jadwal piket meja sekolah", meja], ["penugasan unit", unitTugas],
                                    ["petugas parkiran", parkiran], ["catatan pelaksanaan", catatan]]) {
            if (r.error) { laporError(`Gagal memuat ${konteks}`, r.error); return; }
        }
        // Jadwal jam piket unit baru ada sejak berkas 20260920; bila view-nya
        // belum ada, penanggung jawabnya tetap muncul di kolom "tanpa jam".
        if (unitJadwal.error) console.warn("v_jadwal_piket_unit belum tersedia:", unitJadwal.error.message);

        state.jadwalMeja = meja.data || [];
        state.jadwalUnit = unitJadwal.data || [];
        state.tugasUnit = unitTugas.data || [];
        state.parkiran = parkiran.data || [];
        state.catatan = catatan.data || [];
        state.libur = new Map((libur.data || []).map((l) => [l.tanggal, l.keterangan || ""]));
    } else {
        state.jadwalMeja = demoData.piket || [];
        state.jadwalUnit = [{ tugas_id: 9001, guru_id: demoData.guru[2]?.id, guru: demoData.guru[2]?.nama,
                              unit: "Laboratorium IPA", hari: "Senin", jam_ke: 3 }];
        state.tugasUnit = [{ tugas_id: 9001, guru_id: demoData.guru[2]?.id, nama: demoData.guru[2]?.nama,
                             unit: "Laboratorium IPA", jam_per_minggu: 4, mulai: null, selesai: null }];
        state.parkiran = HARI_LIST.map((h, i) => ({ hari: h, guru_id: demoData.guru[i]?.id,
                                                    nama: demoData.guru[i]?.nama, catatan: null }));
        state.libur = new Map();
        // Catatan mode pratinjau tidak ikut terbawa antar rentang, supaya
        // tidak tertinggal sebagai baris tanpa tanggal yang cocok.
        state.catatan = state.catatan.filter((c) => c.tanggal >= state.awal && c.tanggal <= state.akhir);
    }

    const liburDalamRentang = state.hari.filter((d) => state.libur.has(d.iso));
    liburBox.hidden = !liburDalamRentang.length;
    if (liburDalamRentang.length) {
        liburBox.innerHTML = `<b>${liburDalamRentang.length} hari libur dalam rentang ini:</b> `
            + liburDalamRentang.map((d) => esc(tglPendek(d.iso) + (state.libur.get(d.iso) ? ` (${state.libur.get(d.iso)})` : ""))).join(", ")
            + ". Biasanya tidak ada piket, jadi hari itu tidak ikut terisi Hadir sendiri; "
            + "bila tetap ada petugas yang bertugas, kehadirannya boleh dipilih satu per satu.";
    }

    render();
}

// ---------- Daftar petugas per tanggal ----------
const besar = (tab) => tab[0].toUpperCase() + tab.slice(1);
const idSimpan = (tab) => "simpan" + besar(tab);
const idBatal = (tab) => "batal" + besar(tab);

/* Petugas satu tanggal, dalam bentuk yang sama untuk ketiga jenis:
     { kunci, guruId, tugasId, nama, ket, jam: [jam_ke, ...] }
   `jam` kosong berarti petugasnya terjadwal tetapi jamnya belum dicatat —
   pitanya masuk kolom "tanpa jam" di ujung kanan matriks. */
function daftarPetugas(tab, d, urut) {
    if (tab === "meja") return petugasMeja(d, urut);
    if (tab === "unit") return petugasUnit(d, urut);
    return petugasParkiran(d);
}

function petugasMeja(d, urut) {
    const per = new Map();
    for (const p of state.jadwalMeja) {
        if (p.hari !== d.hari) continue;
        if (!per.has(p.guru_id)) {
            per.set(p.guru_id, { kunci: p.guru_id, guruId: p.guru_id, tugasId: null,
                                 nama: namaGuru(p.guru_id), ket: "", jam: [] });
        }
        if (p.jam_ke != null) per.get(p.guru_id).jam.push(Number(p.jam_ke));
    }
    const daftar = [...per.values()];
    for (const p of daftar) p.ket = p.jam.length ? "Jam ke-" + ringkasJam(p.jam) : "tanpa jam jaga tercatat";
    return daftar.sort((a, b) => urut(a.guruId) - urut(b.guruId));
}

function petugasUnit(d, urut) {
    const berlaku = (t) => (!t.mulai || t.mulai <= d.iso) && (!t.selesai || t.selesai >= d.iso);
    const tugas = new Map(state.tugasUnit.map((t) => [String(t.tugas_id), t]));
    const per = new Map();

    for (const p of state.jadwalUnit) {
        if (p.hari !== d.hari) continue;
        const t = tugas.get(String(p.tugas_id));
        if (t && !berlaku(t)) continue;      // penugasannya belum mulai / sudah selesai
        const k = String(p.tugas_id);
        if (!per.has(k)) {
            per.set(k, { kunci: k, guruId: p.guru_id, tugasId: Number(p.tugas_id),
                         nama: p.guru || t?.nama || namaGuru(p.guru_id), ket: p.unit || t?.unit || "Unit", jam: [] });
        }
        if (p.jam_ke != null) per.get(k).jam.push(Number(p.jam_ke));
    }

    /* Penanggung jawab yang jam jaganya belum dijadwalkan sama sekali tetap
       ditampilkan — kehadirannya dulu bisa dicatat, dan tidak boleh hilang
       hanya karena Data Induk belum diisi. Yang jadwalnya sudah ada tetapi
       tidak kebagian hari ini memang tidak muncul: hari itu ia tidak jaga. */
    const berjadwal = new Set(state.jadwalUnit.map((p) => String(p.tugas_id)));
    for (const t of state.tugasUnit) {
        const k = String(t.tugas_id);
        if (berjadwal.has(k) || !berlaku(t)) continue;
        per.set(k, { kunci: k, guruId: t.guru_id, tugasId: Number(t.tugas_id),
                     nama: t.nama, ket: t.unit || "Unit", jam: [] });
    }

    return [...per.values()].sort((a, b) =>
        String(a.ket).localeCompare(String(b.ket), "id") || urut(a.guruId) - urut(b.guruId));
}

/* Catatan yang petugasnya tidak lagi ada di jadwal tanggal itu — jadwalnya
   diubah sesudah pelaksanaannya dicatat, atau dicatat pada masa ketika
   halaman ini belum mengenal jam jaga. Tetap digambar, di kolom "tanpa
   jam": kalau tidak, catatannya tak terlihat di layar tetapi tetap
   terhitung di Induk Pembiayaan, dan satu-satunya jalan membatalkannya
   adalah menghapus catatan sejenis dalam rentang itu sekaligus. */
function tambahTercecer(tab, isiPer) {
    const jenis = JENIS[tab];
    for (const d of state.hari) {
        const isi = isiPer.get(d.iso) || [];
        const ada = new Set(isi.map((p) => `${p.guruId}|${p.tugasId ?? ""}`));
        for (const c of state.catatan) {
            if (c.jenis !== jenis || c.tanggal !== d.iso) continue;
            const k = `${c.guru_id}|${c.tugas_id ?? ""}`;
            if (ada.has(k)) continue;
            ada.add(k);
            isi.push({ kunci: "x" + k, guruId: c.guru_id, tugasId: c.tugas_id ?? null,
                       nama: namaGuru(c.guru_id), ket: "tercatat, tetapi tidak ada di jadwal tanggal ini",
                       jam: [], tercecer: true });
        }
        isiPer.set(d.iso, isi);
    }
}

function petugasParkiran(d) {
    const p = state.parkiran.find((x) => x.hari === d.hari);
    if (!p) return [];
    return [{ kunci: p.guru_id, guruId: p.guru_id, tugasId: null, nama: p.nama || namaGuru(p.guru_id),
              ket: p.catatan ? `Catatan roster: ${p.catatan}` : "Pengawas parkiran sesudah jam pulang", jam: [] }];
}

// ---------- Render ----------
function render() {
    if (state.tab === "parkiran") renderParkiran();
    else renderMatriksJam(state.tab);
}

/* Kolom matriks jam: tiap jam pelajaran, dengan kolom sela tipis pada jeda
   istirahat — sama persis dengan matriks Jadwal KBM dan matriks Data Induk. */
function kolomJam() {
    const jamList = state.jam.length ? state.jam : [];
    const kolom = [];
    jamList.forEach((j, i) => {
        const prev = jamList[i - 1];
        if (prev?.selesai && j.mulai && jam5(prev.selesai) !== jam5(j.mulai)) {
            kolom.push({ sela: true, dari: jam5(prev.selesai), sampai: jam5(j.mulai) });
        }
        kolom.push({ jam: j, jamKe: Number(j.jam_ke) });
    });
    return kolom;
}

/* Tiap petugas menempati satu lajur dalam baris tanggalnya, jadi jam
   berturut-turut milik orang yang sama tersambung menjadi satu pita.
   Petugas yang jam jaganya tidak bertumpuk berbagi lajur, supaya baris
   tanggal tetap pendek. Sama dengan cara Data Induk menyusun matriksnya. */
function lajurkan(petugas) {
    const akhirLajur = [];
    const lajurDari = new Map();
    for (const p of petugas) {
        if (!p.jam.length) continue;
        const a = Math.min(...p.jam), b = Math.max(...p.jam);
        let i = akhirLajur.findIndex((akhir) => akhir < a);
        if (i < 0) i = akhirLajur.push(0) - 1;
        akhirLajur[i] = b;
        lajurDari.set(p.kunci, i);
    }
    return akhirLajur.map((_, i) => petugas.filter((p) => lajurDari.get(p.kunci) === i));
}

/* Satu pita nama. Warnanya adalah statusnya: hijau hadir, merah tidak
   hadir, garis putus-putus berarti belum dicatat. */
function pitaHtml(iso, jenis, p, extra = "") {
    const c = cariCatatan(iso, jenis, p.guruId, p.tugasId);
    const status = c ? (c.status === "Tidak Hadir" ? "absen" : "hadir") : "draf";
    const kelas = ["pk-pita", status, p.tercecer && "tercecer", extra].filter(Boolean).join(" ");
    const judul = [
        p.nama,
        `${jenis} · ${tglIndo(iso)}`,
        p.ket,
        c ? `Status: ${c.status}` : "Belum dicatat",
        c?.catatan ? `Catatan: ${c.catatan}` : "",
        isUnlocked() ? "Ketuk untuk memilih kehadirannya" : "Buka kunci edit untuk mencatat",
    ].filter(Boolean).join("\n");

    return `<div class="${kelas}" role="button" tabindex="0"
        data-tanggal="${esc(iso)}" data-jenis="${esc(jenis)}" data-guru="${esc(p.guruId)}"
        data-tugas="${p.tugasId == null ? "" : esc(p.tugasId)}"
        data-nama="${esc(p.nama)}" data-ket="${esc(p.ket || "")}"
        title="${esc(judul)}">${esc(namaPendek(p.nama))}${
            c?.catatan ? '<span class="pk-tanda" aria-hidden="true">•</span>' : ""}</div>`;
}

function labelBaris(d, isi) {
    const jenis = JENIS[state.tab];
    const tercatat = isi.filter((p) => cariCatatan(d.iso, jenis, p.guruId, p.tugasId)).length;
    const libur = state.libur.has(d.iso);
    const sub = !isi.length ? (libur ? "libur" : "tidak ada petugas")
        : `${tercatat}/${isi.length} tercatat${libur ? " · libur" : ""}`;
    return `<th scope="row" class="m-label"><span>${HARI_PENDEK[d.hari]}, ${esc(tglPendek(d.iso))}</span>
        <small>${esc(sub)}</small></th>`;
}

function renderMatriksJam(tab) {
    const jenis = JENIS[tab];
    const urut = peringkatGuru(state.guru);
    const kolom = kolomJam();
    const isiPer = new Map(state.hari.map((d) => [d.iso, daftarPetugas(tab, d, urut)]));
    tambahTercecer(tab, isiPer);
    const adaTanpaJam = [...isiPer.values()].some((daftar) => daftar.some((p) => !p.jam.length));
    const total = [...isiPer.values()].reduce((n, daftar) => n + daftar.length, 0);

    const hariNyata = todayISO();
    const html = [];

    html.push('<thead><tr><th class="m-sudut">Tanggal</th>');
    for (const c of kolom) {
        if (c.sela) { html.push(`<th class="m-sela" title="Istirahat ${c.dari}–${c.sampai}"></th>`); continue; }
        html.push(`<th class="m-jam">
            <span class="m-jam-ke">${c.jamKe}</span>
            ${c.jam.mulai ? `<span class="m-jam-waktu">${jam5(c.jam.mulai)}–${jam5(c.jam.selesai)}</span>` : ""}
            ${c.jam.keterangan ? `<span class="m-jam-ket">${esc(c.jam.keterangan)}</span>` : ""}
          </th>`);
    }
    if (adaTanpaJam) html.push('<th class="m-jam pk-tanpa-jam"><span class="m-jam-ke">·</span><span class="m-jam-waktu">tanpa jam</span></th>');
    html.push("</tr></thead><tbody>");

    for (const d of state.hari) {
        const isi = isiPer.get(d.iso) || [];
        const jalur = lajurkan(isi);
        const kelasBaris = [d.iso === hariNyata && "aktif", state.libur.has(d.iso) && "libur"].filter(Boolean).join(" ");
        html.push(`<tr class="${kelasBaris}">${labelBaris(d, isi)}`);

        kolom.forEach((c, ci) => {
            if (c.sela) { html.push('<td class="m-sela"></td>'); return; }
            const punya = (p) => p.jam.includes(c.jamKe);
            const ada = isi.some(punya);
            const kiri = kolom[ci - 1], kanan = kolom[ci + 1];
            const pita = !ada ? "" : jalur.map((lajur) => {
                const p = lajur.find(punya);
                if (!p) return '<div class="pk-kosong"></div>';
                const dariKiri = kiri && !kiri.sela && p.jam.includes(kiri.jamKe);
                const keKanan = kanan && !kanan.sela && p.jam.includes(kanan.jamKe);
                const extra = [dariKiri && "dari-kiri", keKanan && "ke-kanan"].filter(Boolean).join(" ");
                return pitaHtml(d.iso, jenis, p, extra);
            }).join("");
            html.push(`<td class="m-sel pk-sel${ada ? "" : " pk-nol"}">${pita}</td>`);
        });

        if (adaTanpaJam) {
            const lepas = isi.filter((p) => !p.jam.length);
            html.push(`<td class="m-sel pk-sel${lepas.length ? "" : " pk-nol"}">${
                lepas.map((p) => pitaHtml(d.iso, jenis, p)).join("")}</td>`);
        }
        html.push("</tr>");
    }
    html.push("</tbody>");

    const table = document.getElementById("matriks" + besar(tab));
    table.innerHTML = html.join("");
    table.classList.toggle("bisa-ubah", isUnlocked());
    const nSela = kolom.filter((c) => c.sela).length;
    table.style.minWidth = `${96 + (kolom.length - nSela + (adaTanpaJam ? 1 : 0)) * 76 + nSela * 12}px`;

    document.getElementById("kosong" + besar(tab)).hidden = total > 0;
    document.querySelector(`#tab-${tab} .matriks-scroll`).hidden = total === 0;

    pasangAksi(table);
    renderRingkas(tab, isiPer);
}

/* Parkiran tidak mengenal jam pelajaran — satu petugas per hari kerja,
   sekitar 30 menit sesudah jam pulang. Jadi matriksnya berbentuk
   penanggalan: kolom Senin–Jumat, baris satu pekan, dan tiap sel adalah
   satu tanggal. Sepekan penuh terbaca sekaligus, dan hari yang belum ada
   petugasnya langsung kelihatan sebagai sel kosong pada kolomnya. */
function renderParkiran() {
    const jenis = JENIS.parkiran;
    const hariNyata = todayISO();
    const isiPer = new Map(state.hari.map((d) => [d.iso, daftarPetugas("parkiran", d)]));
    tambahTercecer("parkiran", isiPer);
    const total = [...isiPer.values()].reduce((n, daftar) => n + daftar.length, 0);

    // Kelompokkan tanggal menurut pekannya (Senin sebagai awal pekan).
    const pekan = [];
    for (const d of state.hari) {
        const t = new Date(d.iso + "T00:00:00");
        t.setDate(t.getDate() - (HARI_LIST.indexOf(d.hari)));
        const kunci = isoDari(t);
        let p = pekan.find((x) => x.kunci === kunci);
        if (!p) { p = { kunci, sel: new Map() }; pekan.push(p); }
        p.sel.set(d.hari, d);
    }

    const html = [];
    html.push('<thead><tr><th class="m-sudut">Pekan</th>');
    for (const h of HARI_LIST) html.push(`<th class="m-hari">${h}</th>`);
    html.push("</tr></thead><tbody>");

    for (const p of pekan) {
        const tanggal = HARI_LIST.map((h) => p.sel.get(h)).filter(Boolean);
        const jml = tanggal.reduce((n, d) => n + (isiPer.get(d.iso) || []).length, 0);
        const hadir = tanggal.filter((d) => (isiPer.get(d.iso) || [])
            .some((x) => cariCatatan(d.iso, jenis, x.guruId, null)?.status === "Hadir")).length;
        const label = tanggal.length
            ? `${tglPendek(tanggal[0].iso)}–${tglPendek(tanggal[tanggal.length - 1].iso)}`
            : tglPendek(p.kunci);
        const aktif = tanggal.some((d) => d.iso === hariNyata);

        html.push(`<tr class="${aktif ? "aktif" : ""}"><th scope="row" class="m-label">
            <span>${esc(label)}</span><small>${hadir}/${jml} hadir</small></th>`);

        for (const h of HARI_LIST) {
            const d = p.sel.get(h);
            if (!d) { html.push('<td class="m-sel pk-hari-sel pk-luar"></td>'); continue; }
            const isi = isiPer.get(d.iso) || [];
            const libur = state.libur.has(d.iso);
            const kelas = ["m-sel", "pk-hari-sel", d.iso === hariNyata && "sekarang",
                           libur && "pk-libur", !isi.length && "pk-nol"].filter(Boolean).join(" ");
            html.push(`<td class="${kelas}">
                <span class="pk-tgl">${esc(tglPendek(d.iso))}${libur ? ' <b class="pk-tgl-libur">libur</b>' : ""}</span>
                ${isi.length ? isi.map((x) => pitaHtml(d.iso, jenis, x, "lebar")).join("")
                             : '<span class="pk-kosong-teks">belum ada petugas</span>'}</td>`);
        }
        html.push("</tr>");
    }
    html.push("</tbody>");

    const table = document.getElementById("matriksParkiran");
    table.innerHTML = html.join("");
    table.classList.toggle("bisa-ubah", isUnlocked());
    table.style.minWidth = `${96 + HARI_LIST.length * 132}px`;

    document.getElementById("kosongParkiran").hidden = total > 0;
    document.querySelector("#tab-parkiran .matriks-scroll").hidden = total === 0;

    pasangAksi(table);
    renderRingkas("parkiran", isiPer);
}

function renderRingkas(tab, isiPer) {
    const jenis = JENIS[tab];
    let total = 0, hadir = 0, absen = 0;
    for (const d of state.hari) {
        for (const p of isiPer.get(d.iso) || []) {
            total++;
            const c = cariCatatan(d.iso, jenis, p.guruId, p.tugasId);
            if (!c) continue;
            if (c.status === "Tidak Hadir") absen++; else hadir++;
        }
    }
    const belum = total - hadir - absen;
    const hari = state.hari.length;
    document.getElementById("ringkas" + besar(tab)).textContent = total
        ? `${hari} hari kerja · ${total} giliran piket · ${hadir} hadir · ${absen} tidak hadir · ${belum} belum dicatat`
        : "";

    // Tombol simpan menyebut berapa yang masih tertunda, supaya jelas ada
    // yang belum tersimpan tanpa perlu menghitung sendiri.
    const unlocked = isUnlocked();
    const tertunda = draf(tab, isiPer).length;
    const tombol = document.getElementById(idSimpan(tab));
    tombol.disabled = !unlocked || !tertunda;
    tombol.textContent = tertunda ? `Simpan ${tertunda} yang belum tercatat` : "Semua sudah tercatat";

    /* Jalan keluar bila ternyata salah — misalnya rentangnya keliru dan
       sepekan penuh terlanjur tercatat. Membatalkan satu per satu lewat
       tombol "Batalkan catatan" di dalam dialog tetap bisa, tetapi untuk
       puluhan baris itu menyiksa. Tombolnya hanya muncul kalau memang ada
       yang bisa dibatalkan, supaya tidak menggoda saat tidak perlu. */
    const sudah = catatanJenis(tab).length;
    const batal = document.getElementById(idBatal(tab));
    batal.hidden = !sudah;
    batal.disabled = !unlocked;
    batal.textContent = `Batalkan ${sudah} catatan dalam rentang ini`;
    batal.title = unlocked ? "" : "Buka kunci edit dahulu";

    if (tab === "parkiran") {
        document.getElementById("footParkiran").textContent =
            `${hadir} hari jaga terhitung dalam rentang ini. Piket tidak mengenal pengganti: `
            + "bila petugasnya berhalangan, harinya memang tidak dijaga. "
            + "Besaran kompensasinya dihitung di aplikasi Induk Pembiayaan.";
    }
}

/* Giliran piket yang belum punya catatan. Hari libur dilewati: di situ
   biasanya memang tidak ada piket, dan sekali tekan tidak boleh mencatat
   kehadiran sehari penuh yang tidak pernah terjadi — untuk parkiran itu
   berarti uang yang tidak pernah dikonfirmasi. */
function draf(tab, isiPer) {
    const jenis = JENIS[tab];
    const out = [];
    for (const d of state.hari) {
        if (state.libur.has(d.iso)) continue;
        for (const p of isiPer.get(d.iso) || []) {
            if (cariCatatan(d.iso, jenis, p.guruId, p.tugasId)) continue;
            out.push({ tanggal: d.iso, jenis, guru_id: p.guruId, tugas_id: p.tugasId,
                       status: "Hadir", catatan: null });
        }
    }
    return out;
}

function isiTab(tab) {
    const urut = peringkatGuru(state.guru);
    return new Map(state.hari.map((d) => [d.iso, daftarPetugas(tab, d, urut)]));
}

function pasangAksi(table) {
    const unlocked = isUnlocked();
    table.querySelectorAll(".pk-pita").forEach((el) => {
        if (!unlocked) { el.removeAttribute("tabindex"); el.removeAttribute("role"); return; }
        el.addEventListener("click", () => bukaPilihan(el));
        el.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); bukaPilihan(el); }
        });
    });
}

// ---------- Dialog pilih kehadiran ----------
// Dua ketukan: nama, lalu Hadir atau Tidak Hadir. Pilihannya langsung
// tersimpan — tidak ada tombol Simpan terpisah, karena satu-satunya yang
// dipilih di sini memang statusnya.
let pilihanAktif = null;

function pasangModal() {
    const modal = document.getElementById("statusModal");
    document.getElementById("statusTutup").addEventListener("click", tutupPilihan);
    modal.addEventListener("click", (ev) => { if (ev.target === modal) tutupPilihan(); });
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !modal.hidden) tutupPilihan(); });
    modal.querySelectorAll(".pilih-hadir button").forEach((b) =>
        b.addEventListener("click", () => simpanStatus(b.dataset.status)));
    document.getElementById("statusHapus").addEventListener("click", () => simpanStatus(""));
}

function bukaPilihan(el) {
    if (!isUnlocked()) return;
    const tanggal = el.dataset.tanggal;
    const jenis = el.dataset.jenis;
    const guruId = el.dataset.guru;
    const tugasId = el.dataset.tugas === "" ? null : Number(el.dataset.tugas);
    const c = cariCatatan(tanggal, jenis, guruId, tugasId);
    pilihanAktif = { tanggal, jenis, guruId, tugasId };

    document.getElementById("statusNama").textContent = el.dataset.nama;
    document.getElementById("statusSub").textContent =
        `${jenis} · ${tglIndo(tanggal)}${el.dataset.ket ? " · " + el.dataset.ket : ""}`;

    const liburBox = document.getElementById("statusLibur");
    const libur = state.libur.get(tanggal);
    liburBox.hidden = !state.libur.has(tanggal);
    if (!liburBox.hidden) {
        liburBox.textContent = `Tanggal ini tercatat sebagai hari libur${libur ? ` (${libur})` : ""}. `
            + "Biasanya tidak ada piket — isi hanya bila petugasnya memang bertugas.";
    }

    const catatan = document.getElementById("statusCatatan");
    catatan.value = c?.catatan || "";

    // Bawaannya Hadir, karena umumnya memang hadir; pada baris yang sudah
    // tercatat yang disorot adalah statusnya sekarang.
    const terpilih = c ? c.status : "Hadir";
    document.querySelectorAll(".pilih-hadir button").forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.status === terpilih)));

    document.getElementById("statusHapus").hidden = !c;
    document.getElementById("statusModal").hidden = false;
    catatan.focus();
}

function tutupPilihan() {
    document.getElementById("statusModal").hidden = true;
    pilihanAktif = null;
}

// status kosong = catatannya dibatalkan
async function simpanStatus(status) {
    if (!pilihanAktif || !isUnlocked()) return;
    const { tanggal, jenis, guruId, tugasId } = pilihanAktif;
    const catatan = document.getElementById("statusCatatan").value.trim() || null;
    const lama = cariCatatan(tanggal, jenis, guruId, tugasId);
    tutupPilihan();

    if (!status) {
        if (lama) await hapusCatatan(lama);
        render();
        return;
    }

    const isi = { tanggal, jenis, guru_id: guruId, tugas_id: tugasId, status, catatan };

    if (!isSupabaseConfigured) {
        if (lama) Object.assign(lama, isi);
        else state.catatan.push({ id: "D" + Date.now(), ...isi });
        render();
        return;
    }

    if (lama) {
        const { error } = await supabaseClient.from("kg_pelaksanaan_piket").update(isi).eq("id", lama.id);
        if (error) { laporError("Gagal menyimpan catatan piket", error); return; }
        Object.assign(lama, isi);
    } else {
        const { data, error } = await supabaseClient.from("kg_pelaksanaan_piket").insert(isi).select().single();
        if (error) { laporError("Gagal menyimpan catatan piket", error); return; }
        state.catatan.push(data);
    }
    render();
}

async function hapusCatatan(baris) {
    if (isSupabaseConfigured) {
        const { error } = await supabaseClient.from("kg_pelaksanaan_piket").delete().eq("id", baris.id);
        if (error) { laporError("Gagal membatalkan catatan piket", error); return; }
    }
    state.catatan = state.catatan.filter((c) => c !== baris);
}

// ---------- Simpan sekaligus ----------
/* Menyimpan seluruh giliran yang belum tercatat sebagai Hadir. Yang sudah
   tercatat tidak ditimpa. Sejak tanggalnya menjadi rentang, sekali tekan
   bisa menyangkut berpuluh hari — dan setiap barisnya berujung di
   perhitungan honor — jadi rentang lebih dari sehari selalu dikonfirmasi
   dahulu, dengan jumlah dan tanggalnya disebut lengkap. */
async function simpanBelumTercatat(tab) {
    if (!isUnlocked()) return;
    const isiPer = isiTab(tab);
    const baru = draf(tab, isiPer);
    if (!baru.length) return;

    if (state.hari.length > 1) {
        const setuju = confirm(
            `Simpan ${baru.length} catatan piket ${JENIS[tab]} sebagai HADIR, `
            + `pada ${state.hari.length} hari kerja ${tglIndo(state.awal)} – ${tglIndo(state.akhir)}?\n\n`
            + "Yang sudah tercatat tidak diubah. Setiap baris ikut terhitung di Induk Pembiayaan.");
        if (!setuju) return;
    }

    if (!isSupabaseConfigured) {
        baru.forEach((b, i) => state.catatan.push({ id: "D" + Date.now() + i, ...b }));
        render();
        kabar(`${baru.length} catatan piket ${JENIS[tab]} disimpan sebagai Hadir.`);
        return;
    }

    // Dipotong per 200 baris supaya satu permintaan tidak membengkak.
    let tersimpan = 0;
    for (let i = 0; i < baru.length; i += 200) {
        const { data, error } = await supabaseClient.from("kg_pelaksanaan_piket")
            .insert(baru.slice(i, i + 200)).select();
        if (error) { laporError("Gagal menyimpan catatan piket", error); break; }
        state.catatan.push(...(data || []));
        tersimpan += (data || []).length;
    }
    render();
    if (tersimpan) kabar(`${tersimpan} catatan piket ${JENIS[tab]} disimpan sebagai Hadir.`);
}

/* Membatalkan SELURUH catatan satu jenis dalam rentang yang sedang dibuka.
   Kasus yang ditangani: rentangnya keliru, lalu berhari-hari terlanjur
   tercatat. Membatalkan satu per satu lewat dialog tetap bisa dan tetap
   berguna untuk memperbaiki satu orang; yang ini untuk sekali hapus.

   Penghapusannya tidak bisa dikembalikan, jadi jumlah, jenis, dan
   rentangnya disebut lengkap lebih dulu. Memakai confirm bawaan peramban
   dan bukan dialog buatan sendiri — dialog buatan sendiri pernah tertimbun
   toolbar sehingga tombolnya tidak bisa ditekan; confirm bawaan digambar
   oleh peramban, di luar jangkauan lapisan halaman. */
async function batalkanSemua(tab) {
    if (!isUnlocked()) return;
    const baris = catatanJenis(tab);
    if (!baris.length) return;

    const setuju = confirm(
        `Batalkan ${baris.length} catatan piket ${JENIS[tab]} pada ${tglIndo(state.awal)} – ${tglIndo(state.akhir)}?\n\n`
        + "Seluruh petugas dalam rentang itu kembali berstatus \"belum dicatat\", "
        + "dan hari-hari itu tidak lagi terhitung di Induk Pembiayaan.\n\n"
        + "Yang dibatalkan tidak bisa dikembalikan — harus dicatat ulang.");
    if (!setuju) return;

    if (isSupabaseConfigured) {
        const { error } = await supabaseClient.from("kg_pelaksanaan_piket")
            .delete().in("id", baris.map((c) => c.id));
        if (error) { laporError("Gagal membatalkan catatan piket", error); return; }
    }
    state.catatan = state.catatan.filter((c) => c.jenis !== JENIS[tab]);
    render();
    kabar(`${baris.length} catatan piket ${JENIS[tab]} dalam rentang ini dibatalkan. `
        + "Petugasnya kembali berstatus belum dicatat.");
}

/* Kabar hasil tindakan yang berhasil. Bentuknya sama dengan banner galat
   dan letaknya sama, supaya hasil sebuah tindakan selalu dicari di satu
   tempat — hanya warnanya netral, dan hilang sendiri setelah beberapa detik. */
function kabar(pesan) {
    document.getElementById("kabarBanner")?.remove();
    const box = document.createElement("div");
    box.id = "kabarBanner";
    box.className = "error-banner kabar";
    box.innerHTML = `${esc(pesan)}<button type="button" class="error-close" aria-label="Tutup">×</button>`;
    const main = document.querySelector("main");
    main.insertBefore(box, main.firstChild);
    box.querySelector(".error-close").addEventListener("click", () => box.remove());
    setTimeout(() => { if (box.isConnected) box.remove(); }, 9000);
}

boot().catch((err) => laporError("Gagal memuat halaman", err));
