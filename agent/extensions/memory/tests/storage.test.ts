import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { readRecentObservations, observationFilename } from "../utils.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evo-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

describe("readRecentObservations", () => {
  it("returns empty string for non-existent directory", () => {
    expect(readRecentObservations("/nonexistent", 3)).toBe("");
  });

  it("returns empty string for empty directory", () => {
    expect(readRecentObservations(tmpDir, 3)).toBe("");
  });

  it("reads all md files within the day window", () => {
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(tmpDir, `${today}T09-00-00.md`), "morning obs");
    fs.writeFileSync(path.join(tmpDir, `${today}T14-00-00.md`), "afternoon obs");

    const result = readRecentObservations(tmpDir, 3);
    expect(result).toContain("morning obs");
    expect(result).toContain("afternoon obs");
  });

  it("excludes files older than the day window", () => {
    const old = new Date();
    old.setDate(old.getDate() - 10);
    const oldDate = old.toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    fs.writeFileSync(path.join(tmpDir, `${oldDate}T09-00-00.md`), "old obs");
    fs.writeFileSync(path.join(tmpDir, `${today}T09-00-00.md`), "recent obs");

    const result = readRecentObservations(tmpDir, 3);
    expect(result).not.toContain("old obs");
    expect(result).toContain("recent obs");
  });

  it("ignores non-md files", () => {
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(tmpDir, `${today}T09-00-00.md`), "good");
    fs.writeFileSync(path.join(tmpDir, `${today}T09-00-00.txt`), "ignored");

    const result = readRecentObservations(tmpDir, 3);
    expect(result).toContain("good");
    expect(result).not.toContain("ignored");
  });

  it("returns files sorted chronologically", () => {
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(tmpDir, `${today}T14-00-00.md`), "second");
    fs.writeFileSync(path.join(tmpDir, `${today}T09-00-00.md`), "first");

    const result = readRecentObservations(tmpDir, 3);
    const firstIdx = result.indexOf("first");
    const secondIdx = result.indexOf("second");
    expect(firstIdx).toBeLessThan(secondIdx);
  });
});

describe("observationFilename", () => {
  it("produces a valid filename with .md extension", () => {
    const name = observationFilename();
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.md$/);
  });

  it("does not contain colons", () => {
    const name = observationFilename();
    expect(name).not.toContain(":");
  });
});
