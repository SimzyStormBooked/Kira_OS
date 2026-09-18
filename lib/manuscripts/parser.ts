import "server-only";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fromBuffer, type ZipFile } from "yauzl";
import { SaxesParser } from "saxes";
import { extractRawText } from "mammoth";
import { getDocumentProxy } from "unpdf";
import { MANUSCRIPT_MAX_BYTES, MANUSCRIPT_MAX_TEXT, MANUSCRIPT_MAX_CHUNKS, MANUSCRIPT_CHUNK_SIZE,
  MANUSCRIPT_PARSER_VERSION, manuscriptFormat, type ParsedManuscript, type ManuscriptChunk } from "./contract";

export class ManuscriptParseError extends Error {
  constructor(message: string) { super(message); this.name = "ManuscriptParseError"; }
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const MAX_EXPANDED = 20 * 1024 * 1024;
const fail = (message = "This file could not be read. Try an unencrypted DOCX, text PDF, EPUB, TXT or Markdown file."): never => { throw new ManuscriptParseError(message); };
type Section = { label: string; text: string };

/** Read every archive stream with actual-byte budgets; central-directory sizes alone are not trusted. */
async function readArchive(buffer: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    let archive: ZipFile | undefined; let settled = false; let bytes = 0; let entries = 0;
    const files = new Map<string, Buffer>();
    const finishError = (error: unknown) => {
      if (settled) return; settled = true; clearTimeout(timer); archive?.close();
      reject(error instanceof ManuscriptParseError ? error : new ManuscriptParseError("This document archive is damaged or unsupported."));
    };
    const timer = setTimeout(() => finishError(new ManuscriptParseError("This document took too long to unpack. Export a simpler copy and try again.")), 12000);
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) return finishError(error);
      archive = zip;
      zip.on("error", finishError);
      zip.on("end", () => { if (!settled) { settled = true; clearTimeout(timer); resolve(files); } });
      zip.on("entry", (entry) => {
        if (settled) return;
        const name = entry.fileName;
        if (++entries > 2000 || entry.uncompressedSize > MAX_EXPANDED || entry.generalPurposeBitFlag & 1 ||
          name.startsWith("/") || name.includes("\\") || name.split("/").includes("..") || files.has(name) ||
          ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000)
          return finishError(new ManuscriptParseError("This document contains an unsafe or oversized archive. Export a new copy."));
        if (name.endsWith("/")) { zip.readEntry(); return; }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return finishError(streamError);
          const parts: Buffer[] = []; let entryBytes = 0;
          stream.on("error", finishError);
          stream.on("data", (part: Buffer) => {
            entryBytes += part.length; bytes += part.length;
            if (bytes > MAX_EXPANDED || entryBytes > MAX_EXPANDED) { stream.destroy(); finishError(new ManuscriptParseError("The expanded document is too large. Split it or export a text copy.")); return; }
            parts.push(part);
          });
          stream.on("end", () => {
            if (settled) return;
            files.set(name, Buffer.concat(parts)); zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}
function utf8(buffer: Buffer) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, ""); }
  catch { return fail("This text is not UTF-8. Export it as UTF-8 text or DOCX and try again."); }
}
function xml(text: string, onOpen: (name: string, attrs: Record<string, string>) => void, onText?: (value: string) => void, onClose?: (name: string) => void, allowHtmlDoctype = false) {
  const parser = new SaxesParser({ xmlns: false });
  parser.on("doctype", declaration => {
    // EPUB XHTML commonly uses this inert declaration. External identifiers and
    // internal subsets remain forbidden, including ones attached to an HTML root.
    if (!allowHtmlDoctype || !/^\s*html\s*$/i.test(declaration)) fail("Documents with custom XML entities are not supported. Export a clean copy.");
  });
  parser.on("opentag", tag => onOpen(tag.name.toLowerCase(), tag.attributes as Record<string, string>));
  parser.on("closetag", tag => onClose?.(tag.name.toLowerCase()));
  parser.on("text", value => onText?.(value)); parser.on("cdata", value => onText?.(value));
  parser.write(text).close();
}
function epubSections(files: Map<string, Buffer>): Section[] {
  if (files.get("mimetype")?.toString().trim() !== "application/epub+zip" || files.has("META-INF/encryption.xml")) fail("Use an unencrypted EPUB exported from your manuscript editor.");
  const container = files.get("META-INF/container.xml"); if (!container) fail();
  let root = "";
  xml(utf8(container!), (name, attrs) => { if (name.endsWith("rootfile") && !root) root = attrs["full-path"] ?? ""; });
  const manifestFile = files.get(root); if (!manifestFile) fail();
  const manifest = new Map<string, string>(); const spine: string[] = [];
  xml(utf8(manifestFile!), (name, attrs) => {
    if (name === "item" && /^(application\/xhtml\+xml|text\/html)$/.test(attrs["media-type"] ?? "")) {
      const href = attrs.href ?? "";
      if (/^[a-z]+:|^\/|\\/i.test(href)) fail();
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(root), decodeURIComponent(href.split("#")[0])));
      if (target.startsWith("../")) fail();
      manifest.set(attrs.id, target);
    }
    if (name === "itemref" && attrs.linear !== "no") spine.push(attrs.idref);
  });
  if (!spine.length || spine.length > 1000) fail();
  return spine.map((id, index) => {
    const filename = manifest.get(id); const body = filename ? files.get(filename) : undefined; if (!body) fail();
    let text = ""; let hidden = 0; let label = ""; let heading = false;
    xml(utf8(body!), (name) => {
      if (["script", "style", "head"].includes(name)) hidden++;
      if (/^(p|div|h[1-6]|br|li)$/.test(name)) text += "\n";
      if (/^h[1-6]$/.test(name) && !label) heading = true;
    }, value => { if (!hidden) { text += value; if (heading) label += value; } }, name => {
      if (["script", "style", "head"].includes(name)) hidden--;
      if (/^h[1-6]$/.test(name)) heading = false;
      if (/^(p|div|h[1-6]|li)$/.test(name)) text += "\n";
    }, true);
    return { label: (label.trim() || `Section ${index + 1}`).slice(0, 160), text };
  });
}
export function chunkSections(sections: Section[]): ManuscriptChunk[] {
  const chunks: ManuscriptChunk[] = []; let total = 0;
  for (const section of sections) {
    const text = section.text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
    total += text.length;
    if (total > MANUSCRIPT_MAX_TEXT) fail("This manuscript has too much text for one upload. Split it into individual books.");
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + MANUSCRIPT_CHUNK_SIZE, text.length);
      if (end < text.length) {
        const boundary = Math.max(text.lastIndexOf("\n", end), text.lastIndexOf(" ", end));
        if (boundary > start + MANUSCRIPT_CHUNK_SIZE / 2) end = boundary;
        // Never cut a UTF-16 surrogate pair in half.
        if (/^[\uDC00-\uDFFF]$/.test(text[end] ?? "")) end--;
      }
      const reference = text.slice(start, end).trim();
      if (reference) chunks.push({ id: randomUUID(), chunk_index: chunks.length, section: `${section.label} · passage ${chunks.length + 1}`.slice(0, 200), reference_text: reference, content_hash: hash(reference) });
      if (chunks.length > MANUSCRIPT_MAX_CHUNKS) fail("This manuscript needs too many passages. Split it into individual books.");
      start = end;
    }
  }
  if (!chunks.length || total < 40) fail("No readable manuscript text was found. For a scanned PDF, export a text-based PDF or DOCX first.");
  return chunks;
}
export async function parseManuscript(buffer: Buffer, filename: string, mime: string): Promise<ParsedManuscript> {
  if (!buffer.length || buffer.length > MANUSCRIPT_MAX_BYTES) fail("Choose a nonempty manuscript under 4 MB.");
  const format = manuscriptFormat(filename, mime); if (!format) fail("Choose a DOCX, PDF, EPUB, TXT or Markdown file with a matching extension.");
  let sections: Section[];
  try {
    if (format === "txt" || format === "md") {
      const text = utf8(buffer); if (text.includes("\u0000")) fail("This file contains binary data. Export a UTF-8 text copy.");
      sections = [{ label: "Manuscript", text }];
    } else if (format === "docx" || format === "epub") {
      if (buffer.readUInt32LE(0) !== 0x04034b50) fail();
      const files = await readArchive(buffer);
      if (format === "epub") sections = epubSections(files);
      else {
        if (!files.has("word/document.xml") || !files.has("[Content_Types].xml")) fail();
        // The complete archive was bounded above; external file access stays disabled.
        const documentXml = utf8(files.get("word/document.xml")!); xml(documentXml, () => {});
        const raw = await extractRawText({ buffer });
        sections = [{ label: "Manuscript", text: raw.value }];
      }
    } else {
      if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) fail();
      const pdf = await getDocumentProxy(new Uint8Array(buffer), { useSystemFonts: false, disableFontFace: true, stopAtErrors: true });
      try {
        if (pdf.numPages > 1200) fail("This PDF has too many pages. Upload one book at a time.");
        sections = []; let total = 0; const deadline = Date.now() + 18000;
        for (let number = 1; number <= pdf.numPages; number++) {
          if (Date.now() > deadline) fail("This PDF takes too long to read. Export a DOCX or text copy.");
          const page = await pdf.getPage(number); const content = await page.getTextContent();
          const text = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("");
          total += text.length; if (total > MANUSCRIPT_MAX_TEXT) fail("This PDF contains too much text. Upload one book at a time.");
          sections.push({ label: `Page ${number}`, text }); page.cleanup();
        }
      } finally { await pdf.loadingTask.destroy(); }
    }
    const chunks = chunkSections(sections);
    return { chunks, textHash: hash(chunks.map(chunk => chunk.reference_text).join("\n")), parserVersion: MANUSCRIPT_PARSER_VERSION };
  } catch (error) { if (error instanceof ManuscriptParseError) throw error; return fail(); }
}
