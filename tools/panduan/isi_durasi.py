"""Sisipkan durasi ke berkas WebM hasil MediaRecorder agar video bisa digeser (seek) di pemutar.

MediaRecorder menulis Segment > Info tanpa elemen Duration. Skrip ini menambah
Duration (dalam satuan TimecodeScale, bawaan 1 ms) ke elemen Info.

    python tools/panduan/isi_durasi.py static/panduan/video-panduan.webm 96.3
"""
import struct
import sys

SEGMENT, INFO, DURATION, TIMECODE_SCALE = 0x18538067, 0x1549A966, 0x4489, 0x2AD7B1


def baca_id(b, i):
    n = 1
    while n <= 4 and not (b[i] & (0x80 >> (n - 1))):
        n += 1
    return int.from_bytes(b[i:i + n], "big"), n


def baca_ukuran(b, i):
    n = 1
    while not (b[i] & (0x80 >> (n - 1))):
        n += 1
    v = b[i] & (0xFF >> n)
    for k in range(1, n):
        v = (v << 8) | b[i + k]
    return v, n, v == (1 << (7 * n)) - 1


def tulis_ukuran(v, n=8):
    return ((1 << (7 * n)) | v).to_bytes(n, "big")


def main(path, detik):
    b = bytearray(open(path, "rb").read())
    i = 0
    eid, n = baca_id(b, i)
    size, sn, _ = baca_ukuran(b, i + n)
    i += n + sn + size  # lewati header EBML
    eid, n = baca_id(b, i)
    assert eid == SEGMENT, "Segment tidak ditemukan"
    _, sn, tak_tentu = baca_ukuran(b, i + n)
    assert tak_tentu, "Segment berukuran tetap; skrip ini hanya untuk keluaran MediaRecorder"
    i += n + sn
    eid, n = baca_id(b, i)
    while eid != INFO:
        size, sn, _ = baca_ukuran(b, i + n)
        i += n + sn + size
        eid, n = baca_id(b, i)
    info_awal = i
    size, sn, _ = baca_ukuran(b, i + n)
    isi_awal, isi_akhir = i + n + sn, i + n + sn + size
    isi = bytes(b[isi_awal:isi_akhir])
    skala = 1_000_000
    j = 0
    while j < len(isi):
        cid, cn = baca_id(isi, j)
        csize, csn, _ = baca_ukuran(isi, j + cn)
        if cid == DURATION:
            print("Durasi sudah ada, tidak diubah.")
            return
        if cid == TIMECODE_SCALE:
            skala = int.from_bytes(isi[j + cn + csn:j + cn + csn + csize], "big")
        j += cn + csn + csize
    durasi = detik * 1e9 / skala
    elemen = struct.pack(">H", DURATION) + b"\x88" + struct.pack(">d", durasi)
    isi_baru = isi + elemen
    header = b[info_awal:info_awal + n] + tulis_ukuran(len(isi_baru))
    b[info_awal:isi_akhir] = header + isi_baru
    open(path, "wb").write(b)
    print(f"Durasi {detik} detik ditulis ke {path}")


if __name__ == "__main__":
    main(sys.argv[1], float(sys.argv[2]))
