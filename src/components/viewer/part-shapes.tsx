"use client";

import { RoundedBox } from "@react-three/drei";
import type { BodySpec } from "@/lib/board/bodies";

/**
 * Bodies for parts whose look the package kind alone gets wrong: a relay, a screw terminal, a pin header, a DIP chip
 * with its legs, a through-hole LED, a standing regulator, a crystal can, an electrolytic capacitor, an axial part.
 * Frame: x along the pin row, y across, z up from the board surface; origin at the footprint centre.
 */

const TIN = "#c9ccd2";
const GOLD = "#d8b24a";
const RUBBER = "#17181b";

type Fade = { transparent: boolean; opacity: number; depthWrite: boolean } | null;
type Look = { c: string; em: string; fade: Fade; tinted: boolean };

const Metal = ({ color = TIN, fade }: { color?: string; fade: Fade }) => <meshStandardMaterial color={color} metalness={0.9} roughness={0.28} {...fade} />;
const Plastic = ({ color, em = "#000", fade, gloss = 0.5 }: { color: string; em?: string; fade: Fade; gloss?: number }) => (
  <meshStandardMaterial color={color} emissive={em} metalness={0.05} roughness={1 - gloss} {...fade} />
);

/** A lead through the board: a tinned pin from just above the surface down past the solder side. */
function Pin({ x, y, top = 0.6, r = 0.3, fade, color }: { x: number; y: number; top?: number; r?: number; fade: Fade; color?: string }) {
  const len = top + 2.6;
  return (
    <mesh position={[x, y, top - len / 2]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[r, r, len, 10]} />
      <Metal fade={fade} color={color} />
    </mesh>
  );
}

function Relay({ L, W, H, look }: { L: number; W: number; H: number; look: Look }) {
  return (
    <>
      <RoundedBox args={[L, W, H - 0.4]} radius={0.7} smoothness={3} position={[0, 0, 0.4 + (H - 0.4) / 2]} castShadow>
        <Plastic color={look.c} em={look.em} fade={look.fade} gloss={0.62} />
      </RoundedBox>
      {/* the base the case snaps onto */}
      <mesh position={[0, 0, 0.3]}>
        <boxGeometry args={[L * 0.97, W * 0.97, 0.6]} />
        <Plastic color={RUBBER} fade={look.fade} />
      </mesh>
      {/* printed label panel on top */}
      {look.tinted ? null : (
        <mesh position={[0, 0, H + 0.01]}>
          <planeGeometry args={[L * 0.72, W * 0.62]} />
          <meshStandardMaterial color="#ececea" roughness={0.75} transparent opacity={look.fade ? 0.1 : 0.14} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}

function Terminal({ L, W, H, poles, look }: { L: number; W: number; H: number; poles: number; look: Look }) {
  const step = L / poles;
  return (
    <>
      {/* low front with the wire entries, taller back that carries the screws */}
      <RoundedBox args={[L, W, H * 0.62]} radius={0.35} smoothness={2} position={[0, 0, (H * 0.62) / 2]} castShadow>
        <Plastic color={look.c} em={look.em} fade={look.fade} gloss={0.45} />
      </RoundedBox>
      <RoundedBox args={[L, W * 0.62, H]} radius={0.35} smoothness={2} position={[0, W * 0.19, H / 2]} castShadow>
        <Plastic color={look.c} em={look.em} fade={look.fade} gloss={0.45} />
      </RoundedBox>
      {Array.from({ length: poles }, (_, i) => {
        const x = (i - (poles - 1) / 2) * step;
        return (
          <group key={i}>
            {/* screw head with its slot */}
            <mesh position={[x, W * 0.19, H + 0.02]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[step * 0.3, step * 0.3, 0.5, 24]} />
              <Metal fade={look.fade} />
            </mesh>
            <mesh position={[x, W * 0.19, H + 0.29]} rotation={[0, 0, Math.PI / 5]}>
              <boxGeometry args={[step * 0.52, step * 0.09, 0.04]} />
              <meshStandardMaterial color="#3a3c41" roughness={0.6} {...look.fade} />
            </mesh>
            {/* wire entry with the clamp inside */}
            <mesh position={[x, -W / 2 - 0.01, H * 0.33]}>
              <boxGeometry args={[step * 0.56, 0.06, H * 0.34]} />
              <meshStandardMaterial color="#0c0d0f" roughness={0.9} {...look.fade} />
            </mesh>
            <mesh position={[x, -W / 2 + 0.25, H * 0.25]}>
              <boxGeometry args={[step * 0.44, 0.1, H * 0.12]} />
              <Metal fade={look.fade} />
            </mesh>
            <Pin x={x} y={0} fade={look.fade} r={0.45} />
          </group>
        );
      })}
    </>
  );
}

function Header({ L, W, H, pins, pitch, look }: { L: number; W: number; H: number; pins: number; pitch: number; look: Look }) {
  const rows = Math.max(1, Math.round(W / pitch));
  const cols = Math.max(1, Math.round(pins / rows));
  const posts: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) posts.push([(c - (cols - 1) / 2) * pitch, (r - (rows - 1) / 2) * pitch]);
  return (
    <>
      <RoundedBox args={[L, W, 2.5]} radius={0.25} smoothness={2} position={[0, 0, 1.25]} castShadow>
        <Plastic color={look.c} em={look.em} fade={look.fade} gloss={0.4} />
      </RoundedBox>
      {posts.map(([x, y], i) => (
        <mesh key={i} position={[x, y, (H - 2.6) / 2]} castShadow>
          <boxGeometry args={[0.64, 0.64, H + 2.6]} />
          <Metal color={GOLD} fade={look.fade} />
        </mesh>
      ))}
    </>
  );
}

function Dip({ L, W, H, pins, look }: { L: number; W: number; H: number; pins: number; look: Look }) {
  const per = Math.max(1, Math.ceil(pins / 2));
  const lift = 0.5;
  const legs = [];
  for (let i = 0; i < per; i++) {
    const x = (i - (per - 1) / 2) * 2.54;
    for (const s of [-1, 1]) {
      legs.push(
        // shoulder out of the body, then the leg down through the board
        <mesh key={`s${i}${s}`} position={[x, s * (W / 2 + 0.3), lift + H * 0.45]}>
          <boxGeometry args={[1.3, 0.75, 0.28]} />
          <Metal fade={look.fade} />
        </mesh>,
        <mesh key={`l${i}${s}`} position={[x, s * 3.81, (lift + H * 0.45 - 2.4) / 2]}>
          <boxGeometry args={[0.5, 0.28, lift + H * 0.45 + 2.4]} />
          <Metal fade={look.fade} />
        </mesh>,
      );
    }
  }
  return (
    <>
      <RoundedBox args={[L, W, H]} radius={0.22} smoothness={2} position={[0, 0, lift + H / 2]} castShadow>
        <Plastic color={look.c} em={look.em} fade={look.fade} gloss={0.42} />
      </RoundedBox>
      {/* the pin-1 notch at one end */}
      <mesh position={[-L / 2 + 0.02, 0, lift + H + 0.01]}>
        <circleGeometry args={[0.85, 20, -Math.PI / 2, Math.PI]} />
        <meshStandardMaterial color="#3c3d42" roughness={0.4} {...look.fade} />
      </mesh>
      {legs}
    </>
  );
}

function Led({ H, pitch, look }: { H: number; pitch: number; look: Look }) {
  const r = 2.5;
  const lens = { color: look.c, emissive: look.tinted ? look.em : look.c, emissiveIntensity: look.tinted ? 1 : 0.22, roughness: 0.12, metalness: 0, transparent: true, opacity: look.fade ? 0.16 : 0.82, depthWrite: !look.fade };
  return (
    <>
      <mesh position={[0, 0, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r + 0.4, r + 0.4, 1, 28]} />
        <meshStandardMaterial {...lens} />
      </mesh>
      <mesh position={[0, 0, 1 + (H - 1 - r) / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[r, r, H - 1 - r, 28]} />
        <meshStandardMaterial {...lens} />
      </mesh>
      <mesh position={[0, 0, H - r]} rotation={[Math.PI / 2, 0, 0]}>
        <sphereGeometry args={[r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial {...lens} />
      </mesh>
      {/* the anvil and post seen through the lens */}
      <mesh position={[0, 0, H * 0.42]}>
        <boxGeometry args={[pitch * 0.9, 0.5, H * 0.5]} />
        <Metal fade={look.fade} />
      </mesh>
      {[-1, 1].map((s) => (
        <Pin key={s} x={(s * pitch) / 2} y={0} top={0.2} r={0.25} fade={look.fade} />
      ))}
    </>
  );
}

function To220({ L, W, H, look }: { L: number; W: number; H: number; look: Look }) {
  const leg = 3.6;
  const bodyH = Math.min(9.2, H - leg);
  return (
    <>
      {/* the metal tab stands behind the moulded body and rises above it, with its mounting hole */}
      <mesh position={[0, W / 2 - 0.65, leg + (H - leg) / 2]} castShadow>
        <boxGeometry args={[L, 1.3, H - leg]} />
        <Metal fade={look.fade} />
      </mesh>
      <mesh position={[0, W / 2 - 1.31, leg + bodyH + (H - leg - bodyH) / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.8, 24]} />
        <meshStandardMaterial color="#101113" roughness={0.8} {...look.fade} />
      </mesh>
      <RoundedBox args={[L, W - 1.3, bodyH]} radius={0.3} smoothness={2} position={[0, -0.65, leg + bodyH / 2]} castShadow>
        <Plastic color={look.c} em={look.em} fade={look.fade} gloss={0.42} />
      </RoundedBox>
      {[-1, 0, 1].map((i) => (
        <mesh key={i} position={[i * 2.54, -0.4, (leg - 2.4) / 2]}>
          <boxGeometry args={[0.8, 0.5, leg + 2.4]} />
          <Metal fade={look.fade} />
        </mesh>
      ))}
    </>
  );
}

function To92({ H, look }: { H: number; look: Look }) {
  const leg = 2;
  return (
    <>
      <mesh position={[0, 0, leg + (H - leg) / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[2.3, 2.3, H - leg, 24, 1, false, Math.PI / 2, Math.PI]} />
        <Plastic color={look.c} em={look.em} fade={look.fade} gloss={0.42} />
      </mesh>
      <mesh position={[0, -0.01, leg + (H - leg) / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.6, H - leg]} />
        <Plastic color={look.c} em={look.em} fade={look.fade} gloss={0.42} />
      </mesh>
      {[-1, 0, 1].map((i) => (
        <Pin key={i} x={i * 1.27} y={0.6} top={leg} r={0.22} fade={look.fade} />
      ))}
    </>
  );
}

function Hc49({ L, W, H, pitch, look }: { L: number; W: number; H: number; pitch: number; look: Look }) {
  const mat = <meshStandardMaterial color={look.c} emissive={look.em} metalness={0.9} roughness={0.22} {...look.fade} />;
  return (
    <>
      {/* a stadium-shaped can: a box with a half-round at each end, on a slightly wider base flange */}
      {[0.3, 0.75].map((z, i) => {
        const [l, w, h] = i ? [L - 0.6, W - 0.6, H - 0.45] : [L, W, 0.45];
        return (
          <group key={z} position={[0, 0, i ? 0.45 + h / 2 : h / 2]}>
            <mesh castShadow>
              <boxGeometry args={[l - w, w, h]} />
              {mat}
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[(s * (l - w)) / 2, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[w / 2, w / 2, h, 24]} />
                {mat}
              </mesh>
            ))}
          </group>
        );
      })}
      {[-1, 1].map((s) => (
        <Pin key={s} x={(s * pitch) / 2} y={0} top={0.2} r={0.22} fade={look.fade} />
      ))}
    </>
  );
}

function Electrolytic({ W, H, look }: { W: number; H: number; look: Look }) {
  const r = W / 2;
  return (
    <>
      <mesh position={[0, 0, 0.25]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r * 0.9, r * 0.9, 0.5, 32]} />
        <Plastic color={RUBBER} fade={look.fade} />
      </mesh>
      {/* the sleeve, pinched in near the bottom and rolled over the top edge */}
      <mesh position={[0, 0, 0.5 + (H - 1) / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[r, r, H - 1, 40]} />
        <Plastic color={look.c} em={look.em} fade={look.fade} gloss={0.6} />
      </mesh>
      <mesh position={[0, 0, H - 0.25]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r * 0.9, r, 0.5, 40]} />
        <Plastic color={look.c} em={look.em} fade={look.fade} gloss={0.6} />
      </mesh>
      {/* aluminium top with the pressure vent scored into it */}
      <mesh position={[0, 0, H + 0.01]}>
        <circleGeometry args={[r * 0.9, 40]} />
        <meshStandardMaterial color="#cfd2d6" metalness={0.85} roughness={0.34} {...look.fade} />
      </mesh>
      {look.tinted
        ? null
        : [0, Math.PI / 2].map((a) => (
            <mesh key={a} position={[0, 0, H + 0.02]} rotation={[0, 0, a + Math.PI / 4]}>
              <planeGeometry args={[r * 1.5, Math.max(0.08, r * 0.045)]} />
              <meshStandardMaterial color="#8d9096" metalness={0.6} roughness={0.5} {...look.fade} />
            </mesh>
          ))}
      {/* the pale stripe that marks the negative lead */}
      {look.tinted ? null : (
        <mesh position={[r + 0.01, 0, 0.5 + (H - 1) / 2]} rotation={[Math.PI / 2, Math.PI / 2, 0]}>
          <planeGeometry args={[r * 0.75, (H - 1) * 0.9]} />
          <meshStandardMaterial color="#c6c6c2" roughness={0.6} {...look.fade} />
        </mesh>
      )}
    </>
  );
}

function Axial({ L, W, pitch, look }: { L: number; W: number; pitch: number; look: Look }) {
  const r = W / 2;
  const z = r + 0.3;
  const reach = Math.max(L / 2 + 0.6, pitch / 2);
  const resistor = look.c === "#c8a878";
  // Resistor colour bands, or the single cathode band of a diode.
  const bands = look.tinted ? [] : resistor ? [["#7a4a21", -0.3], ["#111111", -0.12], ["#c0392b", 0.06], ["#c9a227", 0.32]] : [["#c9ccd2", -0.3]];
  return (
    <>
      <mesh position={[0, 0, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[r, r, L, 24]} />
        <Plastic color={look.c} em={look.em} fade={look.fade} gloss={0.5} />
      </mesh>
      {bands.map(([color, at]) => (
        <mesh key={String(at)} position={[(at as number) * L, 0, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[r * 1.02, r * 1.02, L * 0.09, 24]} />
          <meshStandardMaterial color={color as string} roughness={0.5} {...look.fade} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[(s * (L / 2 + reach)) / 2, 0, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.28, 0.28, reach - L / 2, 8]} />
            <Metal fade={look.fade} />
          </mesh>
          <Pin x={s * reach} y={0} top={z} r={0.28} fade={look.fade} />
        </group>
      ))}
    </>
  );
}

/** The body for a part with a known look, or null when the package kind draws it well enough. */
export function ShapedBody({ body, look }: { body: BodySpec; look: Look }) {
  const L = Math.max(0.6, body.length);
  const W = Math.max(0.6, body.width);
  const H = Math.max(0.6, body.height);
  switch (body.shape) {
    case "relay":
      return <Relay L={L} W={W} H={H} look={look} />;
    case "terminal":
      return <Terminal L={L} W={W} H={H} poles={Math.max(1, body.pins)} look={look} />;
    case "header":
      return <Header L={L} W={W} H={H} pins={Math.max(1, body.pins)} pitch={body.pitch || 2.54} look={look} />;
    case "dip":
      return <Dip L={L} W={W} H={H} pins={body.pins} look={look} />;
    case "led":
      return <Led H={Math.max(4, H)} pitch={body.pitch || 2.54} look={look} />;
    case "to220":
      return <To220 L={L} W={W} H={Math.max(8, H)} look={look} />;
    case "to92":
      return <To92 H={Math.max(4, H)} look={look} />;
    case "hc49":
      return <Hc49 L={L} W={W} H={H} pitch={body.pitch || 4.88} look={look} />;
    case "electrolytic":
      return <Electrolytic W={W} H={Math.max(1.5, H)} look={look} />;
    case "axial":
      return <Axial L={L} W={W} pitch={body.pitch || L + 4} look={look} />;
    default:
      return null;
  }
}
