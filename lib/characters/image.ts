import type { PortraitFormat } from "./contract";

/**
 * Removes every metadata container that can carry a location, a camera serial, a
 * timestamp, or an author's name from a portrait, and drops anything appended after the
 * image's own end marker. This is a rewrite of the container, not a re-encode: pixel data
 * is copied untouched. A file this cannot parse is rejected rather than stored, so an
 * unrecognized structure never reaches private storage with its metadata intact.
 *
 * Colour profiles are removed along with the rest. That can shift rendered colour slightly
 * and is the accepted trade for not shipping an ICC blob we have not inspected.
 */
export class PortraitImageError extends Error {
  constructor(message: string) { super(message); }
}
export type SanitizedImage = {
  bytes: Buffer;
  width: number | null;
  height: number | null;
  /** Container sections that were present and removed, for the upload record. */
  removed: string[];
};

const JPEG_METADATA_SEGMENTS = new Set([0xfe, ...Array.from({ length: 16 }, (_, index) => 0xe0 + index)]);
const JPEG_STANDALONE = new Set([0x01, 0xd8, 0xd9, ...Array.from({ length: 8 }, (_, index) => 0xd0 + index)]);
const JPEG_FRAME_HEADERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
// Chunks that carry no identifying information. Everything else, including eXIf, tEXt,
// zTXt, iTXt, tIME and iCCP, is dropped.
const PNG_KEPT_CHUNKS = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND", "gAMA", "cHRM", "sRGB", "sBIT", "bKGD", "pHYs", "acTL", "fcTL", "fdAT"]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_DROPPED_CHUNKS = new Set(["EXIF", "XMP "]);
const VP8X_EXIF_FLAG = 0x08, VP8X_XMP_FLAG = 0x04;

function fail(message: string): never { throw new PortraitImageError(message); }

function sanitizeJpeg(input: Buffer): SanitizedImage {
  if (input.length < 4 || input.readUInt16BE(0) !== 0xffd8) fail("This file is not a JPEG image.");
  const parts: Buffer[] = [input.subarray(0, 2)];
  const removed = new Set<string>();
  let width: number | null = null, height: number | null = null;
  let offset = 2;
  while (offset < input.length) {
    if (input[offset] !== 0xff) fail("This JPEG image is damaged and was not stored.");
    // Fill bytes are legal padding between segments.
    while (offset < input.length && input[offset] === 0xff) offset += 1;
    if (offset >= input.length) fail("This JPEG image ends inside a marker.");
    const marker = input[offset]; offset += 1;
    if (marker === 0xd9) break; // End of image: anything after it is not part of the picture.
    if (JPEG_STANDALONE.has(marker)) continue;
    if (offset + 2 > input.length) fail("This JPEG image ends inside a segment.");
    const length = input.readUInt16BE(offset);
    if (length < 2 || offset + length > input.length) fail("This JPEG image declares an impossible segment.");
    const segment = input.subarray(offset, offset + length);
    if (JPEG_FRAME_HEADERS.has(marker) && length >= 7) { height = segment.readUInt16BE(3); width = segment.readUInt16BE(5); }
    if (JPEG_METADATA_SEGMENTS.has(marker)) {
      const label = marker === 0xfe ? "comment" : `APP${marker - 0xe0}`;
      const kind = segment.subarray(2, 8).toString("latin1");
      removed.add(kind.startsWith("Exif") ? "exif" : kind.startsWith("http") || kind.startsWith("XMP") ? "xmp" : label);
      offset += length;
      continue;
    }
    parts.push(Buffer.from([0xff, marker]), segment);
    offset += length;
    if (marker === 0xda) {
      // Entropy-coded scan data runs to the end marker; copy it and stop.
      const end = findJpegEnd(input, offset);
      parts.push(input.subarray(offset, end));
      if (end < input.length - 2) removed.add("trailing data");
      break;
    }
  }
  parts.push(Buffer.from([0xff, 0xd9]));
  if (width === null || height === null) fail("This JPEG image has no readable frame header.");
  return { bytes: Buffer.concat(parts), width, height, removed: [...removed] };
}

function findJpegEnd(input: Buffer, start: number) {
  for (let index = start; index < input.length - 1; index += 1) {
    if (input[index] === 0xff && input[index + 1] === 0xd9) return index;
  }
  return input.length;
}

function sanitizePng(input: Buffer): SanitizedImage {
  if (input.length < 8 || !input.subarray(0, 8).equals(PNG_SIGNATURE)) fail("This file is not a PNG image.");
  const parts: Buffer[] = [PNG_SIGNATURE];
  const removed = new Set<string>();
  let width: number | null = null, height: number | null = null, sawEnd = false;
  let offset = 8;
  while (offset + 8 <= input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.subarray(offset + 4, offset + 8).toString("latin1");
    const end = offset + 12 + length;
    if (length > 0x7fffffff || end > input.length) fail("This PNG image declares an impossible chunk.");
    if (type === "IHDR" && length >= 8) { width = input.readUInt32BE(offset + 8); height = input.readUInt32BE(offset + 12); }
    if (PNG_KEPT_CHUNKS.has(type)) parts.push(input.subarray(offset, end));
    else removed.add(type === "eXIf" ? "exif" : type === "iTXt" || type === "tEXt" || type === "zTXt" ? "text" : type);
    offset = end;
    if (type === "IEND") { sawEnd = true; break; }
  }
  if (!sawEnd) fail("This PNG image has no end chunk.");
  if (offset < input.length) removed.add("trailing data");
  if (width === null || height === null) fail("This PNG image has no header chunk.");
  return { bytes: Buffer.concat(parts), width, height, removed: [...removed] };
}

function webpDimensions(fourcc: string, payload: Buffer): { width: number | null; height: number | null } {
  if (fourcc === "VP8X" && payload.length >= 10) {
    return { width: (payload.readUIntLE(4, 3) & 0xffffff) + 1, height: (payload.readUIntLE(7, 3) & 0xffffff) + 1 };
  }
  if (fourcc === "VP8 " && payload.length >= 10 && payload[3] === 0x9d && payload[4] === 0x01 && payload[5] === 0x2a) {
    return { width: payload.readUInt16LE(6) & 0x3fff, height: payload.readUInt16LE(8) & 0x3fff };
  }
  if (fourcc === "VP8L" && payload.length >= 5 && payload[0] === 0x2f) {
    const bits = payload.readUInt32LE(1);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return { width: null, height: null };
}

function sanitizeWebp(input: Buffer): SanitizedImage {
  if (input.length < 12 || input.subarray(0, 4).toString("latin1") !== "RIFF" || input.subarray(8, 12).toString("latin1") !== "WEBP") fail("This file is not a WebP image.");
  const declared = input.readUInt32LE(4) + 8;
  if (declared > input.length) fail("This WebP image declares an impossible size.");
  const parts: Buffer[] = [];
  const removed = new Set<string>();
  if (declared < input.length) removed.add("trailing data");
  let width: number | null = null, height: number | null = null;
  let offset = 12;
  while (offset + 8 <= declared) {
    const fourcc = input.subarray(offset, offset + 4).toString("latin1");
    const size = input.readUInt32LE(offset + 4);
    const padded = size + (size % 2);
    const end = offset + 8 + padded;
    if (size > 0x7fffffff || end > declared) fail("This WebP image declares an impossible chunk.");
    const payload = input.subarray(offset + 8, offset + 8 + size);
    if (width === null) ({ width, height } = webpDimensions(fourcc, payload));
    if (WEBP_DROPPED_CHUNKS.has(fourcc)) removed.add(fourcc.trim() === "EXIF" ? "exif" : "xmp");
    else if (fourcc === "VP8X" && size >= 1 && (payload[0] & (VP8X_EXIF_FLAG | VP8X_XMP_FLAG)) !== 0) {
      // The canvas header advertises metadata that is being removed; clear those flags.
      const rewritten = Buffer.from(input.subarray(offset, end));
      rewritten[8] = payload[0] & ~(VP8X_EXIF_FLAG | VP8X_XMP_FLAG);
      removed.add("metadata flags");
      parts.push(rewritten);
    } else parts.push(input.subarray(offset, end));
    offset = end;
  }
  if (!parts.length) fail("This WebP image has no picture data.");
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1"); header.writeUInt32LE(body.length + 4, 4); header.write("WEBP", 8, "latin1");
  return { bytes: Buffer.concat([header, body]), width, height, removed: [...removed] };
}

export function sanitizePortraitImage(input: Buffer, format: PortraitFormat): SanitizedImage {
  const sanitized = format === "jpeg" ? sanitizeJpeg(input) : format === "png" ? sanitizePng(input) : sanitizeWebp(input);
  if (!sanitized.bytes.length) fail("This image could not be prepared for private storage.");
  if ((sanitized.width ?? 1) < 1 || (sanitized.height ?? 1) < 1 || (sanitized.width ?? 1) > 20000 || (sanitized.height ?? 1) > 20000) {
    fail("This image's dimensions are outside the supported range.");
  }
  return sanitized;
}
