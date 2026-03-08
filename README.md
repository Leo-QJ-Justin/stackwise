# StackWise

**Know your stack. Own your edge.**

The Claude Code ecosystem ships new plugins, MCP servers, and skills every week. Most power users can't tell you what's in their stack, what overlaps, or what gaps they're ignoring. That asymmetry is the difference between someone who uses Claude Code and someone who *dominates* with it.

StackWise is a local intelligence layer that continuously tracks, classifies, and optimizes your entire Claude Code tooling setup — so you always know exactly what you have, what you're missing, and what to drop.

## The Problem

- A new MCP server drops — is it better than what you already have?
- You installed five plugins last month — do any of them overlap?
- A creator demos a skill on social media — does it fill a gap or just duplicate something?
- You can't export "what I use and why" to share with your team or seed a new machine.

Without a system, you're guessing. StackWise makes it measurable.

## How It Works

Every tool that enters your ecosystem — whether you installed it, scanned it, or it was flagged by an automation pipeline — goes through a two-step LLM classification:

```
Tool arrives (scan, watcher, or automation pipeline)
  │
  ├─ Registry hit ──────> Already known → skip (instant, free)
  │
  └─ Unknown ───────────> Step 1: DISCOVERY
                          → category, description, capabilities
                            │
                            v
                          Step 2: COMPARISON against your active stack
                          → NEW | DUPLICATE | ALTERNATIVE | UNRELATED
                          → confidence score + reasoning
                            │
                            v
                          Route: active / queue / rejected
```

The registry acts as a cache. As it grows, fewer LLM calls are needed — classification gets cheaper and faster over time.

### Entry Points

| Source | What It Scans | Trigger |
|--------|--------------|---------|
| **Plugin scanner** | `~/.claude/plugins/installed_plugins.json` | Manual scan or auto on load |
| **MCP scanner** | `~/.claude/.mcp.json` (global config) | Manual scan or auto on load |
| **File watcher** | `~/.claude/plugins/` and `~/.claude/skills/` | Real-time on file change |
| **Ingest API** | Social media pipeline (n8n) | Automation POSTs tool mentions |

## Features

### Dashboard
- **At-a-glance stats** — active tools, pending queue, swaps, coverage gaps
- **List & Bento grid views** — toggle between dense list and category-grouped tiles
- **7-category taxonomy** — Development, Skills & File Handling, Integrations, Workflow & Agents, Prompting & Context, Research & Knowledge, UI & Frontend
- **Gap analysis** — instantly see which categories have zero coverage
- **Cmd+K search** — fuzzy search across your entire registry with keyboard navigation
- **Inline notes** — annotate any stack tool with context on why you keep it

### Intelligence
- **Two-step classification** — discovery (what is this?) and comparison (how does it fit?) as independent LLM calls
- **Duplicate detection** — case-insensitive, hyphen-normalized matching prevents duplicates
- **Stack verdicts** — every tool gets a reasoned verdict: NEW, DUPLICATE, ALTERNATIVE, or UNRELATED
- **Multi-provider** — Claude CLI, Ollama (local), Anthropic, OpenAI, Gemini, Mistral, Bedrock, OpenRouter

### Stack Management
- **Drag-and-drop recategorization** — move tools between categories
- **Swap tracking** — replace tools with a full audit trail (what changed and why)
- **History timeline** — unified chronological view of every tool, swap, and classification decision
- **Stack export** — export your curated stack as markdown context for any Claude conversation

## Quick Start

```bash
# Clone and install
git clone https://github.com/Leo-QJ-Justin/stackwise.git
cd stackwise
bun install

# Set up the database
npx drizzle-kit push
npx tsx lib/db/seed.ts

# Start
bun run dev
```

Open `http://localhost:3000`. Go to **Settings** to configure your LLM provider — local options (Claude CLI, Ollama) need no API key.

Or use the dev script:

```bash
./dev.sh setup   # Install deps + init DB
./dev.sh start   # Start dev server
./dev.sh auto    # Setup + start in one command
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, server + client components) |
| Database | SQLite via Drizzle ORM + better-sqlite3 |
| UI | Tailwind CSS + shadcn/ui + @dnd-kit |
| LLM | Vercel AI SDK (`generateObject` with Zod schemas) |
| File watching | chokidar |

## Project Structure

```
stackwise/
├── app/                    Next.js pages and API routes
│   ├── api/                REST endpoints (scan, stack, tools, stats, settings, ingest)
│   ├── settings/           Provider configuration
│   ├── history/            Timeline view
│   ├── tools/[id]/         Tool detail page
│   └── export/             Stack export
├── components/             Dashboard, search modal, stats bar, notifications
├── lib/
│   ├── db/                 Drizzle schema, seed data, migrations
│   ├── classify.ts         Two-step LLM classification engine
│   ├── providers.ts        Multi-provider model factory
│   ├── shared.ts           Categories, provider configs, shared types
│   ├── watcher.ts          File system watcher (chokidar)
│   ├── github.ts           README fetcher for plugin metadata
│   └── settings.ts         Settings helpers
├── automation/             n8n workflow + Docker Compose for social monitoring
├── tests/                  API and data flow test suites
└── dev.sh                  Unified dev script (setup/start/test/stop)
```

## Automation (Optional)

StackWise ships with a Dockerized n8n workflow that monitors social media for Claude Code tool mentions:

1. Apify scrapes posts on a schedule
2. n8n routes media to OCR / Whisper for text extraction
3. Claude extracts tool names from the text
4. Results POST to `/api/ingest` for automatic classification

See [automation/SETUP.md](automation/SETUP.md) for details.

## Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| App scaffold | Done | Dashboard, schema, API routes, file watcher |
| Intelligence layer | Done | Two-step LLM classification, multi-provider, verdicts |
| Dashboard overhaul | Done | Stats bar, bento grid, gap analysis, Cmd+K search, timeline |
| Automation bundle | Done | n8n + Docker for social monitoring pipeline |
| Desktop packaging | Planned | Tauri wrapper for native distribution |
| Confidence tuning | Planned | Self-improving classification accuracy over time |

## License

Private — not yet open source.
