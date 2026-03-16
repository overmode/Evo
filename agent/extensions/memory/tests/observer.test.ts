import { describe, it, expect } from "vitest";
import type { Message, UserMessage, AssistantMessage, Usage } from "@mariozechner/pi-ai";
import {
  estimateTokenCount,
  messageContentToText,
  messagesToText,
  buildObserverMessages,
} from "../utils.js";

const ZERO_USAGE: Usage = {
  input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const userMsg = (text: string): UserMessage => ({
  role: "user",
  content: [{ type: "text", text }],
  timestamp: Date.now(),
});

const assistantMsg = (text: string): AssistantMessage => ({
  role: "assistant",
  content: [{ type: "text", text }],
  api: "anthropic-messages",
  provider: "anthropic",
  model: "test",
  usage: ZERO_USAGE,
  stopReason: "stop",
  timestamp: Date.now(),
});

describe("estimateTokenCount", () => {
  it("returns a positive number for non-empty text", () => {
    expect(estimateTokenCount("hello world")).toBeGreaterThan(0);
  });

  it("returns 0 for empty text", () => {
    expect(estimateTokenCount("")).toBe(0);
  });

  it("scales with text length", () => {
    const short = estimateTokenCount("hello");
    const long = estimateTokenCount("hello ".repeat(100));
    expect(long).toBeGreaterThan(short);
  });
});

describe("messageContentToText", () => {
  it("handles string content", () => {
    expect(messageContentToText("hello")).toBe("hello");
  });

  it("extracts text from content array", () => {
    const content = [
      { type: "text" as const, text: "hello" },
      { type: "text" as const, text: "world" },
    ];
    expect(messageContentToText(content)).toBe("hello\nworld");
  });

  it("filters non-text content", () => {
    expect(messageContentToText([
      { type: "text" as const, text: "hello" },
    ])).toBe("hello");
  });
});

describe("messagesToText", () => {
  it("formats messages with role labels", () => {
    const messages: Message[] = [userMsg("hi"), assistantMsg("hello")];
    const result = messagesToText(messages);
    expect(result).toContain("[User] hi");
    expect(result).toContain("[Assistant] hello");
  });

  it("handles empty array", () => {
    expect(messagesToText([])).toBe("");
  });
});

describe("buildObserverMessages", () => {
  it("includes conversation text without previous observations header", () => {
    const messages: Message[] = [userMsg("hello")];
    const result = buildObserverMessages(messages, "");
    expect(result).toContain("## New conversation to observe");
    expect(result).toContain("[User] hello");
    expect(result).not.toContain("Previous observations");
  });

  it("includes existing observations when provided", () => {
    const messages: Message[] = [userMsg("hello")];
    const result = buildObserverMessages(messages, "- 🔴 09:00 Some prior observation");
    expect(result).toContain("## Previous observations");
    expect(result).toContain("Some prior observation");
    expect(result).toContain("## New conversation to observe");
  });
});
