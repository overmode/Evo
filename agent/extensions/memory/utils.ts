import type { Message } from "@mariozechner/pi-ai";
import { estimateTokenCount } from "tokenx";
import * as fs from "node:fs";
import * as path from "node:path";

export { estimateTokenCount };

// --- Path utils ---

/** Strips leading ./ from a path. */
export function normalizePath(filePath: string): string {
  return filePath.replace(/^\.\//, "");
}

/**
 * Checks if a path starts with any of the given prefixes.
 * @returns The matching prefix, or undefined.
 */
export function matchesPrefix(filePath: string, prefixes: string[]): string | undefined {
  const normalized = normalizePath(filePath);
  return prefixes.find((p) => normalized === p || normalized.startsWith(p));
}

// --- Guard utils ---

/** Paths the agent's tools are not allowed to modify. */
export const READONLY_PATHS = ["sessions/", ".pi/AGENTS.md"];

/**
 * Checks if a file path falls within a readonly zone.
 * @returns The matching readonly prefix, or undefined if the path is writable.
 */
export function isReadonlyPath(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined;
  return matchesPrefix(filePath, READONLY_PATHS);
}

/**
 * Checks if a path targets a knowledge .md file.
 */
export function isKnowledgeMd(filePath: string | undefined): boolean {
  if (!filePath) return false;
  return matchesPrefix(filePath, ["knowledge/"]) !== undefined && filePath.endsWith(".md");
}

/**
 * Best-effort check for bash commands that would modify files.
 * Not exhaustive — the main defense is the write/edit tool_call guard.
 */
export function isMutatingBashCommand(command: string): boolean {
  return /\b(rm|mv|cp|chmod|chown|tee|dd)\b|>>?\s/.test(command);
}

// --- Text extraction utils ---

/**
 * Extracts text from an AssistantMessage content array.
 * Filters to text blocks and joins them.
 */
export function extractText(content: { type: string; text?: string }[]): string {
  return content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

// --- Observer utils ---

/**
 * Extracts plain text from a message's content field.
 * Handles both string content (user messages) and content arrays (all message types).
 */
export function messageContentToText(content: Message["content"]): string {
  if (typeof content === "string") return content;
  return extractText(content);
}

/**
 * Converts an array of messages into a readable transcript with role labels.
 * Used as input for the observer LLM call.
 */
export function messagesToText(messages: Message[]): string {
  return messages
    .map((m) => {
      const role = m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : "Tool";
      return `[${role}] ${messageContentToText(m.content)}`;
    })
    .join("\n\n");
}

/** System prompt for the observer LLM call. */
export const OBSERVER_PROMPT = `You are a memory observer. Your job is to compress a conversation into concise, dated observation notes.

Rules:
- Use a two-level bulleted list. Top-level bullets are topics/events, sub-bullets are details.
- Prefix each bullet with a timestamp (HH:MM) and priority emoji: 🔴 high, 🟡 medium, 🟢 low.
- Group by date with a "Date: YYYY-MM-DD" header.
- Capture: facts learned about the user, decisions made, tasks discussed, preferences expressed, emotional state.
- End with "Current task:" and "Suggested next:" lines for continuity.
- Be dense. Aim for 5-40x compression. Do NOT include raw message text — only distilled observations.
- If previous observations are provided, DO NOT repeat them. Only add new observations.`;

/**
 * Builds the user prompt for the observer LLM call.
 * Includes existing observations so the observer avoids repeating them.
 */
export function buildObserverMessages(
  messages: Message[],
  existingObservations: string,
): string {
  let prompt = "";
  if (existingObservations) {
    prompt += `## Previous observations (DO NOT repeat these)\n${existingObservations}\n\n`;
  }
  prompt += `## New conversation to observe\n${messagesToText(messages)}`;
  return prompt;
}

// --- Storage utils ---

/**
 * Reads a file, returning empty string if it doesn't exist.
 */
export function readFileIfExists(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Reads and concatenates observation files from the last N days.
 * Files are named YYYY-MM-DDTHH-MM-SS.md and sorted chronologically.
 */
export function readRecentObservations(dir: string, days: number): string {
  if (!fs.existsSync(dir)) return "";

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .filter((f) => f.slice(0, 10) >= cutoffDate);

  return files
    .map((f) => readFileIfExists(path.join(dir, f)))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Generates a timestamp-based filename for an observation.
 * Supports multiple observations per day (e.g., 2026-03-16T09-31-45.md).
 */
export function observationFilename(): string {
  return new Date().toISOString().replace(/:/g, "-").slice(0, 19) + ".md";
}

// --- Knowledge utils ---

/**
 * Parses YAML frontmatter from a markdown file.
 * Returns the description field if present, or null.
 *
 * Expected format:
 * ```
 * ---
 * description: Short description of the file
 * ---
 * ```
 */
export function parseDescription(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const frontmatter = match[1];
  const descLine = frontmatter.match(/^description:\s*(.+)$/m);
  return descLine ? descLine[1].trim() : null;
}

/** Result of validating a knowledge file. */
export interface KnowledgeValidation {
  filePath: string;
  valid: boolean;
  description: string | null;
  error?: string;
}

/**
 * Validates a single knowledge file: checks it has frontmatter with a description.
 */
export function validateKnowledgeFile(filePath: string): KnowledgeValidation {
  const content = readFileIfExists(filePath);
  if (!content) {
    return { filePath, valid: false, description: null, error: "File is empty or unreadable" };
  }
  const description = parseDescription(content);
  if (!description) {
    return { filePath, valid: false, description: null, error: "Missing frontmatter description" };
  }
  return { filePath, valid: true, description };
}

/**
 * Validates all markdown files in a knowledge directory.
 * Returns validation results for each file.
 */
export function validateKnowledgeDir(dir: string): KnowledgeValidation[] {
  if (!fs.existsSync(dir)) return [];
  return collectMarkdownFiles(dir).map(validateKnowledgeFile);
}

/** Recursively collect all .md files in a directory. */
function collectMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(fullPath));
    } else if (entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Entry in the knowledge tree map. */
export interface KnowledgeEntry {
  /** Path relative to the knowledge root. */
  relativePath: string;
  /** Description from frontmatter, or null if missing. */
  description: string | null;
}

/**
 * Builds a tree-view string of the knowledge directory.
 * Each file is shown with its description from frontmatter.
 *
 * Example output:
 * ```
 * knowledge/
 *   recipes/
 *     risotto.md — Mushroom risotto recipe with arborio rice and white wine
 *     carbonara.md — Classic Roman carbonara with guanciale
 *   people/
 *     sarah.md — Colleague on the auth team
 * ```
 */
export function buildKnowledgeMap(knowledgeDir: string): string {
  if (!fs.existsSync(knowledgeDir)) return "";

  const entries: KnowledgeEntry[] = collectMarkdownFiles(knowledgeDir)
    .sort()
    .map((filePath) => ({
      relativePath: path.relative(knowledgeDir, filePath),
      description: parseDescription(readFileIfExists(filePath)),
    }));

  if (!entries.length) return "";

  // Build a tree structure from flat paths
  const lines: string[] = ["knowledge/"];
  const seenDirs = new Set<string>();

  for (const entry of entries) {
    const parts = entry.relativePath.split(path.sep);

    // Add directory prefixes
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join(path.sep);
      if (!seenDirs.has(dirPath)) {
        seenDirs.add(dirPath);
        const indent = "  ".repeat(i + 1);
        lines.push(`${indent}${parts[i]}/`);
      }
    }

    // Add the file with description
    const indent = "  ".repeat(parts.length);
    const fileName = parts[parts.length - 1];
    const desc = entry.description ? ` — ${entry.description}` : " — (no description)";
    lines.push(`${indent}${fileName}${desc}`);
  }

  return lines.join("\n");
}

