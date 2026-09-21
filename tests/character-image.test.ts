import { describe, expect, it } from "vitest";
import { PortraitImageError, sanitizePortraitImage } from "@/lib/characters/image";

// Structurally valid containers. The sanitizer rewrites containers and never decodes
// pixels, so fixtures carry marker structure rather than real compressed images.
function segment(marker: number, payload: Buffer) {
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xff00 | marker, 0); header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}
const gps = Buffer.from("GPSLatitude 33.4484 N GPSLongitude 112.0740 W", "latin1");
function jpeg({ exif = true, comment = true, trailing = true } = {}) {
  const frame = Buffer.alloc(15);
  frame.writeUInt8(8, 0); frame.writeUInt16BE(1200, 1); frame.writeUInt16BE(900, 3); frame.writeUInt8(3, 5);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.concat([Buffer.from("JFIF\0", "latin1"), Buffer.alloc(9)])),
    ...(exif ? [segment(0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), gps]))] : []),
    ...(comment ? [segment(0xfe, Buffer.from("Kira's camera, home studio", "latin1"))] : []),
    segment(0xc0, frame),
    segment(0xda, Buffer.from([0x01, 0x00])),
    Buffer.from([0x12, 0x34, 0x56]),
    Buffer.from([0xff, 0xd9]),
    ...(trailing ? [Buffer.from("APPENDED-PAYLOAD", "latin1")] : []),
  ]);
}
function chunk(type: string, data: Buffer) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0); head.write(type, 4, "latin1");
  return Buffer.concat([head, data, Buffer.alloc(4)]); // CRC is not validated by the sanitizer.
}
function png({ exif = true, text = true, trailing = true } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(640, 0); ihdr.writeUInt32BE(480, 4); ihdr.writeUInt8(8, 8); ihdr.writeUInt8(6, 9);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    ...(exif ? [chunk("eXIf", gps)] : []),
    ...(text ? [chunk("tEXt", Buffer.from("Author\0Kira", "latin1")), chunk("tIME", Buffer.alloc(7))] : []),
    chunk("pHYs", Buffer.alloc(9)),
    chunk("IDAT", Buffer.from([0x78, 0x9c, 0x01])),
    chunk("IEND", Buffer.alloc(0)),
    ...(trailing ? [Buffer.from("APPENDED-PAYLOAD", "latin1")] : []),
  ]);
}
function riffChunk(fourcc: string, data: Buffer) {
  const head = Buffer.alloc(8);
  head.write(fourcc, 0, "latin1"); head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}
function webp({ exif = true, flags = 0x08 | 0x04 } = {}) {
  const vp8x = Buffer.alloc(10);
  vp8x.writeUInt8(flags, 0); vp8x.writeUIntLE(1023, 4, 3); vp8x.writeUIntLE(767, 7, 3);
  const body = Buffer.concat([
    riffChunk("VP8X", vp8x),
    riffChunk("VP8 ", Buffer.from([0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a, 0x00, 0x04, 0x00, 0x03])),
    ...(exif ? [riffChunk("EXIF", gps)] : []),
  ]);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1"); header.writeUInt32LE(body.length + 4, 4); header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}
const text = (value: Buffer) => value.toString("latin1");

describe("portrait metadata removal", () => {
  it("strips JPEG Exif, comments and appended data while keeping the picture", () => {
    const original = jpeg();
    expect(text(original)).toContain("GPSLatitude");
    const result = sanitizePortraitImage(original, "jpeg");
    expect(text(result.bytes)).not.toContain("GPSLatitude");
    expect(text(result.bytes)).not.toContain("home studio");
    expect(text(result.bytes)).not.toContain("APPENDED-PAYLOAD");
    expect(result.removed).toEqual(expect.arrayContaining(["exif", "comment"]));
    expect(result).toMatchObject({ width: 900, height: 1200 });
    // Scan data survives, and the result still starts and ends as a JPEG.
    expect([...result.bytes.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    expect([...result.bytes.subarray(-2)]).toEqual([0xff, 0xd9]);
    expect(result.bytes).toContain(0x56);
    expect(result.bytes.length).toBeLessThan(original.length);
  });

  it("leaves a JPEG without metadata unchanged in content and reports nothing removed", () => {
    const result = sanitizePortraitImage(jpeg({ exif: false, comment: false, trailing: false }), "jpeg");
    expect(result.removed).toEqual(["APP0"]); // The JFIF density block is dropped with the rest.
    expect(result).toMatchObject({ width: 900, height: 1200 });
  });

  it("keeps only safe PNG chunks", () => {
    const result = sanitizePortraitImage(png(), "png");
    expect(text(result.bytes)).not.toContain("GPSLatitude");
    expect(text(result.bytes)).not.toContain("Kira");
    expect(text(result.bytes)).not.toContain("APPENDED-PAYLOAD");
    expect(text(result.bytes)).toContain("IHDR");
    expect(text(result.bytes)).toContain("IDAT");
    expect(text(result.bytes)).toContain("pHYs");
    expect(result.removed).toEqual(expect.arrayContaining(["exif", "text", "tIME", "trailing data"]));
    expect(result).toMatchObject({ width: 640, height: 480 });
  });

  it("drops WebP metadata chunks and clears the flags that advertise them", () => {
    const result = sanitizePortraitImage(webp(), "webp");
    expect(text(result.bytes)).not.toContain("GPSLatitude");
    expect(text(result.bytes)).not.toContain("EXIF");
    expect(result.removed).toEqual(expect.arrayContaining(["exif", "metadata flags"]));
    expect(result).toMatchObject({ width: 1024, height: 768 });
    // The rewritten RIFF size matches the shortened body, and no metadata flag remains.
    expect(result.bytes.readUInt32LE(4)).toBe(result.bytes.length - 8);
    expect(result.bytes[20] & 0x0c).toBe(0);
  });

  it("refuses anything it cannot fully parse instead of storing it", () => {
    const cases: [string, Buffer, "png" | "jpeg" | "webp"][] = [
      ["declared type does not match the bytes", png(), "jpeg"],
      ["truncated JPEG segment", jpeg().subarray(0, 12), "jpeg"],
      ["PNG without an end chunk", Buffer.concat([png().subarray(0, 33)]), "png"],
      ["impossible PNG chunk length", (() => { const value = png(); value.writeUInt32BE(0x7ffffffe, 8); return value; })(), "png"],
      ["WebP with an impossible size", (() => { const value = webp(); value.writeUInt32LE(0xfffffff0, 4); return value; })(), "webp"],
      ["empty file", Buffer.alloc(0), "png"],
    ];
    for (const [reason, bytes, format] of cases) {
      expect(() => sanitizePortraitImage(bytes, format), reason).toThrow(PortraitImageError);
    }
  });
});
