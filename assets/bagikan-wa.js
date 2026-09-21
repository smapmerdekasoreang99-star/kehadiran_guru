// =========================================================
// Bagikan ke WhatsApp — Jadwal Guru Pengganti
// Menyusun data penugasan hari itu menjadi (1) gambar tabel PNG
// yang rapi untuk dikirim ke grup, dan (2) teks WhatsApp.
// =========================================================

const HARI_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function tanggalPanjang(iso) {
    const d = new Date(iso + "T00:00:00");
    return `${HARI_ID[d.getDay()]}, ${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

// ---------- Susun baris ----------
// items: [{ guru_id, status, jam_ke, kelas_id, pengganti_id|null, status_pengganti|null }]
// lookup: { namaGuru(id), namaKelas(id), labelStatus(kode) }
// Hasil: [{ guru, ket, baris: [{ jamLabel, kelas, pengganti, kode }] }]
export function susunKelompok(items, lookup) {
    const perGuru = new Map();
    for (const it of items) {
        if (!perGuru.has(it.guru_id)) perGuru.set(it.guru_id, []);
        perGuru.get(it.guru_id).push(it);
    }
    const kelompok = [];
    for (const [gid, arr] of perGuru) {
        arr.sort((a, b) => a.jam_ke - b.jam_ke);
        const baris = [];
        for (const it of arr) {
            const last = baris[baris.length - 1];
            const samaKelas = last && last.kelas_id === it.kelas_id && last.pengganti_id === it.pengganti_id && last.kode === it.status_pengganti && last.jamAkhir === it.jam_ke - 1;
            if (samaKelas) {
                last.jamAkhir = it.jam_ke;
            } else {
                baris.push({
                    jamAwal: it.jam_ke, jamAkhir: it.jam_ke,
                    kelas_id: it.kelas_id, kelas: lookup.namaKelas(it.kelas_id),
                    pengganti_id: it.pengganti_id, pengganti: it.pengganti_id ? lookup.namaGuru(it.pengganti_id) : "—",
                    kode: it.status_pengganti,
                });
            }
        }
        // keterangan: gabungan status ketidakhadiran (biasanya satu)
        const kets = [...new Set(arr.map((a) => a.status))];
        kelompok.push({
            guru_id: gid, guru: lookup.namaGuru(gid),
            ket: kets.map((k) => lookup.labelStatus(k)).join(" / "),
            baris: baris.map((b) => ({ ...b, jamLabel: b.jamAwal === b.jamAkhir ? `${b.jamAwal}` : `${b.jamAwal}–${b.jamAkhir}` })),
        });
    }
    return kelompok;
}

// ---------- Teks WhatsApp ----------
export function buatTeks({ tanggal, kelompok, catatan, namaSekolah }) {
    const L = [];
    L.push(`*Jadwal Guru Pengganti*`);
    L.push(`${namaSekolah} · ${tanggalPanjang(tanggal)}`);
    L.push("");
    for (const k of kelompok) {
        L.push(`*${k.guru}* — ${k.ket}`);
        for (const b of k.baris) {
            L.push(`• Jam ke-${b.jamLabel} · ${b.kelas} → ${b.pengganti}${b.kode ? ` (${b.kode})` : ""}`);
        }
        L.push("");
    }
    if (catatan && catatan.trim()) { L.push(`_Catatan: ${catatan.trim()}_`); L.push(""); }
    const pengganti = [...new Set(kelompok.flatMap((k) => k.baris.map((b) => b.pengganti)).filter((n) => n && n !== "—"))];
    if (pengganti.length) L.push(`Mohon konfirmasi: ${pengganti.join(", ")}`);
    return L.join("\n").trim();
}

// ---------- Gambar tabel (Canvas) ----------
const W = 1000;
const PAD = 36;
const COLS = [
    { key: "guru", label: "Nama Guru", w: 250, align: "left" },
    { key: "ket", label: "Ket", w: 150, align: "center" },
    { key: "jam", label: "Jam ke", w: 90, align: "center" },
    { key: "kelas", label: "Kelas", w: 150, align: "center" },
    { key: "pengganti", label: "Guru Pengganti", w: 288, align: "left" },
];
const ROW_H = 40;
const HEAD_H = 40;

/* Warnanya disalin dari assets/dasar.css, bukan dipilih ulang di sini.
   Kanvas tidak bisa membaca token CSS — berkas ini juga harus jalan di
   Node untuk diuji — jadi nilainya ditulis apa adanya. Bila palet bersama
   berubah, nilai di bawah ikut diperbarui. */
const C = {
    bg: "#FAF7F0", surface: "#FFFFFF", ink: "#221E17", muted: "#5E5548",
    gold: "#C29433", goldTint: "#FFF6D2", line: "#D6CCB6",
    flameTint: "#F7E4DF", flame: "#A8432E",
};

/* Nuansa kepala gambar mengikuti berat hari itu: makin banyak jam pelajaran
   yang harus dicarikan pengganti, makin “berat” warnanya. Lima tingkat saja
   supaya pembaca di grup WhatsApp bisa menebak keadaan sebelum membaca
   tabelnya. Tiap tingkat membawa warna tulisannya sendiri karena tingkat
   terakhir berlatar gelap. */
const NUANSA = [
    { maks: 2, nama: "lega", latar: "#D9EBD3", garis: "#4C7A44", tulisan: "#1B3517", redup: "#3F6639" },
    { maks: 5, nama: "wajar", latar: "#E8F0CE", garis: "#6E7F35", tulisan: "#28310F", redup: "#54632A" },
    { maks: 9, nama: "padat", latar: "#FBEFC6", garis: "#A07A1E", tulisan: "#3A2E0E", redup: "#6B5415" },
    { maks: 14, nama: "berat", latar: "#F6DAC2", garis: "#B4642A", tulisan: "#42230C", redup: "#87471C" },
    { maks: Infinity, nama: "genting", latar: "#8C3423", garis: "#5E2015", tulisan: "#FFF3EE", redup: "#EFCCC2" },
];

// Jumlah jam pelajaran yang harus diganti — satu baris bisa memuat
// beberapa jam berurutan (mis. "3–4"), jadi dihitung dari rentangnya.
export function hitungJam(kelompok) {
    let n = 0;
    for (const k of kelompok) {
        for (const b of k.baris) {
            const a = Number(b.jamAwal), z = Number(b.jamAkhir);
            n += Number.isFinite(a) && Number.isFinite(z) && z >= a ? z - a + 1 : 1;
        }
    }
    return n;
}

export function nuansaKepala(jumlahJam) {
    return NUANSA.find((n) => jumlahJam <= n.maks) || NUANSA[NUANSA.length - 1];
}

function wrapText(ctx, text, maxW) {
    const words = String(text).split(" ");
    const lines = []; let cur = "";
    for (const w of words) {
        const t = cur ? cur + " " + w : w;
        if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
}

// Mengembalikan canvas yang sudah digambar. `createCanvas(w,h)` disuntikkan agar bisa jalan di browser maupun Node.
export function gambarTabel({ tanggal, kelompok, catatan, namaSekolah, logo, createCanvas, scale = 2 }) {
    const FONT = '"Public Sans", "Segoe UI", Arial, sans-serif';
    const SERIF = '"Fraunces", Georgia, serif';

    // ukur dulu tinggi total
    const probe = createCanvas(10, 10).getContext("2d");
    probe.font = `500 15px ${FONT}`;
    const rowsHeights = [];
    for (const k of kelompok) {
        for (const b of k.baris) {
            const lines = wrapText(probe, b.pengganti + (b.kode ? ` (${b.kode})` : ""), COLS[4].w - 24);
            rowsHeights.push(Math.max(ROW_H, 16 + lines.length * 20));
        }
    }
    const tableH = HEAD_H + rowsHeights.reduce((a, b) => a + b, 0);
    /* Kepala dibuat setipis yang masih lapang. Gambar ini dikirim lewat
       WhatsApp dan dibuka di layar HP: tiap piksel tinggi yang tidak
       terpakai membuat tabelnya mengecil saat gambar dimuat pas lebar. */
    const headerH = 60;
    const NOTE_LH = 18;
    const noteLines = catatan && catatan.trim() ? wrapText(probe, "Catatan: " + catatan.trim(), W - PAD * 2) : [];
    /* Kaki dirapatkan seperti kepalanya. Sisa ruang kosong di bawah
       keterangan kode dulu hampir selebar dua baris tulisan — tidak membawa
       apa pun, tetapi ikut mengecilkan tabel saat gambar dimuat pas lebar
       layar HP. Tingginya mengikuti jarak baris kaki di bawah. */
    const footH = noteLines.length ? 26 + noteLines.length * NOTE_LH : 32;
    const H = headerH + 18 + tableH + 12 + footH;

    const canvas = createCanvas(W * scale, H * scale);
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);

    // latar
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

    // kepala berwarna sesuai berat hari itu, dengan garis senada sebagai pembatas
    const nuansa = nuansaKepala(hitungJam(kelompok));
    const GARIS_H = 3;
    ctx.fillStyle = nuansa.latar; ctx.fillRect(0, 0, W, headerH);
    ctx.fillStyle = nuansa.garis; ctx.fillRect(0, headerH - GARIS_H, W, GARIS_H);
    let tx = PAD;
    if (logo) {
        const s = 44;
        ctx.drawImage(logo, PAD, (headerH - GARIS_H - s) / 2, s, s);
        tx = PAD + s + 12;
    }
    // Warna tulisan ikut nuansa: terang di latar gelap, gelap di latar terang.
    ctx.fillStyle = nuansa.tulisan; ctx.font = `600 21px ${SERIF}`; ctx.textBaseline = "alphabetic";
    ctx.fillText("Jadwal Guru Pengganti", tx, 28);
    ctx.fillStyle = nuansa.redup; ctx.font = `500 12px ${FONT}`;
    ctx.fillText(`${namaSekolah}  ·  ${tanggalPanjang(tanggal)}`, tx, 47);

    // tabel
    const x0 = PAD, y0 = headerH + 18;
    const tableW = COLS.reduce((a, c) => a + c.w, 0);
    ctx.fillStyle = C.surface; ctx.fillRect(x0, y0, tableW, tableH);

    // kepala tabel
    ctx.fillStyle = C.goldTint; ctx.fillRect(x0, y0, tableW, HEAD_H);
    ctx.fillStyle = "#6B4E10"; ctx.font = `700 13px ${FONT}`;
    let cx = x0;
    for (const c of COLS) {
        const tw = ctx.measureText(c.label).width;
        const lx = c.align === "center" ? cx + (c.w - tw) / 2 : cx + 12;
        ctx.fillText(c.label.toUpperCase(), lx, y0 + 25);
        cx += c.w;
    }

    // baris
    let y = y0 + HEAD_H; let ri = 0;
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    for (const k of kelompok) {
        const groupTop = y;
        const groupH = k.baris.reduce((a, _, i) => a + rowsHeights[ri + i], 0);
        // sel gabungan: nama guru & ket
        ctx.fillStyle = C.ink; ctx.font = `600 15px ${FONT}`;
        const namaLines = wrapText(ctx, k.guru, COLS[0].w - 24);
        const nh = namaLines.length * 20;
        namaLines.forEach((ln, i) => ctx.fillText(ln, x0 + 12, groupTop + (groupH - nh) / 2 + 15 + i * 20));
        ctx.font = `500 14px ${FONT}`;
        const ketLines = wrapText(ctx, k.ket, COLS[1].w - 20);
        const kh = ketLines.length * 19;
        ketLines.forEach((ln, i) => {
            const tw = ctx.measureText(ln).width;
            ctx.fillStyle = C.flame;
            ctx.fillText(ln, x0 + COLS[0].w + (COLS[1].w - tw) / 2, groupTop + (groupH - kh) / 2 + 14 + i * 19);
        });
        // baris per jam
        for (const b of k.baris) {
            const rh = rowsHeights[ri];
            let cxx = x0 + COLS[0].w + COLS[1].w;
            ctx.fillStyle = C.ink; ctx.font = `600 15px ${FONT}`;
            let t = b.jamLabel; let tw = ctx.measureText(t).width;
            ctx.fillText(t, cxx + (COLS[2].w - tw) / 2, y + rh / 2 + 5);
            cxx += COLS[2].w;
            ctx.font = `500 15px ${FONT}`;
            t = b.kelas; tw = ctx.measureText(t).width;
            ctx.fillText(t, cxx + (COLS[3].w - tw) / 2, y + rh / 2 + 5);
            cxx += COLS[3].w;
            const pl = wrapText(ctx, b.pengganti + (b.kode ? ` (${b.kode})` : ""), COLS[4].w - 24);
            const ph = pl.length * 20;
            pl.forEach((ln, i) => ctx.fillText(ln, cxx + 12, y + (rh - ph) / 2 + 15 + i * 20));
            // garis bawah baris (hanya kolom jam..pengganti)
            ctx.beginPath(); ctx.moveTo(x0 + COLS[0].w + COLS[1].w, y + rh); ctx.lineTo(x0 + tableW, y + rh); ctx.stroke();
            y += rh; ri++;
        }
        // garis bawah kelompok (seluruh lebar), lebih tegas
        ctx.strokeStyle = "#B9AE95"; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + tableW, y); ctx.stroke(); ctx.strokeStyle = C.line;
    }
    // garis kolom & bingkai
    cx = x0;
    for (let i = 0; i < COLS.length; i++) {
        ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx, y0 + tableH); ctx.stroke();
        cx += COLS[i].w;
    }
    ctx.strokeStyle = "#B9AE95"; ctx.strokeRect(x0 + 0.5, y0 + 0.5, tableW - 1, tableH - 1);

    // catatan & keterangan kode
    let fy = y0 + tableH + 18;
    ctx.fillStyle = C.ink; ctx.font = `600 13px ${FONT}`;
    noteLines.forEach((ln, i) => ctx.fillText(ln, PAD, fy + i * NOTE_LH));
    /* Keterangan kode menempel pada catatan: jaraknya dihitung dari baris
       catatan terakhir, bukan ditumpuk satu baris penuh lagi, supaya kaki
       tetap tipis. */
    fy += noteLines.length ? (noteLines.length - 1) * NOTE_LH + 16 : 4;
    ctx.fillStyle = C.muted; ctx.font = `400 11px ${FONT}`;
    ctx.fillText("GT = Guru diTugaskan · PT = Piket diTugaskan · Inf = Infaler   —   dibuat dari Sistem Guru Pengganti", PAD, fy);
    // Penanda asal berkas: rata kanan, lebih kecil, dan miring supaya jelas
    // berbeda tingkat dari dua baris di atasnya.
    fy += 14;
    ctx.font = `italic 400 10px ${FONT}`;
    const cetak = "Dicetak menggunakan aplikasi Kehadiran Guru";
    ctx.fillText(cetak, W - PAD - ctx.measureText(cetak).width, fy);

    return canvas;
}
