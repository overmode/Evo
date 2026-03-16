/**
 * Full initialization: workspace setup + QMD store + model downloads.
 * Run once before first use, or after cloning the repo.
 *
 * Usage: node --env-file=../.env --import tsx/esm src/init.ts
 */
import { createStore } from "@tobilu/qmd";
import * as path from "node:path";
import { bootstrap } from "./bootstrap.js";

const WORKSPACE = process.env.EVO_WORKSPACE ?? path.join(process.cwd(), "workspace");
const TEMPLATES = path.join(new URL(".", import.meta.url).pathname, "..", "templates");

// 1. Set up workspace (templates, skills)
console.log("[init] Setting up workspace...");
await bootstrap(WORKSPACE, TEMPLATES);

// 2. Initialize QMD store
const dbPath = path.join(WORKSPACE, "memory", "index.sqlite");
const obsDir = path.join(WORKSPACE, "memory", "observations");
const knowledgeDir = path.join(WORKSPACE, "knowledge");

console.log("[init] Creating QMD store...");
const store = await createStore({
  dbPath,
  config: {
    collections: {
      observations: { path: obsDir, pattern: "**/*.md" },
      knowledge: { path: knowledgeDir, pattern: "**/*.md" },
    },
  },
});

// 3. Index existing files
console.log("[init] Indexing...");
await store.update();

// 4. Download models and generate embeddings
console.log("[init] Downloading models and generating embeddings (first run only)...");
await store.embed();

try {
  await store.search({ query: "init", limit: 1 });
} catch {
  // Empty index is fine — we just want the models downloaded
}

await store.close();
console.log("[init] Done. You can now run: npm run agent");
