// =========================================================
// Kehadiran Staf — Guru Pengganti SMA Plus Merdeka Soreang
// =========================================================
// Mencatat HARI HADIR tenaga kependidikan yang honornya bergantung
// kedatangan: pola honor "bulanan + insentif kedatangan" (mis. satpam) dan
// "upah harian" (mis. tenaga harian kebersihan). Siapa berpola apa ditetapkan
// di Data Induk → Tugas Guru; ketentuan jam kerja dan hari libur kerja tiap
// orang di Data Induk → Jam Kerja Staf. Di sini hanya dicatat hadir atau
// tidak, dengan jam masuk dan pulang bila perlu.
//
// Staf berpola bulanan murni TIDAK ditampilkan: honornya tidak bergantung
// hari hadir, jadi mencatatnya di sini hanya menambah pekerjaan tanpa arti.
//
// Sumbu matriksnya: baris = orang, kolom = tanggal. Berbeda dengan
// Pelaksanaan Piket (baris tanggal), karena yang dibaca di sini adalah
// "siapa yang sudah berapa hari" — dan orangnya sedikit, tanggalnya banyak.
//
// Satu catatan = satu orang satu tanggal (kunci unik). Menyimpan ulang
// tanggal yang sudah ada berarti MENIMPA, sehingga unggahan rekaman
// fingerprint yang diulang tidak menggandakan apa pun.
//
// Rekaman mesin fingerprint diunggah lewat tombol "Unggah fingerprint":
// berkas ekspor mesin (satu baris per orang per tanggal) dibaca di browser,
// No. ID mesin dipetakan ke guru (peta disimpan di kg_fingerprint_pengguna),
// lalu tiap barisnya menjadi catatan bersumber "fingerprint". Yang terekam
// mesin bukan hanya staf berupah harian, jadi siapa pun yang punya catatan
// dalam rentang ikut tampil — dengan ketentuan jam kerja bawaan sekolah bila
// ia bukan pemegang tugas Staf.
// Rupiahnya dihitung Induk Pembiayaan lewat f_ip_kehadiran_staf.

import { supabaseClient, isSupabaseConfigured } from "../assets/supabase-client.js?v=20260921v";
import { isUnlocked, initLockUI } from "../assets/auth-gate.js?v=20260921v";
import { peringkatGuru } from "../assets/guru-order.js?v=20260921v";
import { muatRujukan } from "../assets/simpanan.js?v=20260921ad";

try { initLockUI(() => render()); } catch (err) { console.error("Gagal memasang tombol kunci:", err); }

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

const TABEL = "kg_kehadiran_staf";
const HARI_FROM_JS_DAY = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const HARI_PENDEK = { Senin: "Sen", Selasa: "Sel", Rabu: "Rab", Kamis: "Kam", Jumat: "Jum", Sabtu: "Sab" };
const BULAN_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
                  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const POLA = { bulanan: "bulanan", bulanan_harian: "bulanan + insentif kedatangan", harian: "upah harian" };
/* Batas kolom yang digambar sekaligus — dua bulan cukup, dan rekap
   memakai rentang yang sama. */
const MAKS_HARI = 62;

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const jam5 = (t) => String(t || "").slice(0, 5);
const isoDari = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayISO = () => isoDari(new Date());
function tglIndo(iso) { const d = new Date(iso + "T00:00:00"); return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`; }
function tglPendek(iso) { const d = new Date(iso + "T00:00:00"); return `${d.getDate()} ${BULAN_PENDEK[d.getMonth()]}`; }

let state = {
    awal: "", akhir: "",
    tab: "matriks",
    guru: [],          // v_guru, untuk urutan masa kerja
    jamKerja: [],      // v_jam_kerja_guru: satu baris per staf per hari
    catatan: [],       // kg_kehadiran_staf dalam rentang
    libur: new Map(),  // tanggal -> keterangan (hari libur sekolah)
    hari: [],          // [{ iso, hari }] Senin–Sabtu dalam rentang
    jamBawaan: new Map(), // hari -> ketentuan bawaan sekolah (jam_kerja), bagi yang bukan Staf
    peta: new Map(),      // no_id mesin -> { nama_mesin, guru_id, abaikan }
};

const cariCatatan = (tanggal, guruId) => state.catatan.find((c) => c.tanggal === tanggal && c.guru_id === guruId);

/* Staf yang hari hadirnya perlu dicatat, beserta ketentuan jam kerjanya
   per hari. Diturunkan dari v_jam_kerja_guru, yang sudah menggabungkan
   bawaan sekolah dan pengecualian per orang. */
function daftarStaf() {
    const per = new Map();
    for (const r of state.jamKerja) {
        if (!per.has(r.guru_id)) {
            const pola = r.pola_honor || "bulanan";
            per.set(r.guru_id, { guruId: r.guru_id, nama: r.nama, jabatan: r.jabatan || "Staf",
                                 pola, sumber: r.sumber_hadir || "fingerprint", jam: new Map(),
                                 // Hari hadirnya menentukan honor: hanya mereka yang
                                 // boleh diisi Hadir sekaligus lewat "Simpan yang belum tercatat".
                                 perluCatat: pola !== "bulanan" });
        }
        per.get(r.guru_id).jam.set(r.hari, { bekerja: !!r.bekerja, masuk: r.masuk, pulang: r.pulang, sumber: r.sumber });
    }
    // Yang punya catatan dalam rentang tetapi bukan pemegang tugas Staf — guru
    // biasa yang terekam mesin fingerprint. Tanpa hari kerja (kehadirannya
    // tidak menentukan honor), ketentuannya jam kerja bawaan sekolah.
    for (const c of state.catatan) {
        if (per.has(c.guru_id)) continue;
        const g = state.guru.find((x) => x.id === c.guru_id);
        per.set(c.guru_id, { guruId: c.guru_id, nama: g?.nama || c.guru_id, jabatan: "Guru", pola: "",
                             sumber: "fingerprint", jam: new Map(), perluCatat: false, tanpaKetentuan: true });
    }
    const urut = peringkatGuru(state.guru);
    const semua = [...per.values()].sort((a, b) => urut(a.guruId) - urut(b.guruId) || a.nama.localeCompare(b.nama, "id"));
    const punyaCatatan = new Set(state.catatan.map((c) => c.guru_id));
    return {
        tampil: semua.filter((s) => s.perluCatat || punyaCatatan.has(s.guruId)),
        bulanan: semua.filter((s) => !s.perluCatat && !punyaCatatan.has(s.guruId)).length,
    };
}

// Ketentuan jam pada satu hari: milik orang itu, atau bawaan sekolah bila
// ia tidak punya baris jam kerja (bukan Staf). Dipakai untuk membandingkan
// jam masuk/pulang — BUKAN untuk menentukan hari kerja (lihat bekerjaPada).
const ketentuanPada = (s, hari) => s.jam.get(hari) || state.jamBawaan.get(hari) || null;
const labelStaf = (s) => [s.jabatan, POLA[s.pola] || s.pola, s.sumber === "fingerprint" && "fingerprint"].filter(Boolean).join(" · ");
const menitDari = (t) => { const [h, m] = jam5(t).split(":").map(Number); return h * 60 + (m || 0); };

// Hari kerja orang itu pada tanggal itu: menurut ketentuannya, dan bukan hari libur sekolah.
const bekerjaPada = (s, d) => !!s.jam.get(d.hari)?.bekerja && !state.libur.has(d.iso);

// ---------- Boot ----------
async function boot() {
    document.getElementById("notice").hidden = isSupabaseConfigured;

    if (isSupabaseConfigured) {
        try {
            const r = await muatRujukan(supabaseClient, ["guru"], (baru) => { state.guru = baru.guru; render(); });
            state.guru = r.guru;
        } catch (err) { laporError("Gagal memuat daftar guru", err); return; }
        const [jb, pt] = await Promise.all([
            supabaseClient.from("jam_kerja").select("hari, urutan, aktif, masuk, pulang"),
            supabaseClient.from("kg_fingerprint_pengguna").select("no_id, nama_mesin, guru_id, abaikan"),
        ]);
        if (jb.error) laporError("Gagal memuat jam kerja bawaan sekolah", jb.error);
        else state.jamBawaan = new Map((jb.data || []).map((r) => [r.hari, { bekerja: !!r.aktif, masuk: r.masuk, pulang: r.pulang, sumber: "bawaan" }]));
        if (pt.error) laporError("Gagal memuat peta pengguna mesin fingerprint (unggahan fingerprint tidak akan bisa disimpan)", pt.error);
        else state.peta = new Map((pt.data || []).map((r) => [String(r.no_id), r]));
    }

    const awal = document.getElementById("tglAwal");
    const akhir = document.getElementById("tglAkhir");
    for (const el of [awal, akhir]) {
        el.addEventListener("change", async () => { state.awal = awal.value; state.akhir = akhir.value; await muatRentang(); });
    }
    document.querySelectorAll(".rekap-tab").forEach((b) => b.addEventListener("click", () => {
        state.tab = b.dataset.tab;
        document.querySelectorAll(".rekap-tab").forEach((x) => x.classList.toggle("active", x === b));
        for (const t of ["matriks", "rekap"]) document.getElementById("tab-" + t).hidden = b.dataset.tab !== t;
        render();
    }));
    document.getElementById("simpanSemua").addEventListener("click", simpanBelumTercatat);
    document.getElementById("batalSemua").addEventListener("click", batalkanSemua);

    pasangPekanPintas();
    pasangModal();
    pasangModalFinger();
    pasangPekan(seninDari(todayISO()));
}

// ---------- Rentang ----------
function seninDari(iso) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
}
// Sepekan Senin–Sabtu: Sabtu ikut karena jam kerja bawaan mengenalnya
// (dan sebagian staf memang bekerja Sabtu).
function pasangPekan(senin) {
    const sabtu = new Date(senin); sabtu.setDate(senin.getDate() + 5);
    state.awal = isoDari(senin); state.akhir = isoDari(sabtu);
    document.getElementById("tglAwal").value = state.awal;
    document.getElementById("tglAkhir").value = state.akhir;
    muatRentang();
}
function pasangPekanPintas() {
    const geser = (pekan) => { const s = seninDari(state.awal || todayISO()); s.setDate(s.getDate() + pekan * 7); pasangPekan(s); };
    document.getElementById("pekanIni").addEventListener("click", () => pasangPekan(seninDari(todayISO())));
    document.getElementById("pekanMundur").addEventListener("click", () => geser(-1));
    document.getElementById("pekanMaju").addEventListener("click", () => geser(1));
}

function hariRentang(awal, akhir) {
    const out = [];
    const d = new Date(awal + "T00:00:00"), batas = new Date(akhir + "T00:00:00");
    while (d <= batas && out.length < MAKS_HARI) {
        const hari = HARI_FROM_JS_DAY[d.getDay()];
        if (hari !== "Minggu") out.push({ iso: isoDari(d), hari });
        d.setDate(d.getDate() + 1);
    }
    return out;
}

async function muatRentang() {
    const card = document.getElementById("mainCard");
    const pesan = document.getElementById("pesanRentang");
    const liburBox = document.getElementById("liburNotice");
    const label = document.getElementById("rentangLabel");
    const tampilkanPesan = (teks) => { pesan.textContent = teks; pesan.hidden = false; liburBox.hidden = true; card.hidden = true; state.hari = []; label.textContent = "—"; };

    if (!state.awal || !state.akhir) return tampilkanPesan("Pilih tanggal mulai dan tanggal akhir.");
    if (state.akhir < state.awal) return tampilkanPesan("Tanggal akhir lebih awal daripada tanggal mulai. Tukar keduanya dahulu.");
    state.hari = hariRentang(state.awal, state.akhir);
    if (!state.hari.length) return tampilkanPesan("Tidak ada hari kerja dalam rentang ini.");
    if (state.hari.length >= MAKS_HARI) return tampilkanPesan(`Rentangnya terlalu panjang — paling banyak ${MAKS_HARI} hari sekaligus. Persempit, misalnya satu bulan.`);
    label.textContent = `${state.hari.length} hari`;
    pesan.hidden = true; card.hidden = false;

    if (isSupabaseConfigured) {
        const [jk, catatan, libur] = await Promise.all([
            supabaseClient.from("v_jam_kerja_guru")
                .select("guru_id, nama, hari, urutan, sumber, bekerja, masuk, pulang, jabatan, pola_honor, sumber_hadir"),
            supabaseClient.from(TABEL).select("id, tanggal, guru_id, status, masuk, pulang, sumber, catatan")
                .gte("tanggal", state.awal).lte("tanggal", state.akhir),
            supabaseClient.from("kg_hari_libur").select("tanggal, keterangan")
                .gte("tanggal", state.awal).lte("tanggal", state.akhir),
        ]);
        if (jk.error) { laporError("Gagal memuat ketentuan jam kerja staf", jk.error); return; }
        if (catatan.error) { laporError("Gagal memuat catatan kehadiran staf", catatan.error); return; }
        state.jamKerja = jk.data || [];
        state.catatan = catatan.data || [];
        state.libur = new Map((libur.data || []).map((l) => [l.tanggal, l.keterangan || ""]));
    } else {
        state.jamKerja = []; state.catatan = []; state.libur = new Map();
    }

    const liburDalamRentang = state.hari.filter((d) => state.libur.has(d.iso));
    liburBox.hidden = !liburDalamRentang.length;
    if (liburDalamRentang.length) {
        liburBox.innerHTML = `<b>${liburDalamRentang.length} hari libur sekolah dalam rentang ini:</b> `
            + liburDalamRentang.map((d) => esc(tglPendek(d.iso) + (state.libur.get(d.iso) ? ` (${state.libur.get(d.iso)})` : ""))).join(", ")
            + ". Hari itu tidak dihitung hari kerja dan tidak ikut terisi Hadir sendiri; bila ada yang tetap bertugas, catat satu per satu.";
    }
    render();
}

// ---------- Render ----------
function render() {
    if (!state.hari.length) return;
    if (state.tab === "rekap") renderRekap(); else renderMatriks();
}

function pitaHtml(d, s) {
    const c = cariCatatan(d.iso, s.guruId);
    const status = c ? (c.status === "Tidak Hadir" ? "absen" : "hadir") : "draf";
    const k = ketentuanPada(s, d.hari);
    const ketentuan = k?.bekerja ? `${jam5(k.masuk)}–${jam5(k.pulang)}${s.tanpaKetentuan ? " (bawaan sekolah)" : ""}` : "libur kerja";
    const teks = !c ? "belum" : c.status === "Tidak Hadir" ? "Tidak hadir"
        : c.masuk ? `${jam5(c.masuk)}–${c.pulang ? jam5(c.pulang) : "…"}` : "Hadir";
    const terlambat = c?.status === "Hadir" && c.masuk && k?.masuk && jam5(c.masuk) > jam5(k.masuk);
    const judul = [s.nama, tglIndo(d.iso), `Ketentuan: ${ketentuan}`,
        c ? `Status: ${c.status}${c.masuk ? ` (${jam5(c.masuk)}–${jam5(c.pulang) || "?"})` : ""} · ${c.sumber}` : "Belum dicatat",
        terlambat ? "Masuk lebih lambat dari ketentuan" : "",
        c?.catatan ? `Catatan: ${c.catatan}` : "",
        isUnlocked() ? "Ketuk untuk memilih kehadirannya" : "Buka kunci edit untuk mencatat"].filter(Boolean).join("\n");
    return `<div class="pk-pita lebar ${status}${terlambat ? " terlambat" : ""}" role="button" tabindex="0"
        data-tanggal="${esc(d.iso)}" data-guru="${esc(s.guruId)}" title="${esc(judul)}">${esc(teks)}${
        c?.catatan ? '<span class="pk-tanda" aria-hidden="true">•</span>' : ""}</div>`;
}

function renderMatriks() {
    const { tampil, bulanan } = daftarStaf();
    const hariNyata = todayISO();
    const html = [];
    html.push('<thead><tr><th class="m-sudut">Staf</th>');
    for (const d of state.hari) {
        const libur = state.libur.has(d.iso);
        html.push(`<th class="m-hari${d.iso === hariNyata ? " sekarang" : ""}${libur ? " pk-libur" : ""}" title="${esc(tglIndo(d.iso))}${libur ? " · libur" : ""}">
            <span class="m-jam-ke">${HARI_PENDEK[d.hari]}</span><span class="m-jam-waktu">${esc(tglPendek(d.iso))}</span></th>`);
    }
    html.push("</tr></thead><tbody>");
    for (const s of tampil) {
        const nHadir = state.hari.filter((d) => cariCatatan(d.iso, s.guruId)?.status === "Hadir").length;
        const nKerja = state.hari.filter((d) => bekerjaPada(s, d)).length;
        html.push(`<tr><th scope="row" class="m-label"><span title="${esc(s.nama)}">${esc(s.nama)}</span>
            <small>${esc(labelStaf(s))} · ${s.tanpaKetentuan ? `${nHadir} hadir` : `${nHadir}/${nKerja} hadir`}</small></th>`);
        for (const d of state.hari) {
            const kerja = bekerjaPada(s, d);
            const c = cariCatatan(d.iso, s.guruId);
            const kelas = ["m-sel", "pk-hari-sel", "pk-staf-sel", d.iso === hariNyata && "sekarang", !kerja && "pk-libur"].filter(Boolean).join(" ");
            // Hari libur kerja tetap bisa dicatat (mis. lembur Sabtu), tetapi
            // sel kosongnya tidak menggoda: cukup tulisan "libur".
            // Yang tanpa ketentuan (bukan Staf) tidak punya "hari libur kerja":
            // sel tanpa rekaman dibiarkan kosong, bukan bertuliskan libur.
            html.push(`<td class="${kelas}">${kerja || c ? pitaHtml(d, s) : s.tanpaKetentuan ? "" : '<span class="pk-kosong-teks">libur</span>'}</td>`);
        }
        html.push("</tr>");
    }
    html.push("</tbody>");

    const table = document.getElementById("matriksStaf");
    table.innerHTML = html.join("");
    table.classList.toggle("bisa-ubah", isUnlocked());
    table.style.minWidth = `${190 + state.hari.length * 92}px`;
    document.getElementById("kosongStaf").hidden = tampil.length > 0;
    document.querySelector("#tab-matriks .matriks-scroll").hidden = !tampil.length;

    const unlocked = isUnlocked();
    table.querySelectorAll(".pk-pita").forEach((el) => {
        if (!unlocked) { el.removeAttribute("tabindex"); el.removeAttribute("role"); return; }
        el.addEventListener("click", () => bukaPilihan(el));
        el.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); bukaPilihan(el); } });
    });
    // Sel libur yang belum tercatat pun bisa diketuk saat edit aktif.
    if (unlocked) table.querySelectorAll("td.pk-libur").forEach((td) => {
        if (td.querySelector(".pk-pita")) return;
        const i = [...td.parentElement.children].indexOf(td) - 1;
        const s = tampil[[...table.tBodies[0].rows].indexOf(td.parentElement)];
        const d = state.hari[i];
        if (!s || !d) return;
        td.style.cursor = "pointer";
        td.addEventListener("click", () => bukaPilihan({ dataset: { tanggal: d.iso, guru: s.guruId } }));
    });

    renderRingkas(tampil, bulanan);
}

function hitungStaf(s) {
    const kerja = state.hari.filter((d) => bekerjaPada(s, d));
    let hadir = 0, tidak = 0, terlambat = 0, belum = 0, menitTerlambat = 0, pulangCepat = 0;
    for (const d of state.hari) {
        const c = cariCatatan(d.iso, s.guruId);
        if (!c) { if (bekerjaPada(s, d)) belum++; continue; }
        if (c.status === "Tidak Hadir") tidak++; else hadir++;
        const k = ketentuanPada(s, d.hari);
        if (c.status === "Hadir" && c.masuk && k?.masuk && jam5(c.masuk) > jam5(k.masuk)) {
            terlambat++; menitTerlambat += menitDari(c.masuk) - menitDari(k.masuk);
        }
        if (c.status === "Hadir" && c.pulang && k?.pulang && jam5(c.pulang) < jam5(k.pulang)) pulangCepat++;
    }
    return { hariKerja: kerja.length, hadir, tidak, terlambat, belum, menitTerlambat, pulangCepat };
}

function renderRingkas(tampil, bulanan) {
    const t = tampil.reduce((a, s) => { const h = hitungStaf(s); for (const k in h) a[k] += h[k]; return a; },
        { hariKerja: 0, hadir: 0, tidak: 0, terlambat: 0, belum: 0, menitTerlambat: 0, pulangCepat: 0 });
    document.getElementById("ringkasMatriks").textContent = tampil.length
        ? `${state.hari.length} hari · ${tampil.length} staf · ${t.hariKerja} hari kerja · ${t.hadir} hadir · ${t.tidak} tidak hadir · ${t.belum} belum dicatat`
        : "";
    document.getElementById("footMatriks").textContent =
        (bulanan ? `${bulanan} staf berpola honor bulanan murni tidak ditampilkan karena belum punya catatan dalam rentang ini — honornya tidak bergantung hari hadir. ` : "")
        + "Jam masuk dan pulang tidak wajib; bila diisi, yang lebih lambat dari ketentuan ditandai. "
        + "Rekaman mesin fingerprint diunggah lewat tombol di atas dan menimpa tanggal yang sama; catatan manual dipertahankan kecuali diminta ditimpa. "
        + "Nilai rupiahnya dihitung di aplikasi Induk Pembiayaan.";

    const unlocked = isUnlocked();
    document.getElementById("unggahFinger").disabled = !unlocked;
    const tertunda = draf(tampil).length;
    const tombol = document.getElementById("simpanSemua");
    tombol.disabled = !unlocked || !tertunda;
    tombol.textContent = tertunda ? `Simpan ${tertunda} yang belum tercatat` : "Semua sudah tercatat";
    const batal = document.getElementById("batalSemua");
    batal.hidden = !state.catatan.length;
    batal.disabled = !unlocked;
    batal.textContent = `Batalkan ${state.catatan.length} catatan dalam rentang ini`;
}

function renderRekap() {
    const { tampil } = daftarStaf();
    const num = (v) => `<td class="num">${v}</td>`;
    const persen = (a, b) => b ? `<span class="persen ${a / b >= 0.95 ? "baik" : a / b >= 0.85 ? "sedang" : "rendah"}">${(a / b * 100).toFixed(2).replace(".", ",")}%</span>` : "—";
    const baris = tampil.map((s) => ({ s, h: hitungStaf(s) }));
    document.getElementById("bodyRekap").innerHTML = baris.map(({ s, h }, i) => `<tr>
        <td class="num">${i + 1}</td><td class="nama">${esc(s.nama)}</td><td>${esc(s.jabatan)}</td>
        <td>${esc(POLA[s.pola] || s.pola || "—")}${s.sumber === "fingerprint" ? ' <small style="color:var(--tinta-3)">fingerprint</small>' : ""}</td>
        ${num(h.hariKerja)}${num(h.hadir)}${num(h.tidak)}${num(h.belum)}${num(h.terlambat)}${num(h.menitTerlambat)}${num(h.pulangCepat)}<td class="num">${s.tanpaKetentuan ? "—" : persen(h.hadir, h.hariKerja)}</td></tr>`).join("")
        || `<tr><td colspan="12" class="empty-state">Belum ada staf yang hari hadirnya perlu dicatat.</td></tr>`;
    const t = baris.reduce((a, { h }) => { for (const k in h) a[k] += h[k]; return a; }, { hariKerja: 0, hadir: 0, tidak: 0, terlambat: 0, belum: 0, menitTerlambat: 0, pulangCepat: 0 });
    document.getElementById("footRekap").innerHTML = baris.length ? `<tr class="total"><td></td><td colspan="3">Total (${baris.length} orang)</td>
        ${num(t.hariKerja)}${num(t.hadir)}${num(t.tidak)}${num(t.belum)}${num(t.terlambat)}${num(t.menitTerlambat)}${num(t.pulangCepat)}<td class="num">${persen(t.hadir, t.hariKerja)}</td></tr>` : "";
    document.getElementById("ringkasRekap").textContent = `${tglIndo(state.awal)} – ${tglIndo(state.akhir)} · ${state.catatan.length} catatan`;
}

// ---------- Dialog ----------
let pilihanAktif = null;

function pasangModal() {
    const modal = document.getElementById("statusModal");
    document.getElementById("statusTutup").addEventListener("click", tutupPilihan);
    modal.addEventListener("click", (ev) => { if (ev.target === modal) tutupPilihan(); });
    document.addEventListener("keydown", (ev) => {
        if (ev.key !== "Escape") return;
        if (!modal.hidden) tutupPilihan();
        if (!document.getElementById("fingerModal").hidden) tutupUnggahFinger();
    });
    modal.querySelectorAll(".pilih-hadir button").forEach((b) => b.addEventListener("click", () => simpanStatus(b.dataset.status)));
    document.getElementById("statusHapus").addEventListener("click", () => simpanStatus(""));
}

function bukaPilihan(el) {
    if (!isUnlocked()) return;
    const tanggal = el.dataset.tanggal, guruId = el.dataset.guru;
    const s = daftarStaf().tampil.find((x) => x.guruId === guruId);
    const d = state.hari.find((x) => x.iso === tanggal);
    if (!s || !d) return;
    const c = cariCatatan(tanggal, guruId);
    pilihanAktif = { tanggal, guruId };

    document.getElementById("statusNama").textContent = s.nama;
    document.getElementById("statusSub").textContent = `${s.jabatan} · ${HARI_FROM_JS_DAY[new Date(tanggal + "T00:00:00").getDay()]}, ${tglIndo(tanggal)}`;
    const k = ketentuanPada(s, d.hari);
    document.getElementById("statusKetentuan").textContent = k?.bekerja
        ? `Ketentuan jam kerja hari ini: ${jam5(k.masuk)}–${jam5(k.pulang)}${k.sumber === "khusus" ? " (jam khusus)" : s.tanpaKetentuan ? " (bawaan sekolah)" : ""}.`
        : "Menurut ketentuan, hari ini bukan hari kerjanya.";
    const liburBox = document.getElementById("statusLibur");
    const libur = state.libur.has(tanggal);
    liburBox.hidden = !libur && (!!k?.bekerja || s.tanpaKetentuan);
    liburBox.textContent = libur
        ? `Tanggal ini hari libur sekolah${state.libur.get(tanggal) ? ` (${state.libur.get(tanggal)})` : ""}. Isi hanya bila memang bertugas.`
        : "Hari libur kerja orang ini. Isi hanya bila memang bertugas, misalnya lembur.";

    document.getElementById("statusMasuk").value = jam5(c?.masuk);
    document.getElementById("statusPulang").value = jam5(c?.pulang);
    document.getElementById("statusCatatan").value = c?.catatan || "";
    const terpilih = c ? c.status : "Hadir";
    document.querySelectorAll(".pilih-hadir button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.status === terpilih)));
    document.getElementById("statusHapus").hidden = !c;
    document.getElementById("statusModal").hidden = false;
    document.getElementById("statusMasuk").focus();
}

function tutupPilihan() { document.getElementById("statusModal").hidden = true; pilihanAktif = null; }

// status kosong = catatannya dibatalkan
async function simpanStatus(status) {
    if (!pilihanAktif || !isUnlocked()) return;
    const { tanggal, guruId } = pilihanAktif;
    const masuk = document.getElementById("statusMasuk").value || null;
    const pulang = document.getElementById("statusPulang").value || null;
    const catatan = document.getElementById("statusCatatan").value.trim() || null;
    tutupPilihan();

    const lama = cariCatatan(tanggal, guruId);
    if (!status) {
        if (lama) await hapusCatatan(lama);
        render();
        return;
    }
    // Yang disunting tangan berarti sumbernya manual, walau semula dari
    // mesin — supaya jejak siapa yang menentukan angkanya tidak hilang.
    const isi = { tanggal, guru_id: guruId, status, masuk: status === "Hadir" ? masuk : null,
                  pulang: status === "Hadir" ? pulang : null, sumber: "manual", catatan };
    if (!isSupabaseConfigured) {
        if (lama) Object.assign(lama, isi); else state.catatan.push({ id: "D" + Date.now(), ...isi });
        render(); return;
    }
    const { data, error } = await supabaseClient.from(TABEL).upsert(isi, { onConflict: "tanggal,guru_id" }).select().single();
    if (error) { laporError("Gagal menyimpan kehadiran staf", error); return; }
    if (lama) Object.assign(lama, data); else state.catatan.push(data);
    render();
}

async function hapusCatatan(baris) {
    if (isSupabaseConfigured) {
        const { error } = await supabaseClient.from(TABEL).delete().eq("id", baris.id);
        if (error) { laporError("Gagal membatalkan catatan", error); return; }
    }
    state.catatan = state.catatan.filter((c) => c !== baris);
}

// ---------- Simpan / batalkan sekaligus ----------
/* Hari kerja yang belum punya catatan, sebagai Hadir. Hari libur kerja dan
   hari libur sekolah dilewati: sekali tekan tidak boleh mencatat kedatangan
   yang tidak pernah terjadi — untuk upah harian itu uang yang tidak pernah
   dikonfirmasi. */
function draf(tampil) {
    const out = [];
    for (const s of tampil) for (const d of state.hari) {
        if (!s.perluCatat || !bekerjaPada(s, d) || cariCatatan(d.iso, s.guruId)) continue;
        out.push({ tanggal: d.iso, guru_id: s.guruId, status: "Hadir", sumber: "manual" });
    }
    return out;
}

async function simpanBelumTercatat() {
    if (!isUnlocked()) return;
    const baru = draf(daftarStaf().tampil);
    if (!baru.length) return;
    if (state.hari.length > 1 || baru.length > 1) {
        if (!confirm(`Simpan ${baru.length} catatan kehadiran staf sebagai HADIR pada ${tglIndo(state.awal)} – ${tglIndo(state.akhir)}?\n\n`
            + "Yang sudah tercatat tidak diubah. Setiap baris ikut terhitung di Induk Pembiayaan.")) return;
    }
    if (!isSupabaseConfigured) {
        baru.forEach((b, i) => state.catatan.push({ id: "D" + Date.now() + i, ...b }));
        render(); return;
    }
    let tersimpan = 0;
    for (let i = 0; i < baru.length; i += 200) {
        const { data, error } = await supabaseClient.from(TABEL).insert(baru.slice(i, i + 200)).select();
        if (error) { laporError("Gagal menyimpan kehadiran staf", error); break; }
        state.catatan.push(...(data || []));
        tersimpan += (data || []).length;
    }
    render();
    if (tersimpan) kabar(`${tersimpan} catatan kehadiran staf disimpan sebagai Hadir.`);
}

async function batalkanSemua() {
    if (!isUnlocked() || !state.catatan.length) return;
    const n = state.catatan.length;
    if (!confirm(`Batalkan ${n} catatan kehadiran staf pada ${tglIndo(state.awal)} – ${tglIndo(state.akhir)}?\n\n`
        + "Termasuk yang berasal dari rekaman fingerprint. Yang dibatalkan tidak bisa dikembalikan — harus dicatat ulang.")) return;
    if (isSupabaseConfigured) {
        const id = state.catatan.map((c) => c.id);
        for (let i = 0; i < id.length; i += 200) {
            const { error } = await supabaseClient.from(TABEL).delete().in("id", id.slice(i, i + 200));
            if (error) { laporError("Gagal membatalkan catatan", error); return; }
        }
    }
    state.catatan = [];
    render();
    kabar(`${n} catatan kehadiran staf dalam rentang ini dibatalkan.`);
}

// ---------- Unggah rekaman mesin fingerprint ----------
/* Berkas ekspor mesin: satu baris per orang per tanggal, kolom No. ID, Nama,
   Tanggal, Scan Masuk, Scan Pulang, Absent. Aturan pembacaannya:
     ada scan (masuk atau pulang)  -> Hadir, jamnya ikut tersimpan
     tanpa scan dan Absent = True  -> Tidak Hadir — kecuali hari libur sekolah
                                      atau hari libur kerja orang itu (mesin
                                      tidak tahu kalender sekolah)
     tanpa scan dan tanpa Absent   -> dilewati (mesin tidak menjadwalkannya)
   Scan masuk yang sama persis dengan scan pulang berarti mesin menghitung
   satu sidik jari dua kali; jam pulangnya dianggap tidak ada. */
let unggahan = null;   // hasil pembacaan berkas yang sedang ditinjau di modal

const normalNama = (n) => String(n || "").split(",")[0].replace(/\(.*?\)/g, " ")
    .replace(/^((dra?s?|dr|h|hj|ir|prof|kh|ust|ustadz|ustadzah)\.?\s+)+/i, "")
    .toLowerCase().replace(/[^a-z ]+/g, " ").trim().replace(/\s+/g, " ");

/* Tebakan awal dari nama di mesin: nama lengkap yang sama, atau — bila mesin
   hanya mencatat satu kata — satu-satunya guru aktif yang nama depannya
   itu. Dua kandidat atau lebih berarti tidak ditebak; petugas yang memilih. */
function tebakGuru(namaMesin) {
    const target = normalNama(namaMesin);
    if (!target) return null;
    const aktif = state.guru.filter((g) => g.status_aktif === "Aktif");
    let cocok = aktif.filter((g) => normalNama(g.nama) === target);
    if (cocok.length !== 1 && !target.includes(" ")) cocok = aktif.filter((g) => normalNama(g.nama).split(" ")[0] === target);
    return cocok.length === 1 ? cocok[0].id : null;
}

function jamDari(v) {
    if (v === "" || v == null) return null;
    if (v instanceof Date) return isNaN(v) ? null : `${String(v.getHours()).padStart(2, "0")}:${String(v.getMinutes()).padStart(2, "0")}`;
    if (typeof v === "number") { const mnt = Math.round((v % 1) * 1440); return `${String(Math.floor(mnt / 60)).padStart(2, "0")}:${String(mnt % 60).padStart(2, "0")}`; }
    const m = String(v).trim().match(/^(\d{1,2})[:.](\d{2})/);
    return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}
function tanggalDari(v) {
    if (v instanceof Date) return isNaN(v) ? null : isoDari(v);
    if (typeof v === "number") { const d = window.XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null; }
    const t = String(v).trim();
    let m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : null;
}

function uraiEksporMesin(m) {
    const cari = (b, ...nama) => { for (const n of nama) { const i = b.indexOf(n); if (i >= 0) return i; } return -1; };
    let k = null;
    for (let i = 0; i < Math.min(m.length, 40) && !k; i++) {
        const b = m[i].map((v) => String(v).trim().toLowerCase());
        const noId = cari(b, "no. id", "no.id", "no id", "ac-no.", "ac-no", "id"), tgl = cari(b, "tanggal", "date");
        if (noId >= 0 && tgl >= 0) k = { baris: i, noId, tgl, nama: cari(b, "nama", "name"), emp: cari(b, "emp no.", "emp no", "no."),
            masuk: cari(b, "scan masuk", "clock in", "check-in", "check in", "masuk"), pulang: cari(b, "scan pulang", "clock out", "check-out", "check out", "pulang"),
            absen: cari(b, "absent", "absen", "alpa") };
    }
    if (!k) throw new Error('Baris judul kolom tidak ditemukan. Berkas harus punya kolom "No. ID" dan "Tanggal" — unggah ekspor mesin, bukan matriks rekap.');
    if (k.masuk < 0 || k.pulang < 0) throw new Error('Kolom "Scan Masuk" dan "Scan Pulang" tidak ditemukan di berkas ini.');

    const orang = new Map();
    let nBaris = 0, awal = null, akhir = null;
    for (const r of m.slice(k.baris + 1)) {
        const noId = String(r[k.noId] ?? "").trim();
        const tanggal = tanggalDari(r[k.tgl]);
        if (!noId || !tanggal) continue;
        const masuk = jamDari(r[k.masuk]);
        let pulang = jamDari(r[k.pulang]);
        if (pulang && pulang === masuk) pulang = null;
        const absen = k.absen >= 0 && /^(true|1|ya|y|x)$/i.test(String(r[k.absen]).trim());
        const status = masuk || pulang ? "Hadir" : absen ? "Tidak Hadir" : null;
        if (!orang.has(noId)) orang.set(noId, { noId, emp: k.emp >= 0 ? String(r[k.emp] ?? "").trim() : "", nama: String(k.nama >= 0 ? r[k.nama] : "").trim(), hari: [], hadir: 0, absen: 0 });
        const o = orang.get(noId);
        o.hari.push({ tanggal, masuk, pulang, status });
        if (status === "Hadir") o.hadir++; else if (status === "Tidak Hadir") o.absen++;
        nBaris++;
        if (!awal || tanggal < awal) awal = tanggal;
        if (!akhir || tanggal > akhir) akhir = tanggal;
    }
    if (!nBaris) throw new Error("Tidak ada baris rekaman yang terbaca di bawah judul kolom.");
    return { orang: [...orang.values()].sort((a, b) => (Number(a.noId) || 0) - (Number(b.noId) || 0) || a.noId.localeCompare(b.noId)), nBaris, awal, akhir };
}

function bacaBerkasMesin(file) {
    return new Promise((selesai, gagal) => {
        if (!window.XLSX) return gagal(new Error("Pembaca Excel (SheetJS) belum termuat — periksa sambungan internet, lalu muat ulang halaman."));
        const fr = new FileReader();
        fr.onerror = () => gagal(new Error("Berkas tidak bisa dibaca."));
        fr.onload = (e) => {
            try {
                const wb = window.XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true });
                const ws = wb.Sheets[wb.SheetNames[0]];
                selesai(uraiEksporMesin(window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" })));
            } catch (err) { gagal(err); }
        };
        fr.readAsArrayBuffer(file);
    });
}

function pasangModalFinger() {
    const modal = document.getElementById("fingerModal");
    document.getElementById("unggahFinger").addEventListener("click", bukaUnggahFinger);
    document.getElementById("fingerTutup").addEventListener("click", tutupUnggahFinger);
    modal.addEventListener("click", (ev) => { if (ev.target === modal) tutupUnggahFinger(); });
    document.getElementById("fingerBerkas").addEventListener("change", pilihBerkasFinger);
    document.getElementById("fingerSimpan").addEventListener("click", simpanUnggahan);
    document.getElementById("fingerTabel").addEventListener("change", (ev) => {
        if (ev.target.tagName === "SELECT") { perbaruiBarisFinger(ev.target.closest("tr")); perbaruiTombolFinger(); }
    });
}

function bukaUnggahFinger() {
    if (!isUnlocked()) return;
    unggahan = null;
    const berkas = document.getElementById("fingerBerkas");
    berkas.value = "";
    document.getElementById("fingerIsi").hidden = true;
    document.getElementById("fingerPesan").hidden = true;
    document.getElementById("fingerSimpan").disabled = true;
    document.getElementById("fingerTimpa").checked = false;
    document.getElementById("fingerModal").hidden = false;
    berkas.focus();
}
function tutupUnggahFinger() { document.getElementById("fingerModal").hidden = true; unggahan = null; }

function pesanFinger(teks, tampil = true) {
    const el = document.getElementById("fingerPesan");
    el.textContent = teks; el.hidden = !tampil;
}

async function pilihBerkasFinger(ev) {
    const file = ev.target.files?.[0];
    document.getElementById("fingerIsi").hidden = true;
    document.getElementById("fingerSimpan").disabled = true;
    unggahan = null;
    if (!file) return;
    pesanFinger("Membaca berkas…");
    try {
        unggahan = await bacaBerkasMesin(file);
    } catch (err) { pesanFinger(`Berkas tidak bisa dipakai: ${err.message || err}`); return; }
    pesanFinger("", false);
    renderTabelFinger();
}

function opsiGuru() {
    return state.guru.filter((g) => g.status_aktif === "Aktif")
        .map((g) => `<option value="${esc(g.id)}">${esc(g.nama)}</option>`).join("");
}

function renderTabelFinger() {
    const { orang, nBaris, awal, akhir } = unggahan;
    const nHari = new Set(orang.flatMap((o) => o.hari.map((h) => h.tanggal))).size;
    document.getElementById("fingerRingkas").textContent =
        `${orang.length} pengguna mesin · ${nBaris} baris · ${nHari} tanggal, ${tglIndo(awal)} – ${tglIndo(akhir)}.`;
    const opsi = opsiGuru();
    const tbody = document.querySelector("#fingerTabel tbody");
    tbody.innerHTML = orang.map((o) => {
        const peta = state.peta.get(o.noId);
        const tebakan = !peta ? tebakGuru(o.nama) : null;
        const nilai = peta ? (peta.abaikan ? "__abaikan" : (peta.guru_id || "")) : (tebakan || "");
        return `<tr data-no-id="${esc(o.noId)}">
            <td class="num">${esc(o.noId)}</td>
            <td>${esc(o.nama || "—")}${o.emp ? `<span class="tebakan">Emp No. ${esc(o.emp)}</span>` : ""}</td>
            <td class="num">${o.hadir}</td><td class="num">${o.absen}</td>
            <td><select data-nilai="${esc(nilai)}">
                <option value="">— belum dipilih: dilewati —</option>
                <option value="__abaikan">Abaikan (tidak dicatat)</option>
                ${opsi}</select>
                ${tebakan ? '<span class="tebakan">tebakan dari nama — periksa</span>' : peta?.guru_id || peta?.abaikan ? '<span class="tebakan">dari unggahan sebelumnya</span>' : ""}</td>
        </tr>`;
    }).join("");
    tbody.querySelectorAll("select").forEach((sel) => { sel.value = sel.dataset.nilai; if (sel.value !== sel.dataset.nilai) sel.value = ""; });
    tbody.querySelectorAll("tr").forEach(perbaruiBarisFinger);
    document.getElementById("fingerIsi").hidden = false;
    perbaruiTombolFinger();
}

function perbaruiBarisFinger(tr) {
    const v = tr.querySelector("select").value;
    tr.classList.toggle("belum", !v);
    tr.classList.toggle("abaikan", v === "__abaikan");
}
function perbaruiTombolFinger() {
    const pilihan = [...document.querySelectorAll("#fingerTabel select")].map((s) => s.value);
    const dipetakan = pilihan.filter((v) => v && v !== "__abaikan").length;
    const tombol = document.getElementById("fingerSimpan");
    tombol.disabled = !unggahan || !dipetakan;
    tombol.textContent = dipetakan ? `Simpan rekaman ${dipetakan} orang` : "Pilih dulu guru untuk tiap No. ID";
}

async function simpanUnggahan() {
    if (!unggahan || !isUnlocked()) return;
    if (!isSupabaseConfigured) { pesanFinger("Belum terhubung ke Supabase — unggahan tidak bisa disimpan."); return; }
    const berkas = unggahan;
    const timpaManual = document.getElementById("fingerTimpa").checked;
    const pilihan = new Map([...document.querySelectorAll("#fingerTabel tr[data-no-id]")]
        .map((tr) => [tr.dataset.noId, tr.querySelector("select").value]));
    const tombol = document.getElementById("fingerSimpan");
    tombol.disabled = true; tombol.textContent = "Menyimpan…";
    const gagal = (konteks, err) => { laporError(konteks, err); perbaruiTombolFinger(); };

    // 1. Peta No. ID -> guru, diingat untuk unggahan berikutnya.
    const peta = berkas.orang.map((o) => {
        const v = pilihan.get(o.noId) || "";
        return { no_id: o.noId, nama_mesin: o.nama || null, guru_id: v && v !== "__abaikan" ? v : null, abaikan: v === "__abaikan", diperbarui_pada: new Date().toISOString() };
    });
    {
        const { error } = await supabaseClient.from("kg_fingerprint_pengguna").upsert(peta, { onConflict: "no_id" });
        if (error) return gagal("Gagal menyimpan peta pengguna mesin fingerprint", error);
        peta.forEach((p) => state.peta.set(p.no_id, p));
    }

    // 2. Kalender sekolah, jam kerja tiap orang, dan catatan yang sudah ada
    //    dalam rentang berkas — bukan rentang layar, yang bisa berbeda.
    const guruIds = [...new Set(peta.filter((p) => p.guru_id).map((p) => p.guru_id))];
    const [libur, jk, lama] = await Promise.all([
        supabaseClient.from("kg_hari_libur").select("tanggal").gte("tanggal", berkas.awal).lte("tanggal", berkas.akhir),
        supabaseClient.from("v_jam_kerja_guru").select("guru_id, hari, bekerja").in("guru_id", guruIds),
        supabaseClient.from(TABEL).select("id, tanggal, guru_id, sumber").gte("tanggal", berkas.awal).lte("tanggal", berkas.akhir).in("guru_id", guruIds),
    ]);
    if (libur.error) return gagal("Gagal memuat hari libur", libur.error);
    if (jk.error) return gagal("Gagal memuat jam kerja staf", jk.error);
    if (lama.error) return gagal("Gagal memuat catatan yang sudah ada", lama.error);
    const liburSet = new Set((libur.data || []).map((l) => l.tanggal));
    const kerja = new Map();   // guru_id -> Map(hari -> bekerja)
    for (const r of jk.data || []) { if (!kerja.has(r.guru_id)) kerja.set(r.guru_id, new Map()); kerja.get(r.guru_id).set(r.hari, !!r.bekerja); }
    const ada = new Map((lama.data || []).map((c) => [c.tanggal + "|" + c.guru_id, c]));

    // 3. Baris rekaman menjadi catatan.
    const isi = [];
    const n = { hadir: 0, tidak: 0, kosong: 0, libur: 0, manual: 0, dilewati: 0 };
    for (const o of berkas.orang) {
        const p = peta.find((x) => x.no_id === o.noId);
        if (!p.guru_id) { n.dilewati += o.hari.length; continue; }
        for (const h of o.hari) {
            if (!h.status) { n.kosong++; continue; }
            if (h.status === "Tidak Hadir") {
                const hari = HARI_FROM_JS_DAY[new Date(h.tanggal + "T00:00:00").getDay()];
                const bekerja = kerja.get(p.guru_id)?.get(hari);
                if (liburSet.has(h.tanggal) || bekerja === false) { n.libur++; continue; }
            }
            const sebelumnya = ada.get(h.tanggal + "|" + p.guru_id);
            if (sebelumnya && sebelumnya.sumber === "manual" && !timpaManual) { n.manual++; continue; }
            isi.push({ tanggal: h.tanggal, guru_id: p.guru_id, status: h.status,
                       masuk: h.status === "Hadir" ? h.masuk : null, pulang: h.status === "Hadir" ? h.pulang : null,
                       sumber: "fingerprint", catatan: null });
            if (h.status === "Hadir") n.hadir++; else n.tidak++;
        }
    }
    for (let i = 0; i < isi.length; i += 200) {
        const { error } = await supabaseClient.from(TABEL).upsert(isi.slice(i, i + 200), { onConflict: "tanggal,guru_id" });
        if (error) return gagal("Gagal menyimpan rekaman fingerprint", error);
    }

    // 4. Tampilkan rentang berkasnya, supaya hasilnya langsung terlihat.
    tutupUnggahFinger();
    if (hariRentang(berkas.awal, berkas.akhir).length < MAKS_HARI) {
        state.awal = berkas.awal; state.akhir = berkas.akhir;
        document.getElementById("tglAwal").value = state.awal;
        document.getElementById("tglAkhir").value = state.akhir;
    }
    await muatRentang();
    const rincian = [
        `${n.hadir} hadir`, `${n.tidak} tidak hadir`,
        n.manual ? `${n.manual} dilewati karena sudah dicatat manual` : "",
        n.libur ? `${n.libur} tanpa scan pada hari libur dilewati` : "",
        n.kosong ? `${n.kosong} baris tanpa rekaman dilewati` : "",
        n.dilewati ? `${n.dilewati} baris milik pengguna yang diabaikan/belum dipilih` : "",
    ].filter(Boolean).join(", ");
    kabar(`Rekaman fingerprint ${tglIndo(berkas.awal)} – ${tglIndo(berkas.akhir)} tersimpan: ${isi.length} catatan (${rincian}).`);
}


function kabar(pesan) {
    document.getElementById("kabarBanner")?.remove();
    const box = document.createElement("div");
    box.id = "kabarBanner"; box.className = "error-banner kabar";
    box.innerHTML = `${esc(pesan)}<button type="button" class="error-close" aria-label="Tutup">×</button>`;
    const main = document.querySelector("main");
    main.insertBefore(box, main.firstChild);
    box.querySelector(".error-close").addEventListener("click", () => box.remove());
    setTimeout(() => { if (box.isConnected) box.remove(); }, 9000);
}

boot().catch((err) => laporError("Gagal memuat halaman", err));
