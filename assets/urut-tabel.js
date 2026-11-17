/* Urutkan tabel rekap dengan mengetuk judul kolomnya (17 Nov 2026).
   Ketukan pertama: teks A→Z, angka terbesar dulu; ketukan kedua membalik;
   ketukan ketiga kembali ke urutan bawaan (masa kerja terlama dulu).
   Bekerja pada baris yang sudah tergambar, jadi cukup panggil
   terapkanUrut(tabel) di akhir setiap render. Kepala dua baris
   (rowspan/colspan) didukung: hanya sel judul satu kolom yang bisa diketuk.
   Tabel cetak/unduhan tidak terpengaruh. */

const STATUS = new WeakMap();   // tabel -> { kol, arah }

// Peta kolom: indeks kolom nyata untuk setiap <th> berlebar satu kolom.
function petaKolom(tabel) {
    const terisi = [], hasil = [];
    [...tabel.tHead.rows].forEach((tr, r) => {
        let c = 0;
        for (const th of tr.cells) {
            while (terisi[r]?.[c]) c++;
            const rs = th.rowSpan || 1, cs = th.colSpan || 1;
            for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) (terisi[r + i] ||= [])[c + j] = true;
            if (cs === 1) hasil.push({ th, kol: c });
            c += cs;
        }
    });
    return hasil;
}

const nilaiAngka = (teks) => {
    const m = teks.replace(/\./g, "").replace(",", ".").match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
};

export function pasangUrut(tabel) {
    if (!tabel || STATUS.has(tabel)) return;
    STATUS.set(tabel, { kol: null, arah: 0 });
    for (const { th, kol } of petaKolom(tabel)) {
        const judul = th.textContent.trim();
        if (/^no$/i.test(judul)) continue;   // nomor urut ikut dinomori ulang
        const angka = th.classList.contains("num");
        const tombol = document.createElement("button");
        tombol.type = "button"; tombol.className = "urut-kol"; tombol.dataset.kol = kol;
        tombol.title = `Urutkan menurut ${judul}` + (th.title ? ` — ${th.title}` : "");
        tombol.append(...th.childNodes);
        const panah = document.createElement("span"); panah.className = "panah"; panah.setAttribute("aria-hidden", "true");
        tombol.append(panah);
        th.append(tombol);
        tombol.addEventListener("click", () => {
            const s = STATUS.get(tabel), awal = angka ? -1 : 1;
            if (s.kol !== kol) { s.kol = kol; s.arah = awal; }
            else if (s.arah === awal) s.arah = -awal;
            else { s.kol = null; s.arah = 0; }
            STATUS.get(tabel).angka = angka;
            terapkanUrut(tabel);
        });
    }
    tandai(tabel);
}

function tandai(tabel) {
    const s = STATUS.get(tabel);
    for (const b of tabel.tHead.querySelectorAll(".urut-kol")) {
        const aktif = s.kol != null && Number(b.dataset.kol) === s.kol;
        const th = b.closest("th");
        if (aktif) th.setAttribute("aria-sort", s.arah > 0 ? "ascending" : "descending"); else th.removeAttribute("aria-sort");
        b.querySelector(".panah").textContent = aktif ? (s.arah > 0 ? "▲" : "▼") : "↕";
    }
}

export function terapkanUrut(tabel) {
    const s = STATUS.get(tabel); if (!s) return;
    for (const tbody of tabel.tBodies) {
        const baris = [...tbody.rows];
        if (baris.some((tr) => tr.querySelector(".empty-state"))) continue;
        baris.forEach((tr, i) => { if (tr.dataset.asli == null) tr.dataset.asli = i; });
        const asli = (tr) => Number(tr.dataset.asli);
        let urut = baris.slice().sort((a, b) => asli(a) - asli(b));
        if (s.kol != null) {
            const ambil = (tr) => (tr.cells[s.kol]?.textContent || "").trim();
            urut.sort((a, b) => {
                const x = ambil(a), y = ambil(b);
                if (s.angka) {
                    const p = nilaiAngka(x), q = nilaiAngka(y);
                    if (p == null || q == null) return (p == null) - (q == null) || asli(a) - asli(b);   // kosong selalu di bawah
                    return s.arah * (p - q) || asli(a) - asli(b);
                }
                if (!x || x === "—" || !y || y === "—") return (!x || x === "—") - (!y || y === "—") || asli(a) - asli(b);
                return s.arah * x.localeCompare(y, "id", { numeric: true }) || asli(a) - asli(b);
            });
        }
        tbody.append(...urut);
        // Kolom "No" dinomori ulang mengikuti urutan baru.
        const no = petaKolom(tabel).find(({ th }) => /^no$/i.test(th.textContent.trim()));
        if (no) urut.forEach((tr, i) => { if (tr.cells[no.kol]) tr.cells[no.kol].textContent = i + 1; });
    }
    tandai(tabel);
}
