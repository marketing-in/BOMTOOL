import type { ViewerPart } from "@/components/viewer/types";

/**
 * Where a BoM line sits on the board: the outline from above with every part, this line's parts filled and named.
 * Bottom-side parts are dashed (seen through the board). Server-rendered SVG, so it follows the selected line at once.
 */
export function BoardMap({ width, height, parts, lineId, title }: { width: number; height: number; parts: ViewerPart[]; lineId: string | null; title: string }) {
  const pad = 4;
  const mine = parts.filter((p) => p.lineId === lineId);
  return (
    <svg viewBox={`${-width / 2 - pad} ${-height / 2 - pad} ${width + 2 * pad} ${height + 2 * pad}`} role="img" aria-label={title} className="h-auto w-full">
      <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={2} className="fill-muted stroke-border" strokeWidth={0.4} />
      {parts.map((p) => {
        const on = p.lineId === lineId && lineId !== null;
        return (
          <rect
            key={p.refDes}
            x={-p.body.length / 2}
            y={-p.body.width / 2}
            width={Math.max(0.6, p.body.length)}
            height={Math.max(0.6, p.body.width)}
            rx={0.3}
            // Board y runs up; SVG y runs down.
            transform={`translate(${p.x} ${-p.y}) rotate(${-p.rotation})`}
            className={on ? "fill-primary stroke-primary" : "fill-card stroke-muted-foreground/40"}
            strokeWidth={on ? 0.5 : 0.25}
            strokeDasharray={p.side === "BOTTOM" ? "0.8 0.6" : undefined}
          />
        );
      })}
      {mine.slice(0, 24).map((p) => (
        <text key={`t${p.refDes}`} x={p.x} y={-p.y - p.body.width / 2 - 1} textAnchor="middle" className="fill-foreground" style={{ fontSize: Math.max(2.2, Math.min(width, height) / 32) }}>
          {p.refDes}
        </text>
      ))}
    </svg>
  );
}
