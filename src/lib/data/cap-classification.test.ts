import { describe, it, expect } from "vitest";
import {
  classifyUniverse,
  rankToCap,
  LARGE_CAP_MAX_RANK,
  MID_CAP_MAX_RANK,
  type CapInput,
} from "./cap-classification";

describe("rankToCap", () => {
  it("applies the documented rank bands", () => {
    expect(rankToCap(1)).toBe("large");
    expect(rankToCap(LARGE_CAP_MAX_RANK)).toBe("large");
    expect(rankToCap(LARGE_CAP_MAX_RANK + 1)).toBe("mid");
    expect(rankToCap(MID_CAP_MAX_RANK)).toBe("mid");
    expect(rankToCap(MID_CAP_MAX_RANK + 1)).toBe("small");
  });
});

describe("classifyUniverse", () => {
  it("ranks by descending market cap and assigns bands", () => {
    const input: CapInput[] = [
      { stockId: "a", marketCapCrore: 500000 },
      { stockId: "b", marketCapCrore: 100000 },
      { stockId: "c", marketCapCrore: 900000 },
    ];
    const out = classifyUniverse(input);
    const byId = new Map(out.map((r) => [r.stockId, r]));
    expect(byId.get("c")!.rank).toBe(1); // largest first
    expect(byId.get("a")!.rank).toBe(2);
    expect(byId.get("b")!.rank).toBe(3);
    // Small universe → all within top 100 → all large.
    expect(byId.get("c")!.cap).toBe("large");
  });

  it("classifies a stock with no market cap as null (never guessed)", () => {
    const input: CapInput[] = [
      { stockId: "has", marketCapCrore: 100000 },
      { stockId: "none", marketCapCrore: null },
    ];
    const out = classifyUniverse(input);
    const none = out.find((r) => r.stockId === "none")!;
    expect(none.cap).toBeNull();
    expect(none.rank).toBeNull();
  });

  it("ineligible (no market cap) stocks do not shift ranks of eligible ones", () => {
    const withNulls: CapInput[] = [
      { stockId: "x", marketCapCrore: 300000 },
      { stockId: "nullcap", marketCapCrore: null },
      { stockId: "y", marketCapCrore: 200000 },
    ];
    const out = classifyUniverse(withNulls);
    const byId = new Map(out.map((r) => [r.stockId, r]));
    expect(byId.get("x")!.rank).toBe(1);
    expect(byId.get("y")!.rank).toBe(2);
  });

  it("assigns large/mid/small across a large synthetic universe", () => {
    // 300 stocks with strictly descending caps → ranks 1..300.
    const input: CapInput[] = Array.from({ length: 300 }, (_, i) => ({
      stockId: `s${String(i).padStart(3, "0")}`,
      marketCapCrore: 1_000_000 - i, // s000 largest
    }));
    const out = classifyUniverse(input);
    const byId = new Map(out.map((r) => [r.stockId, r]));
    expect(byId.get("s000")!.cap).toBe("large"); // rank 1
    expect(byId.get("s099")!.cap).toBe("large"); // rank 100
    expect(byId.get("s100")!.cap).toBe("mid"); // rank 101
    expect(byId.get("s249")!.cap).toBe("mid"); // rank 250
    expect(byId.get("s250")!.cap).toBe("small"); // rank 251
    expect(byId.get("s299")!.cap).toBe("small"); // rank 300

    const counts = out.reduce(
      (acc, r) => {
        if (r.cap) acc[r.cap] += 1;
        return acc;
      },
      { large: 0, mid: 0, small: 0 },
    );
    expect(counts.large).toBe(100);
    expect(counts.mid).toBe(150);
    expect(counts.small).toBe(50);
  });

  it("treats zero / negative / NaN market cap as unclassifiable", () => {
    const input: CapInput[] = [
      { stockId: "zero", marketCapCrore: 0 },
      { stockId: "neg", marketCapCrore: -5 },
      { stockId: "nan", marketCapCrore: Number.NaN },
      { stockId: "ok", marketCapCrore: 123 },
    ];
    const out = classifyUniverse(input);
    const byId = new Map(out.map((r) => [r.stockId, r]));
    expect(byId.get("zero")!.cap).toBeNull();
    expect(byId.get("neg")!.cap).toBeNull();
    expect(byId.get("nan")!.cap).toBeNull();
    expect(byId.get("ok")!.rank).toBe(1);
  });
});
