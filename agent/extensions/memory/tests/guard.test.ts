import { describe, it, expect } from "vitest";
import { isReadonlyPath, isMutatingBashCommand } from "../utils.js";

describe("isReadonlyPath", () => {
  it("blocks writes to sessions/", () => {
    expect(isReadonlyPath("sessions/chat.jsonl")).toBe("sessions/");
    expect(isReadonlyPath("sessions/2026-03-16.jsonl")).toBe("sessions/");
    expect(isReadonlyPath("sessions/")).toBe("sessions/");
  });

  it("blocks writes to .pi/AGENTS.md", () => {
    expect(isReadonlyPath(".pi/AGENTS.md")).toBe(".pi/AGENTS.md");
  });

  it("strips leading ./ before checking", () => {
    expect(isReadonlyPath("./sessions/foo.jsonl")).toBe("sessions/");
    expect(isReadonlyPath("./.pi/AGENTS.md")).toBe(".pi/AGENTS.md");
  });

  it("allows writes to other paths", () => {
    expect(isReadonlyPath("knowledge/recipes.md")).toBeUndefined();
    expect(isReadonlyPath("skills/cooking/SKILL.md")).toBeUndefined();
    expect(isReadonlyPath(".pi/SYSTEM.md")).toBeUndefined();
    expect(isReadonlyPath("memory/observations/2026-03-16.md")).toBeUndefined();
  });

  it("returns undefined for empty/undefined input", () => {
    expect(isReadonlyPath(undefined)).toBeUndefined();
    expect(isReadonlyPath("")).toBeUndefined();
  });
});

describe("isMutatingBashCommand", () => {
  it("detects rm commands", () => {
    expect(isMutatingBashCommand("rm -rf sessions/")).toBe(true);
    expect(isMutatingBashCommand("rm sessions/chat.jsonl")).toBe(true);
  });

  it("detects mv and cp", () => {
    expect(isMutatingBashCommand("mv sessions/a.jsonl /tmp/")).toBe(true);
    expect(isMutatingBashCommand("cp /tmp/evil sessions/")).toBe(true);
  });

  it("detects redirections", () => {
    expect(isMutatingBashCommand("echo foo > sessions/file")).toBe(true);
    expect(isMutatingBashCommand("echo foo >> sessions/file")).toBe(true);
  });

  it("detects tee and dd", () => {
    expect(isMutatingBashCommand("cat foo | tee sessions/file")).toBe(true);
    expect(isMutatingBashCommand("dd if=/dev/zero of=sessions/file")).toBe(true);
  });

  it("allows read-only commands", () => {
    expect(isMutatingBashCommand("cat sessions/chat.jsonl")).toBe(false);
    expect(isMutatingBashCommand("ls sessions/")).toBe(false);
    expect(isMutatingBashCommand("wc -l sessions/chat.jsonl")).toBe(false);
    expect(isMutatingBashCommand("grep hello sessions/chat.jsonl")).toBe(false);
  });
});
