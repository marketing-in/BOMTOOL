/**
 * Reads a chosen BoM file off the page's main thread (Phase 37): a large workbook takes seconds in SheetJS, and the
 * upload form stays usable — the spinner turns, the fields can be typed in — while every sheet is read.
 */
import { previewPack } from "./workbook";

export type PreviewRequest = { id: number; buf: ArrayBuffer; name: string; choice: string[] | null };
export type PreviewReply = { id: number; ok: true; data: ReturnType<typeof previewPack> } | { id: number; ok: false; message: string };

self.onmessage = (e: MessageEvent<PreviewRequest>) => {
  const { id, buf, name, choice } = e.data;
  let reply: PreviewReply;
  try {
    reply = { id, ok: true, data: previewPack(new Uint8Array(buf), name, choice ? { bomSheets: choice } : {}) };
  } catch (err) {
    reply = { id, ok: false, message: err instanceof Error ? err.message : "The file could not be read." };
  }
  self.postMessage(reply);
};
