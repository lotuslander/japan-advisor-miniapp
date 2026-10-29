# -*- coding: utf-8 -*-
"""
把 R11 源程序鉴别材料 / 软件说明书（纯文本，\f 分页）转成 PDF。

不依赖 reportlab：手写 PDF 1.4 结构，嵌入系统 TrueType 中文字体（SimSun/微软雅黑），
使用 Identity-H + CID 编码保证中文正确显示（未经 OCR 的矢量文字，可直接被审查人员阅读/复制）。

用法：
    python txt2pdf.py <input.txt> <output.pdf> <header_font_size>
"""
import sys
import os
import zlib
import struct

# ───────────── 字体处理 ─────────────

def _read_u16(b, o):
    return struct.unpack('>H', b[o:o + 2])[0]


def _read_s16(b, o):
    return struct.unpack('>h', b[o:o + 2])[0]


def _read_u32(b, o):
    return struct.unpack('>I', b[o:o + 4])[0]


def parse_ttf(path):
    """解析 TTF，返回 cmap(unicode->gid)、hmtx(advance widths)、字体度量。"""
    with open(path, 'rb') as f:
        data = f.read()

    tag = data[:4]
    if tag not in (b'\x00\x01\x00\x00', b'true', b'ttcf'):
        raise ValueError('不支持的字体格式: %r' % tag)
    if tag == b'ttcf':
        # 字体集合，取第一个字体
        off = _read_u32(data, 12)
        numTables = _read_u16(data, off + 4)
        table_dir = off + 12
    else:
        numTables = _read_u16(data, 4)
        table_dir = 12

    tables = {}
    for i in range(numTables):
        rec = table_dir + i * 16
        name = data[rec:rec + 4].decode('latin-1')
        offset = _read_u32(data, rec + 8)
        length = _read_u32(data, rec + 12)
        tables[name] = (offset, length)

    # head
    head_off = tables['head'][0]
    unitsPerEm = _read_u16(data, head_off + 18)
    xMin = _read_s16(data, head_off + 36)
    yMin = _read_s16(data, head_off + 38)
    xMax = _read_s16(data, head_off + 40)
    yMax = _read_s16(data, head_off + 42)

    # hhea
    hhea_off = tables['hhea'][0]
    numberOfHMetrics = _read_u16(data, hhea_off + 34)

    # hmtx
    hmtx_off = tables['hmtx'][0]
    advances = []
    for i in range(numberOfHMetrics):
        advances.append(_read_u16(data, hmtx_off + i * 4))

    # cmap：优先 format 4 (BMP)
    cmap_off = tables['cmap'][0]
    numSub = _read_u16(data, cmap_off + 2)
    best = None
    for i in range(numSub):
        rec = cmap_off + 4 + i * 8
        platid = _read_u16(data, rec)
        encid = _read_u16(data, rec + 2)
        sub_off = cmap_off + _read_u32(data, rec + 4)
        fmt = _read_u16(data, sub_off)
        if fmt == 4 and ((platid == 3 and encid in (1, 10)) or platid == 0):
            best = sub_off
            break

    cmap = {}
    if best is not None:
        segX2 = _read_u16(data, best + 6)
        seg = segX2 // 2
        endArr = best + 14
        startArr = endArr + segX2 + 2
        idDeltaArr = startArr + segX2
        idRangeArr = idDeltaArr + segX2
        for s in range(seg):
            end = _read_u16(data, endArr + s * 2)
            start = _read_u16(data, startArr + s * 2)
            delta = _read_s16(data, idDeltaArr + s * 2)
            rangeOff = _read_u16(data, idRangeArr + s * 2)
            if start == 0xFFFF:
                continue
            for c in range(start, min(end, 0xFFFE) + 1):
                if rangeOff == 0:
                    gid = (c + delta) & 0xFFFF
                else:
                    gi = idRangeArr + s * 2 + rangeOff + (c - start) * 2
                    if gi + 1 >= len(data):
                        continue
                    gid = _read_u16(data, gi)
                    if gid != 0:
                        gid = (gid + delta) & 0xFFFF
                if gid != 0:
                    cmap[c] = gid

    def glyph_width(gid):
        if gid < len(advances):
            return advances[gid]
        if advances:
            return advances[-1]
        return unitsPerEm // 2

    return {
        'data': data,
        'tables': tables,
        'unitsPerEm': unitsPerEm,
        'bbox': (xMin, yMin, xMax, yMax),
        'cmap': cmap,
        'glyph_width': glyph_width,
        'fontfile_key': tables.get('glyf') or tables.get('CFF '),
    }


# ───────────── 字体子集化 ─────────────

def _build_glyf_subset(data, tables, keep_gids):
    """
    构建 glyf/loca 子集。
    做法：保留原 glyph 索引不变（把不需要的字形写成空 glyph），
    这样 CID(=原 gid) 无需重映射，实现最简单且不易出错。
    额外：复合字形依赖的其他字形也必须保留。
    """
    glyf_off, glyf_len = tables['glyf']
    loca_off, loca_len = tables['loca']
    head_off = tables['head'][0]
    indexToLocFormat = _read_s16(data, head_off + 50)

    numGlyphs = (loca_len // 2 - 1) if indexToLocFormat == 0 else (loca_len // 4 - 1)

    def loca(i):
        if indexToLocFormat == 0:
            return _read_u16(data, loca_off + i * 2) * 2
        return _read_u32(data, loca_off + i * 4)

    # 收集需要的 gid，并递归展开复合字形的依赖
    need = set(g for g in keep_gids if 0 <= g <= numGlyphs)
    stack = list(need)
    while stack:
        g = stack.pop()
        s, e = loca(g), loca(g + 1)
        if e <= s:
            continue
        gdata = data[glyf_off + s: glyf_off + e]
        if len(gdata) < 10:
            continue
        ncont = struct.unpack('>h', gdata[0:2])[0]
        if ncont < 0:  # 复合字形
            p = 10
            while p + 4 <= len(gdata):
                flags = struct.unpack('>H', gdata[p:p + 2])[0]
                comp_gid = struct.unpack('>H', gdata[p + 2:p + 4])[0]
                if comp_gid not in need:
                    need.add(comp_gid)
                    stack.append(comp_gid)
                p += 4
                if flags & 0x0001:  # ARG_1_AND_2_ARE_WORDS
                    p += 4
                else:
                    p += 2
                if flags & 0x0008:  # WE_HAVE_A_SCALE
                    p += 2
                elif flags & 0x0040:  # WE_HAVE_AN_X_AND_Y_SCALE
                    p += 4
                elif flags & 0x0080:  # WE_HAVE_A_TWO_BY_TWO
                    p += 8
                if not (flags & 0x0020):  # MORE_COMPONENTS
                    break
    # 0 号 .notdef 始终保留
    need.add(0)

    # 重写 glyf + loca（保持索引不变，未用字形写空）
    new_glyf = bytearray()
    new_loca = []
    for i in range(numGlyphs + 1):
        new_loca.append(len(new_glyf) // 2 if indexToLocFormat == 0 else len(new_glyf))
        if i >= numGlyphs:
            break
        if i in need:
            s, e = loca(i), loca(i + 1)
            gd = data[glyf_off + s: glyf_off + e]
            new_glyf += gd
            if len(gd) % 4:  # 4 字节对齐
                new_glyf += b'\x00' * (4 - len(gd) % 4)
    # 最后追加末位 loca
    new_loca.append(len(new_glyf) // 2 if indexToLocFormat == 0 else len(new_glyf))

    if indexToLocFormat == 0:
        loca_bytes = b''.join(struct.pack('>H', v) for v in new_loca)
    else:
        loca_bytes = b''.join(struct.pack('>I', v) for v in new_loca)

    return bytes(new_glyf), loca_bytes


def build_subset(font, keep_gids):
    """
    生成精简后的 TTF：保留全部表结构，只把 glyf/loca 替换为子集版本。
    这样浏览器/PDF 阅读器可正常解析，体积从 ~9MB 降到小几百 KB。
    """
    data = font['data']
    tables = font['tables']

    if 'glyf' not in tables or 'loca' not in tables:
        # CFF 轮廓字体，不做子集，直接返回原字体
        return data

    new_glyf, new_loca = _build_glyf_subset(data, tables, keep_gids)

    # 组装新 TTF：仅替换 glyf / loca，其余表原样复制
    order = [n for n in tables.keys()]
    # 保证 head 在首位（规范要求）
    if 'head' in order:
        order.remove('head')
        order.insert(0, 'head')

    def table_bytes(name):
        if name == 'glyf':
            return new_glyf
        if name == 'loca':
            return new_loca
        off, ln = tables[name]
        return data[off:off + ln]

    numTables = len(order)
    # 计算 searchRange 等
    import math
    maxPow2 = 2 ** int(math.floor(math.log2(numTables))) if numTables > 0 else 1
    searchRange = maxPow2 * 16
    entrySelector = int(math.log2(maxPow2)) if maxPow2 > 1 else 0
    rangeShift = numTables * 16 - searchRange

    out = bytearray()
    out += data[:4]  # sfntVersion
    out += struct.pack('>HHHH', numTables, searchRange, entrySelector, rangeShift)

    dir_size = 12 + numTables * 16
    body = bytearray()
    offset = dir_size
    records = []
    for name in order:
        tb = table_bytes(name)
        records.append((name, offset, len(tb)))
        # 4 字节对齐
        padded = tb + b'\x00' * ((4 - len(tb) % 4) % 4)
        body += padded
        offset += len(padded)

    for (name, off, ln) in records:
        nm = name.encode('latin-1')[:4].ljust(4, b' ')
        out += nm
        out += struct.pack('>III', 0, off, ln)  # checksum 置 0（阅读器通常不校验）
    out += body

    # 修正 head.checkSumAdjustment 置 0（PDF 阅读器不强制校验）
    return bytes(out)


# ───────────── PDF 构建 ─────────────

class PdfBuilder:
    def __init__(self):
        self.objects = [None]  # 1-based

    def add(self, content):
        self.objects.append(content)
        return len(self.objects) - 1

    def set(self, num, content):
        self.objects[num] = content

    def write(self, path):
        out = bytearray()
        out += b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
        offsets = [0] * len(self.objects)
        for i in range(1, len(self.objects)):
            offsets[i] = len(out)
            out += ('%d 0 obj\n' % i).encode('latin-1')
            body = self.objects[i]
            if isinstance(body, str):
                out += body.encode('latin-1')
            else:
                out += body
            if not body if isinstance(body, bytes) else False:
                pass
            out += b'\nendobj\n'

        xref_pos = len(out)
        n = len(self.objects)
        out += ('xref\n0 %d\n' % n).encode('latin-1')
        out += b'0000000000 65535 f \n'
        for i in range(1, n):
            out += ('%010d 00000 n \n' % offsets[i]).encode('latin-1')
        out += ('trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n'
                % (n, xref_pos)).encode('latin-1')
        with open(path, 'wb') as f:
            f.write(out)


def build_stream(data, compress=True):
    if compress:
        comp = zlib.compress(data, 9)
        return b'<< /Length %d /Filter /FlateDecode >>\nstream\n' % len(comp) + comp + b'\nendstream'
    return b'<< /Length %d >>\nstream\n' % len(data) + data + b'\nendstream'


def find_font():
    candidates = [
        r'C:\Windows\Fonts\simsun.ttc',
        r'C:\Windows\Fonts\msyh.ttc',
        r'C:\Windows\Fonts\simhei.ttf',
        r'C:\Windows\Fonts\simkai.ttf',
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    raise RuntimeError('未找到可用中文字体')


def main():
    if len(sys.argv) < 3:
        print('用法: python txt2pdf.py <input.txt> <output.pdf>')
        return 1
    src_path = sys.argv[1]
    out_path = sys.argv[2]

    font_path = find_font()
    font = parse_ttf(font_path)

    with open(src_path, 'r', encoding='utf-8') as f:
        text = f.read()

    pages = text.split('\n\f\n')

    # A4：595.28 x 841.89 pt
    PW, PH = 595.28, 841.89
    MARGIN_L, MARGIN_R, MARGIN_T, MARGIN_B = 46, 46, 54, 46
    HEADER_SIZE = 9.0
    BODY_SIZE = 7.2
    LINE_GAP = 1.16

    # 字体度量（1/1000 em 单位）
    UPEM = font['unitsPerEm'] or 1000
    # 从 hhea 读取真实 ascent/descent（1/em 单位）
    data = font['data']
    hhea_off = font['tables']['hhea'][0]
    raw_asc = _read_s16(data, hhea_off + 4)
    raw_desc = _read_s16(data, hhea_off + 6)
    # 换算到 1000/em
    ascent = int(round(raw_asc * 1000.0 / UPEM))
    descent = int(round(raw_desc * 1000.0 / UPEM))
    # FontBBox 也要换算到 1000/em 坐标系（PDF 规范要求）
    fb = font['bbox']
    font_bbox = (
        int(round(fb[0] * 1000.0 / UPEM)),
        int(round(fb[1] * 1000.0 / UPEM)),
        int(round(fb[2] * 1000.0 / UPEM)),
        int(round(fb[3] * 1000.0 / UPEM)),
    )

    # Identity-H CID：cid = 原始 gid
    desc_sz = BODY_SIZE / 1000.0
    asc_pt = ascent * desc_sz
    desc_pt = descent * desc_sz

    pdf = PdfBuilder()
    # 1: Catalog, 2: Pages 占位
    catalog_num = pdf.add('<< /Type /Catalog /Pages 2 0 R >>')
    pages_num = pdf.add('PLACEHOLDER_PAGES')

    # 嵌入字体（子集化：只保留文档实际用到的字形，把 9MB 字体压缩到几百 KB）
    # 注意：used_gids 在下方统一计算，此处先占位，稍后回填字体流内容。
    fontfile_num = pdf.add('PLACEHOLDER_FONTFILE')

    font_names = {
        'FontFile2': fontfile_num,
    }
    desc_num = pdf.add(
        '<< /Type /FontDescriptor /FontName /SimSun /Flags 4 '
        '/FontBBox [%d %d %d %d] /ItalicAngle 0 /Ascent %d /Descent %d '
        '/CapHeight %d /StemV 80 /FontFile2 %d 0 R >>'
        % (font_bbox[0], font_bbox[1], font_bbox[2], font_bbox[3],
           ascent, descent, ascent, fontfile_num)
    )

    # CIDFont + Type0
    def enc_glyph(text_str):
        """把字符串转成 CID16 字节流（Identity-H，cid=gid）"""
        out = bytearray()
        for ch in text_str:
            cp = ord(ch)
            gid = font['cmap'].get(cp, 0)
            if gid == 0:
                gid = font['cmap'].get(ord('?'), 0)
            out += struct.pack('>H', gid & 0xFFFF)
        return bytes(out)

    # 统计页数后构建
    page_objs = []
    content_objs = []

    for pg in pages:
        lines = pg.split('\n')
        header = lines[0] if lines else ''
        rule = lines[1] if len(lines) > 1 else ''
        body = lines[2:]

        ops = []
        # 页眉
        hdr_gid = enc_glyph(header)
        ops.append('BT /F1 %g Tf %.2f %.2f Td <%s> Tj ET'
                   % (HEADER_SIZE, MARGIN_L, PH - MARGIN_T + 14, hdr_gid.hex()))
        # 分隔线
        ops.append('%.2f %.2f m %.2f %.2f l S'
                   % (MARGIN_L, PH - MARGIN_T + 8, PW - MARGIN_R, PH - MARGIN_T + 8))

        y = PH - MARGIN_T - BODY_SIZE
        for ln in body:
            if ln == '':
                y -= BODY_SIZE * LINE_GAP
                continue
            gid = enc_glyph(ln)
            ops.append('BT /F1 %g Tf %.2f %.2f Td <%s> Tj ET'
                       % (BODY_SIZE, MARGIN_L, y, gid.hex()))
            y -= BODY_SIZE * LINE_GAP

        content = '\n'.join(ops).encode('latin-1')
        cnum = pdf.add(build_stream(content))
        content_objs.append(cnum)
        pnum = pdf.add('PLACEHOLDER_PAGE')
        page_objs.append(pnum)

        pdf.set(pnum,
                '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] '
                '/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>'
                % (PW, PH, 0, cnum))
        # 占位符修正：F1 序号稍后填

    # 现在添加字体对象（放在页对象之后，引用关系无环）
    # 收集文档中实际用到的字符 -> gid，为这些 gid 输出真实字宽（1000/em 单位）
    used_gids = set()
    for pg in pages:
        for ch in pg:
            gid = font['cmap'].get(ord(ch), 0)
            if gid:
                used_gids.add(gid)
    w_entries = []
    for gid in sorted(used_gids):
        w = font['glyph_width'](gid)
        w_entries.append('%d [%d]' % (gid, int(round(w * 1000.0 / UPEM))))
    W_ARRAY = ' '.join(w_entries)

    cidfont_num = pdf.add(
        '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /SimSun '
        '/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> '
        '/FontDescriptor %d 0 R /DW 1000 /W [%s] >>'
        % (desc_num, W_ARRAY)
    )
    type0_num = pdf.add(
        '<< /Type /Font /Subtype /Type0 /BaseFont /SimSun /Encoding /Identity-H '
        '/DescendantFonts [%d 0 R] >>' % cidfont_num
    )

    # 修正页对象的字体引用
    for pnum, cnum in zip(page_objs, content_objs):
        pdf.set(pnum,
                '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] '
                '/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>'
                % (PW, PH, type0_num, cnum))

    # Pages
    kids = ' '.join('%d 0 R' % p for p in page_objs)
    pdf.set(pages_num, '<< /Type /Pages /Count %d /Kids [%s] >>' % (len(page_objs), kids))

    # ── 字体子集化并回填字体流 ──
    # 只嵌入文档实际用到的字形（含复合字形依赖），并丢弃 EBDT/EBLC 位图表，
    # 体积从 17MB 降到约 0.6MB。Identity-H 的 CID 仍等于原 gid，无需重映射。
    subset_bytes = None
    try:
        import font_subset as _fs
        _cmap = _fs.cmap_gid_map(font_path)
        _need = set()
        for ch in set(text):
            g = _cmap.get(ord(ch))
            if g:
                _need.add(g)
        _cand = _fs.build_subset(font_path, _need)
        if len(_cand) < len(open(font_path, 'rb').read()):
            import tempfile
            if _fs.verify_subset(_cand, tempfile.mkdtemp()):
                subset_bytes = _cand
    except Exception:
        subset_bytes = None

    if subset_bytes is None:
        subset_bytes = open(font_path, 'rb').read()
        print('  [提示] 字体子集化不可用，使用完整字体嵌入')

    pdf.set(fontfile_num, build_stream(subset_bytes))

    pdf.write(out_path)

    print('  已生成: %s' % out_path)
    print('  页数: %d' % len(page_objs))
    print('  字体: %s' % os.path.basename(font_path))
    print('  大小: %.1f KB' % (os.path.getsize(out_path) / 1024.0))
    return 0


if __name__ == '__main__':
    sys.exit(main())
