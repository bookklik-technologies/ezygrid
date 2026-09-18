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

/** Resource limits applied during ZIP ingestion (F03). */
export interface ZipReadLimits {
  /** Maximum number of archive members. */
  maxEntries?: number;
  /** Maximum total expanded size across all members. */
  maxTotalExpanded?: number;
  /** Maximum expanded size of a single member. */
  maxEntryExpanded?: number;
  /** Maximum expanded/compressed ratio (guards zip bombs). */
  maxCompressionRatio?: number;
}

const DEFAULT_LIMITS: Required<ZipReadLimits> = {
  maxEntries: 4096,
  maxTotalExpanded: 512 * 1024 * 1024,
  maxEntryExpanded: 256 * 1024 * 1024,
  maxCompressionRatio: 1000,
};

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
  if (offset < 0 || offset + size > data.length) {
    throw new Error('corrupt zip archive: truncated header');
  }
  let value = 0;
  for (let i = size - 1; i >= 0; i--) {
    value = value * 256 + data[offset + i]!;
  }
  return value;
}

/**
 * Inflate a raw deflate stream with an expanded-size cap enforced WHILE
 * streaming, so an over-budget entry aborts before its bytes are allocated (F03).
 */
async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const source = new Blob([data as unknown as BlobPart]);
  let produced = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      produced += chunk.byteLength;
      if (produced > limit) {
        controller.error(new Error(`zip entry exceeds expanded size limit (${limit})`));
        return;
      }
      controller.enqueue(chunk);
    },
  });
  const stream = source.stream().pipeThrough(new DecompressionStream('deflate-raw')).pipeThrough(counter);
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Read a ZIP archive; deflated entries decompress via DecompressionStream,
 * stored entries are sliced directly. Central-directory signatures, local
 * header bounds and CRC values are verified, missing signatures abort
 * parsing, and every expansion is bounded by `limits` (F03).
 */
export async function readZip(
  data: Uint8Array,
  limits: ZipReadLimits = {},
): Promise<Map<string, Uint8Array>> {
  const maxEntries = limits.maxEntries ?? DEFAULT_LIMITS.maxEntries;
  const maxTotalExpanded = limits.maxTotalExpanded ?? DEFAULT_LIMITS.maxTotalExpanded;
  const maxEntryExpanded = limits.maxEntryExpanded ?? DEFAULT_LIMITS.maxEntryExpanded;
  const maxCompressionRatio = limits.maxCompressionRatio ?? DEFAULT_LIMITS.maxCompressionRatio;

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
  if (entryCount > maxEntries) {
    throw new Error(`zip archive exceeds entry limit (${maxEntries})`);
  }
  const centralOffset = readLE(data, eocd + 16, 4);
  if (centralOffset < 0 || centralOffset >= data.length) {
    throw new Error('corrupt zip archive: central directory out of bounds');
  }
  const decoder = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  let totalExpanded = 0;
  let offset = centralOffset;
  for (let i = 0; i < entryCount; i++) {
    // A missing or invalid signature is a hard failure, never silent
    // truncation (F03).
    if (readLE(data, offset, 4) !== 0x02014b50) {
      throw new Error('corrupt zip archive: invalid central directory signature');
    }
    const method = readLE(data, offset + 10, 2);
    const compressedSize = readLE(data, offset + 20, 4);
    const uncompressedSize = readLE(data, offset + 24, 4);
    const crc = readLE(data, offset + 16, 4);
    const nameLength = readLE(data, offset + 28, 2);
    const extraLength = readLE(data, offset + 30, 2);
    const commentLength = readLE(data, offset + 32, 2);
    const localOffset = readLE(data, offset + 42, 4);
    const name = decoder.decode(data.slice(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (uncompressedSize > maxEntryExpanded || totalExpanded + uncompressedSize > maxTotalExpanded) {
      throw new Error('zip archive exceeds expanded size limits');
    }
    // local header: verify signature and bounds before slicing (F03)
    if (readLE(data, localOffset, 4) !== 0x04034b50) {
      throw new Error(`corrupt zip archive: invalid local header for ${name}`);
    }
    const localNameLength = readLE(data, localOffset + 26, 2);
    const localExtraLength = readLE(data, localOffset + 28, 2);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > data.length) {
      throw new Error(`corrupt zip archive: entry data out of bounds for ${name}`);
    }
    const compressed = data.slice(dataStart, dataStart + compressedSize);
    let entryData: Uint8Array;
    if (method === 0) {
      entryData = compressed;
    } else if (method === 8) {
      entryData = await inflateRaw(compressed, maxEntryExpanded);
    } else {
      throw new Error(`unsupported zip method ${method} for ${name}`);
    }
    if (entryData.length !== uncompressedSize) {
      throw new Error(`zip entry size mismatch for ${name}`);
    }
    // Compression-ratio guard; tiny entries are exempt to avoid noise.
    if (compressedSize > 1024) {
      const ratio = entryData.length / compressedSize;
      if (ratio > maxCompressionRatio) {
        throw new Error(`zip compression ratio exceeds limit for ${name}`);
      }
    }
    // Verify the CRC recorded in the central directory (F03).
    if (crc32(entryData) !== crc) {
      throw new Error(`zip entry CRC mismatch for ${name}`);
    }
    totalExpanded += entryData.length;
    files.set(name, entryData);
  }
  return files;
}
