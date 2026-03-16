import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sessionDate } from "./session.js";

describe("sessionDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns today's date after the reset hour", () => {
    vi.setSystemTime(new Date(2026, 2, 16, 10, 0, 0));
    expect(sessionDate(4)).toBe("2026-03-16");
  });

  it("returns yesterday's date before the reset hour", () => {
    vi.setSystemTime(new Date(2026, 2, 16, 3, 0, 0));
    expect(sessionDate(4)).toBe("2026-03-15");
  });

  it("returns today's date exactly at the reset hour", () => {
    vi.setSystemTime(new Date(2026, 2, 16, 4, 0, 0));
    expect(sessionDate(4)).toBe("2026-03-16");
  });

  it("handles midnight correctly", () => {
    vi.setSystemTime(new Date(2026, 2, 16, 0, 0, 0));
    expect(sessionDate(4)).toBe("2026-03-15");
  });

  it("handles custom reset hour", () => {
    vi.setSystemTime(new Date(2026, 2, 16, 5, 30, 0));
    expect(sessionDate(6)).toBe("2026-03-15");
    expect(sessionDate(5)).toBe("2026-03-16");
  });
});
