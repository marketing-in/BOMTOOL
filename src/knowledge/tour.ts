/**
 * The application tour: the tool in the order a job moves through the factory, from the customer's files to the
 * shipped lot. Shown at /tour. `href` may contain {bom} — replaced with a BoM on file so the stop opens a real page.
 */

export type TourStop = {
  key: string;
  title: string;
  /** Who mostly uses it. */
  who: string;
  /** What the page is for, in one or two sentences. */
  what: string;
  /** What to try while you are there. */
  tryIt: string[];
  href: string;
  /** Sidebar entry that leads to it. */
  menu: string;
};

export type TourChapter = { key: string; title: string; summary: string; stops: TourStop[] };

export const TOUR: TourChapter[] = [
  {
    key: "start",
    title: "1 · Bring the customer's product in",
    summary: "Everything starts from what the customer sent: a BoM, Gerbers, or both.",
    stops: [
      {
        key: "home",
        title: "Home",
        who: "Everyone",
        what: "The day at a glance: a ring per line for clear-to-build, each BoM with its own board and a bar of its ten steps, and the alerts that need attention.",
        tryIt: ["Press “Next” on a BoM to go straight to the step it is waiting on", "Switch the currency in the top bar: INR, USD, EUR"],
        href: "/",
        menu: "Overview → Home",
      },
      {
        key: "upload-bom",
        title: "Upload the BoM and the Gerbers",
        who: "Purchasing, engineering",
        what: "Drop the BoM (Excel or CSV) and the Gerber files side by side. Columns are recognised, lines are matched to parts, and the board is read from the Gerbers. Either file alone also works. A workbook with several sheets is read whole — placement report, load lists, not-fitted lists — and Gerbers of a whole panel are cut down to one board.",
        tryIt: ["Upload one of the files in samples/", "Fix a column on the Remap page if it was read wrongly"],
        href: "/boms/new",
        menu: "Sourcing → BoMs → Upload BoM",
      },
      {
        key: "footprint-match",
        title: "Footprint match",
        who: "Engineering, purchasing",
        what: "Step 3 of every BoM: each designator's package in the BoM against the footprint on the board. A ring shows the share that match, and the board is drawn with every part coloured by its result.",
        tryIt: ["Hover a dot on the board to see the designator and why", "Open the folded list of matching designators"],
        href: "/boms/{bom}/match",
        menu: "BoM → 3 · Footprint match",
      },
      {
        key: "upload-gerber",
        title: "Quick look at Gerbers",
        who: "Engineering",
        what: "Drop the Gerber and drill files with no BoM at all: the board appears in 3D with the components read off it, joints, paste and bare-board prices.",
        tryIt: ["Upload samples/board/GW-200", "Press “Quote this board” to turn it into a BoM"],
        href: "/viewer/new",
        menu: "Engineering → PCB / PCBA viewer",
      },
    ],
  },
  {
    key: "understand",
    title: "2 · Understand the product",
    summary: "Before quoting: what it is, what is risky, and what is in short supply.",
    stops: [
      {
        key: "bom",
        title: "The BoM",
        who: "Purchasing, engineering",
        what: "Every line with stock, price, lead time, lifecycle and five scores. The strip on top takes you to every other view of the same product and back.",
        tryIt: ["Sort by the worst score", "Open a red line to see why"],
        href: "/boms/{bom}",
        menu: "Sourcing → BoMs",
      },
      {
        key: "reverse",
        title: "Reverse engineering",
        who: "Engineering, sales",
        what: "What the product is and how it works, read from its parts: functional blocks, interfaces, supply rails and what a rebuild still needs from the customer.",
        tryIt: ["Open a block to see its parts", "Read “What it takes to rebuild it”"],
        href: "/boms/{bom}/reverse",
        menu: "Engineering → Reverse engineering",
      },
      {
        key: "analysis",
        title: "Deep analysis",
        who: "Purchasing",
        what: "Is the BoM ready, where the supply comes from, which lines carry the risk, where the money goes and what to do first.",
        tryIt: ["Read the actions at the top", "Open Supply chain for the same BoM"],
        href: "/boms/{bom}/analysis",
        menu: "BoM → Analysis",
      },
      {
        key: "viewer",
        title: "The product in 3D",
        who: "Engineering, production",
        what: "Bare board, assembled board and enclosure. Click a part to see its stock and risk; switch on the risk overlay. Layers pulls the board apart with the components floating above it.",
        tryIt: ["Open Layers and drag the explode slider", "Open the SMT line to watch the board run"],
        href: "/boms/{bom}/viewer",
        menu: "BoM → 3D view",
      },
    ],
  },
  {
    key: "quote",
    title: "3 · Quote it",
    summary: "Four steps: bare board, components, box, price.",
    stops: [
      {
        key: "build-board",
        title: "Bare board",
        who: "Purchasing",
        what: "Fabricators on file and online services, with a landed price per quantity, or type in the fab's own quote.",
        tryIt: ["Choose a fab", "Compare the price at each quantity"],
        href: "/boms/{bom}/build/board",
        menu: "BoM → Build & quote",
      },
      {
        key: "build-parts",
        title: "Components and how to source them",
        who: "Purchasing",
        what: "Source the whole BoM by our own order, lowest price, shortest lead time or lowest risk — then change single lines if needed.",
        tryIt: ["Compare the four sourcing options", "Pick another source for one line"],
        href: "/boms/{bom}/build/parts",
        menu: "BoM → Build & quote → Components",
      },
      {
        key: "build-quote",
        title: "The quote",
        who: "Sales, purchasing",
        what: "Price per board and per lot at up to four quantities, with conversion cost from the process route, NRE, margin and GST. Issue a numbered quote or export Excel.",
        tryIt: ["Change the quantities", "Open the print preview"],
        href: "/boms/{bom}/build/quote",
        menu: "BoM → Build & quote → Quote",
      },
    ],
  },
  {
    key: "build",
    title: "4 · Can we build it?",
    summary: "The shop-floor view of the same product.",
    stops: [
      {
        key: "feasibility",
        title: "Feasibility study",
        who: "Engineering, production, quality",
        what: "The answer on top beside the customer's own board. Our lines are drawn as lanes of station icons and the whole process as a chain of steps — tap one to see its machine. Nine gates are signed in order; pins, paste, shifts and cost are folded underneath.",
        tryIt: ["Tap a station that is amber to read why", "Open “Solder paste and solder” to find the paste per board and per panel"],
        href: "/boms/{bom}/feasibility",
        menu: "BoM → 4 · Can we build it?",
      },
      {
        key: "route",
        title: "Process route",
        who: "Production",
        what: "Every step from bare board to packed box as a chain of icons, placed on our lines and machines. Each step opens to why this product needs it, the parts it handles and what is checked.",
        tryIt: ["Open a step to see the parts it handles", "Press “Show in 3D” on a step"],
        href: "/boms/{bom}/route",
        menu: "BoM → 9 · Process route",
      },
    ],
  },
  {
    key: "buy",
    title: "5 · Buy the parts",
    summary: "From shortage to purchase order.",
    stops: [
      {
        key: "parts",
        title: "Parts catalogue",
        who: "Everyone",
        what: "Every part with offers, stock in our stores, alternates, price history and risk. The search box in the top bar lands here.",
        tryIt: ["Search an MPN", "Open a part and look at its alternates"],
        href: "/parts",
        menu: "Sourcing → Parts catalogue",
      },
      {
        key: "sourcing",
        title: "Sourcing & RFQ",
        who: "Purchasing",
        what: "Distributor health, the cart, requests for quotation, purchase-order drafts, supplier price lists and landed-cost checks.",
        tryIt: ["Add a BoM's shortages to the cart", "Raise an RFQ from the cart"],
        href: "/sourcing",
        menu: "Sourcing → Sourcing & RFQ",
      },
      {
        key: "inventory",
        title: "Inventory",
        who: "Stores",
        what: "Lots in our stores with date codes, reservations, movements and excess stock that can be offered.",
        tryIt: ["Find a part's lots and their bins"],
        href: "/inventory",
        menu: "Factory → Inventory",
      },
    ],
  },
  {
    key: "run",
    title: "6 · Run it in the factory",
    summary: "Lines, work orders and the schedule.",
    stops: [
      {
        key: "operations",
        title: "Operations",
        who: "Planning, production",
        what: "The four lines at a glance, what is clear to build and what is waiting for parts.",
        tryIt: ["Open a work order", "Check clear-to-build for a BoM"],
        href: "/operations",
        menu: "Factory → Operations",
      },
      {
        key: "schedule",
        title: "Schedule and lines",
        who: "Planning",
        what: "Work orders on each line by shift, and each line's machines and capability.",
        tryIt: ["See what a line can build: smallest chip, finest pitch"],
        href: "/operations/schedule",
        menu: "Factory → Schedule · Lines",
      },
    ],
  },
  {
    key: "know",
    title: "7 · Reference and compliance",
    summary: "What the team looks things up in.",
    stops: [
      {
        key: "compliance",
        title: "Compliance",
        who: "Quality",
        what: "RoHS, REACH, country of origin, HSN codes and estimated duty for each BoM.",
        tryIt: ["Export the compliance sheet"],
        href: "/compliance",
        menu: "Engineering → Compliance",
      },
      {
        key: "knowledge",
        title: "Knowledge, dictionary and directory",
        who: "Everyone",
        what: "How boards and assemblies are made, what each kind of component is, and the fabs, box makers and vendors we work with.",
        tryIt: ["Look up a component in the dictionary", "Open the directory of PCB fabs"],
        href: "/knowledge",
        menu: "Engineering → Knowledge · Component dictionary · Directory",
      },
    ],
  },
];

export const tourStops = () => TOUR.flatMap((c) => c.stops);
