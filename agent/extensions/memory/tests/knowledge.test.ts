import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseDescription,
  validateKnowledgeFile,
  validateKnowledgeDir,
  buildKnowledgeMap,
} from "../utils.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evo-knowledge-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

describe("parseDescription", () => {
  it("extracts description from frontmatter", () => {
    const content = `---\ndescription: A great recipe\n---\n\n# Title\n\nBody`;
    expect(parseDescription(content)).toBe("A great recipe");
  });

  it("returns null when no frontmatter", () => {
    expect(parseDescription("# Just a title\n\nBody")).toBeNull();
  });

  it("returns null when frontmatter has no description", () => {
    const content = `---\ntags: [cooking]\n---\n\n# Title`;
    expect(parseDescription(content)).toBeNull();
  });

  it("handles extra whitespace in description", () => {
    const content = `---\ndescription:   Spaced out  \n---`;
    expect(parseDescription(content)).toBe("Spaced out");
  });

  it("handles multiple frontmatter fields", () => {
    const content = `---\ntags: [cooking]\ndescription: My recipe\nauthor: Lucas\n---\n\n# Title`;
    expect(parseDescription(content)).toBe("My recipe");
  });
});

describe("validateKnowledgeFile", () => {
  it("returns valid for a file with description", () => {
    const filePath = path.join(tmpDir, "test.md");
    fs.writeFileSync(filePath, "---\ndescription: Test file\n---\n\n# Test");
    const result = validateKnowledgeFile(filePath);
    expect(result.valid).toBe(true);
    expect(result.description).toBe("Test file");
  });

  it("returns invalid for a file without frontmatter", () => {
    const filePath = path.join(tmpDir, "test.md");
    fs.writeFileSync(filePath, "# Just a title");
    const result = validateKnowledgeFile(filePath);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing frontmatter");
  });

  it("returns invalid for an empty file", () => {
    const filePath = path.join(tmpDir, "empty.md");
    fs.writeFileSync(filePath, "");
    const result = validateKnowledgeFile(filePath);
    expect(result.valid).toBe(false);
  });
});

describe("validateKnowledgeDir", () => {
  it("returns empty array for non-existent directory", () => {
    expect(validateKnowledgeDir("/nonexistent")).toEqual([]);
  });

  it("validates all markdown files recursively", () => {
    fs.mkdirSync(path.join(tmpDir, "sub"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "good.md"), "---\ndescription: Good\n---\n# Good");
    fs.writeFileSync(path.join(tmpDir, "bad.md"), "# No frontmatter");
    fs.writeFileSync(path.join(tmpDir, "sub", "nested.md"), "---\ndescription: Nested\n---\n# Nested");

    const results = validateKnowledgeDir(tmpDir);
    expect(results).toHaveLength(3);
    expect(results.filter((r) => r.valid)).toHaveLength(2);
    expect(results.filter((r) => !r.valid)).toHaveLength(1);
  });
});

describe("buildKnowledgeMap", () => {
  it("returns empty string for non-existent directory", () => {
    expect(buildKnowledgeMap("/nonexistent")).toBe("");
  });

  it("returns empty string for empty directory", () => {
    expect(buildKnowledgeMap(tmpDir)).toBe("");
  });

  it("builds a tree with descriptions", () => {
    fs.mkdirSync(path.join(tmpDir, "recipes"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "recipes", "risotto.md"),
      "---\ndescription: Mushroom risotto with arborio rice\n---\n# Risotto",
    );
    fs.writeFileSync(
      path.join(tmpDir, "recipes", "carbonara.md"),
      "---\ndescription: Classic Roman carbonara\n---\n# Carbonara",
    );

    const map = buildKnowledgeMap(tmpDir);
    expect(map).toContain("knowledge/");
    expect(map).toContain("recipes/");
    expect(map).toContain("risotto.md — Mushroom risotto with arborio rice");
    expect(map).toContain("carbonara.md — Classic Roman carbonara");
  });

  it("shows (no description) for files without frontmatter", () => {
    fs.writeFileSync(path.join(tmpDir, "orphan.md"), "# No frontmatter");
    const map = buildKnowledgeMap(tmpDir);
    expect(map).toContain("orphan.md — (no description)");
  });

  it("handles nested directories", () => {
    fs.mkdirSync(path.join(tmpDir, "a", "b"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "a", "b", "deep.md"),
      "---\ndescription: Deep file\n---\n# Deep",
    );

    const map = buildKnowledgeMap(tmpDir);
    expect(map).toContain("a/");
    expect(map).toContain("b/");
    expect(map).toContain("deep.md — Deep file");
  });
});
