import { BOARD_LIMITS, unreadableArchive, type UploadFile } from "./upload";

/**
 * Customers send Gerbers as .rar about as often as .zip. This opens the RAR archives among the uploaded files and
 * returns their files in their place (everything else is passed through untouched), under the same caps as a zip:
 * hidden and oversized entries are left out, and the whole may not unpack to more than the limit. Server only: the
 * RAR reader (node-unrar-js, WebAssembly) is loaded on first use.
 */
export async function openArchives(files: UploadFile[], limits = BOARD_LIMITS): Promise<UploadFile[]> {
  const out: UploadFile[] = [];
  let expanded = 0;
  for (const f of files) {
    if (unreadableArchive(f.bytes) !== "RAR") {
      out.push(f);
      continue;
    }
    const { createExtractorFromData } = await import("node-unrar-js");
    try {
      const data = f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) as ArrayBuffer;
      const extractor = await createExtractorFromData({ data });
      // The reader's iterators must be run to the end, or it keeps the archive open.
      const headers = [...extractor.getFileList().fileHeaders];
      if (headers.some((h) => h.flags.encrypted)) throw new Error("it is password-protected");
      const wanted = headers.filter((h) => !h.flags.directory && !/(^|[\\/])(\.|__MACOSX[\\/])/.test(h.name) && h.unpSize <= limits.entry);
      expanded += wanted.reduce((s, h) => s + h.unpSize, 0);
      if (expanded > limits.expanded) throw new Error(`it expands to more than ${Math.round(limits.expanded / 1048576)} MB — upload the board files only`);
      const names = new Set(wanted.map((h) => h.name));
      const extracted = [...extractor.extract({ files: (h) => names.has(h.name) }).files];
      for (const x of extracted) if (x.extraction) out.push({ name: x.fileHeader.name.split(/[\\/]/).pop() ?? x.fileHeader.name, bytes: x.extraction });
    } catch (e) {
      throw new Error(`“${f.name}” could not be opened: ${e instanceof Error && e.message ? e.message : "the RAR archive is damaged"}.`);
    }
  }
  return out;
}
