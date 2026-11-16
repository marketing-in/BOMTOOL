import { describe, expect, it } from "vitest";
import { splitMarking } from "@/lib/board/marking";

describe("splitMarking", () => {
  it("keeps short part numbers on one line", () => {
    expect(splitMarking("LM358DR")).toEqual(["LM358DR"]);
  });

  it("breaks long ones where letters meet digits, near the middle", () => {
    expect(splitMarking("TPS563200DDCR")).toEqual(["TPS563200", "DDCR"]);
    expect(splitMarking("STM32G431CBU6")).toEqual(["STM32G", "431CBU6"]);
  });

  it("drops a separator left at the start of the second line", () => {
    expect(splitMarking("AMS1117-3.3")).toEqual(["AMS1117", "3.3"]);
  });

  it("falls back to the middle when there is no boundary near it", () => {
    expect(splitMarking("ABCDEFGHIJKLMN")).toEqual(["ABCDEFG", "HIJKLMN"]);
  });
});
