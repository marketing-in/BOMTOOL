/**
 * PCB materials directory: laminates, surface finishes and build features. Versioned seed data (Phase 12).
 * Values are typical datasheet figures for comparing families — the laminate maker's datasheet decides.
 */

export type Laminate = {
  slug: string;
  name: string;
  family: string;
  /** Glass transition, decomposition temperature (°C). null = not specified for this class. */
  tg: number | null;
  td: number | null;
  /** Dielectric constant and dissipation factor around 1–10 GHz. */
  dk: string;
  df: string;
  /** Z-axis expansion 50–260 °C (%), or CTE where that is the usual figure. */
  zExpansion: string;
  /** Thermal conductivity, W/m·K. */
  k: string;
  /** Relative cost, standard FR-4 = 1. */
  cost: number;
  examples: string[];
  uses: string[];
  notes: string;
};

export const LAMINATES: Laminate[] = [
  { slug: "fr2", name: "FR-2 / FR-1 (paper phenolic)", family: "Paper-based", tg: null, td: null, dk: "≈4.5", df: "≈0.03", zExpansion: "high", k: "0.2", cost: 0.5, examples: ["Generic XPC/FR-1"], uses: ["Single-sided consumer and toy boards", "Remote controls"], notes: "Punched, not drilled; single-sided, no plated holes; poor moisture and heat resistance." },
  { slug: "cem1", name: "CEM-1 (paper core, glass faces)", family: "Composite", tg: 125, td: null, dk: "≈4.5", df: "≈0.03", zExpansion: "high", k: "0.25", cost: 0.7, examples: ["Kingboard KB-5150"], uses: ["Single-sided power supplies", "Lighting"], notes: "Cheaper than FR-4, punchable; single-sided only." },
  { slug: "cem3", name: "CEM-3 (glass-mat core)", family: "Composite", tg: 125, td: null, dk: "≈4.5", df: "≈0.02", zExpansion: "≈4 %", k: "0.3", cost: 0.85, examples: ["Kingboard KB-7150"], uses: ["Double-sided consumer boards", "LED lighting"], notes: "Plated through-holes possible; white CEM-3 popular in LED lighting." },
  { slug: "fr4-std", name: "FR-4 standard (Tg 130–140)", family: "FR-4", tg: 135, td: 310, dk: "4.3–4.6", df: "0.018–0.022", zExpansion: "≈4.0 %", k: "0.3", cost: 1, examples: ["Kingboard KB-6160", "Shengyi S1141", "Isola DE104"], uses: ["Most 1–4 layer boards"], notes: "Default for general electronics; limited margin for many lead-free reflow passes and thick multilayers." },
  { slug: "fr4-mid", name: "FR-4 mid-Tg (Tg 150)", family: "FR-4", tg: 150, td: 325, dk: "4.2–4.5", df: "0.016–0.020", zExpansion: "≈3.5 %", k: "0.3", cost: 1.1, examples: ["Shengyi S1000H", "Kingboard KB-6165"], uses: ["Industrial 4–6 layer boards", "Lead-free assemblies"], notes: "Good default for lead-free 4-layer work." },
  { slug: "fr4-high", name: "FR-4 high-Tg (Tg 170–180)", family: "FR-4", tg: 175, td: 340, dk: "4.0–4.4", df: "0.015–0.021", zExpansion: "≈2.8 %", k: "0.35", cost: 1.3, examples: ["Isola 370HR", "Shengyi S1000-2M", "ITEQ IT-180A"], uses: ["Automotive", "6+ layers", "Motor drives", "Thick boards"], notes: "Withstands several lead-free reflows; the usual choice for reliability." },
  { slug: "fr4-hf", name: "Halogen-free FR-4", family: "FR-4", tg: 160, td: 350, dk: "4.2–4.6", df: "0.010–0.015", zExpansion: "≈2.8 %", k: "0.35", cost: 1.3, examples: ["Shengyi S1150G", "Panasonic R-1566", "Isola DE156"], uses: ["Consumer brands with halogen-free policies", "EU eco-labels"], notes: "No bromine flame retardant; drill and press parameters differ." },
  { slug: "low-loss", name: "Low-loss / high-speed epoxy", family: "High-speed", tg: 200, td: 360, dk: "3.3–3.8", df: "0.002–0.009", zExpansion: "≈2.8 %", k: "0.4", cost: 3.5, examples: ["Panasonic Megtron 6", "Isola I-Speed", "Isola FR408HR"], uses: ["10+ Gbps serial links", "Servers and networking"], notes: "Spread-glass and smooth copper options reduce skew and loss." },
  { slug: "polyimide", name: "Polyimide (rigid)", family: "Polyimide", tg: 250, td: 390, dk: "≈4.2", df: "≈0.015", zExpansion: "≈1.2 %", k: "0.35", cost: 3, examples: ["Arlon 85N", "Isola P95"], uses: ["Aerospace", "Down-hole", "Burn-in boards"], notes: "Very high temperature; absorbs moisture — bake before assembly." },
  { slug: "flex-pi", name: "Flexible polyimide film", family: "Flex", tg: 360, td: 500, dk: "3.2–3.5", df: "0.002–0.008", zExpansion: "n/a (film)", k: "0.2", cost: 3, examples: ["DuPont Pyralux AP", "Panasonic Felios"], uses: ["Flex and rigid-flex circuits"], notes: "Adhesiveless laminates for dynamic flex and fine pitch; coverlay instead of solder mask." },
  { slug: "ptfe", name: "PTFE (woven/ceramic-filled)", family: "RF / microwave", tg: null, td: 500, dk: "2.2–3.0", df: "0.0009–0.002", zExpansion: "PTFE: high z-CTE", k: "0.2–0.6", cost: 10, examples: ["Rogers RT/duroid 5880", "Taconic TLY", "Rogers RO3003"], uses: ["Radar", "Satellite", "mmWave"], notes: "Needs plasma desmear and special handling; often in hybrid stack-ups with FR-4." },
  { slug: "hydrocarbon", name: "Hydrocarbon-ceramic", family: "RF / microwave", tg: 280, td: 390, dk: "3.0–3.66", df: "0.0027–0.0037", zExpansion: "≈32 ppm/°C (z)", k: "0.6–0.7", cost: 5, examples: ["Rogers RO4350B", "Rogers RO4003C", "Taconic RF-35"], uses: ["Antennas", "LNAs", "5G and automotive radar"], notes: "Processes like FR-4 (standard drilling, plating); stable Dk." },
  { slug: "bt-epoxy", name: "BT epoxy", family: "Substrate", tg: 200, td: 350, dk: "3.6–4.0", df: "≈0.010", zExpansion: "≈1.5 %", k: "0.4", cost: 4, examples: ["Mitsubishi Gas Chemical BT"], uses: ["IC substrates", "Memory modules", "Camera modules"], notes: "Low expansion and high Tg; used in packaging more than in PCBAs." },
  { slug: "ims-al", name: "Aluminium IMS (metal core)", family: "Metal core", tg: 130, td: null, dk: "dielectric ≈ 4–6", df: "—", zExpansion: "Al base 23 ppm/°C", k: "1–3 (dielectric)", cost: 1.8, examples: ["Bergquist HPL-03015", "Ventec VT-4B", "Laird Tlam"], uses: ["LED lighting", "Power modules"], notes: "Single copper layer on a thin dielectric bonded to 5052/6061 aluminium." },
  { slug: "ims-cu", name: "Copper IMS / copper-core", family: "Metal core", tg: 130, td: null, dk: "dielectric ≈ 4–6", df: "—", zExpansion: "Cu base 17 ppm/°C", k: "2–8 (dielectric), base 390", cost: 4, examples: ["Ventec VT-4A", "Thermal-via copper-core"], uses: ["High-power LEDs", "Laser drivers"], notes: "Heavier and costlier than aluminium; best heat spreading." },
  { slug: "ceramic", name: "Ceramic (alumina / AlN)", family: "Ceramic", tg: null, td: null, dk: "Al₂O₃ ≈ 9.8, AlN ≈ 8.8", df: "≈0.0003", zExpansion: "≈7 ppm/°C (Al₂O₃), 4.5 (AlN)", k: "Al₂O₃ 24, AlN 170", cost: 12, examples: ["96 % alumina thick-film", "DBC / AMB copper on ceramic"], uses: ["Power modules", "Sensors", "High-temperature electronics"], notes: "Thick/thin-film or direct-bonded copper; brittle — needs care in assembly." },
];

export type Finish = { slug: string; name: string; thickness: string; flatness: "excellent" | "good" | "poor"; shelfLifeMonths: number; rohs: boolean; wireBond: boolean; contacts: boolean; cost: number; best: string; watch: string };

export const FINISHES: Finish[] = [
  { slug: "hasl", name: "HASL (tin-lead)", thickness: "1–40 µm, uneven", flatness: "poor", shelfLifeMonths: 12, rohs: false, wireBond: false, contacts: false, cost: 1, best: "Exempt / non-RoHS products with coarse pitch.", watch: "Not RoHS; uneven surface unsuitable below 0.65 mm pitch." },
  { slug: "lf-hasl", name: "Lead-free HASL (SnCuNi)", thickness: "1–25 µm, uneven", flatness: "poor", shelfLifeMonths: 12, rohs: true, wireBond: false, contacts: false, cost: 1, best: "Cheap, robust finish for THT and coarse SMT.", watch: "Thermal shock on the board; poor for fine pitch, QFN and BGA." },
  { slug: "enig", name: "ENIG (electroless nickel, immersion gold)", thickness: "Ni 3–6 µm, Au 0.05–0.1 µm", flatness: "excellent", shelfLifeMonths: 12, rohs: true, wireBond: false, contacts: true, cost: 1.4, best: "Fine pitch, QFN, BGA, keypads — the default for dense boards.", watch: "\"Black pad\" if the process drifts; nickel layer under fast RF lines adds loss." },
  { slug: "enepig", name: "ENEPIG (+ electroless palladium)", thickness: "Ni 3–6, Pd 0.05–0.3, Au 0.03–0.1 µm", flatness: "excellent", shelfLifeMonths: 12, rohs: true, wireBond: true, contacts: true, cost: 1.8, best: "Mixed solder + gold wire-bond assemblies; very reliable joints.", watch: "Higher cost; fewer fabs." },
  { slug: "osp", name: "OSP (organic solderability preservative)", thickness: "0.2–0.5 µm", flatness: "excellent", shelfLifeMonths: 6, rohs: true, wireBond: false, contacts: false, cost: 0.8, best: "Cheap and flat for high-volume consumer SMT.", watch: "Short shelf life; degrades with each reflow; not visible to AOI; poor for ICT test pads." },
  { slug: "imag", name: "Immersion silver", thickness: "0.1–0.3 µm", flatness: "excellent", shelfLifeMonths: 6, rohs: true, wireBond: false, contacts: false, cost: 1.1, best: "High-speed and RF boards (low loss), flat pads.", watch: "Tarnishes; creep corrosion in sulphur-rich air; handle with gloves." },
  { slug: "imsn", name: "Immersion tin", thickness: "≈1 µm", flatness: "excellent", shelfLifeMonths: 6, rohs: true, wireBond: false, contacts: false, cost: 1.1, best: "Press-fit connectors, flat pads at low cost.", watch: "Tin whiskers risk; limited reflow cycles; can attack solder mask." },
  { slug: "hard-gold", name: "Hard (electrolytic) gold", thickness: "Au 0.75–1.5 µm over Ni", flatness: "good", shelfLifeMonths: 24, rohs: true, wireBond: false, contacts: true, cost: 3, best: "Edge connectors and sliding contacts (card fingers).", watch: "Expensive; usually only on fingers, with another finish elsewhere." },
  { slug: "soft-gold", name: "Soft (wire-bondable) gold", thickness: "Au 0.3–1 µm over Ni", flatness: "good", shelfLifeMonths: 24, rohs: true, wireBond: true, contacts: false, cost: 3, best: "Chip-on-board wire bonding.", watch: "Too much gold embrittles solder joints." },
  { slug: "carbon", name: "Carbon ink", thickness: "10–20 µm", flatness: "good", shelfLifeMonths: 24, rohs: true, wireBond: false, contacts: true, cost: 0.9, best: "Membrane keypad and jumper contacts on cheap boards.", watch: "Resistive; not solderable." },
];

export type BoardFeature = { slug: string; group: string; name: string; detail: string; cost: string };

export const BOARD_FEATURES: BoardFeature[] = [
  { slug: "cu-05", group: "Copper weight", name: "½ oz (17.5 µm)", detail: "Fine lines down to 75 µm; inner layers of HDI.", cost: "Base" },
  { slug: "cu-1", group: "Copper weight", name: "1 oz (35 µm)", detail: "The standard outer copper; 0.1–0.15 mm lines.", cost: "Base" },
  { slug: "cu-2", group: "Copper weight", name: "2 oz (70 µm)", detail: "Power rails and motor boards; lines ≥ 0.2 mm.", cost: "+15–30 %" },
  { slug: "cu-3plus", group: "Copper weight", name: "3–10 oz (105–350 µm)", detail: "Heavy copper for high current; wide spacing rules.", cost: "+50–200 %" },
  { slug: "via-th", group: "Vias", name: "Plated through-hole via", detail: "Drilled through the whole board; 0.2–0.3 mm finished hole typical.", cost: "Base" },
  { slug: "via-blind", group: "Vias", name: "Blind and buried vias", detail: "Connect outer-to-inner or inner-to-inner layers only; extra lamination cycles.", cost: "+30–80 %" },
  { slug: "via-micro", group: "Vias", name: "Laser microvias (HDI)", detail: "≤ 0.15 mm laser-drilled, one layer deep; stacked or staggered.", cost: "+50–150 %" },
  { slug: "via-in-pad", group: "Vias", name: "Via-in-pad, filled and capped (VIPPO)", detail: "Resin-filled and plated over so BGA pads can hold vias.", cost: "+20–40 %" },
  { slug: "via-tented", group: "Vias", name: "Tented / plugged vias", detail: "Mask over or resin plug in vias to stop solder wicking and ICT issues.", cost: "≈ base" },
  { slug: "back-drill", group: "Vias", name: "Back-drilling", detail: "Removes via stubs on high-speed links.", cost: "+10–25 %" },
  { slug: "mask-lpi", group: "Solder mask", name: "LPI solder mask", detail: "Liquid photo-imageable; green best for fine dams (≥ 0.1 mm); black/white harder to inspect.", cost: "Base" },
  { slug: "mask-colours", group: "Solder mask", name: "Colours and finishes", detail: "Green, blue, red, black, white, yellow, purple; matte or glossy.", cost: "Non-green +0–10 %" },
  { slug: "silk", group: "Solder mask", name: "Silkscreen / legend", detail: "Ink-jet or screen printed; ≥ 0.15 mm line, 0.8 mm text height for readability.", cost: "Base" },
  { slug: "impedance", group: "Electrical", name: "Controlled impedance", detail: "Fab tunes widths to hit 50 Ω single / 90–100 Ω differential within ±10 %; coupon tested.", cost: "+5–15 %" },
  { slug: "ipc-1", group: "Quality class (IPC-6012 / IPC-A-610)", name: "Class 1 — general", detail: "Consumer toys and disposables; cosmetic defects accepted.", cost: "Lowest" },
  { slug: "ipc-2", group: "Quality class (IPC-6012 / IPC-A-610)", name: "Class 2 — dedicated service", detail: "Industrial, communications, most commercial products; the usual choice.", cost: "Base" },
  { slug: "ipc-3", group: "Quality class (IPC-6012 / IPC-A-610)", name: "Class 3 — high performance", detail: "Medical, aerospace, automotive safety; tighter annular ring, plating and inspection.", cost: "+20–40 %" },
  { slug: "panel-v", group: "Panelisation", name: "V-score panels", detail: "Straight-line breakaway; parts ≥ 0.5–1 mm from the score.", cost: "Base" },
  { slug: "panel-tab", group: "Panelisation", name: "Tab-routed panels (mouse bites)", detail: "Any outline; needs depanel router or punch.", cost: "Base" },
  { slug: "edge-plating", group: "Special", name: "Edge plating / castellated holes", detail: "Plated board edges for shielding or half-holes for module soldering.", cost: "+15–30 %" },
];
