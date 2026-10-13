"""Ubah MP4 terfragmentasi (keluaran MediaRecorder) menjadi MP4 biasa dengan durasi dan indeks sampel.

MP4 dari peramban berisi moov kosong plus pasangan moof/mdat, dan durasinya 0. Sebagian pemutar
(Windows Media Player, Film & TV, PowerPoint) tidak bisa menggeser video seperti itu. Skrip ini
menyalin sampel apa adanya (tanpa encode ulang) lalu menulis tabel stbl dan durasi yang lengkap.

    python tools/panduan/defrag_mp4.py masukan.mp4 [keluaran.mp4]
"""
import struct
import sys

WADAH = {b"moov", b"trak", b"mdia", b"minf", b"stbl", b"edts", b"dinf", b"mvex", b"moof", b"traf"}


def urai(data, awal=0, akhir=None):
    """Kembalikan daftar (tipe, isi, posisi) ; isi berupa daftar anak untuk kotak wadah."""
    akhir = len(data) if akhir is None else akhir
    out, i = [], awal
    while i + 8 <= akhir:
        size, tipe = struct.unpack(">I4s", data[i:i + 8])
        hdr = 8
        if size == 1:
            size = struct.unpack(">Q", data[i + 8:i + 16])[0]
            hdr = 16
        elif size == 0:
            size = akhir - i
        isi = urai(data, i + hdr, i + size) if tipe in WADAH else data[i + hdr:i + size]
        out.append([tipe, isi, i])
        i += size
    return out


def tulis(tipe, isi):
    if isinstance(isi, list):
        isi = b"".join(tulis(t, c) for t, c, *_ in isi)
    if len(isi) + 8 > 0xFFFFFFFF:
        return struct.pack(">I4sQ", 1, tipe, len(isi) + 16) + isi
    return struct.pack(">I4s", len(isi) + 8, tipe) + isi


def cari(daftar, tipe):
    return next((c for c in daftar if c[0] == tipe), None)


def penuh(versi, flags, isi=b""):
    return struct.pack(">I", (versi << 24) | flags) + isi


def main(masuk, keluar):
    data = open(masuk, "rb").read()
    atas = urai(data)
    ftyp = cari(atas, b"ftyp")
    moov = cari(atas, b"moov")
    mvex = cari(moov[1], b"mvex")
    trex = {}
    for c in mvex[1] if mvex else []:
        if c[0] == b"trex":
            tid, sdi, dur, size, flags = struct.unpack(">IIIII", c[1][4:24])
            trex[tid] = {"dur": dur, "size": size, "flags": flags}

    # Kumpulkan sampel per trek dari setiap moof.
    sampel = {tid: [] for tid in trex}
    for tipe, isi, pos in atas:
        if tipe != b"moof":
            continue
        for traf in (c for c in isi if c[0] == b"traf"):
            tfhd = cari(traf[1], b"tfhd")[1]
            vf = struct.unpack(">I", tfhd[:4])[0]
            fl = vf & 0xFFFFFF
            tid = struct.unpack(">I", tfhd[4:8])[0]
            j = 8
            basis = pos  # default-base-is-moof (Chrome)
            d = dict(trex[tid])
            if fl & 0x01:
                basis = struct.unpack(">Q", tfhd[j:j + 8])[0]; j += 8
            if fl & 0x02:
                j += 4
            if fl & 0x08:
                d["dur"] = struct.unpack(">I", tfhd[j:j + 4])[0]; j += 4
            if fl & 0x10:
                d["size"] = struct.unpack(">I", tfhd[j:j + 4])[0]; j += 4
            if fl & 0x20:
                d["flags"] = struct.unpack(">I", tfhd[j:j + 4])[0]; j += 4
            for trun in (c[1] for c in traf[1] if c[0] == b"trun"):
                vf = struct.unpack(">I", trun[:4])[0]
                versi, tf = vf >> 24, vf & 0xFFFFFF
                n = struct.unpack(">I", trun[4:8])[0]
                k = 8
                off = 0
                if tf & 0x01:
                    off = struct.unpack(">i", trun[k:k + 4])[0]; k += 4
                pertama = None
                if tf & 0x04:
                    pertama = struct.unpack(">I", trun[k:k + 4])[0]; k += 4
                letak = basis + off
                for s in range(n):
                    dur, size, flags, cto = d["dur"], d["size"], d["flags"], 0
                    if tf & 0x100:
                        dur = struct.unpack(">I", trun[k:k + 4])[0]; k += 4
                    if tf & 0x200:
                        size = struct.unpack(">I", trun[k:k + 4])[0]; k += 4
                    if tf & 0x400:
                        flags = struct.unpack(">I", trun[k:k + 4])[0]; k += 4
                    elif s == 0 and pertama is not None:
                        flags = pertama
                    if tf & 0x800:
                        cto = struct.unpack(">i" if versi else ">I", trun[k:k + 4])[0]; k += 4
                    sampel[tid].append({"data": data[letak:letak + size], "dur": dur, "size": size,
                                        "sync": not (flags & 0x00010000), "cto": cto})
                    letak += size

    # Susun mdat: sampel tiap trek berurutan (satu sampel per chunk).
    ftyp_baru = tulis(b"ftyp", b"isom" + struct.pack(">I", 512) + b"isomiso2avc1mp41")
    trak_list = [c for c in moov[1] if c[0] == b"trak"]

    def bangun_moov(awal_mdat):
        letak = awal_mdat
        mov_ts = struct.unpack(">I", cari(moov[1], b"mvhd")[1][12:16])[0] if cari(moov[1], b"mvhd")[1][0] == 0 else \
            struct.unpack(">I", cari(moov[1], b"mvhd")[1][20:24])[0]
        anak_baru, durasi_film = [], 0
        for trak in trak_list:
            tkhd = cari(trak[1], b"tkhd")[1]
            tid = struct.unpack(">I", tkhd[12:16] if tkhd[0] == 0 else tkhd[20:24])[0]
            ss = sampel[tid]
            mdia = cari(trak[1], b"mdia")
            mdhd = bytearray(cari(mdia[1], b"mdhd")[1])
            ts = struct.unpack(">I", mdhd[12:16] if mdhd[0] == 0 else mdhd[20:24])[0]
            total = sum(s["dur"] for s in ss)
            if mdhd[0] == 0:
                mdhd[16:20] = struct.pack(">I", total)
            else:
                mdhd[24:32] = struct.pack(">Q", total)
            dur_film = round(total * mov_ts / ts)
            durasi_film = max(durasi_film, dur_film)
            tkhd = bytearray(tkhd)
            if tkhd[0] == 0:
                tkhd[20:24] = struct.pack(">I", dur_film)
            else:
                tkhd[28:36] = struct.pack(">Q", dur_film)

            # stts (gabungkan durasi yang sama berurutan)
            stts = []
            for s in ss:
                if stts and stts[-1][1] == s["dur"]:
                    stts[-1][0] += 1
                else:
                    stts.append([1, s["dur"]])
            stbl_lama = cari(cari(mdia[1], b"minf")[1], b"stbl")[1]
            stbl = [[b"stsd", cari(stbl_lama, b"stsd")[1]],
                    [b"stts", penuh(0, 0, struct.pack(">I", len(stts)) + b"".join(struct.pack(">II", *e) for e in stts))]]
            if any(s["cto"] for s in ss):
                ctts = []
                for s in ss:
                    if ctts and ctts[-1][1] == s["cto"]:
                        ctts[-1][0] += 1
                    else:
                        ctts.append([1, s["cto"]])
                stbl.append([b"ctts", penuh(0, 0, struct.pack(">I", len(ctts)) + b"".join(struct.pack(">II", *e) for e in ctts))])
            if not all(s["sync"] for s in ss):
                sync = [i + 1 for i, s in enumerate(ss) if s["sync"]]
                stbl.append([b"stss", penuh(0, 0, struct.pack(">I", len(sync)) + b"".join(struct.pack(">I", x) for x in sync))])
            stbl.append([b"stsc", penuh(0, 0, struct.pack(">IIII", 1, 1, 1, 1))])
            stbl.append([b"stsz", penuh(0, 0, struct.pack(">II", 0, len(ss)) + b"".join(struct.pack(">I", s["size"]) for s in ss))])
            offs = []
            for s in ss:
                offs.append(letak); letak += s["size"]
            stbl.append([b"co64", penuh(0, 0, struct.pack(">I", len(offs)) + b"".join(struct.pack(">Q", o) for o in offs))])

            minf = cari(mdia[1], b"minf")
            minf_baru = [[t, (stbl if t == b"stbl" else c)] for t, c, *_ in minf[1]]
            mdia_baru = [[t, (bytes(mdhd) if t == b"mdhd" else minf_baru if t == b"minf" else c)] for t, c, *_ in mdia[1]]
            trak_baru = [[t, (bytes(tkhd) if t == b"tkhd" else mdia_baru if t == b"mdia" else c)]
                         for t, c, *_ in trak[1] if t != b"edts"]
            anak_baru.append([b"trak", trak_baru])
        mvhd = bytearray(cari(moov[1], b"mvhd")[1])
        if mvhd[0] == 0:
            mvhd[16:20] = struct.pack(">I", durasi_film)
        else:
            mvhd[24:32] = struct.pack(">Q", durasi_film)
        isi = [[b"mvhd", bytes(mvhd)]] + anak_baru + [[t, c] for t, c, *_ in moov[1] if t not in (b"mvhd", b"trak", b"mvex")]
        return tulis(b"moov", isi), durasi_film / mov_ts

    mdat_isi = b"".join(s["data"] for tid in [struct.unpack(">I", (lambda k: k[12:16] if k[0] == 0 else k[20:24])(cari(t[1], b"tkhd")[1]))[0] for t in trak_list] for s in sampel[tid])
    # Ukuran moov tidak bergantung pada letak mdat (co64 berukuran tetap), jadi hitung dua kali.
    moov_coba, _ = bangun_moov(0)
    hdr_mdat = 16 if len(mdat_isi) + 8 > 0xFFFFFFFF else 8
    awal = len(ftyp_baru) + len(moov_coba) + hdr_mdat
    moov_baru, detik = bangun_moov(awal)
    with open(keluar, "wb") as f:
        f.write(ftyp_baru + moov_baru + tulis(b"mdat", mdat_isi))
    print(f"{keluar}: {detik:.1f} detik, " + ", ".join(f"trek {t}: {len(s)} sampel" for t, s in sampel.items()))


if __name__ == "__main__":
    masuk = sys.argv[1]
    main(masuk, sys.argv[2] if len(sys.argv) > 2 else masuk)
