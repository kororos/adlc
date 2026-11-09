# QuickTime draws a tx3g subtitle track only when the track (tkhd) and its default text box have a size.
# ffmpeg leaves both 0×0: set them to the video's size. Usage: fix-tx3g.py file.m4v [width height]
import struct, sys
path = sys.argv[1]; W = int(sys.argv[2]) if len(sys.argv) > 2 else 1920; H = int(sys.argv[3]) if len(sys.argv) > 3 else 1080
buf = bytearray(open(path, "rb").read())
def boxes(start, end):
    pos = start
    while pos + 8 <= end:
        size, typ = struct.unpack(">I4s", buf[pos:pos + 8]); hdr = 8
        if size == 1: size = struct.unpack(">Q", buf[pos + 8:pos + 16])[0]; hdr = 16
        if size == 0: size = end - pos
        yield typ.decode("latin1"), pos, size, hdr
        pos += size
def find(start, end, path_):
    for typ, pos, size, hdr in boxes(start, end):
        if typ == path_[0]:
            if len(path_) == 1: yield pos, size, hdr
            else: yield from find(pos + hdr, pos + size, path_[1:])
patched = 0
for moov, msize, mhdr in find(0, len(buf), ["moov"]):
    for trak, tsize, thdr in find(moov + mhdr, moov + msize, ["trak"]):
        hd = list(find(trak + thdr, trak + tsize, ["mdia", "hdlr"]))
        if not hd or bytes(buf[hd[0][0] + hd[0][2] + 8:hd[0][0] + hd[0][2] + 12]) not in (b"sbtl", b"text"): continue
        for pos, size, hdr in find(trak + thdr, trak + tsize, ["tkhd"]):
            struct.pack_into(">II", buf, pos + size - 8, W << 16, H << 16)
        for pos, size, hdr in find(trak + thdr, trak + tsize, ["mdia", "minf", "stbl", "stsd"]):
            e = pos + hdr + 8                       # first sample entry
            if bytes(buf[e + 4:e + 8]) == b"tx3g":
                b = e + 8 + 8                       # after the entry header, reserved and data ref index
                struct.pack_into(">hhhh", buf, b + 10, 0, 0, H, W)   # BoxRecord top, left, bottom, right
                patched += 1
open(path, "wb").write(buf)
print(f"patched {patched} subtitle track(s) to {W}x{H}")
