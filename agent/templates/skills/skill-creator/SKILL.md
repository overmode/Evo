---
name: skill-creator
description: Guide for creating and improving skills. Use when you want to create a new skill, update an existing one, or need guidance on skill design patterns like progressive disclosure, workflow structuring, or output formatting.
---

# Skill Creator

Skills are modular, self-contained packages that extend your capabilities with specialized knowledge, workflows, and tools. They live in `.pi/skills/` and are discovered automatically by Pi.

## Skill Anatomy

```
.pi/skills/
  skill-name/
    SKILL.md            — required: frontmatter + instructions
    scripts/            — optional: executable code for deterministic tasks
    references/         — optional: documentation loaded into context on demand
    assets/             — optional: files used in output (templates, etc.)
```

### SKILL.md (required)

Two parts:

1. **Frontmatter** — `name` and `description`. These are always in context (~100 tokens). The description is how Pi decides when to load the skill, so be clear and comprehensive about what it does AND when to use it.
2. **Body** — Instructions and guidance. Only loaded when the skill triggers.

```markdown
---
name: recipe-helper
description: Help find, adapt, and store recipes. Use when the user asks about cooking, meal planning, ingredient substitutions, or dietary adaptations.
---

## Instructions

1. Check knowledge/recipes/ for existing recipes
2. ...
```

Frontmatter rules:
- `name`: lowercase a-z, 0-9, hyphens only, max 64 chars, must match directory name
- `description`: required — skills without it are not loaded
- No other frontmatter fields needed

### Scripts (`scripts/`)

Include when the same code would be rewritten repeatedly or deterministic reliability is needed. Scripts are token-efficient and can be executed without loading into context.

### References (`references/`)

Documentation loaded into context on demand. Keep SKILL.md lean — move detailed information here.

- If a reference file is large (>10k words), include grep patterns in SKILL.md
- Organize by domain or variant (e.g., `references/aws.md`, `references/gcp.md`)
- See references/output-patterns.md for template and example patterns
- See references/workflows.md for sequential and conditional workflow patterns

### Assets (`assets/`)

Files used in output, not loaded into context. Templates, images, boilerplate code.

## Core Principles

### Concise is Key

The context window is shared. Only add context you don't already have. Prefer concise examples over verbose explanations. Keep SKILL.md body under 500 lines.

### Set Appropriate Degrees of Freedom

- **High freedom** (text instructions): When multiple approaches are valid
- **Medium freedom** (pseudocode/scripts with parameters): When a preferred pattern exists
- **Low freedom** (specific scripts, few parameters): When operations are fragile or consistency is critical

### Progressive Disclosure

Three loading levels:
1. **Metadata** (name + description) — always in context (~100 tokens)
2. **SKILL.md body** — when skill triggers (<5k words)
3. **Bundled resources** — as needed (unlimited, scripts can run without reading)

Split content when approaching the 500-line limit. Reference split files clearly from SKILL.md so you know they exist.

## Creation Process

1. **Understand** — What patterns keep recurring? What does this skill need to handle?
2. **Plan resources** — What scripts, references, or assets would help?
3. **Create the directory** — `mkdir -p .pi/skills/skill-name`
4. **Write SKILL.md** — Start with frontmatter, then instructions
5. **Add resources** — Scripts, references, assets as needed
6. **Iterate** — Use the skill, notice gaps, improve

## What NOT to Include

- README.md, CHANGELOG.md, or other meta-documentation
- Setup/testing procedures
- User-facing documentation
- Anything obvious to a capable LLM
