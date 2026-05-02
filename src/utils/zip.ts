/**
 * Minimal ZIP encoder — store method (no compression).
 * Sufficient for bundling multiple small binary files.
 */

// ─── CRC-32 ───────────────────────────────────────────────────────────────────

const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (const b of data) c = CRC32_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ─── Byte helpers ─────────────────────────────────────────────────────────────

function u8(a: number[], v: number)  { a.push(v & 0xFF); }
function u16(a: number[], v: number) { a.push(v & 0xFF, (v >> 8) & 0xFF); }
function u32(a: number[], v: number) {
  a.push(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF);
}

// ─── ZIP builder ──────────────────────────────────────────────────────────────

export interface ZipEntry { name: string; data: Uint8Array }

export function buildZip(entries: ZipEntry[]): Uint8Array {
  const localOffsets: number[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;

  // Local file headers + data
  for (const { name, data } of entries) {
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const local: number[] = [];

    u32(local, 0x04034B50);  // local file header signature
    u16(local, 20);           // version needed: 2.0
    u16(local, 0);            // general purpose flags
    u16(local, 0);            // compression: stored
    u16(local, 0);            // last mod time
    u16(local, 0);            // last mod date
    u32(local, crc);
    u32(local, data.length);  // compressed size
    u32(local, data.length);  // uncompressed size
    u16(local, nameBytes.length);
    u16(local, 0);            // extra field length
    nameBytes.forEach(b => u8(local, b));

    localOffsets.push(offset);
    const localArr = new Uint8Array(local);
    chunks.push(localArr);
    chunks.push(data);
    offset += localArr.length + data.length;
  }

  // Central directory
  const cdStart = offset;
  const centralDir: number[] = [];

  for (let i = 0; i < entries.length; i++) {
    const { name, data } = entries[i];
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);

    u32(centralDir, 0x02014B50); // central dir signature
    u16(centralDir, 0x0314);     // version made by: Unix 2.0
    u16(centralDir, 20);          // version needed
    u16(centralDir, 0);           // flags
    u16(centralDir, 0);           // compression: stored
    u16(centralDir, 0);           // last mod time
    u16(centralDir, 0);           // last mod date
    u32(centralDir, crc);
    u32(centralDir, data.length); // compressed size
    u32(centralDir, data.length); // uncompressed size
    u16(centralDir, nameBytes.length);
    u16(centralDir, 0);           // extra field length
    u16(centralDir, 0);           // file comment length
    u16(centralDir, 0);           // disk number start
    u16(centralDir, 0);           // internal attributes
    u32(centralDir, 0);           // external attributes
    u32(centralDir, localOffsets[i]);
    nameBytes.forEach(b => u8(centralDir, b));
  }

  const cdArr = new Uint8Array(centralDir);
  chunks.push(cdArr);

  // End of central directory record
  const eocd: number[] = [];
  u32(eocd, 0x06054B50);  // EOCD signature
  u16(eocd, 0);            // disk number
  u16(eocd, 0);            // start disk
  u16(eocd, entries.length);
  u16(eocd, entries.length);
  u32(eocd, cdArr.length);
  u32(eocd, cdStart);
  u16(eocd, 0);            // comment length
  chunks.push(new Uint8Array(eocd));

  // Combine
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { result.set(c, pos); pos += c.length; }
  return result;
}
