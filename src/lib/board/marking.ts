/** Long part numbers go on two lines, broken where letters meet digits — the way real markings read. */
export function splitMarking(text: string): string[] {
  if (text.length <= 9) return [text];
  const cls = (c: string) => (/\d/.test(c) ? 0 : /[a-z]/i.test(c) ? 1 : 2);
  const mid = text.length / 2;
  let at = -1;
  for (let i = 3; i <= text.length - 2; i++) if (cls(text[i - 1]) !== cls(text[i]) && (at < 0 || Math.abs(i - mid) < Math.abs(at - mid))) at = i;
  if (at < 0 || Math.abs(at - mid) > 3) at = Math.ceil(mid);
  return [text.slice(0, at), text.slice(at).replace(/^[-_/.]/, "")];
}
