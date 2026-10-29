# -*- coding: utf-8 -*-
"""
PDF 中文字体子集化工具

背景：SimSun 完整嵌入约 9MB，三个 PDF 合计 28MB，可能超过上传系统限制。
本模块把 TTF/TTC 裁剪为「仅包含指定字符」的独立 TTF，体积可降到几百 KB。

实现要点：
1. 从 TTC 中取出指定字体的表目录（TTC 内部各字体共享数据区）
2. 重写 glyf + loca：只保留需要的字形，索引保持原 gid 不变（填空 glyph），
   这样 PDF 的 Identity-H CID 无需重映射
3. 重建完整 sfnt 头 + 表目录（含正确的 searchRange/entrySelector/rangeShift）
4. 校验：子集必须能被 FreeType(Pillow) 成功加载
"""
import struct
import math


def _u16(b, o): return struct.unpack('>H', b[o:o + 2])[0]
def _s16(b, o): return struct.unpack('>h', b[o:o + 2])[0]
def _u32(b, o): return struct.unpack('>I', b[o:o + 4])[0]


def read_sfnt(data, offset=0):
    """读取单个 sfnt（TTF）的表目录：{tag: (offset, length)}"""
    if data[offset:offset + 4] not in (b'\x00\x01\x00\x00', b'true'):
        raise ValueError('不是 TrueType 字体')
    numTables = _u16(data, offset + 4)
    tables = {}
    for i in range(numTables):
        rec = offset + 12 + i * 16
        tag = data[rec:rec + 4].decode('latin-1')
        off = _u32(data, rec + 8)
        ln = _u32(data, rec + 12)
        tables[tag] = (off, ln)
    return tables


def open_font(path):
    """打开字体文件，若是 TTC 则取第 0 个字体。返回 (data, tables)"""
    data = open(path, 'rb').read()
    if data[:4] == b'ttcf':
        num = _u32(data, 8)
        if num < 1:
            raise ValueError('TTC 中无字体')
        offset = _u32(data, 12)
        return data, read_sfnt(data, offset)
    return data, read_sfnt(data, 0)


def build_subset(path, keep_gids):
    """
    生成子集 TTF，只保留 keep_gids 中的字形（含复合字形依赖）。
    返回 bytes；若字体非 TrueType 轮廓则返回原文件内容。
    """
    data, tables = open_font(path)

    if 'glyf' not in tables or 'loca' not in tables or 'head' not in tables:
        return data  # CFF 轮廓，放弃子集

    head_off = tables['head'][0]
    indexToLocFormat = _s16(data, head_off + 50)
    loca_off, loca_len = tables['loca']
    glyf_off, glyf_len = tables['glyf']

    if indexToLocFormat == 0:
        numGlyphs = loca_len // 2 - 1
    else:
        numGlyphs = loca_len // 4 - 1

    def loca(i):
        if indexToLocFormat == 0:
            return _u16(data, loca_off + i * 2) * 2
        return _u32(data, loca_off + i * 4)

    def glyph_bytes(i):
        s, e = loca(i), loca(i + 1)
        if e <= s:
            return b''
        return data[glyf_off + s: glyf_off + e]

    # 展开复合字形依赖
    need = set()
    for g in keep_gids:
        if 0 <= g < numGlyphs:
            need.add(g)
    need.add(0)
    stack = list(need)
    while stack:
        g = stack.pop()
        gd = glyph_bytes(g)
        if len(gd) < 10:
            continue
        ncont = struct.unpack('>h', gd[0:2])[0]
        if ncont >= 0:
            continue
        p = 10
        while p + 4 <= len(gd):
            flags = _u16(gd, p)
            comp = _u16(gd, p + 2)
            if comp not in need and comp < numGlyphs:
                need.add(comp)
                stack.append(comp)
            p += 4
            if flags & 0x0001:
                p += 4
            else:
                p += 2
            if flags & 0x0008:
                p += 2
            elif flags & 0x0040:
                p += 4
            elif flags & 0x0080:
                p += 8
            if not (flags & 0x0020):
                break

    # 重建 glyf + loca（保持 gid 索引，未用字形置空）
    new_glyf = bytearray()
    new_loca = []
    for i in range(numGlyphs):
        new_loca.append(len(new_glyf) // 2 if indexToLocFormat == 0 else len(new_glyf))
        if i in need:
            gd = glyph_bytes(i)
            new_glyf += gd
            if len(gd) % 4:
                new_glyf += b'\x00' * (4 - len(gd) % 4)
    new_loca.append(len(new_glyf) // 2 if indexToLocFormat == 0 else len(new_glyf))

    if indexToLocFormat == 0:
        new_loca_bytes = b''.join(struct.pack('>H', v) for v in new_loca)
    else:
        new_loca_bytes = b''.join(struct.pack('>I', v) for v in new_loca)

    # 组装新 TTF
    # 关键：丢弃点阵位图表（EBDT/EBLC 占 5.6MB，PDF 用矢量轮廓完全不需要），
    # 以及竖排度量表（vhea/vmtx，中文横排排版不用）。
    DROP = {'EBDT', 'EBLC', 'EBSC', 'bdat', 'bloc', 'vhea', 'vmtx', 'MERG', 'meta'}
    order = sorted([t for t in tables.keys() if t not in DROP])
    if 'head' in order:
        order.remove('head')
        order.insert(0, 'head')

    def tbl(name):
        if name == 'glyf':
            return bytes(new_glyf)
        if name == 'loca':
            return new_loca_bytes
        o, l = tables[name]
        return data[o:o + l]

    numTables = len(order)
    maxPow2 = 1 << int(math.floor(math.log2(numTables)))
    searchRange = maxPow2 * 16
    entrySelector = int(math.log2(maxPow2))
    rangeShift = numTables * 16 - searchRange

    header = bytearray()
    header += b'\x00\x01\x00\x00'
    header += struct.pack('>HHHH', numTables, searchRange, entrySelector, rangeShift)

    dir_size = 12 + numTables * 16
    body = bytearray()
    offset = dir_size
    recs = []
    for name in order:
        tb = tbl(name)
        recs.append((name, offset, len(tb)))
        pad = (4 - len(tb) % 4) % 4
        body += tb + b'\x00' * pad
        offset += len(tb) + pad

    for (name, off, ln) in recs:
        header += name.encode('latin-1')[:4].ljust(4, b' ')
        header += struct.pack('>III', 0, off, ln)

    return bytes(header) + bytes(body)


def cmap_gid_map(path):
    """返回 unicode -> gid 映射（供调用方统计所需字形）"""
    data, tables = open_font(path)
    cmap_off = tables['cmap'][0]
    numSub = _u16(data, cmap_off + 2)
    best = None
    for i in range(numSub):
        rec = cmap_off + 4 + i * 8
        pid = _u16(data, rec)
        eid = _u16(data, rec + 2)
        sub = cmap_off + _u32(data, rec + 4)
        fmt = _u16(data, sub)
        if fmt == 4 and (pid == 3 or pid == 0):
            best = sub
            break
    m = {}
    if best is None:
        return m
    segX2 = _u16(data, best + 6)
    seg = segX2 // 2
    endArr = best + 14
    startArr = endArr + segX2 + 2
    deltaArr = startArr + segX2
    rangeArr = deltaArr + segX2
    for s in range(seg):
        end = _u16(data, endArr + s * 2)
        start = _u16(data, startArr + s * 2)
        delta = _s16(data, deltaArr + s * 2)
        ro = _u16(data, rangeArr + s * 2)
        if start == 0xFFFF or start > 0xFFFE:
            continue
        for c in range(start, min(end, 0xFFFE) + 1):
            if ro == 0:
                gid = (c + delta) & 0xFFFF
            else:
                gi = rangeArr + s * 2 + ro + (c - start) * 2
                if gi + 1 >= len(data):
                    continue
                gid = _u16(data, gi)
                if gid:
                    gid = (gid + delta) & 0xFFFF
            if gid:
                m[c] = gid
    return m


def verify_subset(subset_bytes, tmpdir):
    """用 Pillow 校验子集字体可被 FreeType 加载"""
    import os
    p = os.path.join(tmpdir, '_verify_subset.ttf')
    with open(p, 'wb') as f:
        f.write(subset_bytes)
    try:
        from PIL import ImageFont
        ImageFont.truetype(p, 20)
        ok = True
    except Exception as e:
        ok = False
    try:
        os.remove(p)
    except Exception:
        pass
    return ok
