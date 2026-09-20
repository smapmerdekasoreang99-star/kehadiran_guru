// =========================================================
// Pelaksanaan Piket — Guru Pengganti SMA Plus Merdeka Soreang
// =========================================================
// Halaman ini hanya mencatat PELAKSANAAN. Penugasannya ada di tempat lain:
//   Meja Sekolah : tabel piket (Data Induk → Piket & Honor)
//   Unit         : guru_tugas jenis "Diperbantukan" (Data Induk → Tugas Guru)
//   Parkiran     : tabel piket_parkiran (Data Induk → Piket & Honor)
// Semua catatan masuk ke satu tabel kg_pelaksanaan_piket dengan pembeda
// kolom `jenis`, karena bentuk datanya sama: satu petugas, satu tanggal,
// hadir atau tidak.

import { supabaseClient, isSupabaseConfigured } from "../assets/supabase-client.js?v=20260920t";
import { demoData } from "../assets/demo-data.js?v=20260920t";
import { isUnlocked, initLockUI } from "../assets/auth-gate.js?v=20260920t";
import { terapkanUrutan, peringkatGuru } from "../assets/guru-order.js?v=20260920t";

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
const JENIS = { meja: "Meja Sekolah", unit: "Unit", parkiran: "Parkiran" };

function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let state = {
    tanggal: isSupabaseConfigured ? todayISO() : "2026-09-14",
    hari: "Senin",
    tab: "meja",
    guru: [],
    petugasMeja: [],      // [{ guru_id, nama, jam: [1,2,3] }]
    petugasUnit: [],      // [{ tugas_id, guru_id, nama, unit, jam_per_minggu }]
    petugasParkiran: [],  // [{ guru_id, nama, catatan }]
    catatan: [],          // baris kg_pelaksanaan_piket pada tanggal ini
    libur: null,
};

const namaGuru = (id) => state.guru.find((g) => g.id === id)?.nama || id;

// Satu baris catatan dikenali dari tanggal + jenis + petugas + unit.
// tugas_id hanya dipakai jenis Unit; di luar itu selalu null.
function cariCatatan(jenis, guruId, tugasId = null) {
    return state.catatan.find((c) => c.jenis === jenis && c.guru_id === guruId
        && (c.tugas_id ?? null) === (tugasId ?? null));
}

// ---------- Boot ----------
async function boot() {
    document.getElementById("notice").hidden = isSupabaseConfigured;

    if (isSupabaseConfigured) {
        const { data: guru, error: eG } = await terapkanUrutan(
            supabaseClient.from("v_guru").select("id, nama, status_aktif, tmt_sekolah"));
        if (eG) { laporError("Gagal memuat data guru", eG); return; }
        state.guru = guru || [];
    } else {
        state.guru = demoData.guru.map((g) => ({ ...g, status_aktif: "Aktif" }));
    }

    const tanggalInput = document.getElementById("tanggalPicker");
    tanggalInput.value = state.tanggal;
    tanggalInput.addEventListener("change", async (e) => {
        state.tanggal = e.target.value;
        await muatTanggal();
    });

    document.querySelectorAll(".rekap-tab").forEach((b) => b.addEventListener("click", () => {
        state.tab = b.dataset.tab;
        document.querySelectorAll(".rekap-tab").forEach((x) => x.classList.toggle("active", x === b));
        for (const t of ["meja", "unit", "parkiran"]) document.getElementById("tab-" + t).hidden = b.dataset.tab !== t;
    }));

    for (const tab of ["meja", "unit", "parkiran"]) {
        document.getElementById(idSimpan(tab)).addEventListener("click", () => simpanBelumTercatat(tab));
        document.getElementById(idBatal(tab)).addEventListener("click", () => batalkanSemua(tab));
    }

    await muatTanggal();
}

async function muatTanggal() {
    state.hari = HARI_FROM_JS_DAY[new Date(state.tanggal + "T00:00:00").getDay()];
    document.getElementById("hariLabel").textContent = state.hari;

    const card = document.getElementById("mainCard");
    const weekend = document.getElementById("weekendNotice");
    const liburBox = document.getElementById("liburNotice");

    if (!HARI_LIST.includes(state.hari)) {
        weekend.hidden = false;
        liburBox.hidden = true;
        card.hidden = true;
        return;
    }
    weekend.hidden = true;
    card.hidden = false;

    // Daftar petugas mengikuti urutan masa kerja seperti daftar guru induknya.
    const urut = peringkatGuru(state.guru);

    if (isSupabaseConfigured) {
        const [meja, unit, parkiran, catatan, libur] = await Promise.all([
            supabaseClient.from("kg_piket").select("guru_id, hari, jam_ke").eq("hari", state.hari),
            supabaseClient.from("v_guru_unit").select("tugas_id, guru_id, nama, unit, jam_per_minggu, mulai, selesai"),
            supabaseClient.from("v_piket_parkiran").select("hari, guru_id, nama, catatan").eq("hari", state.hari),
            supabaseClient.from("kg_pelaksanaan_piket")
                .select("id, tanggal, jenis, guru_id, tugas_id, status, pengganti_id, catatan")
                .eq("tanggal", state.tanggal),
            supabaseClient.from("kg_hari_libur").select("tanggal, keterangan").eq("tanggal", state.tanggal),
        ]);
        for (const [konteks, r] of [["jadwal piket meja sekolah", meja], ["guru diperbantukan", unit],
                                    ["petugas parkiran", parkiran], ["catatan pelaksanaan", catatan]]) {
            if (r.error) { laporError(`Gagal memuat ${konteks}`, r.error); return; }
        }

        // Satu baris per petugas per hari; jam jaganya hanya keterangan.
        const perGuru = new Map();
        for (const p of meja.data || []) {
            if (!perGuru.has(p.guru_id)) perGuru.set(p.guru_id, { guru_id: p.guru_id, nama: namaGuru(p.guru_id), jam: [] });
            if (p.jam_ke != null) perGuru.get(p.guru_id).jam.push(p.jam_ke);
        }
        state.petugasMeja = [...perGuru.values()].sort((a, b) => urut(a.guru_id) - urut(b.guru_id));

        // Tugas unit yang belum mulai atau sudah selesai pada tanggal ini tidak ikut.
        state.petugasUnit = (unit.data || [])
            .filter((u) => (!u.mulai || u.mulai <= state.tanggal) && (!u.selesai || u.selesai >= state.tanggal))
            .sort((a, b) => String(a.unit).localeCompare(String(b.unit), "id") || urut(a.guru_id) - urut(b.guru_id));

        state.petugasParkiran = parkiran.data || [];
        state.catatan = catatan.data || [];
        state.libur = (libur.data || [])[0] || null;
    } else {
        const perGuru = new Map();
        for (const p of (demoData.piket || []).filter((p) => p.hari === state.hari)) {
            if (!perGuru.has(p.guru_id)) perGuru.set(p.guru_id, { guru_id: p.guru_id, nama: namaGuru(p.guru_id), jam: [] });
            perGuru.get(p.guru_id).jam.push(p.jam_ke);
        }
        state.petugasMeja = [...perGuru.values()].sort((a, b) => urut(a.guru_id) - urut(b.guru_id));
        state.petugasUnit = [{ tugas_id: 9001, guru_id: demoData.guru[2]?.id, nama: demoData.guru[2]?.nama, unit: "Laboratorium IPA", jam_per_minggu: 4 }];
        state.petugasParkiran = [{ hari: state.hari, guru_id: demoData.guru[0]?.id, nama: demoData.guru[0]?.nama, catatan: null }];
        state.libur = null;
    }

    liburBox.hidden = !state.libur;
    if (state.libur) {
        liburBox.textContent = `Tanggal ini tercatat sebagai hari libur${state.libur.keterangan ? ` (${state.libur.keterangan})` : ""}. `
            + "Biasanya tidak ada piket; bila tetap ada petugas yang bertugas, catatannya boleh diisi.";
    }

    render();
}

// ---------- Render ----------
const besar = (tab) => tab[0].toUpperCase() + tab.slice(1);
const idSimpan = (tab) => "simpan" + besar(tab);
const idBatal = (tab) => "batal" + besar(tab);

const BULAN_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
                  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
function tglIndo(iso) {
    const d = new Date(iso + "T00:00:00");
    return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

// Seluruh catatan satu jenis pada tanggal yang sedang dibuka. Sengaja
// dihitung dari state.catatan, bukan dari baris yang tampil: bila jadwal
// piketnya diubah SESUDAH pelaksanaannya dicatat, catatan petugas lama
// tetap ada di database walau namanya tidak lagi muncul di tabel. Kalau
// dihitung dari tabel, catatan itu tertinggal dan diam-diam ikut terhitung
// di Induk Pembiayaan.
const catatanJenis = (tab) => state.catatan.filter((c) => c.jenis === JENIS[tab]);

function render() {
    renderTabel("meja");
    renderTabel("unit");
    renderTabel("parkiran");
}

function daftarPetugas(tab) {
    if (tab === "meja") return state.petugasMeja;
    if (tab === "unit") return state.petugasUnit;
    return state.petugasParkiran;
}

// Petugas piket umumnya hadir, jadi "Hadir" sudah terpilih sejak awal dan
// yang perlu diubah hanya yang menyimpang. Pilihannya belum tersimpan sampai
// ada tindakan: kalau kehadiran ikut tertulis begitu halaman dibuka, tanggal
// yang tidak pernah dibuka siapa pun akan terbaca seolah semua orang hadir —
// dan untuk parkiran itu berarti uang yang tidak pernah dikonfirmasi.
function selStatus(nilai, aktif, draf) {
    // Pada hari libur biasanya memang tidak ada piket, jadi di situ tidak ada
    // yang dianggap hadir lebih dulu — kalau tidak, satu klik bisa mencatat
    // sehari penuh kehadiran yang tidak pernah terjadi.
    const bawaan = draf ? (state.libur ? "" : "Hadir") : (nilai || "");
    const opsi = [["Hadir", "Hadir"], ["Tidak Hadir", "Tidak hadir"], ["Digantikan", "Digantikan"]];
    if (draf) { if (state.libur) opsi.unshift(["", "— tidak ada piket —"]); }
    else opsi.push(["", "— batalkan catatan —"]);
    return `<select class="kelas-filter" data-aksi="status" ${aktif ? "" : "disabled"} style="min-width:190px">${
        opsi.map(([v, t]) => `<option value="${v}" ${v === bawaan ? "selected" : ""}>${t}</option>`).join("")
    }</select>`;
}

// Selalu digambar, tetapi mati sampai statusnya "Digantikan" — supaya
// pilihannya tinggal dipakai begitu status diubah, tanpa menggambar ulang.
function selPengganti(terjadwalId, nilai, aktif, perlu) {
    const calon = state.guru.filter((g) => g.id !== terjadwalId && (g.status_aktif ?? "Aktif") === "Aktif");
    return `<select class="kelas-filter" data-aksi="pengganti" ${aktif && perlu ? "" : "disabled"} style="min-width:200px">
        <option value="">${perlu ? "— pilih pengganti —" : "—"}</option>
        ${calon.map((g) => `<option value="${esc(g.id)}" ${g.id === (nilai || "") ? "selected" : ""}>${esc(g.nama)}</option>`).join("")}
      </select>`;
}

function renderTabel(tab) {
    const jenis = JENIS[tab];
    const unlocked = isUnlocked();
    const daftar = daftarPetugas(tab);
    const body = document.getElementById("body" + besar(tab));
    const kosong = document.getElementById("kosong" + besar(tab));

    kosong.hidden = daftar.length > 0;
    body.innerHTML = daftar.map((p) => {
        const tugasId = tab === "unit" ? p.tugas_id : null;
        const c = cariCatatan(jenis, p.guru_id, tugasId);
        const status = c?.status || "";
        const perluPengganti = status === "Digantikan";
        const kolomTengah = tab === "meja"
            ? `<td>${p.jam.length ? "jam ke-" + ringkasJam(p.jam) : '<span class="tugas-note">—</span>'}</td>`
            : tab === "unit" ? `<td>${esc(p.unit || "—")}</td>` : "";
        return `<tr data-guru="${esc(p.guru_id)}" data-tugas="${tugasId == null ? "" : esc(tugasId)}" data-jenis="${esc(jenis)}"
                    class="${c ? "" : "belum"}">
            <td class="nama">${esc(p.nama)}${status === "Digantikan"
                ? `<br><span class="tugas-note">digantikan ${esc(namaGuru(c.pengganti_id))}</span>`
                : c ? "" : '<br><span class="tugas-note">belum disimpan</span>'}</td>
            ${kolomTengah}
            <td>${selStatus(status, unlocked, !c)}</td>
            <td>${selPengganti(p.guru_id, c?.pengganti_id, unlocked, perluPengganti)}</td>
            <td><input type="text" class="kelas-filter" data-aksi="catatan" style="min-width:160px"
                 value="${esc(c?.catatan || "")}" placeholder="opsional" ${unlocked ? "" : "disabled"}></td>
          </tr>`;
    }).join("");

    pasangAksi(body, tab);

    // Tombolnya menyebut berapa baris yang masih tertunda, supaya jelas ada
    // yang belum tersimpan tanpa perlu menghitung sendiri.
    const belum = [...body.querySelectorAll("tr.belum")]
        .filter((tr) => tr.querySelector('[data-aksi="status"]').value).length;
    const tombol = document.getElementById(idSimpan(tab));
    tombol.disabled = !unlocked || !belum;
    tombol.textContent = belum ? `Simpan ${belum} yang belum tercatat` : "Semua sudah tercatat";

    /* Jalan keluar bila ternyata salah — misalnya tanggalnya keliru dan
       sehari penuh terlanjur tercatat. Membatalkan satu per satu lewat
       pilihan "— batalkan catatan —" di kolom status tetap bisa, tetapi
       untuk 20-an baris itu menyiksa. Tombolnya hanya muncul kalau memang
       ada yang bisa dibatalkan, supaya tidak menggoda saat tidak perlu. */
    const sudah = catatanJenis(tab).length;
    const batal = document.getElementById(idBatal(tab));
    batal.hidden = !sudah;
    batal.disabled = !unlocked;
    batal.textContent = `Batalkan ${sudah} catatan tanggal ini`;
    batal.title = unlocked ? "" : "Buka kunci edit dahulu";

    renderRingkas(tab);
}

// "jam ke-1, 2, 3" ditulis "1–3" bila berurutan, supaya kolomnya tidak panjang.
function ringkasJam(jam) {
    const urut = [...new Set(jam)].sort((a, b) => a - b);
    if (urut.length === 0) return "";
    if (urut.length > 1 && urut[urut.length - 1] - urut[0] === urut.length - 1)
        return `${urut[0]}–${urut[urut.length - 1]}`;
    return urut.join(", ");
}

function renderRingkas(tab) {
    const jenis = JENIS[tab];
    const daftar = daftarPetugas(tab);
    const n = (s) => daftar.filter((p) => cariCatatan(jenis, p.guru_id, tab === "unit" ? p.tugas_id : null)?.status === s).length;
    const belum = daftar.length - n("Hadir") - n("Tidak Hadir") - n("Digantikan");
    const el = document.getElementById("ringkas" + besar(tab));
    el.textContent = daftar.length
        ? `${daftar.length} petugas terjadwal · ${n("Hadir")} hadir · ${n("Digantikan")} digantikan · ${n("Tidak Hadir")} tidak hadir · ${belum} belum dicatat`
        : "";

    if (tab === "parkiran") {
        const terlaksana = n("Hadir") + n("Digantikan");
        document.getElementById("footParkiran").textContent =
            `${terlaksana} hari jaga terhitung pada tanggal ini. Bila petugas digantikan, harinya `
            + "jatuh ke penggantinya. Besaran kompensasinya dihitung di aplikasi Induk Pembiayaan.";
    }
}

function pasangAksi(body, tab) {
    body.querySelectorAll("tr").forEach((tr) => {
        const baris = {
            jenis: tr.dataset.jenis,
            guruId: tr.dataset.guru,
            tugasId: tr.dataset.tugas === "" ? null : Number(tr.dataset.tugas),
        };
        const q = (aksi) => tr.querySelector(`[data-aksi="${aksi}"]`);

        q("status").addEventListener("change", () => simpanBaris(baris, tr, tab));
        q("pengganti").addEventListener("change", () => simpanBaris(baris, tr, tab));
        q("catatan").addEventListener("change", () => simpanBaris(baris, tr, tab));
    });
}

// ---------- Simpan ----------
async function simpanBaris(baris, tr, tab) {
    const status = tr.querySelector('[data-aksi="status"]').value;
    const pengSel = tr.querySelector('[data-aksi="pengganti"]');
    const catatan = tr.querySelector('[data-aksi="catatan"]').value.trim() || null;
    const lama = cariCatatan(baris.jenis, baris.guruId, baris.tugasId);

    // Status kosong = catatan dibatalkan.
    if (!status) {
        if (lama) await hapusCatatan(lama);
        renderTabel(tab);
        return;
    }

    // Status "Digantikan" tanpa pengganti belum lengkap: buka pilihannya dan
    // tunggu. Tanpa ini database menolak barisnya (constraint), dan
    // penolakannya tidak jelas bagi pengguna.
    if (status === "Digantikan" && !pengSel.value) {
        pengSel.disabled = false;
        pengSel.options[0].textContent = "— pilih pengganti —";
        pengSel.focus();
        return;
    }

    const isi = {
        tanggal: state.tanggal,
        jenis: baris.jenis,
        guru_id: baris.guruId,
        tugas_id: baris.tugasId,
        status,
        pengganti_id: status === "Digantikan" ? pengSel.value : null,
        catatan,
    };

    if (!isSupabaseConfigured) {
        if (lama) Object.assign(lama, isi);
        else state.catatan.push({ id: "D" + Date.now(), ...isi });
        renderTabel(tab);
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
    renderTabel(tab);
}

async function hapusCatatan(baris) {
    if (isSupabaseConfigured) {
        const { error } = await supabaseClient.from("kg_pelaksanaan_piket").delete().eq("id", baris.id);
        if (error) { laporError("Gagal membatalkan catatan piket", error); return; }
    }
    state.catatan = state.catatan.filter((c) => c !== baris);
}

// Menyimpan baris yang statusnya sudah terpilih di layar tetapi belum tercatat
// di database — umumnya seluruhnya "Hadir". Yang sudah tercatat tidak ditimpa,
// dan baris "Digantikan" yang penggantinya belum dipilih dilewati supaya tidak
// tersimpan berbeda dari yang terbaca di layar.
async function simpanBelumTercatat(tab) {
    if (!isUnlocked()) return;
    const jenis = JENIS[tab];
    const body = document.getElementById("body" + besar(tab));
    let tertunda = 0;

    for (const tr of [...body.querySelectorAll("tr.belum")]) {
        const guruId = tr.dataset.guru;
        const tugasId = tr.dataset.tugas === "" ? null : Number(tr.dataset.tugas);
        if (cariCatatan(jenis, guruId, tugasId)) continue;
        const status = tr.querySelector('[data-aksi="status"]').value;
        if (!status) continue;
        const pengganti = tr.querySelector('[data-aksi="pengganti"]').value;
        if (status === "Digantikan" && !pengganti) { tertunda += 1; continue; }

        const isi = { tanggal: state.tanggal, jenis, guru_id: guruId, tugas_id: tugasId, status,
                      pengganti_id: status === "Digantikan" ? pengganti : null,
                      catatan: tr.querySelector('[data-aksi="catatan"]').value.trim() || null };
        if (!isSupabaseConfigured) { state.catatan.push({ id: "D" + Date.now() + guruId, ...isi }); continue; }
        const { data, error } = await supabaseClient.from("kg_pelaksanaan_piket").insert(isi).select().single();
        if (error) { laporError("Gagal menyimpan catatan piket", error); break; }
        state.catatan.push(data);
    }
    if (tertunda) laporError("Sebagian belum tersimpan",
        { message: `${tertunda} baris berstatus Digantikan belum menyebut penggantinya.` });
    renderTabel(tab);
}

/* Membatalkan SELURUH catatan satu jenis pada tanggal yang sedang dibuka.
   Kasus yang ditangani: tanggalnya keliru, lalu sehari penuh terlanjur
   tercatat. Membatalkan satu per satu lewat pilihan "— batalkan catatan —"
   di kolom status tetap bisa dan tetap berguna untuk memperbaiki satu
   orang; yang ini untuk sekali hapus.

   Penghapusannya tidak bisa dikembalikan, jadi jumlah, jenis, dan
   tanggalnya disebut lengkap lebih dulu. Memakai confirm bawaan peramban
   dan bukan dialog buatan sendiri — dialog buatan sendiri pernah tertimbun
   toolbar sehingga tombolnya tidak bisa ditekan; confirm bawaan digambar
   oleh peramban, di luar jangkauan lapisan halaman. */
async function batalkanSemua(tab) {
    if (!isUnlocked()) return;
    const baris = catatanJenis(tab);
    if (!baris.length) return;

    const setuju = confirm(
        `Batalkan ${baris.length} catatan piket ${JENIS[tab]} pada ${tglIndo(state.tanggal)}?\n\n`
        + `Seluruh petugas pada tanggal itu kembali berstatus "belum dicatat", `
        + `dan tanggal ini tidak lagi terhitung di Induk Pembiayaan.\n\n`
        + `Yang dibatalkan tidak bisa dikembalikan — harus dicatat ulang.`);
    if (!setuju) return;

    if (isSupabaseConfigured) {
        const { error } = await supabaseClient.from("kg_pelaksanaan_piket")
            .delete().in("id", baris.map((c) => c.id));
        if (error) { laporError("Gagal membatalkan catatan piket", error); return; }
    }
    state.catatan = state.catatan.filter((c) => c.jenis !== JENIS[tab]);
    renderTabel(tab);
    kabar(`${baris.length} catatan piket ${JENIS[tab]} pada ${tglIndo(state.tanggal)} dibatalkan. `
        + `Petugasnya kembali berstatus belum dicatat.`);
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
