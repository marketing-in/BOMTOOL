import { normaliseMpn } from "@/lib/normalise";

/**
 * Reference marks. the AI points at what it talks about with `[[line:12]]`, `[[ref:U3]]`, `[[part:LM358DR]]`,
 * `[[kb:reflow-soldering]]` and `[[dict:ldo]]`; the server turns each into a link (or leaves plain text when
 * the thing does not exist), and the panel draws the answer from the blocks below.
 */

export const REF_KINDS = ["line", "ref", "part", "kb", "dict"] as const;
export type RefKind = (typeof REF_KINDS)[number];

export type RefLink = { href: string; label: string };
export type RefLinks = Record<string, RefLink>;

const MARK = /\[\[(line|ref|part|kb|dict):([^\[\]\n]{1,80})\]\]/g;

export const refKey = (kind: RefKind, value: string) => `${kind}:${value.trim().toLowerCase()}`;

export function marksIn(text: string): { kind: RefKind; value: string }[] {
  const seen = new Map<string, { kind: RefKind; value: string }>();
  for (const m of text.matchAll(MARK)) seen.set(refKey(m[1] as RefKind, m[2]), { kind: m[1] as RefKind, value: m[2].trim() });
  return [...seen.values()];
}

/** What the marks can point at for the BoM the user has open. */
export type RefLookup = {
  revisionId: string | null;
  lines: { id: string; lineNo: number; refs: string[]; partId: string | null; mpn: string | null }[];
  /** Catalogue parts by normalised MPN, for parts that are not on the open BoM. */
  parts?: Record<string, string>;
  articles: Set<string>;
  dictionary: Map<string, string>;
  articleTitles?: Map<string, string>;
};

export function resolveRef(kind: RefKind, value: string, lk: RefLookup): RefLink | null {
  const v = value.trim();
  const lineHref = (id: string) => `/boms/${lk.revisionId}/build/parts?line=${id}`;
  switch (kind) {
    case "line": {
      const n = Number(v.replace(/^line\s*/i, ""));
      const l = lk.revisionId && Number.isInteger(n) ? lk.lines.find((x) => x.lineNo === n) : undefined;
      return l ? { href: lineHref(l.id), label: `Line ${l.lineNo}` } : null;
    }
    case "ref": {
      const up = v.toUpperCase();
      const l = lk.revisionId ? lk.lines.find((x) => x.refs.some((r) => r.toUpperCase() === up)) : undefined;
      return l ? { href: lineHref(l.id), label: up } : null;
    }
    case "part": {
      const key = normaliseMpn(v);
      const onBom = lk.lines.find((x) => x.partId && x.mpn && normaliseMpn(x.mpn) === key);
      const id = onBom?.partId ?? lk.parts?.[key];
      return id ? { href: `/parts/${id}`, label: onBom?.mpn ?? v } : { href: `/parts?q=${encodeURIComponent(v)}`, label: v };
    }
    case "kb":
      return lk.articles.has(v) ? { href: `/knowledge/${v}`, label: lk.articleTitles?.get(v) ?? v } : null;
    case "dict": {
      const name = lk.dictionary.get(v);
      return name ? { href: `/knowledge/dictionary/${v}`, label: name } : null;
    }
  }
}

export function linkAnswer(text: string, lk: RefLookup): RefLinks {
  const out: RefLinks = {};
  for (const m of marksIn(text)) {
    const link = resolveRef(m.kind, m.value, lk);
    if (link) out[refKey(m.kind, m.value)] = link;
  }
  return out;
}

// ── Drawing an answer

export type Inline = { t: "text"; text: string } | { t: "bold"; text: string } | { t: "code"; text: string } | { t: "ref"; kind: RefKind; value: string };
export type Block = { type: "p" | "h"; inline: Inline[] } | { type: "ul" | "ol"; items: Inline[][] };

/** What a mark reads as when it has no link: the bare value, with "line" spelled out. */
export const plainRef = (kind: RefKind, value: string) => (kind === "line" ? `line ${value.replace(/^line\s*/i, "")}` : value);

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const token = /\[\[(line|ref|part|kb|dict):([^\[\]\n]{1,80})\]\]|\*\*([^*\n]+)\*\*|`([^`\n]+)`/g;
  let at = 0;
  for (const m of text.matchAll(token)) {
    if (m.index > at) out.push({ t: "text", text: text.slice(at, m.index) });
    if (m[1]) out.push({ t: "ref", kind: m[1] as RefKind, value: m[2].trim() });
    else if (m[3]) out.push({ t: "bold", text: m[3] });
    else out.push({ t: "code", text: m[4] });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ t: "text", text: text.slice(at) });
  return out;
}

/** The small part of Markdown an answer uses: paragraphs, headings, bullet and numbered lists, bold, code. */
export function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", inline: parseInline(para.join(" ")) });
    para = [];
  };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (!line) flush();
    else if (heading) {
      flush();
      blocks.push({ type: "h", inline: parseInline(heading[1]) });
    } else if (bullet || numbered) {
      flush();
      const type = bullet ? "ul" : "ol";
      const last = blocks[blocks.length - 1];
      const item = parseInline((bullet ?? numbered)![1]);
      if (last && last.type === type) last.items.push(item);
      else blocks.push({ type, items: [item] });
    } else para.push(line);
  }
  flush();
  return blocks;
}
