/**
 * What each kind of machine on an SMT line does to the board, step by step, in plain words: for the machine sheet
 * on the Lines page, the walk along the line and the one-machine process view. Pure data and one lookup.
 *
 * `share` is the part of one board's time in the machine that the step takes (the shares of a process add up to 1):
 * the 3D view lights the step the machine is at.
 */

export type ProcessStep = { title: string; text: string; share: number };

export type MachineProcess = {
  /** One line for the whole-line list: what the board gains here. */
  short: string;
  /** What the machine is for and why it matters. */
  what: string;
  steps: ProcessStep[];
};

const IN = (text = "The conveyor brings the board in, stops it and clamps it by its edges."): ProcessStep => ({ title: "Board in", text, share: 0.2 });
const OUT = (text: string): ProcessStep => ({ title: "Board out", text, share: 0.2 });

const BY_TYPE: Record<string, MachineProcess> = {
  LASER_MARKER: {
    short: "A serial number or QR code is lasered onto the bare board.",
    what: "Burns a serial number or QR code into each bare board before anything else happens to it, so every later step, test and repair can be traced back to this one board.",
    steps: [
      IN(),
      { title: "Find", text: "A camera finds the board's marks and the spot where the code goes.", share: 0.15 },
      { title: "Mark", text: "The laser writes the QR code or dot-matrix serial into the solder mask.", share: 0.3 },
      { title: "Verify", text: "The code is read back to make sure it scans.", share: 0.15 },
      OUT("The marked board goes on to the printer."),
    ],
  },
  STENCIL_PRINTER: {
    short: "Solder paste is printed onto the pads through a stencil.",
    what: "Prints solder paste onto the board's pads through a steel stencil. Most soldering defects start here, so paste volume and alignment matter more than speed.",
    steps: [
      IN("The conveyor brings the bare board in and clamps it under the stencil."),
      { title: "Align", text: "A camera finds the fiducial marks on the board and on the stencil and lines the two up.", share: 0.15 },
      { title: "Print", text: "The squeegee wipes paste across the stencil; the paste goes through its openings onto the pads.", share: 0.35 },
      { title: "Release", text: "The board drops away from the stencil and leaves the paste deposits standing.", share: 0.1 },
      OUT("The printed board goes on to paste inspection."),
    ],
  },
  SPI: {
    short: "Every paste deposit is measured in 3D before parts go on.",
    what: "Measures every paste deposit in 3D — height, area, volume, offset — before any part is placed. A bad print is caught here, while the board can still be washed and printed again.",
    steps: [
      IN(),
      { title: "Scan", text: "The camera head moves over the board field by field, projecting stripes of light to read the height of each deposit.", share: 0.4 },
      { title: "Judge", text: "Each pad's volume, area and position is compared with its limits: too little, too much or bridged paste fails.", share: 0.2 },
      OUT("Good boards go on to placement; a failed board stops for the operator."),
    ],
  },
  PICK_AND_PLACE: {
    short: "Parts are picked from the feeders and placed onto the paste.",
    what: "Picks parts from tape feeders and trays with vacuum nozzles and sets them onto the paste. This machine decides the line's speed and the smallest part the line can build.",
    steps: [
      IN(),
      { title: "Pick", text: "The head picks parts from the feeders, several nozzles at a time.", share: 0.2 },
      { title: "Check", text: "A camera looks at every part on its nozzle: the right part, the right way round, exactly where it sits.", share: 0.15 },
      { title: "Place", text: "Each part is set onto its pads in the paste, corrected by what the camera saw.", share: 0.25 },
      OUT("The populated board goes on towards the oven."),
    ],
  },
  REFLOW_OVEN: {
    short: "The paste is melted into solder joints in the oven.",
    what: "Melts the paste into solder joints. The board rides a chain through heated zones; the temperature profile — how fast it heats, how hot it gets, for how long — decides the quality of every joint.",
    steps: [
      { title: "Preheat", text: "The first zones warm the board evenly, so nothing cracks or warps.", share: 0.3 },
      { title: "Soak", text: "The temperature is held while the flux cleans the pads and the whole board evens out.", share: 0.25 },
      { title: "Reflow", text: "The peak zones take the paste above its melting point: the solder wets the pads and the leads.", share: 0.2 },
      { title: "Cool", text: "The cooling zones freeze the joints quickly, for a fine and strong grain.", share: 0.25 },
    ],
  },
  AOI: {
    short: "Every part and joint is photographed and checked.",
    what: "Photographs the soldered board and checks every part and every joint: missing, wrong, shifted, reversed, lifted, bridged. It is the line's last automatic check.",
    steps: [
      IN(),
      { title: "Capture", text: "The camera head steps over the board under coloured light from several angles.", share: 0.35 },
      { title: "Compare", text: "Each part and joint is compared with the programmed good one.", share: 0.25 },
      OUT("Passed boards go on; a failed board is flagged for the repair station."),
    ],
  },
};

const CONVEYOR: Record<"link" | "inspection" | "cooling", MachineProcess> = {
  link: {
    short: "The board is carried to the next machine.",
    what: "Carries boards from one machine to the next, and holds one as a buffer while the next machine is still busy.",
    steps: [
      { title: "Receive", text: "The machine before it hands the board over when this conveyor is free.", share: 0.3 },
      { title: "Carry", text: "The belts carry the board along at the line's height.", share: 0.4 },
      { title: "Hand over", text: "The board waits at the end until the next machine asks for it.", share: 0.3 },
    ],
  },
  inspection: {
    short: "The operator can look the placed board over before it is soldered.",
    what: "A lit stop before the oven where the operator can look over the placed parts: the last chance to straighten or replace a part by hand before it is soldered.",
    steps: [
      { title: "Receive", text: "The placed board rolls in under the lamp.", share: 0.3 },
      { title: "Look", text: "The operator checks polarity marks, tall parts and anything the mounter flagged.", share: 0.4 },
      { title: "Hand over", text: "The board goes on into the oven.", share: 0.3 },
    ],
  },
  cooling: {
    short: "Fans cool the hot board after the oven.",
    what: "Brings the hot board down to handling temperature with fans after the oven, before it is inspected or touched.",
    steps: [
      { title: "Receive", text: "The board comes out of the oven still hot.", share: 0.3 },
      { title: "Cool", text: "Fans above and below the belt blow room air over it.", share: 0.4 },
      { title: "Hand over", text: "The cooled board goes on to inspection.", share: 0.3 },
    ],
  },
};

const OTHER: MachineProcess = {
  short: "The board is worked on here.",
  what: "A station of the line. Its process steps are not on file yet.",
  steps: [IN(), { title: "Work", text: "The machine does its work on the board.", share: 0.6 }, OUT("The board goes on to the next machine.")],
};

/** The process of one machine, by its type (and, for conveyors, by what its model says it is). */
export function processOf(type: string, model: string): MachineProcess {
  if (BY_TYPE[type]) return BY_TYPE[type];
  if (/conveyor/i.test(model)) return CONVEYOR[/inspection/i.test(model) ? "inspection" : /cool/i.test(model) ? "cooling" : "link"];
  return OTHER;
}

/** Which step a machine is at, `frac` (0–1) of the way through one board. */
export function stepAt(steps: ProcessStep[], frac: number): number {
  let sum = 0;
  for (let i = 0; i < steps.length; i++) {
    sum += steps[i].share;
    if (frac < sum) return i;
  }
  return steps.length - 1;
}
