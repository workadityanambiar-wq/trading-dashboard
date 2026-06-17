/**
 * Unit tests for pure formatting utility functions.
 *
 * formatPct: adds sign prefix, converts decimal to percentage
 * formatPrice: tier-based decimal precision (4dp < $10, 2dp $10–$1000, locale ≥ $1000)
 * formatVolume: abbreviates to K / M / B with one decimal place
 */
import { describe, it, expect } from "vitest";
import { formatPct, formatPrice, formatVolume } from "./utils";

// ── formatPct ─────────────────────────────────────────────────────────────────

describe("formatPct", () => {
  it("positive value gets + prefix", () => {
    expect(formatPct(0.05)).toBe("+5.00%");
  });

  it("negative value keeps - sign without extra +", () => {
    expect(formatPct(-0.123)).toBe("-12.30%");
  });

  it("zero gets + prefix", () => {
    expect(formatPct(0)).toBe("+0.00%");
  });

  it("respects custom decimal places", () => {
    expect(formatPct(0.1, 0)).toBe("+10%");
    expect(formatPct(0.1, 1)).toBe("+10.0%");
    expect(formatPct(0.1, 4)).toBe("+10.0000%");
  });

  it("rounds correctly at 2dp default", () => {
    expect(formatPct(0.12345)).toBe("+12.35%");
    expect(formatPct(-0.00001)).toBe("-0.00%");
  });

  it("handles very large values", () => {
    expect(formatPct(10)).toBe("+1000.00%");
  });

  it("handles very small negative values", () => {
    expect(formatPct(-0.00001)).toBe("-0.00%");
  });
});

// ── formatPrice ───────────────────────────────────────────────────────────────

describe("formatPrice", () => {
  it("value below $10 uses 4 decimal places", () => {
    expect(formatPrice(1.2345)).toBe("1.2345");
    expect(formatPrice(9.9999)).toBe("9.9999");
    expect(formatPrice(0.0001)).toBe("0.0001");
  });

  it("value $10–$999 uses 2 decimal places", () => {
    expect(formatPrice(10)).toBe("10.00");
    expect(formatPrice(99.999)).toBe("100.00"); // rounds up
    expect(formatPrice(999.99)).toBe("999.99");
  });

  it("value >= $1000 uses locale format with max 2 decimals", () => {
    const result = formatPrice(1500);
    // Should contain "1,500" (locale thousands separator)
    expect(result).toContain("1,500");
  });

  it("value exactly at $10 boundary uses 2dp", () => {
    expect(formatPrice(10.0)).toBe("10.00");
  });

  it("value exactly at $1000 boundary uses locale format", () => {
    const result = formatPrice(1000);
    expect(result).toContain("1,000");
  });
});

// ── formatVolume ──────────────────────────────────────────────────────────────

describe("formatVolume", () => {
  it("values >= 1B use B suffix", () => {
    expect(formatVolume(1_000_000_000)).toBe("1.0B");
    expect(formatVolume(2_500_000_000)).toBe("2.5B");
    expect(formatVolume(1_234_567_890)).toBe("1.2B");
  });

  it("values >= 1M (and < 1B) use M suffix", () => {
    expect(formatVolume(1_000_000)).toBe("1.0M");
    expect(formatVolume(5_500_000)).toBe("5.5M");
    expect(formatVolume(999_999_999)).toBe("1000.0M"); // just under 1B
  });

  it("values >= 1K (and < 1M) use K suffix", () => {
    expect(formatVolume(1_000)).toBe("1K");
    expect(formatVolume(12_345)).toBe("12K");
    expect(formatVolume(999_999)).toBe("1000K"); // just under 1M
  });

  it("values below 1K return raw string", () => {
    expect(formatVolume(500)).toBe("500");
    expect(formatVolume(0)).toBe("0");
    expect(formatVolume(999)).toBe("999");
  });

  it("exact boundary 1_000_000_000 uses B", () => {
    expect(formatVolume(1_000_000_000)).toBe("1.0B");
  });

  it("exact boundary 1_000_000 uses M", () => {
    expect(formatVolume(1_000_000)).toBe("1.0M");
  });

  it("exact boundary 1_000 uses K", () => {
    expect(formatVolume(1_000)).toBe("1K");
  });
});
