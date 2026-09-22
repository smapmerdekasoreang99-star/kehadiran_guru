// =========================================================
// Pelaksanaan Piket — Guru Pengganti SMA Plus Merdeka Soreang
// =========================================================
// Halaman ini hanya mencatat PELAKSANAAN. Penugasannya ada di tempat lain:
//   Meja Sekolah : tabel piket (Data Induk → Jadwal Piket)
//   Unit         : piket_unit + guru_tugas "Diperbantukan" (Data Induk)
//   Parkiran     : tabel piket_parkiran (Data Induk → Jadwal Piket)
// Semua catatan masuk ke satu tabel kg_pelaksanaan_piket dengan pembeda
// kolom `jenis`, karena bentuk datanya sama: satu petugas, satu giliran,
// hadir atau tidak.
//
// Satu giliran = satu JAM pelajaran untuk Meja Sekolah dan Unit, dan satu
// HARI untuk Parkiran — mengikuti satuan jadwalnya masing-masing. Guru yang
// berjaga dua jam bisa hadir pada jam pertama dan tidak pada jam kedua;
// dicatat per hari, keadaan itu tidak punya tempat untuk ditulis.
//
// Bentuk layarnya sengaja dibuat sama dengan matriks jadwal piket di Data
// Induk — orang yang sama memakai kedua halaman itu, dan dulu keduanya
// menampilkan hal yang sama dengan dua bentuk berbeda: di sana matriks
// berpita nama, di sini tabel berisi kotak pilihan. Sekarang keduanya
// matriks, dan yang berbeda hanya artinya: di Data Induk pita berarti
// "terjadwal", di sini warnanya berarti "hadir atau tidak".
//
// Sumbu matriksnya:
//   Meja & Unit : baris = tanggal, kolom = jam pelajaran — satu pita satu
//                 catatan, dan pita hanya tersambung bila jam bersebelahan
//                 berstatus sama
//   Parkiran    : baris = pekan,   kolom = Senin–Jumat  (parkiran per hari,
//                 bukan per jam, jadi kolom jam tidak ada artinya di situ)

import { supabaseClient, isSupabaseConfigured } from "../assets/supabase-client.js?v=20260921v";
import { demoData } from "../assets/demo-data.js?v=20260921v";
import { isUnlocked, initLockUI } from "../assets/auth-gate.js?v=20260921v";
import { peringkatGuru } from "../assets/guru-order.js?v=20260921v";
import { muatRujukan } from "../assets/simpanan.js?v=20260921ad";
import { ambilLogoBase64 } from "../assets/excel-export.js?v=20260921ae";

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
    profil: null,         // v_penanda_tangan, untuk kop berkas unduhan
    ta: "",               // tahun ajaran aktif, tertulis di bawah judul berkas
};

const namaGuru = (id) => state.guru.find((g) => g.id === id)?.nama || id;

/* Satu baris catatan dikenali dari tanggal + jenis + petugas + unit + JAM.
   tugas_id hanya dipakai jenis Unit; di luar itu selalu null.

   Satuannya jam, bukan hari, karena seorang guru yang berjaga dua jam bisa
   hadir pada jam pertama lalu tidak pada jam kedua. Dicatat per hari, kedua
   keadaan itu terpaksa diringkas jadi satu: menuliskan Hadir berarti
   membayar jam yang tidak dijaga, menuliskan Tidak Hadir berarti menghapus
   jam yang benar-benar dijaga.

   jam_ke kosong berarti sehari tanpa rincian jam. Selalu demikian untuk
   Parkiran — satuannya sekali jaga sesudah bel pulang, bukan jam pelajaran
   — dan untuk penanggung jawab unit yang jam jaganya belum dijadwalkan di
   Data Induk. */
function cariCatatan(tanggal, jenis, guruId, tugasId = null, jamKe = null) {
    return state.catatan.find((c) => c.tanggal === tanggal && c.jenis === jenis
        && c.guru_id === guruId && (c.tugas_id ?? null) === (tugasId ?? null)
        && (c.jam_ke ?? null) === (jamKe ?? null));
}

// Giliran piket satu petugas pada satu hari: satu per jam jaganya, atau
// satu tanpa jam bila jadwalnya tidak menyebut jam.
const jamGiliran = (p) => (p.jam.length ? p.jam : [null]);

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
        // Guru, jam, ketiga jadwal piket, dan identitas kop dari simpanan
        // bersama. Yang diminta segar tiap rentang hanya catatan pelaksanaan
        // dan hari libur — itulah yang berubah setiap hari.
        let rujukan;
        try {
            rujukan = await muatRujukan(supabaseClient,
                ["guru", "jam", "piketMeja", "piketUnit", "guruUnit", "parkiran", "profil", "tahunAjaran"],
                (r) => { terapkanRujukan(r); if (rentangSiap) render(); });
        } catch (err) { laporError("Gagal memuat data rujukan", err); return; }
        terapkanRujukan(rujukan);
    } else {
        state.guru = demoData.guru.map((g) => ({ ...g, status_aktif: "Aktif" }));
        state.jam = demoData.jam || [];
        state.ta = "2026/2027";
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
        document.getElementById("unduh" + besar(tab)).addEventListener("click", () => unduhFormulir(tab));
    }

    pasangPekanPintas();
    pasangModal();
    await muatRentang();
}

/* Tombol pintas pekan. Rentangnya sengaja TIDAK dikunci sepekan — melihat
   sebulan sekaligus itulah gunanya rentang, dan rekap memerlukannya. Yang
   dijaga sepekan adalah KERTASNYA: unduhan selalu satu lembar per pekan,
   berapa pun rentang di layar. Tombol ini hanya jalan pintas bagi yang
   memang bekerja pekan demi pekan. */
function pasangPekanPintas() {
    const seninDari = (iso) => {
        const d = new Date(iso + "T00:00:00");
        const geser = (d.getDay() + 6) % 7;      // Minggu dihitung akhir pekan sebelumnya
        d.setDate(d.getDate() - geser);
        return d;
    };
    const pasangPekan = (senin) => {
        const jumat = new Date(senin);
        jumat.setDate(senin.getDate() + 4);
        state.awal = isoDari(senin);
        state.akhir = isoDari(jumat);
        document.getElementById("tglAwal").value = state.awal;
        document.getElementById("tglAkhir").value = state.akhir;
        muatRentang();
    };
    const geser = (pekan) => {
        const senin = seninDari(state.awal || todayISO());
        senin.setDate(senin.getDate() + pekan * 7);
        pasangPekan(senin);
    };
    document.getElementById("pekanIni").addEventListener("click", () => pasangPekan(seninDari(todayISO())));
    document.getElementById("pekanMundur").addEventListener("click", () => geser(-1));
    document.getElementById("pekanMaju").addEventListener("click", () => geser(1));
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
        const [catatan, libur] = await Promise.all([
            supabaseClient.from("kg_pelaksanaan_piket")
                .select("id, tanggal, jenis, guru_id, tugas_id, jam_ke, status, catatan")
                .gte("tanggal", state.awal).lte("tanggal", state.akhir),
            supabaseClient.from("kg_hari_libur").select("tanggal, keterangan")
                .gte("tanggal", state.awal).lte("tanggal", state.akhir),
        ]);
        if (catatan.error) { laporError("Gagal memuat catatan pelaksanaan", catatan.error); return; }
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

    rentangSiap = true;
    render();
}

// Pembaruan rujukan di latar boleh menggambar ulang hanya bila data
// rentangnya sudah ada; sebelum itu tidak ada yang bisa digambar.
let rentangSiap = false;

function terapkanRujukan(r) {
    state.guru = r.guru;
    state.jam = r.jam;
    state.jadwalMeja = r.piketMeja;
    state.jadwalUnit = r.piketUnit;
    state.tugasUnit = r.guruUnit;
    state.parkiran = r.parkiran;
    state.profil = r.profil[0] || null;
    state.ta = (r.tahunAjaran[0] || {}).kode || "";
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
    // Jamnya kini tertulis pada tiap pita, jadi keterangan barisnya hanya
    // perlu menyebut keadaan yang menyimpang.
    for (const p of daftar) p.ket = p.jam.length ? "" : "tanpa jam jaga tercatat";
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
        // Giliran yang sudah tergambar, dikenali sampai ke jamnya: sejak
        // dicatat per jam, satu jam bisa tercecer sementara jam lain milik
        // orang yang sama tetap terjadwal.
        const terjadwal = new Map(isi.map((p) => [`${p.guruId}|${p.tugasId ?? ""}`, p]));
        const tambahan = new Map();
        for (const c of state.catatan) {
            if (c.jenis !== jenis || c.tanggal !== d.iso) continue;
            const k = `${c.guru_id}|${c.tugas_id ?? ""}`;
            const jam = c.jam_ke == null ? null : Number(c.jam_ke);
            const p = terjadwal.get(k);
            if (p && (jam == null ? !p.jam.length : p.jam.includes(jam))) continue;
            if (!tambahan.has(k)) {
                tambahan.set(k, { kunci: "x" + k, guruId: c.guru_id, tugasId: c.tugas_id ?? null,
                                  nama: namaGuru(c.guru_id),
                                  ket: "tercatat, tetapi tidak ada di jadwal tanggal ini",
                                  jam: [], tercecer: true });
            }
            if (jam != null) tambahan.get(k).jam.push(jam);
        }
        for (const p of tambahan.values()) isi.push(p);
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
// "Jam ke-3 (07:50–08:30)" — jam pelajaran beserta waktunya, bila ada.
function labelJam(jamKe) {
    if (jamKe == null) return "";
    const j = state.jam.find((x) => Number(x.jam_ke) === Number(jamKe));
    return `Jam ke-${jamKe}` + (j?.mulai ? ` (${jam5(j.mulai)}–${jam5(j.selesai)})` : "");
}

function pitaHtml(iso, jenis, p, jamKe = null, extra = "", panjang = 1) {
    const c = cariCatatan(iso, jenis, p.guruId, p.tugasId, jamKe);
    const status = c ? (c.status === "Tidak Hadir" ? "absen" : "hadir") : "draf";
    const kelas = ["pk-pita", status, p.tercecer && "tercecer", extra].filter(Boolean).join(" ");
    const ket = [labelJam(jamKe), p.ket].filter(Boolean).join(" · ");
    const judul = [
        p.nama,
        `${jenis} · ${tglIndo(iso)}`,
        ket,
        c ? `Status: ${c.status}` : "Belum dicatat",
        c?.catatan ? `Catatan: ${c.catatan}` : "",
        isUnlocked() ? "Ketuk untuk memilih kehadirannya" : "Buka kunci edit untuk mencatat",
    ].filter(Boolean).join("\n");

    return `<div class="${kelas}" role="button" tabindex="0"
        data-tanggal="${esc(iso)}" data-jenis="${esc(jenis)}" data-guru="${esc(p.guruId)}"
        data-tugas="${p.tugasId == null ? "" : esc(p.tugasId)}"
        data-jam="${jamKe == null ? "" : esc(jamKe)}"
        data-nama="${esc(p.nama)}" data-ket="${esc(ket)}"
        title="${esc(judul)}">${esc(namaPendek(p.nama))}${
            panjang > 1 ? `<small>${panjang} jam</small>` : ""}${
            c?.catatan ? '<span class="pk-tanda" aria-hidden="true">•</span>' : ""}</div>`;
}

// Berapa giliran (jam) pada satu tanggal, dan berapa yang sudah tercatat.
function hitungBaris(d, isi, jenis) {
    let total = 0, tercatat = 0;
    for (const p of isi) {
        for (const jk of jamGiliran(p)) {
            total++;
            if (cariCatatan(d.iso, jenis, p.guruId, p.tugasId, jk)) tercatat++;
        }
    }
    return { total, tercatat };
}

function labelBaris(d, isi) {
    const jenis = JENIS[state.tab];
    const { total, tercatat } = hitungBaris(d, isi, jenis);
    const libur = state.libur.has(d.iso);
    const satuan = state.tab === "parkiran" ? "" : " jam";
    const sub = !total ? (libur ? "libur" : "tidak ada petugas")
        : `${tercatat}/${total}${satuan} tercatat${libur ? " · libur" : ""}`;
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
            /* Pita hanya disambung bila jam bersebelahan itu berstatus SAMA.
               Sejak kehadiran dicatat per jam, pita panjang yang menyatukan
               jam hadir dengan jam tidak hadir justru menyembunyikan hal
               yang paling perlu terlihat; putusnya pita itulah tandanya. */
            const status = (p, jk) => cariCatatan(d.iso, jenis, p.guruId, p.tugasId, jk)?.status || "";
            const sambung = (p, jk) => p.jam.includes(jk) && status(p, jk) === status(p, c.jamKe);
            const pita = !ada ? "" : jalur.map((lajur) => {
                const p = lajur.find(punya);
                if (!p) return '<div class="pk-kosong"></div>';
                const dariKiri = kiri && !kiri.sela && sambung(p, kiri.jamKe);
                const keKanan = kanan && !kanan.sela && sambung(p, kanan.jamKe);
                const extra = [dariKiri && "dari-kiri", keKanan && "ke-kanan"].filter(Boolean).join(" ");
                // Pita yang melintasi beberapa kolom menyebut panjangnya di
                // samping nama, supaya tidak terbaca sebagai satu jam.
                let panjang = 1;
                if (!dariKiri) for (let k = ci + 1; k < kolom.length && !kolom[k].sela && sambung(p, kolom[k].jamKe); k++) panjang++;
                return pitaHtml(d.iso, jenis, p, c.jamKe, extra, panjang);
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
                ${isi.length ? isi.map((x) => pitaHtml(d.iso, jenis, x, null, "lebar")).join("")
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
            for (const jk of jamGiliran(p)) {
                total++;
                const c = cariCatatan(d.iso, jenis, p.guruId, p.tugasId, jk);
                if (!c) continue;
                if (c.status === "Tidak Hadir") absen++; else hadir++;
            }
        }
    }
    const belum = total - hadir - absen;
    const hari = state.hari.length;
    // Satuannya disebut apa adanya: meja dan unit per jam pelajaran,
    // parkiran per hari jaga.
    const satuan = tab === "parkiran" ? "hari jaga" : "jam jaga";
    document.getElementById("ringkas" + besar(tab)).textContent = total
        ? `${hari} hari kerja · ${total} ${satuan} · ${hadir} hadir · ${absen} tidak hadir · ${belum} belum dicatat`
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
            for (const jk of jamGiliran(p)) {
                if (cariCatatan(d.iso, jenis, p.guruId, p.tugasId, jk)) continue;
                out.push({ tanggal: d.iso, jenis, guru_id: p.guruId, tugas_id: p.tugasId,
                           jam_ke: jk, status: "Hadir", catatan: null });
            }
        }
    }
    return out;
}

function isiTab(tab) {
    const urut = peringkatGuru(state.guru);
    const isiPer = new Map(state.hari.map((d) => [d.iso, daftarPetugas(tab, d, urut)]));
    tambahTercecer(tab, isiPer);
    return isiPer;
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
    const jamKe = el.dataset.jam === "" ? null : Number(el.dataset.jam);
    const c = cariCatatan(tanggal, jenis, guruId, tugasId, jamKe);
    pilihanAktif = { tanggal, jenis, guruId, tugasId, jamKe };

    document.getElementById("statusNama").textContent = el.dataset.nama;
    document.getElementById("statusSub").textContent =
        `${jenis} · ${tglIndo(tanggal)}${el.dataset.ket ? " · " + el.dataset.ket : ""}`;

    /* Sehari bisa terdiri dari beberapa jam, dan biasanya seluruhnya sama.
       Karena itu ditawarkan sekali tekan untuk seluruh jam hari itu —
       tercentang hanya bila belum ada satu pun jam yang tercatat, supaya
       koreksi satu jam yang menyimpang tidak diam-diam menimpa jam lain
       yang sudah benar. Itulah justru keadaan yang membuat pencatatan ini
       diturunkan menjadi per jam. */
    const sehari = jamGiliran(petugasSehari(jenis, tanggal, guruId, tugasId));
    const belumSatuPun = sehari.every((jk) => !cariCatatan(tanggal, jenis, guruId, tugasId, jk));
    const kotak = document.getElementById("statusSemuaJam");
    const centang = document.getElementById("fSemuaJam");
    kotak.hidden = jamKe == null || sehari.length < 2;
    centang.checked = !kotak.hidden && belumSatuPun;
    if (!kotak.hidden) {
        document.getElementById("statusSemuaJamLabel").textContent =
            `Berlaku untuk seluruh ${sehari.length} jam jaganya hari ini (jam ke-${ringkasJam(sehari)})`;
    }

    const liburBox = document.getElementById("statusLibur");
    const libur = state.libur.get(tanggal);
    liburBox.hidden = !state.libur.has(tanggal);
    if (!liburBox.hidden) {
        liburBox.textContent = `Tanggal ini tercatat sebagai hari libur${libur ? ` (${libur})` : ""}. `
            + "Biasanya tidak ada piket — isi hanya bila petugasnya memang bertugas.";
    }

    const catatan = document.getElementById("statusCatatan");
    catatan.value = c?.catatan || "";

    // Bawaannya Hadir, karena umumnya memang hadir; pada jam yang sudah
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

/* Giliran satu petugas pada satu tanggal — dipakai dialog untuk menawarkan
   "seluruh jam hari ini". Dihitung ulang dari jadwalnya, bukan dari yang
   tergambar, supaya tetap benar walau yang diketuk catatan tercecer. */
function petugasSehari(jenis, tanggal, guruId, tugasId) {
    const tab = Object.keys(JENIS).find((k) => JENIS[k] === jenis);
    const d = state.hari.find((x) => x.iso === tanggal);
    if (!tab || !d) return { jam: [] };
    const daftar = daftarPetugas(tab, d, peringkatGuru(state.guru));
    return daftar.find((p) => p.guruId === guruId && (p.tugasId ?? null) === (tugasId ?? null))
        || { jam: [] };
}

// status kosong = catatannya dibatalkan
async function simpanStatus(status) {
    if (!pilihanAktif || !isUnlocked()) return;
    const { tanggal, jenis, guruId, tugasId, jamKe } = pilihanAktif;
    const catatan = document.getElementById("statusCatatan").value.trim() || null;
    const kotak = document.getElementById("statusSemuaJam");
    const semuaJam = !kotak.hidden && document.getElementById("fSemuaJam").checked;
    tutupPilihan();

    /* Pembatalan selalu hanya mengenai jam yang diketuk. Sekali ketuk
       menghapus sehari penuh terlalu jauh dari yang diminta, dan untuk itu
       sudah ada tombol "Batalkan N catatan" di atas tabel. */
    if (!status) {
        const lama = cariCatatan(tanggal, jenis, guruId, tugasId, jamKe);
        if (lama) await hapusCatatan(lama);
        render();
        return;
    }

    const sasaran = semuaJam
        ? jamGiliran(petugasSehari(jenis, tanggal, guruId, tugasId))
        : [jamKe];

    for (const jk of sasaran) {
        const lama = cariCatatan(tanggal, jenis, guruId, tugasId, jk);
        const isi = { tanggal, jenis, guru_id: guruId, tugas_id: tugasId, jam_ke: jk, status, catatan };

        if (!isSupabaseConfigured) {
            if (lama) Object.assign(lama, isi);
            else state.catatan.push({ id: "D" + Date.now() + jk, ...isi });
            continue;
        }
        if (lama) {
            const { error } = await supabaseClient.from("kg_pelaksanaan_piket").update(isi).eq("id", lama.id);
            if (error) { laporError("Gagal menyimpan catatan piket", error); break; }
            Object.assign(lama, isi);
        } else {
            const { data, error } = await supabaseClient.from("kg_pelaksanaan_piket").insert(isi).select().single();
            if (error) { laporError("Gagal menyimpan catatan piket", error); break; }
            state.catatan.push(data);
        }
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
        /* Dipotong per 200 id. Sejak dicatat per jam, sebulan piket meja
           sekolah bisa lebih dari dua ribu baris, dan seluruh id-nya
           dititipkan di alamat permintaan — cukup panjang untuk ditolak
           peladen sebelum satu baris pun terhapus. */
        const id = baris.map((c) => c.id);
        for (let i = 0; i < id.length; i += 200) {
            const { error } = await supabaseClient.from("kg_pelaksanaan_piket")
                .delete().in("id", id.slice(i, i + 200));
            if (error) { laporError("Gagal membatalkan catatan piket", error); return; }
        }
    }
    state.catatan = state.catatan.filter((c) => c.jenis !== JENIS[tab]);
    render();
    kabar(`${baris.length} catatan piket ${JENIS[tab]} dalam rentang ini dibatalkan. `
        + "Petugasnya kembali berstatus belum dicatat.");
}

// ---------- Formulir paraf ----------
/* Lembar kertas yang dibubuhi paraf petugas, sebagai bukti tersendiri di
   luar catatan aplikasi — bendahara memakainya saat menyusun laporan.
   Sengaja KOSONG: statusnya tidak ikut dicetak, supaya paraf dan catatan
   aplikasi menjadi dua saksi yang berdiri sendiri dan bisa diadu.

   Berapa pun rentang di layar, kertasnya selalu satu lembar per pekan —
   alasannya ditulis di assets/formulir-piket.js. */
const JUDUL_FORMULIR = {
    meja: "Formulir Paraf Piket Meja Sekolah",
    unit: "Formulir Paraf Piket Unit",
    parkiran: "Formulir Paraf Piket Parkiran",
};

// Logo dibaca sekali; satu unduhan bisa berisi belasan lembar dengan kop yang sama.
let logoBerkas;
async function logoUnduhan() {
    if (logoBerkas === undefined) logoBerkas = (await ambilLogoBase64("assets/logo-kecil.png")) || null;
    return logoBerkas ? { base64: logoBerkas } : null;
}

function perkakasUnduhan() {
    if (!window.ExcelJS) throw new Error("Pustaka pembuat Excel belum termuat. Periksa sambungan internet, "
        + "lalu muat ulang halaman.");
    if (!window.KopDokumen) throw new Error("Berkas assets/kop-dokumen.js belum termuat, sehingga kop dokumen "
        + "tidak bisa dibuat. Muat ulang halaman.");
    if (!window.FormulirPiket) throw new Error("Berkas assets/formulir-piket.js belum termuat, sehingga formulir "
        + "paraf tidak bisa dibuat. Muat ulang halaman.");
    return { ExcelJS: window.ExcelJS, Kop: window.KopDokumen, F: window.FormulirPiket };
}

/* Baris formulir: satu petugas, jam jaganya dikelompokkan per hari.
    adalah tanggal yang dipakai menimbang masa berlaku penugasan
   unit — yang sudah selesai pada tanggal itu tidak ikut tercetak. */
function barisFormulir(tab, acuan) {
    const urut = peringkatGuru(state.guru);
    if (tab === "parkiran") {
        return Object.fromEntries(state.parkiran.map((p) => [p.hari, p.nama || namaGuru(p.guru_id)]));
    }

    const per = new Map();
    /* Jamnya diserahkan sebagai daftar angka, bukan ringkasan "1–3": di
       kertas tiap jam mendapat lariknya sendiri, karena tiap jam diparaf
       sendiri — sama dengan cara kehadirannya dicatat di layar. */
    const tambahJam = (e, hari, jamKe) => {
        if (jamKe == null) return;
        (e.jam[hari] = e.jam[hari] || []).push(Number(jamKe));
    };

    if (tab === "meja") {
        for (const p of state.jadwalMeja) {
            if (!HARI_LIST.includes(p.hari)) continue;
            if (!per.has(p.guru_id)) {
                per.set(p.guru_id, { guruId: p.guru_id, nama: namaGuru(p.guru_id), unit: "", jam: {} });
            }
            tambahJam(per.get(p.guru_id), p.hari, p.jam_ke);
        }
    } else {
        const berlaku = (t) => (!t.mulai || t.mulai <= acuan) && (!t.selesai || t.selesai >= acuan);
        const tugas = new Map(state.tugasUnit.map((t) => [String(t.tugas_id), t]));
        for (const p of state.jadwalUnit) {
            if (!HARI_LIST.includes(p.hari)) continue;
            const t = tugas.get(String(p.tugas_id));
            if (t && !berlaku(t)) continue;
            const k = String(p.tugas_id);
            if (!per.has(k)) {
                per.set(k, { guruId: p.guru_id, nama: p.guru || t?.nama || namaGuru(p.guru_id),
                             unit: p.unit || t?.unit || "", jam: {} });
            }
            tambahJam(per.get(k), p.hari, p.jam_ke);
        }
        // Penanggung jawab yang jam jaganya belum dijadwalkan tetap dapat
        // barisnya — sama dengan kolom "tanpa jam" di layar.
        const berjadwal = new Set(state.jadwalUnit.map((p) => String(p.tugas_id)));
        for (const t of state.tugasUnit) {
            const k = String(t.tugas_id);
            if (berjadwal.has(k) || !berlaku(t)) continue;
            per.set(k, { guruId: t.guru_id, nama: t.nama, unit: t.unit || "", jam: {} });
        }
    }

    const daftar = [...per.values()];
    for (const e of daftar) {
        for (const h of Object.keys(e.jam)) e.jam[h] = [...new Set(e.jam[h])].sort((a, b) => a - b);
    }
    return daftar.sort((a, b) => String(a.unit).localeCompare(String(b.unit), "id")
                              || urut(a.guruId) - urut(b.guruId));
}

async function unduhFormulir(tab) {
    if (!state.hari.length) return;
    const tombol = document.getElementById("unduh" + besar(tab));
    const teksLama = tombol.textContent;
    try {
        const { ExcelJS, Kop, F } = perkakasUnduhan();
        tombol.disabled = true;
        tombol.textContent = "Menyiapkan…";

        const profil = state.profil || {};
        /* Yang menandatangani di kanan adalah pejabat yang berwenang atas
           ISI dokumennya. Piket meja sekolah dan unit ranah kurikulum —
           keduanya jam pelajaran. Piket parkiran ranah kesiswaan: yang
           diawasi siswa yang pulang, bukan jam belajar. */
        const kesiswaan = tab === "parkiran";
        const ttd = {
            tempat: profil.kota || "", tanggal: null,
            kepala: profil.kepala_sekolah || "",
            labelKanan: kesiswaan ? "Wakasek Kesiswaan," : "Wakasek Kurikulum,",
            namaKanan: (kesiswaan ? profil.kesiswaan : profil.kurikulum) || ""
        };
        const logo = await logoUnduhan();

        /* Satu lembar saja, tanpa tanggal — diperbanyak dengan fotokopi
           untuk pekan-pekan berikutnya. Rentang tanggal di layar hanya
           menentukan penugasan unit mana yang masih berlaku; dipakai
           tanggal AKHIR, karena lembarnya untuk pekan-pekan ke depan. */
        const wb = new ExcelJS.Workbook();
        F.lembarParaf(wb, {
            wb, kop: Kop, logo, profil, jenis: tab,
            judul: JUDUL_FORMULIR[tab],
            sub: state.ta ? `Tahun Pelajaran ${state.ta}` : "",
            namaLembar: "Formulir Paraf",
            ttd, baris: barisFormulir(tab, state.akhir),
        });

        const buf = await wb.xlsx.writeBuffer();
        const blob = new Blob([buf], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `Formulir_Paraf_Piket_${besar(tab)}.xlsx`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);

        kabar(`Formulir paraf piket ${JENIS[tab]} diunduh — satu lembar kosong sepekan, `
            + "siap diperbanyak untuk pekan-pekan berikutnya.");
    } catch (err) {
        laporError("Gagal membuat formulir paraf", err);
    } finally {
        tombol.disabled = false;
        tombol.textContent = teksLama;
    }
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
