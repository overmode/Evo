import type { ExtensionAPI, SessionMessageEntry } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { completeSimple, getModel, Type, StringEnum } from "@mariozechner/pi-ai";
import type { Message } from "@mariozechner/pi-ai";
import { createStore } from "@tobilu/qmd";
import type { QMDStore, HybridQueryResult } from "@tobilu/qmd";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  READONLY_PATHS, isReadonlyPath, isKnowledgeMd, isMutatingBashCommand,
  estimateTokenCount, messagesToText, messageContentToText, extractText,
  buildObserverMessages, OBSERVER_PROMPT,
  readRecentObservations, observationFilename,
  buildKnowledgeMap, validateKnowledgeDir, parseDescription,
} from "./utils.js";

interface MemoryConfig {
  /** Token threshold to trigger the observer. */
  observeThreshold: number;
  /** Number of observation results to auto-inject into context. */
  observationHits: number;
  /** Number of knowledge results to auto-inject into context. */
  knowledgeHits: number;
  /** Max results returned by the recall tool. */
  recallLimit: number;
  /** Model used for the observer (should be cheap and fast). */
  observerModel: { provider: string; id: string };
}

const DEFAULT_CONFIG: MemoryConfig = {
  observeThreshold: 20_000,
  observationHits: 2,
  knowledgeHits: 5,
  recallLimit: 10,
  observerModel: { provider: "anthropic", id: "claude-haiku-4-5-20251001" },
};

const KNOWLEDGE_FORMAT_ERROR = `Knowledge files require YAML frontmatter with a description. Expected format:\n---\ndescription: Short description of the file\n---\n\n# Title\n\nContent...`;

/**
 * Formats hybrid search results as file paths with snippets.
 * Uses bestChunk from QMD's reranked results for the most relevant excerpt.
 */
function formatHybridResults(results: HybridQueryResult[], label: string): string {
  if (!results.length) return "";
  const items = results
    .map((r) => {
      const snippet = (r.bestChunk ?? r.title).slice(0, 200).replace(/\n/g, " ");
      return `- ${r.displayPath} (score: ${r.score.toFixed(2)}): "${snippet}..."`;
    })
    .join("\n");
  return `[${label}]\n${items}`;
}

/**
 * Memory extension — the core runtime for Evo.
 *
 * Guard: blocks tool writes to readonly paths (sessions/, .pi/AGENTS.md).
 * Observer: compresses long conversations into observation notes.
 * Context: uses QMD hybrid search to auto-inject relevant observations and knowledge.
 * Recall tool: lets the agent explicitly search its memory.
 */
export default function memory(pi: ExtensionAPI) {
  const config = DEFAULT_CONFIG;
  let cwd = "";
  let observedUpToIndex = 0;
  let store: QMDStore | null = null;

  function obsDir(): string {
    return path.join(cwd, "memory", "observations");
  }

  function knowledgeDir(): string {
    return path.join(cwd, "knowledge");
  }

  /** Reindex observations and knowledge, then generate embeddings. */
  async function reindex() {
    if (!store) return;
    await store.update();
    await store.embed();
  }

  // --- Guard: enforce readonly zones + knowledge format ---

  pi.on("tool_call", async (event) => {
    // Block writes to readonly paths
    if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
      const match = isReadonlyPath(event.input.path);
      if (match) {
        return { block: true, reason: `${match} is readonly` };
      }
    }

    // Validate knowledge file format before write or edit
    if (isToolCallEventType("write", event) && isKnowledgeMd(event.input.path)) {
      if (!parseDescription(event.input.content)) {
        return {
          block: true,
          reason: KNOWLEDGE_FORMAT_ERROR,
        };
      }
    }
    if (isToolCallEventType("edit", event) && isKnowledgeMd(event.input.path)) {
      const fullPath = path.resolve(cwd, event.input.path);
      const current = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf-8") : "";
      const simulated = current.replace(event.input.oldText, event.input.newText);
      if (!parseDescription(simulated)) {
        return {
          block: true,
          reason: KNOWLEDGE_FORMAT_ERROR,
        };
      }
    }

    // Best-effort: block destructive bash commands targeting readonly paths
    if (isToolCallEventType("bash", event)) {
      const cmd = event.input.command;
      for (const p of READONLY_PATHS) {
        if (cmd.includes(p) && isMutatingBashCommand(cmd)) {
          return { block: true, reason: `${p} is readonly — cannot modify via bash` };
        }
      }
    }

    return undefined;
  });

  // After any bash command, check all knowledge files are valid
  pi.on("tool_result", async (event) => {
    if (event.toolName !== "bash") return;

    const invalid = validateKnowledgeDir(knowledgeDir()).filter((v) => !v.valid);
    if (!invalid.length) return;

    const paths = invalid.map((v) => path.relative(cwd, v.filePath)).join(", ");
    return {
      content: [{ type: "text" as const, text: `Invalid knowledge files: ${paths}. Please fix them.\n\n${KNOWLEDGE_FORMAT_ERROR}` }],
      isError: true,
    };
  });


  // --- Recall tool: explicit memory search ---

  pi.registerTool({
    name: "recall",
    label: "Recall",
    description: "Search your memory (observations and knowledge) using hybrid semantic + keyword search. Returns file paths with snippets — use `read` for full content.",
    parameters: Type.Object({
      query: Type.String({ description: "What to search for" }),
      scope: Type.Optional(StringEnum(
        ["all", "observations", "knowledge"] as const,
        { description: "Which collection to search. Default: all" },
      )),
      limit: Type.Optional(Type.Number({ description: "Max results to return. Default: 10" })),
    }),
    async execute(_toolCallId, params) {
      if (!store) {
        return { content: [{ type: "text" as const, text: "Memory store not initialized." }], details: null };
      }

      const limit = params.limit ?? config.recallLimit;
      const scope = params.scope ?? "all";

      const searchOpts = {
        query: params.query,
        limit,
        ...(scope !== "all" ? { collection: scope } : {}),
      };

      const results = await store.search(searchOpts);

      if (!results.length) {
        return { content: [{ type: "text" as const, text: `No results found for "${params.query}"` }], details: null };
      }

      const formatted = results
        .map((r) => {
          const snippet = (r.bestChunk ?? r.title).slice(0, 300).replace(/\n/g, " ");
          return `${r.displayPath} (score: ${r.score.toFixed(2)})\n  ${snippet}`;
        })
        .join("\n\n");

      return {
        content: [{ type: "text" as const, text: formatted }],
        details: { resultCount: results.length, scope },
      };
    },
  });

  // --- Memory: QMD store lifecycle ---

  pi.on("session_start", async (_event, ctx) => {
    cwd = ctx.cwd;
    fs.mkdirSync(obsDir(), { recursive: true });
    fs.mkdirSync(knowledgeDir(), { recursive: true });
    observedUpToIndex = 0;

    // Validate knowledge files — warn about missing descriptions
    const validations = validateKnowledgeDir(knowledgeDir());
    const invalid = validations.filter((v) => !v.valid);
    if (invalid.length > 0) {
      for (const v of invalid) {
        console.warn(`[memory] ${path.relative(cwd, v.filePath)}: ${v.error}`);
      }
    }

    // Initialize QMD store
    const dbPath = path.join(cwd, "memory", "index.sqlite");
    store = await createStore({
      dbPath,
      config: {
        collections: {
          observations: { path: obsDir(), pattern: "**/*.md" },
          knowledge: { path: knowledgeDir(), pattern: "**/*.md" },
        },
      },
    });

    await reindex();
  });

  pi.on("session_shutdown", async () => {
    await store?.close();
    store = null;
  });

  /**
   * Before each LLM call, inject:
   * 1. The full knowledge map (file tree with descriptions)
   * 2. Hybrid search results for relevant observations and knowledge
   */
  pi.on("context", async (event) => {
    const sections: string[] = [];

    // Always inject the knowledge map — gives the agent awareness of what it knows
    const knowledgeMap = buildKnowledgeMap(knowledgeDir());
    if (knowledgeMap) {
      sections.push(`[Knowledge map]\n${knowledgeMap}`);
    }

    // Run hybrid search if we have a store and a user message
    if (store) {
      const lastUserMsg = [...event.messages].reverse().find((m) => m.role === "user");
      if (lastUserMsg) {
        const queryText = messageContentToText(lastUserMsg.content);
        if (queryText) {
          const obsResults = await store.search({
            query: queryText,
            collection: "observations",
            limit: config.observationHits,
          });
          const knowledgeResults = await store.search({
            query: queryText,
            collection: "knowledge",
            limit: config.knowledgeHits,
          });

          const obsSection = formatHybridResults(obsResults, "Relevant observations — use `read` or `recall` for more");
          const knowledgeSection = formatHybridResults(knowledgeResults, "Relevant knowledge — use `read` or `recall` for more");

          if (obsSection) sections.push(obsSection);
          if (knowledgeSection) sections.push(knowledgeSection);
        }
      }
    }

    if (!sections.length) return { messages: event.messages };

    const memoryMessage: Message = {
      role: "user",
      content: [{ type: "text", text: `[MEMORY — do not respond to this, use as background knowledge]\n\n${sections.join("\n\n")}` }],
      timestamp: 0,
    };

    return {
      messages: [memoryMessage, ...event.messages],
    };
  });

  /**
   * After each turn, check if unobserved messages exceed the token threshold.
   * If so, run the observer, save the observation, and reindex QMD.
   */
  pi.on("turn_end", async (_event, ctx) => {
    const entries = ctx.sessionManager.getBranch();
    const messages = entries
      .filter((e): e is SessionMessageEntry => e.type === "message")
      .map((e) => e.message)
      .filter((m): m is Message => m.role === "user" || m.role === "assistant");

    const unobserved = messages.slice(observedUpToIndex);
    const unobservedText = messagesToText(unobserved);
    const tokenCount = estimateTokenCount(unobservedText);

    if (tokenCount < config.observeThreshold) return;

    console.log(`\n[memory] Observing ${unobserved.length} messages (~${tokenCount} tokens)...`);

    const existingObs = readRecentObservations(obsDir(), 0);
    const userPrompt = buildObserverMessages(unobserved, existingObs);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("[memory] No API key available for observer");
      return;
    }

    const model = getModel(
      config.observerModel.provider as "anthropic",
      config.observerModel.id as "claude-haiku-4-5-20251001",
    );

    const result = await completeSimple(model, {
      systemPrompt: OBSERVER_PROMPT,
      messages: [
        { role: "user", content: [{ type: "text", text: userPrompt }], timestamp: Date.now() },
      ],
    }, { apiKey });

    const text = extractText(result.content);

    fs.writeFileSync(path.join(obsDir(), observationFilename()), text, "utf-8");
    observedUpToIndex = messages.length;

    await reindex();

    console.log("[memory] Observations saved and indexed.");
  });
}
