const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function writeLE(bytes: Uint8Array, offset: number, value: number, size: number): void {
  for (let i = 0; i < size; i++) {
    bytes[offset + i] = (value >>> (8 * i)) & 0xff;
  }
}

/**
 * Build a ZIP archive with STORE (uncompressed) entries — valid for OOXML
 * consumers including Excel and LibreOffice.
 */
export function createZip(entries: ZipEntry[]): Uint8Array {
  let size = 0;
  for (const entry of entries) {
    size += 30 + entry.name.length + entry.data.length + 46 + entry.name.length;
  }
  size += 22;
  const buffer = new Uint8Array(size);
  const encoder = new TextEncoder();
  let offset = 0;
  const central: { name: string; offset: number; crc: number; size: number }[] = [];

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    central.push({ name: entry.name, offset, crc, size: entry.data.length });
    // local file header
    writeLE(buffer, offset, 0x04034b50, 4);
    writeLE(buffer, offset + 4, 20, 2); // version needed
    writeLE(buffer, offset + 6, 0x0800, 2); // UTF-8 flag
    writeLE(buffer, offset + 8, 0, 2); // method: store
    writeLE(buffer, offset + 10, 0, 2); // time
    writeLE(buffer, offset + 12, 0, 2); // date
    writeLE(buffer, offset + 14, crc, 4);
    writeLE(buffer, offset + 18, entry.data.length, 4);
    writeLE(buffer, offset + 22, entry.data.length, 4);
    writeLE(buffer, offset + 26, nameBytes.length, 2);
    writeLE(buffer, offset + 28, 0, 2); // extra len
    buffer.set(nameBytes, offset + 30);
    offset += 30 + nameBytes.length;
    buffer.set(entry.data, offset);
    offset += entry.data.length;
  }

  const centralStart = offset;
  for (const entry of central) {
    const nameBytes = encoder.encode(entry.name);
    writeLE(buffer, offset, 0x02014b50, 4);
    writeLE(buffer, offset + 4, 20, 2); // version made by
    writeLE(buffer, offset + 6, 20, 2); // version needed
    writeLE(buffer, offset + 8, 0x0800, 2);
    writeLE(buffer, offset + 10, 0, 2); // method store
    writeLE(buffer, offset + 12, 0, 2);
    writeLE(buffer, offset + 14, 0, 2);
    writeLE(buffer, offset + 16, entry.crc, 4);
    writeLE(buffer, offset + 20, entry.size, 4);
    writeLE(buffer, offset + 24, entry.size, 4);
    writeLE(buffer, offset + 28, nameBytes.length, 2);
    writeLE(buffer, offset + 30, 0, 2); // extra
    writeLE(buffer, offset + 32, 0, 2); // comment
    writeLE(buffer, offset + 34, 0, 2); // disk
    writeLE(buffer, offset + 36, 0, 2); // internal attrs
    writeLE(buffer, offset + 38, 0, 4); // external attrs
    writeLE(buffer, offset + 42, entry.offset, 4);
    buffer.set(nameBytes, offset + 46);
    offset += 46 + nameBytes.length;
  }
  const centralSize = offset - centralStart;

  // EOCD
  writeLE(buffer, offset, 0x06054b50, 4);
  writeLE(buffer, offset + 4, 0, 2);
  writeLE(buffer, offset + 6, 0, 2);
  writeLE(buffer, offset + 8, central.length, 2);
  writeLE(buffer, offset + 10, central.length, 2);
  writeLE(buffer, offset + 12, centralSize, 4);
  writeLE(buffer, offset + 16, centralStart, 4);
  writeLE(buffer, offset + 20, 0, 2);
  offset += 22;

  return buffer.slice(0, offset);
}

function readLE(data: Uint8Array, offset: number, size: number): number {
  let value = 0;
  for (let i = size - 1; i >= 0; i--) {
    value = value * 256 + data[offset + i]!;
  }
  return value;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const source = new Blob([data as unknown as BlobPart]);
  const stream = source.stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Read a ZIP archive; deflated entries decompress via DecompressionStream,
 * stored entries are sliced directly.
 */
export async function readZip(data: Uint8Array): Promise<Map<string, Uint8Array>> {
  // locate EOCD
  let eocd = -1;
  for (let i = data.length - 22; i >= 0 && i > data.length - 65558; i--) {
    if (readLE(data, i, 4) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('not a zip archive');
  const entryCount = readLE(data, eocd + 10, 2);
  const centralOffset = readLE(data, eocd + 16, 4);
  const decoder = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  let offset = centralOffset;
  for (let i = 0; i < entryCount; i++) {
    if (readLE(data, offset, 4) !== 0x02014b50) break;
    const method = readLE(data, offset + 10, 2);
    const compressedSize = readLE(data, offset + 20, 4);
    const uncompressedSize = readLE(data, offset + 24, 4);
    const nameLength = readLE(data, offset + 28, 2);
    const extraLength = readLE(data, offset + 30, 2);
    const commentLength = readLE(data, offset + 32, 2);
    const localOffset = readLE(data, offset + 42, 4);
    const name = decoder.decode(data.slice(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    // local header
    const localNameLength = readLE(data, localOffset + 26, 2);
    const localExtraLength = readLE(data, localOffset + 28, 2);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = data.slice(dataStart, dataStart + compressedSize);
    if (method === 0) {
      files.set(name, compressed);
    } else if (method === 8) {
      const inflated = await inflateRaw(compressed);
      if (inflated.length !== uncompressedSize) {
        throw new Error(`zip entry size mismatch for ${name}`);
      }
      files.set(name, inflated);
    } else {
      throw new Error(`unsupported zip method ${method} for ${name}`);
    }
  }
  return files;
}
