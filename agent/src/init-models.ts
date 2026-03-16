/**
 * Downloads QMD GGUF models and initializes the search index.
 * Run this before the agent starts to avoid cold-start delays.
 */
import { createStore } from "@tobilu/qmd";
import * as fs from "node:fs";
import * as path from "node:path";

const WORKSPACE = process.env.EVO_WORKSPACE ?? "/workspace";
const dbPath = path.join(WORKSPACE, "memory", "index.sqlite");
const obsDir = path.join(WORKSPACE, "memory", "observations");
const knowledgeDir = path.join(WORKSPACE, "knowledge");

fs.mkdirSync(obsDir, { recursive: true });
fs.mkdirSync(knowledgeDir, { recursive: true });

console.log("[init] Creating QMD store and downloading models...");

const store = await createStore({
  dbPath,
  config: {
    collections: {
      observations: { path: obsDir, pattern: "**/*.md" },
      knowledge: { path: knowledgeDir, pattern: "**/*.md" },
    },
  },
});

console.log("[init] Indexing...");
await store.update();

console.log("[init] Generating embeddings (downloads embedding model on first run)...");
await store.embed();

console.log("[init] Triggering search (downloads query expansion + reranking models on first run)...");
try {
  await store.search({ query: "init", limit: 1 });
} catch {
  // Empty index is fine — we just want the models downloaded
}

await store.close();
console.log("[init] Done.");
