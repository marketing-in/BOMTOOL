import { lineFits, type JobNeeds, type LineCapability } from "./planning";

/** One placed designator, as the route needs to see it. */
export type RoutePart = {
  refDes: string;
  side: "TOP" | "BOTTOM";
  /** Part.mountType: SMD, THT, PRESS_FIT, CHASSIS, CABLE, OTHER. */
  mount: string | null;
  /** Package name ("0402", "QFN-24") and family ("CHIP", "QFN", "BGA"). */
  pkg: string | null;
  family: string | null;
  pitchMm: number | null;
  category: string | null;
  msl: string | null;
  dnp: boolean;
};

export type RouteLine = { code: string; name: string; type: string; capability: LineCapability; capacityCph?: number | null; machines: { type: string; vendor: string; model: string }[] };

export type RouteInput = {
  parts: RoutePart[];
  board: { layers: number; finish: string; widthMm: number; heightMm: number };
  stage: "PROTOTYPE" | "NPI" | "PRODUCTION";
  buildQty: number;
  /** Conformal coating called up in the board spec ("acrylic", …), if any. */
  coating?: string | null;
  enclosure?: { mpn: string; kitGaps: number } | null;
  lines?: RouteLine[];
};

export type RouteStage = "fab" | "prep" | "smt" | "tht" | "post" | "test" | "box" | "ship";

/** The masking decision for a step: what is masked and why, or why no mask is needed (non-masking). */
export type Masking = { needed: boolean; what: string };

export type RouteStep = {
  key: string;
  stage: RouteStage;
  title: string;
  /** For SMT passes: the side being built. */
  side: "TOP" | "BOTTOM" | null;
  /** Why this product needs this step, in this product's terms. */
  why: string;
  /** Designators this step handles — what lights up in 3D. */
  refs: string[];
  /** What is checked or controlled here. */
  checks: string[];
  /** A product-specific risk at this step. */
  watch: string | null;
  /** Machine entry in the component & equipment dictionary. */
  machine: string | null;
  /** Knowledge article that explains the step. */
  article: string | null;
  /** Where it runs in our factory. */
  where: { line: string; lineName: string; equipment: string | null } | null;
  /** Soldering and coating steps: is a mask needed, and for what. */
  masking?: Masking;
};

export const STAGE_LABEL: Record<RouteStage, string> = {
  fab: "Bare board",
  prep: "Preparation",
  smt: "SMT assembly",
  tht: "Through-hole",
  post: "Cleaning & coating",
  test: "Test & programming",
  box: "Box-build",
  ship: "Pack & ship",
};

const CHIP_SIZES = ["01005", "0201", "0402", "0603", "0805", "1206", "1210", "1812", "2010", "2512"];
const HIDDEN_JOINTS = new Set(["QFN", "SON", "BGA", "LGA", "CSP"]);
const MOISTURE_SENSITIVE = new Set(["MSL_3", "MSL_4", "MSL_5", "MSL_5A", "MSL_6"]);
const PROGRAMMABLE = new Set(["mcu", "mpu-soc", "fpga-cpld", "rf-wireless"]);
/**
 * Parts conformal coating must not reach: anything that mates, moves, switches, senses the air or radiates. They are
 * masked before coating (or kept out by a selective coater's program) and the mask comes off after.
 */
const KEEP_OUT = /^(connector|terminal|relay|switch|potentiometer|trimmer|battery|fuse|buzzer|sensor|rf-wireless|antenna)/;
export const isKeepOut = (p: Pick<RoutePart, "category" | "mount">) => p.mount === "CABLE" || p.mount === "CHASSIS" || KEEP_OUT.test(p.category ?? "");
/** Heavy or tall on the first-reflowed side: they hang upside down through the second reflow. */
const HEAVY_FAMILIES = new Set(["TO", "MODULE", "RADIAL", "VCHIP"]);

/** "U1, U2, U3 +4 more" — enough to recognise, short enough to read. */
export function refList(refs: string[], max = 6) {
  return refs.length <= max ? refs.join(", ") : `${refs.slice(0, max).join(", ")} +${refs.length - max} more`;
}

const sortRefs = (refs: string[]) => [...refs].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

/** Where a kind of machine is in the factory: on the preferred line, else wherever we have one. */
function locate(lines: RouteLine[] | undefined, preferred: RouteLine | undefined, machineType: string | null): RouteStep["where"] {
  if (!lines?.length) return null;
  const has = (l: RouteLine) => !machineType || l.machines.some((m) => m.type === machineType);
  const line = preferred && has(preferred) ? preferred : lines.find(has) ?? preferred;
  if (!line) return null;
  const m = machineType ? line.machines.filter((x) => x.type === machineType) : [];
  return { line: line.code, lineName: line.name, equipment: m.length ? m.map((x) => `${x.vendor} ${x.model}`).join(" + ") : null };
}

/**
 * The manufacturing route for one product: every step from bare board to packed box,
 * chosen from its parts (sides, packages, moisture sensitivity, through-hole, what needs programming)
 * and placed on our lines and machines.
 */
export function buildRoute(input: RouteInput): RouteStep[] {
  const placed = input.parts.filter((p) => !p.dnp);
  const smd = placed.filter((p) => p.mount === "SMD" || p.mount === null);
  const tht = placed.filter((p) => p.mount === "THT");
  const pressFit = placed.filter((p) => p.mount === "PRESS_FIT");
  const refs = (ps: RoutePart[]) => sortRefs(ps.map((p) => p.refDes));
  const steps: RouteStep[] = [];
  const add = (s: Omit<RouteStep, "side" | "watch" | "where"> & Partial<Pick<RouteStep, "side" | "watch" | "where">>) =>
    steps.push({ side: null, watch: null, where: null, ...s });

  // Which lines: an SMT line that can build it (the high-mix line for NPI and small runs), then THT and box-build.
  const chips = smd.map((p) => p.pkg).filter((n): n is string => !!n && CHIP_SIZES.includes(n));
  const pitches = smd.map((p) => p.pitchMm).filter((x): x is number => typeof x === "number" && x > 0);
  const needs: JobNeeds = {
    smallestChip: [...chips].sort((a, b) => CHIP_SIZES.indexOf(a) - CHIP_SIZES.indexOf(b))[0] ?? null,
    finestPitchMm: pitches.length ? Math.min(...pitches) : null,
    hasBga: smd.some((p) => ["BGA", "LGA", "CSP"].includes(p.family ?? "")),
    boardMm: [input.board.widthMm, input.board.heightMm],
    doubleSided: smd.some((p) => p.side === "BOTTOM"),
    hasTht: tht.length > 0,
    smdLines: smd.length,
  };
  const smtLines = (input.lines ?? []).filter((l) => (l.type === "SMT" || l.type === "MIXED") && lineFits(l.type, l.capability, needs).ok);
  const smallRun = input.stage !== "PRODUCTION" || input.buildQty < 300;
  const fastest = [...smtLines].sort((a, b) => (b.capacityCph ?? 0) - (a.capacityCph ?? 0))[0];
  const smtLine = smallRun ? smtLines[0] : fastest;
  const thtLine = input.lines?.find((l) => l.type === "THT" || l.type === "MIXED");
  const boxLine = input.lines?.find((l) => l.type === "BOX_BUILD");

  add({
    key: "fab",
    stage: "fab",
    title: "PCB fabrication",
    why: `${input.board.layers}-layer ${input.board.finish} board, ${+input.board.widthMm.toFixed(1)} × ${+input.board.heightMm.toFixed(1)} mm, made by the fab partner and checked on arrival.`,
    refs: [],
    checks: ["Electrical test certificate (opens/shorts)", "Incoming visual and solderability", "Bow and twist within IPC-6012"],
    machine: null,
    article: "pcb-fab-process",
  });

  const wet = placed.filter((p) => MOISTURE_SENSITIVE.has(p.msl ?? ""));
  add({
    key: "kitting",
    stage: "prep",
    title: wet.length ? "Kitting and moisture control" : "Kitting",
    why: wet.length
      ? `${wet.length} moisture-sensitive part${wet.length === 1 ? "" : "s"} (${refList(refs(wet))}): floor life is tracked from bag opening and expired parts are baked.`
      : "Reels and trays are picked against the BoM, counted and verified by barcode.",
    refs: refs(wet),
    checks: ["Barcode verification of every reel", "Count against the work order", ...(wet.length ? ["Humidity indicator card, MSL clock"] : [])],
    machine: wet.length ? "dry-cabinet-baking" : "smart-storage-counter",
    article: wet.length ? "msl-handling" : null,
  });

  // SMT: the lighter side first, so heavy parts aren't hanging upside down through a second reflow.
  const sides = (["TOP", "BOTTOM"] as const).map((s) => ({ side: s, parts: smd.filter((p) => p.side === s) })).filter((s) => s.parts.length);
  sides.sort((a, b) => a.parts.length - b.parts.length || (a.side === "BOTTOM" ? -1 : 1));
  sides.forEach(({ side, parts }, i) => {
    const s = side.toLowerCase();
    const second = i === 1;
    const all = refs(parts);
    const label = sides.length > 1 ? ` — ${s} side` : "";
    const heavyFirst = !second && sides.length > 1 ? parts.filter((p) => HEAVY_FAMILIES.has(p.family ?? "")) : [];
    add({
      key: `print-${s}`,
      stage: "smt",
      side,
      title: `Solder paste printing${label}`,
      why: `Paste is printed through a laser-cut stencil onto the ${s} pads for ${parts.length} part${parts.length === 1 ? "" : "s"}.`,
      refs: all,
      checks: ["Stencil alignment and aperture design", "Squeegee pressure and print speed"],
      machine: "stencil-printer",
      article: "solder-paste-stencil",
      where: locate(input.lines, smtLine, "STENCIL_PRINTER"),
    });
    add({
      key: `spi-${s}`,
      stage: "smt",
      side,
      title: `3D solder paste inspection${label}`,
      why: "Every paste deposit is measured before any part is placed — most solder defects start at the printer.",
      refs: all,
      checks: ["Paste volume, height and offset per pad"],
      machine: "spi-machine",
      article: "inspection-spi-aoi-xray",
      where: locate(input.lines, smtLine, "SPI"),
    });
    const fine = parts.filter((p) => p.pitchMm !== null && p.pitchMm <= 0.5);
    const small = parts.filter((p) => p.pkg === "0201" || p.pkg === "01005");
    add({
      key: `place-${s}`,
      stage: "smt",
      side,
      title: `Pick and place${label}`,
      why: `${parts.length} placements${fine.length ? `, fine pitch on ${refList(refs(fine), 4)}` : ""}${needs.smallestChip ? `, chips down to ${needs.smallestChip}` : ""}.`,
      refs: all,
      checks: ["Feeder setup verified by barcode", "Vision centring of every part", "First-article check"],
      watch: small.length ? `${small.length} 0201-size part${small.length === 1 ? "" : "s"}: nozzle and feeder condition matter.` : null,
      machine: "pick-and-place-machine",
      article: "pick-and-place",
      where: locate(input.lines, smtLine, "PICK_AND_PLACE"),
    });
    add({
      key: `reflow-${s}`,
      stage: "smt",
      side,
      title: `Reflow soldering${label}`,
      why: second
        ? `Second reflow: the ${sides[0].side.toLowerCase()}-side joints remelt while hanging upside down.`
        : "Convection reflow with a profile set for the heaviest and the most heat-sensitive part.",
      refs: all,
      checks: ["Profile: preheat, soak, peak ~245 °C (SAC305), time above liquidus"],
      watch: heavyFirst.length ? `${refList(refs(heavyFirst), 4)} will ride upside down through the second reflow — glue or a carrier.` : null,
      machine: "reflow-oven",
      article: "reflow-profile",
      where: locate(input.lines, smtLine, "REFLOW_OVEN"),
    });
    add({
      key: `aoi-${s}`,
      stage: "smt",
      side,
      title: `Automated optical inspection${label}`,
      why: "Presence, polarity, offset, bridges and fillets on every visible joint.",
      refs: all,
      checks: ["Missing or wrong part", "Polarity", "Bridges and insufficient solder", "Tombstones"],
      machine: "aoi-machine",
      article: "inspection-spi-aoi-xray",
      where: locate(input.lines, smtLine, "AOI"),
    });
    const hidden = parts.filter((p) => HIDDEN_JOINTS.has(p.family ?? ""));
    if (hidden.length)
      add({
        key: `xray-${s}`,
        stage: "smt",
        side,
        title: `X-ray inspection${label}`,
        why: `${refList(refs(hidden), 4)} solder underneath the body, where AOI can't see.`,
        refs: refs(hidden),
        checks: ["Bridges and opens under the body", "Voiding on thermal pads"],
        machine: "x-ray-inspection",
        article: "inspection-spi-aoi-xray",
        where: locate(input.lines, smtLine, "XRAY"),
      });
  });

  if (tht.length) {
    // Bottom-side SMD would wash off in a wave; selective solders around it.
    const selective = smd.some((p) => p.side === "BOTTOM");
    add({
      key: "insert",
      stage: "tht",
      title: "Through-hole insertion",
      why: `${tht.length} through-hole part${tht.length === 1 ? "" : "s"} (${refList(refs(tht))}) inserted at lit benches following the assembly drawing.`,
      refs: refs(tht),
      checks: ["Orientation and polarity", "Seated flat"],
      // Volume work goes on the inserter; short runs are inserted by hand at the benches.
      machine: input.buildQty >= 1000 ? "auto-insertion-machine" : null,
      article: "tht-processes",
      where: locate(input.lines, thtLine, null),
    });
    // A wave floods every open hole: press-fit holes must stay free of solder, so they are masked first.
    const waveMask = !selective && pressFit.length > 0;
    if (waveMask)
      add({
        key: "mask-wave",
        stage: "tht",
        title: "Masking before the wave",
        why: `The press-fit holes of ${refList(refs(pressFit))} must stay free of solder: they are plugged with temporary solder mask (or the wave pallet covers them) before the board goes over the wave.`,
        refs: refs(pressFit),
        checks: ["Every press-fit hole covered", "No mask on the joints to be soldered"],
        machine: null,
        article: "tht-processes",
        where: locate(input.lines, thtLine, "MASKING_STATION"),
        masking: { needed: true, what: `press-fit holes of ${refList(refs(pressFit))}` },
      });
    add({
      key: selective ? "selective" : "wave",
      stage: "tht",
      title: selective ? "Selective soldering" : "Wave soldering",
      why: selective ? "The bottom side already carries SMD parts, so a programmed mini-wave solders only the through-hole leads." : "One pass over a solder wave solders every through-hole lead.",
      refs: refs(tht),
      checks: ["Hole fill (IPC-A-610)", "Bridges and skips"],
      machine: selective ? "selective-soldering-machine" : "wave-soldering-machine",
      article: "tht-processes",
      where: locate(input.lines, thtLine, selective ? "SELECTIVE_SOLDER" : "WAVE_SOLDER"),
      masking: selective
        ? { needed: false, what: "no masking: the selective nozzle solders only the programmed joints" }
        : waveMask
          ? { needed: true, what: "press-fit holes masked (step before)" }
          : { needed: false, what: "no masking: every open hole on the board is meant to be soldered" },
    });
    if (waveMask)
      add({
        key: "demask-wave",
        stage: "tht",
        title: "De-masking after the wave",
        why: "The temporary mask comes off before press-fit, leaving the holes clean and the right size for the pins.",
        refs: refs(pressFit),
        checks: ["No mask residue in the holes", "Hole size within the press-fit spec"],
        machine: null,
        article: "tht-processes",
        where: locate(input.lines, thtLine, "MASKING_STATION"),
      });
  }
  if (pressFit.length)
    add({
      key: "press-fit",
      stage: "tht",
      title: "Press-fit",
      why: `${refList(refs(pressFit))} have compliant pins pressed in without solder.`,
      refs: refs(pressFit),
      checks: ["Force–distance curve per pin"],
      machine: "press-fit-machine",
      article: "tht-processes",
      where: locate(input.lines, thtLine, "PRESS_FIT"),
    });

  if (input.coating)
    add({
      key: "clean",
      stage: "post",
      title: "Cleaning",
      why: "Flux residue comes off before coating, or the coating won't stick.",
      refs: [],
      checks: ["Ionic contamination (ROSE)"],
      machine: "pcb-cleaning-machine",
      article: "post-assembly-processes",
      where: locate(input.lines, thtLine, "WASHER"),
    });

  add({
    key: "depanel",
    stage: "test",
    title: "Depaneling",
    why: "Boards are built in panels and separated after soldering, without stressing the parts near the edge.",
    refs: [],
    checks: ["No cracked MLCCs near the break line"],
    machine: "depaneling-machine",
    article: "post-assembly-processes",
    where: locate(input.lines, boxLine, "DEPANELER"),
  });
  // Electrical test comes before any coating: probes cannot reach test points through the coat.
  const ict = input.stage === "PRODUCTION" && input.buildQty >= 1000;
  add({
    key: ict ? "ict" : "flying-probe",
    stage: "test",
    title: ict ? "In-circuit test" : "Flying probe test",
    why: `${ict ? `A bed-of-nails fixture pays for itself over ${input.buildQty.toLocaleString("en-IN")} boards.` : "No fixture to build — right for NPI and short runs."}${input.coating ? " Done before coating, while the test points are bare." : ""}`,
    refs: [],
    checks: ["Opens and shorts", "Passive values", "Diode and transistor orientation"],
    machine: ict ? "ict-tester" : "flying-probe-tester",
    article: "test-strategy",
    where: locate(input.lines, thtLine, ict ? "ICT" : "FLYING_PROBE"),
  });
  const programmable = placed.filter((p) => PROGRAMMABLE.has(p.category ?? ""));
  if (programmable.length)
    add({
      key: "program",
      stage: "test",
      title: "Firmware programming",
      why: `${refList(refs(programmable), 4)} get${programmable.length === 1 ? "s" : ""} the released firmware and a serial number.`,
      refs: refs(programmable),
      checks: ["Firmware version and checksum logged per serial"],
      machine: "functional-tester",
      article: "test-strategy",
      where: locate(input.lines, boxLine, (input.lines ?? []).some((l) => l.machines.some((m) => m.type === "PROGRAMMER")) ? "PROGRAMMER" : "FCT"),
    });
  add({
    key: "fct",
    stage: "test",
    title: "Functional test",
    why: "The board is powered and exercised against the customer's test spec; results are stored per serial.",
    refs: [],
    checks: ["Power rails and current draw", "Interfaces and I/O", "Pass/fail per serial"],
    machine: "functional-tester",
    article: "test-strategy",
    where: locate(input.lines, boxLine, "FCT"),
  });

  if (input.coating) {
    const keep = placed.filter(isKeepOut);
    if (keep.length)
      add({
        key: "mask-coat",
        stage: "post",
        title: "Masking before coating",
        why: `${keep.length} part${keep.length === 1 ? "" : "s"} must stay free of coating — ${refList(refs(keep))}: mating faces, moving contacts and sensing openings are covered with peelable mask, tape or boots.`,
        refs: refs(keep),
        checks: ["Every keep-out covered per the masking drawing", "Mask edges sealed so coating cannot creep under"],
        machine: null,
        article: "post-assembly-processes",
        where: locate(input.lines, thtLine, "MASKING_STATION"),
        masking: { needed: true, what: refList(refs(keep)) },
      });
    add({
      key: "coat",
      stage: "post",
      title: `Conformal coating (${input.coating})`,
      why: keep.length ? "Protects against moisture and contamination; the masked parts stay clear." : "Protects against moisture and contamination. Nothing on this board has to be kept clear, so it is coated without masking.",
      refs: [],
      checks: ["Coverage and thickness under UV light", "Keep-out areas clean"],
      machine: "conformal-coating-machine",
      article: "post-assembly-processes",
      where: locate(input.lines, thtLine, "CONFORMAL_COATER"),
      masking: keep.length ? { needed: true, what: `${keep.length} keep-out part${keep.length === 1 ? "" : "s"} masked (step before)` } : { needed: false, what: "no masking: no connectors, switches, relays or sensors to keep clear" },
    });
    if (keep.length)
      add({
        key: "demask-coat",
        stage: "post",
        title: "De-masking and coating inspection",
        why: "The masks come off once the coating has cured; the keep-outs are checked clean and the coating edge intact.",
        refs: refs(keep),
        checks: ["No coating on contacts or openings", "No torn coating at the mask edge", "Touch-up logged"],
        machine: null,
        article: "post-assembly-processes",
        where: locate(input.lines, thtLine, "MASKING_STATION"),
      });
  }

  if (input.enclosure) {
    add({
      key: "assemble",
      stage: "box",
      title: "Mechanical assembly",
      why: `The PCBA goes into the ${input.enclosure.mpn} with torque-controlled screws.`,
      refs: [],
      checks: ["Screw torque logged", "No trapped wires or stressed connectors"],
      watch: input.enclosure.kitGaps ? `${input.enclosure.kitGaps} box-build kit item${input.enclosure.kitGaps === 1 ? "" : "s"} not on the BoM yet.` : null,
      machine: null,
      article: "box-build-process",
      where: locate(input.lines, boxLine, "SCREWDRIVER_STATION"),
    });
    add({
      key: "system-test",
      stage: "box",
      title: "Final system test",
      why: "The closed product is tested once more as the customer will use it.",
      refs: [],
      checks: ["Functional test in the box", ...(input.stage === "PRODUCTION" ? ["Burn-in sample per lot"] : [])],
      machine: input.stage === "PRODUCTION" ? "burn-in-chamber" : "functional-tester",
      article: "final-test-packaging",
      where: locate(input.lines, boxLine, input.stage === "PRODUCTION" && (input.lines ?? []).some((l) => l.machines.some((m) => m.type === "BURN_IN")) ? "BURN_IN" : "FCT"),
    });
  }
  add({
    key: "inspect",
    stage: "ship",
    title: "Final inspection",
    why: `Outgoing quality check of the finished ${input.enclosure ? "product" : "boards"} against IPC-A-610 and the customer's drawing, on a sample per lot, before anything is packed.`,
    refs: [],
    checks: ["Workmanship to IPC-A-610 class", "Labels, serials and test records complete", "Lot accepted or held"],
    machine: null,
    article: "final-test-packaging",
    where: locate(input.lines, boxLine, "INSPECTION_STATION"),
  });
  add({
    key: "pack",
    stage: "ship",
    title: input.enclosure ? "Labelling and packing" : "ESD packing",
    why: input.enclosure ? "Product label with serial, then drop-tested packaging." : "Boards ship in ESD-safe bags or trays with humidity control where needed.",
    refs: [],
    checks: ["Label content and serial", "Packing per customer spec"],
    machine: "laser-marking-machine",
    article: input.enclosure ? "final-test-packaging" : "esd-control",
    where: locate(input.lines, boxLine, "PACKING"),
  });
  add({
    key: "dispatch",
    stage: "ship",
    title: "Dispatch",
    why: "Packing list, certificate of conformance, test summary and invoice go with the shipment; the carrier and tracking are recorded.",
    refs: [],
    checks: ["Quantity against the order", "CoC and test summary attached", "E-way bill and invoice"],
    machine: null,
    article: "final-test-packaging",
    where: locate(input.lines, boxLine, "DISPATCH"),
  });
  return steps;
}
