# Evo

A self-improving personal agent built on [Pi Mono](https://pi.dev/).

Evo is a research project exploring whether an LLM agent can genuinely self-improve when given the right feedback loops and constraints — not by retraining weights, but by engineering its own environment: what it knows, what it can do, how it thinks, and how it evaluates whether it's getting better.

## How it works

Evo runs as a Pi coding agent with access to a workspace filesystem. Everything the agent knows lives as markdown files it can read and write.

**Observational memory** — When conversations get long, an observer (cheap LLM call) compresses them into dated observation notes. These are indexed by [QMD](https://github.com/tobi/qmd) for hybrid search (BM25 + vector + reranking), so the agent can recall relevant context from any point in its history.

**Knowledge with structure** — Knowledge files use YAML frontmatter with descriptions. The full knowledge tree (with descriptions) is injected into every LLM call, giving the agent a map of what it knows. A `recall` tool lets it search deeper. Writes to knowledge are validated — no file without a description reaches disk.

**Guard rails** — Sessions and the constitution are readonly (enforced at the tool call level). The agent can read everything but can only write to knowledge, skills, prompts, and triggers.

**Daily sessions** — A new session starts at 4am (configurable). Context carries forward through observations and the knowledge folder.

## Architecture

```
agent/
  src/
    index.ts              — Entry point: bootstraps workspace, creates Pi session
    session.ts            — Session date calculation with daily reset

  extensions/
    memory/
      index.ts            — Pi extension: guard + observer + context injection + recall tool
      utils.ts            — Pure logic: path guards, text extraction, knowledge validation, storage
      tests/              — Collocated tests (48 tests)

  templates/
    AGENTS.md             — Constitution template (immutable rules)
    SYSTEM.md             — Initial self-prompt (agent evolves this)

  compose.yaml            — Docker Compose config
  Dockerfile              — Container image with non-root user
```

At runtime, the workspace looks like:

```
workspace/
  .pi/
    AGENTS.md             — Constitution (readonly)
    SYSTEM.md             — Agent's evolving self-prompt
    extensions/memory/    — Synced from source on every start
  sessions/
    2026-03-16.jsonl      — Today's conversation
  knowledge/
    recipes/risotto.md    — Agent-organized, frontmatter required
  memory/
    observations/         — Compressed conversation notes
    index.sqlite          — QMD search index
```

## Setup

```bash
cd agent
npm install
```

Create a `.env` file at the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
```

## Running

**With Docker (recommended):**

```bash
cd agent
npm start          # docker compose up --build
npm run stop       # docker compose down
```

**Locally (for development):**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
cd agent
npx tsx src/index.ts
```

**With Pi's TUI (for a nicer terminal experience):**

```bash
pi --cwd /path/to/workspace
```

## Testing

```bash
cd agent
npm test           # vitest run
npm run test:watch # vitest (watch mode)
```

## What's next

- Nightly reflection process (knowledge reorganization, skill/prompt engineering)
- Self-triggering (agent schedules its own future actions)
- Backtesting (replay past conversations against proposed changes)
- Telegram integration
- Prompt versioning and A/B testing

## License

MIT
