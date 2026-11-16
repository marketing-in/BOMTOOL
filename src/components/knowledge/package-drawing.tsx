/**
 * Top-view drawing generated from package data (family, pins, pitch, body size). Not a land pattern —
 * an at-a-glance picture of what the part looks like and where its contacts are.
 */
type Pkg = { name: string; family: string; pinCount?: number | null; pitchMm?: number | null; lengthMm?: number | null; widthMm?: number | null };

const BODY = "var(--foreground)";
const METAL = "oklch(0.75 0.03 250)";

export function PackageDrawing({ pkg, size = 160, label = true }: { pkg: Pkg; size?: number; label?: boolean }) {
  const L = pkg.lengthMm ?? 3;
  const Wd = pkg.widthMm ?? 3;
  const pins = Math.max(2, pkg.pinCount ?? 2);
  const pitch = pkg.pitchMm ?? 1;
  const fam = pkg.family;
  // Fit the drawing: body + leads in a square viewBox.
  const span = Math.max(L, Wd) * (["SOIC", "SSOP", "TSSOP", "QFP", "TSOP", "SOT"].includes(fam) ? 1.5 : 1.25);
  const vb = span;
  const cx = vb / 2;
  const cy = vb / 2;
  const bx = cx - L / 2;
  const by = cy - Wd / 2;
  const els: React.ReactNode[] = [];
  const s = Math.min(L, Wd);

  if (fam === "CHIP" || fam === "MOLDED" || fam === "SOD" || fam === "SMx" || fam === "LED" || fam === "VCHIP") {
    const t = L * 0.22;
    els.push(<rect key="b" x={bx} y={by} width={L} height={Wd} rx={s * 0.05} fill={fam === "CHIP" ? "oklch(0.55 0.05 60)" : BODY} />);
    els.push(<rect key="t1" x={bx} y={by} width={t} height={Wd} fill={METAL} />);
    els.push(<rect key="t2" x={bx + L - t} y={by} width={t} height={Wd} fill={METAL} />);
    if (fam === "SOD" || fam === "SMx") els.push(<rect key="band" x={bx + t * 1.2} y={by} width={t * 0.4} height={Wd} fill="var(--card)" opacity={0.7} />);
  } else if (fam === "BGA" || fam === "CSP" || fam === "LGA") {
    els.push(<rect key="b" x={bx} y={by} width={L} height={Wd} rx={s * 0.03} fill={BODY} />);
    const cols = Math.max(2, Math.floor(L / pitch) - 1);
    const rows = Math.max(2, Math.floor(Wd / pitch) - 1);
    const ox = cx - ((cols - 1) * pitch) / 2;
    const oy = cy - ((rows - 1) * pitch) / 2;
    const r = fam === "LGA" ? pitch * 0.22 : pitch * 0.28;
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) els.push(<circle key={`${i}-${j}`} cx={ox + i * pitch} cy={oy + j * pitch} r={r} fill={METAL} />);
    els.push(<circle key="p1" cx={bx + s * 0.06} cy={by + s * 0.06} r={s * 0.025} fill="oklch(0.65 0.18 25)" />);
  } else if (fam === "QFN" || fam === "SON") {
    els.push(<rect key="b" x={bx} y={by} width={L} height={Wd} rx={s * 0.03} fill={BODY} />);
    const perSide = fam === "SON" ? Math.ceil(pins / 2) : Math.ceil(pins / 4);
    const padL = Math.min(0.6, s * 0.12);
    const padW = pitch * 0.5;
    const sides = fam === "SON" ? [0, 2] : [0, 1, 2, 3];
    for (const side of sides) {
      for (let k = 0; k < perSide; k++) {
        const off = (k - (perSide - 1) / 2) * pitch;
        if (side === 0) els.push(<rect key={`s0-${k}`} x={cx + off - padW / 2} y={by} width={padW} height={padL} fill={METAL} />);
        if (side === 2) els.push(<rect key={`s2-${k}`} x={cx + off - padW / 2} y={by + Wd - padL} width={padW} height={padL} fill={METAL} />);
        if (side === 1) els.push(<rect key={`s1-${k}`} x={bx + L - padL} y={cy + off - padW / 2} width={padL} height={padW} fill={METAL} />);
        if (side === 3) els.push(<rect key={`s3-${k}`} x={bx} y={cy + off - padW / 2} width={padL} height={padW} fill={METAL} />);
      }
    }
    els.push(<rect key="ep" x={cx - L * 0.28} y={cy - Wd * 0.28} width={L * 0.56} height={Wd * 0.56} fill={METAL} opacity={0.8} />);
  } else if (fam === "QFP") {
    els.push(<rect key="b" x={bx} y={by} width={L} height={Wd} rx={s * 0.02} fill={BODY} />);
    const perSide = Math.ceil(pins / 4);
    const lead = L * 0.18;
    const lw = pitch * 0.45;
    for (let k = 0; k < perSide; k++) {
      const off = (k - (perSide - 1) / 2) * pitch;
      els.push(<rect key={`t${k}`} x={cx + off - lw / 2} y={by - lead} width={lw} height={lead} fill={METAL} />);
      els.push(<rect key={`b${k}`} x={cx + off - lw / 2} y={by + Wd} width={lw} height={lead} fill={METAL} />);
      els.push(<rect key={`l${k}`} x={bx - lead} y={cy + off - lw / 2} width={lead} height={lw} fill={METAL} />);
      els.push(<rect key={`r${k}`} x={bx + L} y={cy + off - lw / 2} width={lead} height={lw} fill={METAL} />);
    }
    els.push(<circle key="p1" cx={bx + s * 0.08} cy={by + s * 0.08} r={s * 0.03} fill="var(--card)" />);
  } else if (fam === "SOIC" || fam === "SSOP" || fam === "TSSOP" || fam === "TSOP" || fam === "SOT" || fam === "DIP") {
    // Dual-row: leads out of the long sides.
    const perSide = Math.ceil(pins / 2);
    const lead = Wd * 0.28;
    const lw = Math.min(pitch * 0.5, L / perSide * 0.6);
    els.push(<rect key="b" x={bx} y={by} width={L} height={Wd} rx={s * 0.04} fill={BODY} />);
    for (let k = 0; k < perSide; k++) {
      const off = (k - (perSide - 1) / 2) * (fam === "SOT" ? Math.min(pitch, L / perSide) : pitch);
      els.push(<rect key={`t${k}`} x={cx + off - lw / 2} y={by - lead} width={lw} height={lead} fill={METAL} />);
      if (fam !== "SOT" || pins % 2 === 0 || k < perSide - 1 || pins === 3)
        els.push(<rect key={`b${k}`} x={cx + off - lw / 2} y={by + Wd} width={lw} height={lead} fill={METAL} />);
    }
    els.push(<circle key="p1" cx={bx + s * 0.12} cy={by + Wd - s * 0.15} r={s * 0.06} fill="var(--card)" />);
  } else if (fam === "TO") {
    const tab = Wd * 0.35;
    els.push(<rect key="tab" x={bx + L * 0.1} y={by - tab} width={L * 0.8} height={tab} fill={METAL} />);
    els.push(<rect key="b" x={bx} y={by} width={L} height={Wd} rx={s * 0.04} fill={BODY} />);
    const legs = Math.min(pins, 7);
    for (let k = 0; k < legs; k++) {
      const off = (k - (legs - 1) / 2) * Math.min(pitch, L / legs);
      els.push(<rect key={`l${k}`} x={cx + off - 0.35} y={by + Wd} width={0.7} height={Wd * 0.45} fill={METAL} />);
    }
  } else {
    // Modules, crystals, radial, axial and anything else: body with corner pads.
    els.push(<rect key="b" x={bx} y={by} width={L} height={Wd} rx={s * 0.08} fill={fam === "XTAL" ? METAL : BODY} />);
    if (fam === "XTAL") [
      [bx + 0.1, by + 0.1],
      [bx + L - 0.6, by + Wd - 0.6],
    ].forEach(([x, y], k) => els.push(<rect key={k} x={x} y={y} width={0.5} height={0.5} fill={BODY} />));
  }

  return (
    <figure className="flex flex-col items-center gap-1">
      <svg viewBox={`0 0 ${vb} ${vb}`} width={size} height={size} role="img" aria-label={`${pkg.name} package, top view`}>
        {els}
      </svg>
      {label ? (
        <figcaption className="text-center text-xs">
          <span className="num font-medium">{pkg.name}</span>
          <span className="num block text-[11px] text-muted-foreground">
            {L}×{Wd} mm{pkg.pitchMm ? ` · ${pkg.pitchMm} mm pitch` : ""}
            {pkg.pinCount ? ` · ${pkg.pinCount} pins` : ""}
          </span>
        </figcaption>
      ) : null}
    </figure>
  );
}
