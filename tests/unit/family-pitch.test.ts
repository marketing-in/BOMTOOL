import { describe, expect, it } from "vitest";
import { bodyFor, familyPitch } from "@/lib/board/bodies";
import { bodyFromFootprint } from "@/lib/board/find-parts";
import { padsFor } from "@/lib/board/artwork";

describe("pin pitch when nothing states one", () => {
  it("knows the usual pitch of each family", () => {
    expect([familyPitch("LGA24"), familyPitch("QFN-32"), familyPitch("LQFP-64"), familyPitch("TSSOP-20"), familyPitch("SOIC-8"), familyPitch("C_0402")]).toEqual([0.5, 0.5, 0.5, 0.65, 1.27, null]);
  });

  it("puts an LGA's pads under its body, not 1.27 mm apart (the TPMS sensor on the fdgd board)", () => {
    const b = bodyFromFootprint("LGA24", "chip");
    expect(b).toMatchObject({ kind: "leadless", pins: 24, pitch: 0.5 });
    const xs = padsFor(b).map((p) => Math.abs(p.x));
    // Every pad within the body's half-length plus a pad.
    expect(Math.max(...xs)).toBeLessThanOrEqual(b.length / 2 + 0.6);
  });

  it("keeps a stated pitch, and a package's own pitch wins", () => {
    expect(bodyFromFootprint("Header 1x04 2.54mm", "connector").pitch).toBe(2.54);
    expect(bodyFor({ family: "QFN", pinCount: 32, lengthMm: 5, widthMm: 5, heightMm: 0.9, pitchMm: 0.4 }).pitch).toBe(0.4);
    expect(bodyFor({ family: "QFN", pinCount: 32, lengthMm: 5, widthMm: 5, heightMm: 0.9 }).pitch).toBe(0.5);
  });
});
