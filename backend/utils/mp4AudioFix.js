// Repairs MP4/MOV files whose first AAC audio "frame" is really the track's
// AudioSpecificConfig (e.g. the 2 bytes 12 10). Some phone recorders write it
// that way. Chrome/Edge on Windows decode AAC with Media Foundation, which
// rejects that packet, so the whole video fails with
// "PIPELINE_ERROR_DECODE: Failed to send audio packet for decoding".
//
// The fix is done in place without changing any box sizes:
//   - stsz: the first audio sample's size becomes 0 (browsers skip empty packets)
//   - stco/co64: the first audio chunk starts after those bytes
// Nothing else in the file moves, so all other offsets stay valid.

const MAX_TOP_LEVEL_BOXES = 64;

/** Box header at `o` inside `buf` (relative offsets). Returns null if invalid. */
function boxAt(buf, o, end) {
  if (o + 8 > end) return null;
  let size = buf.readUInt32BE(o);
  const type = buf.toString('latin1', o + 4, o + 8);
  let header = 8;
  if (size === 1) {
    if (o + 16 > end) return null;
    size = Number(buf.readBigUInt64BE(o + 8));
    header = 16;
  } else if (size === 0) {
    size = end - o;
  }
  if (size < header || o + size > end) return null;
  return { o, size, type, body: o + header, end: o + size };
}

function children(buf, start, end) {
  const out = [];
  for (let o = start; o < end;) {
    const b = boxAt(buf, o, end);
    if (!b) break;
    out.push(b);
    o = b.end;
  }
  return out;
}

const child = (buf, box, type) => children(buf, box.body, box.end).find((b) => b.type === type);

/** Reads an MPEG-4 descriptor length (1–4 bytes, 7 bits each). */
function descLen(buf, o) {
  let len = 0;
  for (let i = 0; i < 4; i++) {
    const byte = buf[o + i];
    len = (len << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) return { len, next: o + i + 1 };
  }
  return { len, next: o + 4 };
}

/** AudioSpecificConfig bytes from an esds box, or null. */
function audioSpecificConfig(buf, esds) {
  let o = esds.body + 4; // skip FullBox version/flags
  if (buf[o] !== 0x03) return null; // ES_Descriptor
  let d = descLen(buf, o + 1);
  o = d.next + 2; // ES_ID
  const flags = buf[o++];
  if (flags & 0x80) o += 2; // dependsOn_ES_ID
  if (flags & 0x40) o += 1 + buf[o]; // URL
  if (flags & 0x20) o += 2; // OCR_ES_Id
  if (buf[o] !== 0x04) return null; // DecoderConfigDescriptor
  d = descLen(buf, o + 1);
  o = d.next + 13;
  if (buf[o] !== 0x05) return null; // DecoderSpecificInfo
  d = descLen(buf, o + 1);
  if (d.next + d.len > esds.end) return null;
  return buf.subarray(d.next, d.next + d.len);
}

/** Finds an esds box inside an mp4a sample entry (also inside a QuickTime 'wave' box). */
function findEsds(buf, entry) {
  const version = buf.readUInt16BE(entry.body + 8);
  const start = entry.body + 28 + (version === 1 ? 16 : version === 2 ? 36 : 0);
  for (const b of children(buf, start, entry.end)) {
    if (b.type === 'esds') return b;
    if (b.type === 'wave') {
      const inner = children(buf, b.body, b.end).find((x) => x.type === 'esds');
      if (inner) return inner;
    }
  }
  return null;
}

/**
 * Works out the byte patches needed for a file.
 * @param read  async (offset, length) => Buffer   (absolute file offsets)
 * @param fileSize total file size in bytes
 * @returns array of { offset, data } patches (empty when nothing needs fixing)
 */
async function planAacConfigFrameFix(read, fileSize) {
  // Locate the moov box among the top-level boxes
  let moovOffset = -1;
  let moovSize = 0;
  for (let o = 0, n = 0; o + 8 <= fileSize && n < MAX_TOP_LEVEL_BOXES; n++) {
    const head = await read(o, Math.min(16, fileSize - o));
    if (head.length < 8) return [];
    let size = head.readUInt32BE(0);
    if (size === 0) size = fileSize - o; // runs to end of file
    else if (size === 1) size = head.length >= 16 ? Number(head.readBigUInt64BE(8)) : 0;
    const type = head.toString('latin1', 4, 8);
    if (size < 8) return [];
    if (type === 'moov') { moovOffset = o; moovSize = size; break; }
    o += size;
  }
  if (moovOffset < 0 || moovSize > 50 * 1024 * 1024) return [];

  const moovBuf = await read(moovOffset, moovSize);
  const moov = boxAt(moovBuf, 0, moovBuf.length);
  if (!moov) return [];

  const patches = [];
  for (const trak of children(moovBuf, moov.body, moov.end).filter((b) => b.type === 'trak')) {
    const mdia = child(moovBuf, trak, 'mdia');
    const hdlr = mdia && child(moovBuf, mdia, 'hdlr');
    if (!hdlr || moovBuf.toString('latin1', hdlr.body + 8, hdlr.body + 12) !== 'soun') continue;

    const minf = child(moovBuf, mdia, 'minf');
    const stbl = minf && child(moovBuf, minf, 'stbl');
    const stsd = stbl && child(moovBuf, stbl, 'stsd');
    const stsz = stbl && child(moovBuf, stbl, 'stsz');
    const stco = stbl && (child(moovBuf, stbl, 'stco') || child(moovBuf, stbl, 'co64'));
    if (!stsd || !stsz || !stco) continue;

    const entry = children(moovBuf, stsd.body + 8, stsd.end)[0];
    if (!entry || entry.type !== 'mp4a') continue;
    const esds = findEsds(moovBuf, entry);
    const asc = esds && audioSpecificConfig(moovBuf, esds);
    if (!asc || !asc.length) continue;

    const constantSize = moovBuf.readUInt32BE(stsz.body + 4);
    const sampleCount = moovBuf.readUInt32BE(stsz.body + 8);
    if (constantSize !== 0 || sampleCount < 2) continue;
    const firstSize = moovBuf.readUInt32BE(stsz.body + 12);
    if (firstSize !== asc.length) continue;

    const is64 = stco.type === 'co64';
    if (moovBuf.readUInt32BE(stco.body + 4) < 1) continue;
    const firstChunk = is64 ? Number(moovBuf.readBigUInt64BE(stco.body + 8)) : moovBuf.readUInt32BE(stco.body + 8);
    if (firstChunk + firstSize > fileSize) continue;

    const sample = await read(firstChunk, firstSize);
    if (!sample.equals(asc)) continue; // a real audio frame — leave it alone

    const zero = Buffer.alloc(4);
    patches.push({ offset: moovOffset + stsz.body + 12, data: zero });
    const moved = Buffer.alloc(is64 ? 8 : 4);
    if (is64) moved.writeBigUInt64BE(BigInt(firstChunk + firstSize));
    else moved.writeUInt32BE(firstChunk + firstSize);
    patches.push({ offset: moovOffset + stco.body + 8, data: moved });
  }
  return patches;
}

module.exports = { planAacConfigFrameFix };
