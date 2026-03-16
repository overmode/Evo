import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { sessionDate } from "./session.js";

const WORKSPACE = process.env.EVO_WORKSPACE ?? path.join(process.cwd(), "workspace");
const EXTENSIONS_SRC = path.join(new URL(".", import.meta.url).pathname, "..", "extensions");
const TEMPLATES = path.join(new URL(".", import.meta.url).pathname, "..", "templates");

function sessionFile(): string {
  return path.join(WORKSPACE, "sessions", `${sessionDate()}.jsonl`);
}

async function copyDirRecursive(src: string, dest: string) {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

/** Sets up the workspace on first run: copies templates and syncs extensions. */
async function bootstrap() {
  const piDir = path.join(WORKSPACE, ".pi");

  await fs.promises.mkdir(path.join(WORKSPACE, "sessions"), { recursive: true });
  await fs.promises.mkdir(piDir, { recursive: true });

  // Copy prompt templates (only on first run — agent evolves these over time)
  for (const file of ["AGENTS.md", "SYSTEM.md"]) {
    const target = path.join(piDir, file);
    if (!fs.existsSync(target)) {
      await fs.promises.copyFile(path.join(TEMPLATES, file), target);
    }
  }

  // Copy base skills (only on first run — agent creates its own over time)
  const skillsSrc = path.join(TEMPLATES, "skills");
  const skillsDest = path.join(piDir, "skills");
  if (fs.existsSync(skillsSrc) && !fs.existsSync(skillsDest)) {
    await copyDirRecursive(skillsSrc, skillsDest);
  }

  // Always sync extensions from source (they're code, not user data)
  await copyDirRecursive(EXTENSIONS_SRC, path.join(piDir, "extensions"));
}

async function main() {
  await bootstrap();

  const model = getModel("anthropic", "claude-sonnet-4-5");
  const sf = sessionFile();
  const sessionManager = SessionManager.open(sf);

  const { session } = await createAgentSession({
    model,
    sessionManager,
    cwd: WORKSPACE,
  });

  session.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent?.type === "text_delta"
    ) {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
    if (event.type === "tool_execution_start") {
      process.stdout.write(`\n[${event.toolName}]\n`);
    }
  });

  console.log(`Evo ready. Session: ${path.basename(sf)}\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\nyou> ",
  });

  rl.prompt();

  rl.on("line", async (input) => {
    const trimmed = input.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    process.stdout.write("\nevo> ");
    await session.prompt(trimmed);
    process.stdout.write("\n");
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\nGoodbye.");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
