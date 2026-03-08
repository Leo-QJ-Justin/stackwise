# StackWise Automation Pipeline — Setup Guide

This n8n workflow monitors Instagram creators for Claude Code tool mentions, extracts text from images/reels, identifies tool names, and feeds them into StackWise for classification.

## Prerequisites

- StackWise running locally (`npm run dev` on port 3000)
- Docker & Docker Compose
- API keys for: Apify, OCR.Space, OpenRouter

## Quick Start (Docker Compose)

```bash
cd automation
cp .env.example .env
# Edit .env with your API keys
docker compose up -d
```

This starts both **n8n** (port 5678) and **Whisper** (port 8000). Open http://localhost:5678 and create an account.

The workflow file is mounted read-only at `/home/node/workflow.json` — import it from the n8n editor (see step 3 below).

### Environment Variables

Copy `.env.example` to `.env` and fill in your API keys:

| Variable | Description | Get it from |
|----------|-------------|-------------|
| `APIFY_TOKEN` | Apify API token | https://console.apify.com/account#/integrations |
| `OCRSPACE_API_KEY` | OCR.Space API key | https://ocr.space/ocrapi (25K req/month free) |
| `OPENROUTER_API_KEY` | OpenRouter API key | https://openrouter.ai/keys |

The following are pre-configured in `docker-compose.yml` and don't need to be set manually:

| Variable | Value | Purpose |
|----------|-------|---------|
| `WHISPER_URL` | `http://whisper:8000` | Docker-internal Whisper service |
| `STACKWISE_URL` | `http://host.docker.internal:3000` | Host-running StackWise app |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | `false` | Allow `$env` access in workflows |
| `N8N_DEFAULT_BINARY_DATA_MODE` | `filesystem` | Handle large video files |
| `N8N_PAYLOAD_SIZE_MAX` | `256` | Max payload size in MB |

**GPU Whisper** (optional): Edit `docker-compose.yml` to change the whisper image tag to `latest-cuda` and add a `deploy.resources.reservations.devices` GPU reservation.

### Managing the Stack

```bash
docker compose up -d      # Start
docker compose logs -f     # View logs
docker compose down        # Stop
docker compose down -v     # Stop and delete n8n data
```

## Manual Setup (without Docker Compose)

<details>
<summary>Click to expand manual setup steps</summary>

### 1. Start Local Whisper Server

```bash
docker run -d --name whisper \
  -p 8000:8000 \
  -e WHISPER__MODEL=Systran/faster-whisper-small \
  fedirz/faster-whisper-server:latest-cpu
```

Verify: `curl http://localhost:8000/health` should return `OK`.

### 2. Start n8n

```bash
N8N_BLOCK_ENV_ACCESS_IN_NODE=false \
N8N_DEFAULT_BINARY_DATA_MODE=filesystem \
N8N_PAYLOAD_SIZE_MAX=256 \
APIFY_TOKEN=your_apify_token \
OCRSPACE_API_KEY=your_ocrspace_key \
OPENROUTER_API_KEY=your_openrouter_key \
npx n8n@2.10.4
```

</details>

## 3. Import the Workflow

1. Open n8n editor at http://localhost:5678
2. Click **...** menu → **Import from File**
3. Select `automation/workflow.json` (mounted at `/home/node/workflow.json` in Docker)
4. The workflow will appear with all nodes connected

## 4. Set Up Apify Instagram Scraper

1. Go to https://apify.com and create an account (free tier: $5/month credits)
2. Find the actor: **apify/instagram-post-scraper**
3. Configure a task with:
   - **Direct URLs** or **usernames** of creators to monitor
   - **Results limit:** 10-20 per creator (recent posts only)

## 5. Configure Apify Webhook

1. In Apify Console, go to your scraper task → **Integrations** tab
2. Add a webhook:
   - **Event:** `ACTOR.RUN.SUCCEEDED`
   - **URL:** Your n8n webhook URL
     - Local: requires a tunnel (ngrok/cloudflared) since Apify can't reach localhost
     - Example: `https://your-tunnel.ngrok.io/webhook/apify-callback`
3. Save the webhook

**Note:** For local development, you can manually trigger the webhook:
```bash
curl -X POST http://localhost:5678/webhook-test/apify-callback \
  -H "Content-Type: application/json" \
  -d '{"resource":{"defaultDatasetId":"YOUR_DATASET_ID"},"eventType":"ACTOR.RUN.SUCCEEDED"}'
```

## 6. Test the Pipeline

### Manual test with webhook:

1. Run your Apify scraper task manually
2. Copy the dataset ID from the Apify run results
3. In n8n, open the workflow and click **"Listen for Test Event"** on the Webhook node
4. Fire the test webhook (see curl command above)
5. Check StackWise dashboard for new tools in Queue

### Direct ingest test:

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "sourceUrl": "https://www.instagram.com/p/test123/",
    "postType": "image",
    "rawText": "Top 5 Claude Code plugins: Superpowers for TDD, Context7 for docs lookup",
    "tools": ["Superpowers", "Context7"],
    "creatorHandle": "testcreator"
  }'
```

## 7. Schedule Recurring Runs

In Apify Console, set up a schedule for your scraper task:
- **Frequency:** Weekly (recommended)
- **Day:** Sunday evening (review new tools Monday morning)

The webhook fires automatically after each run, so the pipeline is fully hands-free.

## Pipeline Flow

```
Apify scrapes Instagram posts
  → Webhook triggers n8n
  → n8n fetches dataset results
  → IF routes by post type (image vs video)
  → Images → OCR.Space text extraction → Normalize
  → Videos → Download → Local Whisper transcription → Normalize
  → OpenRouter (Claude Sonnet) extracts tool names
  → POST to StackWise /api/ingest
  → StackWise classifies tools against your registry
```

## Architecture

All nodes use `n8n-nodes-base` types only — no community or langchain nodes required.

- **LLM**: OpenRouter API (OpenAI-compatible, supports Claude models)
- **Transcription**: Local faster-whisper in Docker (no OpenAI key needed)
- **OCR**: OCR.Space free tier
- **Scraping**: Apify free tier ($5/month credits)

## Troubleshooting

**`$env` access denied:**
- Ensure `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` is set when starting n8n

**Webhook not receiving data:**
- Ensure n8n workflow is activated (not just saved)
- For test mode, click "Listen for Test Event" first — it only listens for one request
- For production, Apify needs a public URL (use ngrok/cloudflared for local)

**DelayedStream maxDataSize exceeded:**
- Set `N8N_DEFAULT_BINARY_DATA_MODE=filesystem` when starting n8n
- The Whisper node uses a Code node workaround to bypass the 2MB form-data stream limit

**OCR returning empty text:**
- Some Instagram images use custom fonts OCR can't read
- The caption text is used as fallback in the Normalize Text node

**Whisper failing:**
- Verify Docker container is running: `docker ps --filter name=whisper`
- Check health: `curl http://localhost:8000/health`
- Instagram video URLs may expire — run the pipeline promptly after scraping

**Tools not appearing in StackWise:**
- Verify StackWise dev server is running on port 3000
- Check the StackWise API has a classification provider configured (Settings page)
- Look at the n8n execution log for HTTP errors
