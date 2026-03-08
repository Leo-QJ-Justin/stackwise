# StackWise

A local intelligence system for Claude Code power users. Tracks, evaluates, and optimises your productivity stack — plugins, skills, frameworks, and workflows — so you always know what you have, why you have it, and what you're missing.

## Why

The Claude ecosystem is growing fast. Plugins and skills get released weekly, creators cover the same tools repeatedly, and there's no way to diff new suggestions against what you already use. StackWise solves this by maintaining a growing registry that classifies every tool against your existing setup — getting cheaper and faster over time as the registry grows.

## How It Works

StackWise uses a two-step classification pipeline that separates **discovery** (what is this tool?) from **comparison** (how does it fit my stack?):

```
Tool arrives (pipeline, scan, or file watcher)
    |
    v
Registry dedup check (case-insensitive, hyphen-normalized)
    |--- Already known -------> bump mention count, done
    |--- Unknown -------------> two-step classification:
                                   |
                                   v
                              Step 1: DISCOVERY (LLM call)
                              → name, category, description, capabilities
                                   |
                                   v
                              Step 2: COMPARISON (LLM call)
                              → verdict: NEW | DUPLICATE | ALTERNATIVE | UNRELATED
                              → mapsTo, confidence, reasoning
                              (non-fatal — tool keeps metadata if this fails)
                                   |
                                   v
                              Route based on source + verdict:
                              ├─ Installed (forceActive) → always "active", log overlaps
                              └─ Community → queue (NEW/ALT) or rejected (DUP/UNRELATED)
```

### Three entry points, one pipeline

| Route | Source | Trigger |
|-------|--------|---------|
| `/api/scan` | Installed plugins | Manual scan button or auto-scan on first load |
| `/api/ingest` | n8n automation | Instagram/social media pipeline POSTs tool mentions |
| `lib/watcher.ts` | File system | chokidar watches `~/.claude/plugins/` and `~/.claude/skills/` |

All three routes call `classifyAndStore()` which runs both steps internally. The LLM is only called for genuinely unknown tools — the registry acts as a cache.

## Features

- **Five views**: My Stack, My Skills, Queue, Evaluated, Duplicates Log
- **8 category taxonomy**: Development, Skills & File Handling, Integrations, Workflow & Agents, Prompting & Context, Research & Knowledge, UI & Frontend, My Skills
- **Auto-detection**: File watcher monitors `~/.claude/plugins/` and `~/.claude/skills/` for changes
- **Multi-provider classification**: Claude CLI, Ollama, Anthropic, OpenAI, Google Gemini, Mistral, Amazon Bedrock, OpenRouter
- **Two-step classification**: Discovery (metadata extraction) and comparison (stack verdict) as separate LLM calls — comparison failure is non-fatal
- **Duplicate detection**: Case-insensitive, hyphen-normalized matching prevents duplicate entries
- **Stack export**: Export your curated stack as markdown context for any Claude conversation
- **Swap tracking**: Replace tools and keep a record of what changed and why

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Database | SQLite via Drizzle ORM + better-sqlite3 |
| UI | Tailwind CSS + shadcn/ui |
| LLM | Vercel AI SDK (`generateObject` with Zod schemas) |
| File watching | chokidar |

## Getting Started

### Prerequisites

- Node.js >= 20.9.0 (recommend Node 22 via nvm)
- npm or bun for package management

### Setup

```bash
# Clone and install
git clone https://github.com/Leo-QJ-Justin/stackwise.git
cd stackwise
npm install

# Create database schema
npx drizzle-kit push

# Seed with starter tools
npx tsx lib/db/seed.ts

# Start dev server
npm run dev
```

The app runs at `http://localhost:3000`.

### Configure a Provider

Go to **Settings** and select an LLM provider for tool classification. Local options (Claude CLI, Ollama) need no API key. Cloud providers require a key.

## Project Structure

```
stackwise/
├── app/                    Next.js pages and API routes
│   ├── api/                REST endpoints (stack, tools, classify, settings, etc.)
│   ├── settings/           Provider configuration page
│   ├── tools/[id]/         Tool detail page
│   └── export/             Stack export page
├── components/             React components (dashboard, notifications, top bar)
├── lib/
│   ├── db/                 Drizzle schema and seed data
│   ├── classify.ts         LLM classification engine
│   ├── providers.ts        Multi-provider model factory
│   ├── shared.ts           Shared constants (categories, provider config)
│   ├── watcher.ts          File system watcher for auto-detection
│   ├── github.ts           README fetching for URL-based submissions
│   └── settings.ts         Settings helpers
├── automation/
│   ├── workflow.json       Tested n8n workflow for Instagram monitoring
│   └── SETUP.md            Automation setup guide
├── db/
│   └── stack.db            SQLite database (created on setup)
└── docs/
    └── plans/              Design docs and implementation plans
```

## Data Model

- **tools_registry** — Every tool ever seen: name, category, status, verdict reasoning, capabilities
- **stack_items** — Your active stack (references tools_registry)
- **ingested_content** — Raw pipeline output from n8n (source URL, text, verdicts)
- **duplicates_log** — Audit trail of every filtered tool and why
- **settings** — Provider, API key, model preferences, watchlist

## Automation (Optional)

StackWise includes a bundled n8n workflow that monitors Instagram creators for Claude Code tool mentions. The pipeline:

1. Apify scrapes Instagram posts on a schedule
2. n8n routes images to OCR.Space and reels to Whisper for text extraction
3. Claude extracts tool names from the extracted text
4. Results are POSTed to StackWise `/api/ingest` for classification

See [`automation/SETUP.md`](automation/SETUP.md) for setup instructions.

## Build Order

| Phase | Status | Description |
|-------|--------|-------------|
| 1. App Scaffold | Done | Dashboard, schema, API routes, file watcher |
| 2. Intelligence Layer | Done | LLM classification, verdicts, multi-provider support |
| 3. Desktop Packaging | Planned | Tauri wrapper for native app distribution |
| 4. Automation Bundle | Done | n8n workflow for hands-free Instagram monitoring |
| 5. Refinement | Planned | Confidence tuning, gap analysis, onboarding polish |

## License

Private — not yet open source.
