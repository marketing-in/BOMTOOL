import { expect, test, type Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import * as XLSX from "xlsx";

const PASSWORD = process.env.SEED_USER_PASSWORD ?? "ChangeMe!2026";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("purchasing@ems.local");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 90_000 });
}

// ── A made-up job pack, shaped like the real thing: a workbook with the BoM, a CAD placement report and a
// not-fitted list, and a fabricator's panel of two boards with extension-less file names and a Gerber-format drill.

function workbook(): Buffer {
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: string[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  add("CUSTOMER BOM", [
    ["E2E SENSOR BOARD REV 1.0"],
    ["BOM"],
    ["SI.NO.", "ME-Code", "Part", "MFR P No", "Package", "Reference", "Quantity"],
    ["1", "ME20001", "CAP CER 100nF, 50V, X7R, 10%, 0402", "GRM155R71A104JA01D / CL05B104KB5NNNC", "C_0402", "C1", "1"],
    ["2", "ME20002", "RES 10K, 1%, 0402, SMD", "RC0402FR-0710KL", "R_0402", "R1", "1"],
    ["3", "ME20003", "PCB, E2E SENSOR BOARD, REV 1.0, FR4, Green Mask, White Legend, 2Layer, 1.6mmT, 35micron, ENIG, RoHs, 20 x 10 Sq.mm", "", "", "", "1"],
  ]);
  add("XY", [
    ["Placed Component Report"],
    ["Total Placed Components: 3"],
    ["REFDES", "COMP_DEVICE_TYPE", "COMP_VALUE", "COMP_TOL", "SYM_NAME", "SYM_X", "SYM_Y", "SYM_ROTATE", "SYM_MIRROR"],
    ["C1", "CAP_C_0402_100NF", "100nF", "", "C_0402", "5", "5", "0", "NO"],
    ["R1", "RES_R_0402_4K7", "4K7", "", "R_0402", "10", "5", "0", "NO"],
    ["R2", "RES_R_0402", "10K", "", "R_0402", "15", "5", "0", "NO"],
  ]);
  add("TOP DNP", [["R2", "NO"]]);
  add("TOP LOAD", [
    ["Item,Number", "Item,Description", "RefDes", "X", "Y", "R"],
    ["GRM155R71A104JA01D / CL05B104KB5NNNC", "CAP CER 100nF", "C1", "5", "5", "0"],
    ["RC0402FR-0710KL", "RES 10K", "R1", "10", "5", "0"],
  ]);
  return Buffer.from(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

const co = (mm: number) => String(Math.round(mm * 1e6));
const gerber = (layer: string, apertures: string[], body: string[]) => [`G04 -- layer:${layer}*`, "%FSLAX46Y46*%", "%MOMM*%", ...apertures, "G01*", "%LPD*%", ...body, "M02*", ""].join("\n");
const flash = (d: number, x: number, y: number) => [`D${d}*`, `X${co(x)}Y${co(y)}D03*`];
const box = (d: number, x: number, y: number, w: number, h: number) => [`D${d}*`, `X${co(x)}Y${co(y)}D02*`, `X${co(x + w)}Y${co(y)}D01*`, `X${co(x + w)}Y${co(y + h)}D01*`, `X${co(x)}Y${co(y + h)}D01*`, `X${co(x)}Y${co(y)}D01*`];

function panelZip(): Buffer {
  const boards = [0, 22]; // two boards of 20 × 10 mm, 2 mm apart
  const pads = boards.flatMap((ox) => [4.5, 5.5, 9.5, 10.5, 14.5, 15.5].flatMap((x) => flash(10, ox + x, 5)));
  const vias = boards.flatMap((ox) => flash(11, ox + 17, 8));
  const bites = [20.3, 21.7].flatMap((x) => [2, 3, 7, 8].flatMap((y) => flash(11, x, y)));
  return Buffer.from(
    zipSync({
      "panel/tl": strToU8(gerber("tl", ["%ADD10R,0.6X0.5*%", "%ADD11C,0.6*%"], [...pads, ...vias])),
      "panel/ts": strToU8(gerber("ts", ["%ADD10R,0.7X0.6*%"], pads)),
      "panel/ko": strToU8(gerber("ko", ["%ADD10C,0.15*%"], boards.flatMap((ox) => box(10, ox, 0, 20, 10)))),
      "panel/drl": strToU8(gerber("drl", ["%ADD10C,0.3*%", "%ADD11C,0.5*%"], [...boards.flatMap((ox) => flash(10, ox + 17, 8)), ...bites])),
    }),
  );
}

test("A job pack: every sheet is read, the panel is cut to one board, and the engineer's checks show", async ({ page }) => {
  test.setTimeout(600_000);
  await login(page);
  await page.goto("/boms/new");
  await page.getByLabel("BoM file").setInputFiles({ name: "sensor-pack.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: workbook() });
  await page.getByLabel("Board files").setInputFiles({ name: "sensor_panel.zip", mimeType: "application/zip", buffer: panelZip() });
  await page.getByLabel("Customer").selectOption({ label: "Nimbus IoT Pvt Ltd" });
  await page.getByLabel("Project / product").fill(`E2E job pack ${Date.now().toString(36).slice(-5)}`);
  await page.getByLabel("Assembly / BoM name").fill("Sensor board");
  await page.getByLabel("Revision").fill("1.0");
  await page.getByRole("button", { name: "Continue to column mapping" }).click();
  await expect(page.getByRole("heading", { name: /Map columns/ })).toBeVisible({ timeout: 240_000 });

  // Every sheet is named, the bare board's line is read, the not-fitted part is added, the panel is recognised.
  const read = page.getByRole("region", { name: "Read from the file" });
  await expect(read.getByText("Placement report")).toBeVisible();
  await expect(read.getByText("Not fitted · top")).toBeVisible();
  await expect(read.getByText("Load list · top")).toBeVisible();
  await expect(read.getByText(/2 layers · FR-4 · 1\.6 mm · 1 oz copper · ENIG · green mask · white legend · 20 × 10 mm/)).toBeVisible();
  await expect(read.getByText(/added as not-fitted lines/)).toBeVisible();
  await expect(read.getByText("These Gerbers are a panel of 2 boards (2 × 1). One board is shown.")).toBeVisible();
  await expect(read.getByText("The sheets agree with each other.")).toBeVisible();
  // The board files were read as one 20 × 10 mm board, not as skipped files.
  await expect(page.getByText(/Board files read:/)).toContainText("20.0 × 10.0 mm");

  // The header under the title rows, and this customer's column names.
  await expect(page.getByLabel("Field for column ME-Code")).toHaveValue("customerPn");
  await expect(page.getByLabel("Field for column Part", { exact: true })).toHaveValue("description");
  await expect(page.getByLabel("Field for column MFR P No")).toHaveValue("mpn");

  await page.getByRole("button", { name: "Match & score BoM" }).click();
  await expect(page).toHaveURL(/\/match$/, { timeout: 240_000 });
  // Footprints agree; R1's value does not: 10 kΩ in the BoM, 4.7 kΩ on the board. A wrong value is a stop.
  await expect(page.getByRole("heading", { name: "BoM and board do not match" })).toBeVisible();
  await expect(page.getByText("value: BoM 10 kΩ, board 4.7 kΩ", { exact: true })).toBeVisible();
  const id = page.url().match(/\/boms\/([a-z0-9]+)\//)![1];

  // The BoM: two fitted lines and the not-fitted one; the bare board is not a line.
  await page.goto(`/boms/${id}`);
  const grid = page.getByRole("table", { name: "BoM lines" });
  await expect(grid.locator("tbody > tr")).toHaveCount(3);
  // R2 is on the board and on the not-fitted list: it is a line, marked DNP, with nothing to buy.
  await expect(grid.locator("tbody > tr").nth(2)).toContainText("DNP");
  // The 100 nF "50 V" line names a 10 V part: said on the line.
  await page.getByRole("radio", { name: /Scrub issues/ }).click();
  await expect(grid.locator("tbody > tr")).toHaveCount(1);

  // The bare-board step says what the Gerbers came as.
  await page.goto(`/boms/${id}/build/board`);
  const panel = page.getByRole("region", { name: "The panel these Gerbers came as" });
  await expect(panel.getByText("Tabs with mouse bites")).toBeVisible({ timeout: 120_000 });
  await expect(panel.getByRole("img", { name: "Panel of 2 boards, 2 across and 1 up" })).toBeVisible();
});
