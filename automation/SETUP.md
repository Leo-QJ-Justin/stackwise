# StackWise Automation Pipeline — Setup Guide

This n8n workflow monitors Instagram creators for Claude Code tool mentions, extracts text from images/reels, identifies tool names, and feeds them into StackWise for classification.

## Prerequisites

- StackWise running locally (`npm run dev` on port 3000)
- n8n installed (Docker or n8n Cloud)
- API keys for: Apify, OCR.Space, OpenAI (Whisper), Anthropic

## 1. Start n8n

**Docker (recommended):**
```bash
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  n8nio/n8n
```

Open http://localhost:5678 and create an account.

**n8n Cloud:** Sign up at https://n8n.io — free tier is sufficient.

## 2. Import the Workflow

1. Open n8n editor
2. Click **...** menu → **Import from File**
3. Select `automation/workflow.json` from this project
4. The workflow will appear with all nodes connected

## 3. Create Credentials

In n8n, go to **Settings → Credentials** and create:

### Anthropic API
- Type: **Anthropic**
- API Key: Your Anthropic API key from https://console.anthropic.com

### OpenAI Account
- Type: **OpenAI**
- API Key: Your OpenAI API key from https://platform.openai.com
- Used for Whisper audio transcription of reels

### OCR.Space (Header Auth)
The OCR node uses HTTP Request with a header parameter. The API key is read from the `OCRSPACE_API_KEY` environment variable in n8n.

Set it in your n8n environment:
```bash
# Docker
docker run ... -e OCRSPACE_API_KEY=your_key_here n8nio/n8n

# Or in n8n UI: Settings → Variables → Add OCRSPACE_API_KEY
```

Get a free key at https://ocr.space/ocrapi (25,000 requests/month free).

For testing, use the public test key: `helloworld`

### Apify Token
The Apify token is read from the `APIFY_TOKEN` environment variable in n8n.

Set it the same way as OCR.Space above. Get your token at https://console.apify.com/account#/integrations

## 4. Set Up Apify Instagram Scraper

1. Go to https://apify.com and create an account (free tier)
2. Find the actor: **apify/instagram-post-scraper**
3. Configure a task with:
   - **Direct URLs** or **usernames** of creators to monitor
   - **Results limit:** 10-20 per creator (recent posts only)

### Suggested creators to monitor:
Add your preferred Claude Code content creators here.

## 5. Configure Apify Webhook

1. In Apify Console, go to your scraper task → **Integrations** tab
2. Add a webhook:
   - **Event:** `ACTOR.RUN.SUCCEEDED`
   - **URL:** Your n8n webhook URL (shown in the Webhook node)
     - Local: `http://localhost:5678/webhook/apify-callback`
     - n8n Cloud: `https://your-instance.app.n8n.cloud/webhook/apify-callback`
3. Save the webhook

## 6. Configure StackWise Watchlist (Optional)

In StackWise Settings, add creator handles to the watchlist. This is stored as a JSON array:

```
PUT /api/settings
{ "watchlist": "[\"creator1\", \"creator2\"]" }
```

## 7. Test the Pipeline

### Manual test with sample data:

```bash
# Test the ingest endpoint directly
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "sourceUrl": "https://www.instagram.com/p/test123/",
    "postType": "image",
    "rawText": "Top 5 Claude Code plugins: Superpowers for TDD, Context7 for docs lookup, Claude-Mem for memory",
    "tools": ["Superpowers", "Context7", "Claude-Mem"],
    "creatorHandle": "testcreator"
  }'
```

### Full pipeline test:

1. Activate the workflow in n8n (toggle in top-right)
2. Run your Apify scraper task manually
3. Wait for the webhook to fire
4. Check StackWise dashboard for new tools in Queue

## 8. Schedule Recurring Runs

In Apify Console, set up a schedule for your scraper task:
- **Frequency:** Weekly (recommended)
- **Day:** Sunday evening (good time to review new tools Monday morning)

The webhook fires automatically after each run, so the pipeline is fully hands-free.

## Pipeline Flow

```
Apify scrapes Instagram posts
  → Webhook triggers n8n
  → n8n fetches dataset results
  → Switch routes by post type (image vs reel)
  → Images → OCR.Space text extraction
  → Reels → Download → Whisper transcription
  → Merge results
  → Claude extracts tool names from text
  → POST to StackWise /api/ingest
  → StackWise classifies tools against your registry
```

## Troubleshooting

**Webhook not receiving data:**
- Ensure n8n workflow is activated (not just saved)
- Check Apify webhook URL matches exactly
- For local testing, use ngrok or similar to expose localhost

**OCR returning empty text:**
- Some Instagram images use custom fonts OCR can't read
- The caption text is used as fallback
- Try OCR Engine 2 or 3 for better results (modify the HTTP Request node)

**Whisper failing:**
- Verify OpenAI API key has billing enabled
- Check the video URL is accessible (some expire quickly)
- Instagram reel URLs may need to be fetched promptly after scraping

**Tools not appearing in StackWise:**
- Verify StackWise dev server is running on port 3000
- Check the StackWise API has a classification provider configured (Settings page)
- Look at the n8n execution log for HTTP errors
