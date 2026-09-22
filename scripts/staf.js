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
// fingerprint yang diulang kelak tidak menggandakan apa pun.
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
};

const cariCatatan = (tanggal, guruId) => state.catatan.find((c) => c.tanggal === tanggal && c.guru_id === guruId);

/* Staf yang hari hadirnya perlu dicatat, beserta ketentuan jam kerjanya
   per hari. Diturunkan dari v_jam_kerja_guru, yang sudah menggabungkan
   bawaan sekolah dan pengecualian per orang. */
function daftarStaf() {
    const per = new Map();
    for (const r of state.jamKerja) {
        if (!per.has(r.guru_id)) {
            per.set(r.guru_id, { guruId: r.guru_id, nama: r.nama, jabatan: r.jabatan || "Staf",
                                 pola: r.pola_honor || "bulanan", sumber: r.sumber_hadir || "fingerprint", jam: new Map() });
        }
        per.get(r.guru_id).jam.set(r.hari, { bekerja: !!r.bekerja, masuk: r.masuk, pulang: r.pulang, sumber: r.sumber });
    }
    const urut = peringkatGuru(state.guru);
    const semua = [...per.values()].sort((a, b) => urut(a.guruId) - urut(b.guruId) || a.nama.localeCompare(b.nama, "id"));
    return {
        tampil: semua.filter((s) => s.pola !== "bulanan"),
        bulanan: semua.filter((s) => s.pola === "bulanan").length,
    };
}

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
    const k = s.jam.get(d.hari);
    const ketentuan = k?.bekerja ? `${jam5(k.masuk)}–${jam5(k.pulang)}` : "libur kerja";
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
            <small>${esc(s.jabatan)} · ${esc(POLA[s.pola] || s.pola)}${s.sumber === "fingerprint" ? " · fingerprint" : ""} · ${nHadir}/${nKerja} hadir</small></th>`);
        for (const d of state.hari) {
            const kerja = bekerjaPada(s, d);
            const c = cariCatatan(d.iso, s.guruId);
            const kelas = ["m-sel", "pk-hari-sel", "pk-staf-sel", d.iso === hariNyata && "sekarang", !kerja && "pk-libur"].filter(Boolean).join(" ");
            // Hari libur kerja tetap bisa dicatat (mis. lembur Sabtu), tetapi
            // sel kosongnya tidak menggoda: cukup tulisan "libur".
            html.push(`<td class="${kelas}">${kerja || c ? pitaHtml(d, s) : '<span class="pk-kosong-teks">libur</span>'}</td>`);
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
    let hadir = 0, tidak = 0, terlambat = 0, belum = 0;
    for (const d of state.hari) {
        const c = cariCatatan(d.iso, s.guruId);
        if (!c) { if (bekerjaPada(s, d)) belum++; continue; }
        if (c.status === "Tidak Hadir") tidak++; else hadir++;
        const k = s.jam.get(d.hari);
        if (c.status === "Hadir" && c.masuk && k?.masuk && jam5(c.masuk) > jam5(k.masuk)) terlambat++;
    }
    return { hariKerja: kerja.length, hadir, tidak, terlambat, belum };
}

function renderRingkas(tampil, bulanan) {
    const t = tampil.reduce((a, s) => { const h = hitungStaf(s); for (const k in h) a[k] += h[k]; return a; },
        { hariKerja: 0, hadir: 0, tidak: 0, terlambat: 0, belum: 0 });
    document.getElementById("ringkasMatriks").textContent = tampil.length
        ? `${state.hari.length} hari · ${tampil.length} staf · ${t.hariKerja} hari kerja · ${t.hadir} hadir · ${t.tidak} tidak hadir · ${t.belum} belum dicatat`
        : "";
    document.getElementById("footMatriks").textContent =
        (bulanan ? `${bulanan} staf berpola honor bulanan murni tidak ditampilkan — honornya tidak bergantung hari hadir. ` : "")
        + "Jam masuk dan pulang tidak wajib; bila diisi, yang lebih lambat dari ketentuan ditandai. "
        + "Rekaman mesin fingerprint kelak diunggah ke sini dan menimpa tanggal yang sama. "
        + "Nilai rupiahnya dihitung di aplikasi Induk Pembiayaan.";

    const unlocked = isUnlocked();
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
        <td>${esc(POLA[s.pola] || s.pola)}${s.sumber === "fingerprint" ? ' <small style="color:var(--tinta-3)">fingerprint</small>' : ""}</td>
        ${num(h.hariKerja)}${num(h.hadir)}${num(h.tidak)}${num(h.belum)}${num(h.terlambat)}<td class="num">${persen(h.hadir, h.hariKerja)}</td></tr>`).join("")
        || `<tr><td colspan="10" class="empty-state">Belum ada staf yang hari hadirnya perlu dicatat.</td></tr>`;
    const t = baris.reduce((a, { h }) => { for (const k in h) a[k] += h[k]; return a; }, { hariKerja: 0, hadir: 0, tidak: 0, terlambat: 0, belum: 0 });
    document.getElementById("footRekap").innerHTML = baris.length ? `<tr class="total"><td></td><td colspan="3">Total (${baris.length} staf)</td>
        ${num(t.hariKerja)}${num(t.hadir)}${num(t.tidak)}${num(t.belum)}${num(t.terlambat)}<td class="num">${persen(t.hadir, t.hariKerja)}</td></tr>` : "";
    document.getElementById("ringkasRekap").textContent = `${tglIndo(state.awal)} – ${tglIndo(state.akhir)} · ${state.catatan.length} catatan`;
}

// ---------- Dialog ----------
let pilihanAktif = null;

function pasangModal() {
    const modal = document.getElementById("statusModal");
    document.getElementById("statusTutup").addEventListener("click", tutupPilihan);
    modal.addEventListener("click", (ev) => { if (ev.target === modal) tutupPilihan(); });
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !modal.hidden) tutupPilihan(); });
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
    const k = s.jam.get(d.hari);
    document.getElementById("statusKetentuan").textContent = k?.bekerja
        ? `Ketentuan jam kerja hari ini: ${jam5(k.masuk)}–${jam5(k.pulang)}${k.sumber === "khusus" ? " (jam khusus)" : ""}.`
        : "Menurut ketentuan, hari ini bukan hari kerjanya.";
    const liburBox = document.getElementById("statusLibur");
    const libur = state.libur.has(tanggal);
    liburBox.hidden = !libur && !!k?.bekerja;
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
        if (!bekerjaPada(s, d) || cariCatatan(d.iso, s.guruId)) continue;
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
