# Meteor Bot — Tutorial

> How to operate Meteor: the AI-managed Obsidian wiki bot.

---

## What Is This?

Meteor is a Telegram bot (`@MeteorBotBot`) backed by MiniMax M2.7 that manages a structured markdown vault. The **llm-wiki protocol** (from [nvk/llm-wiki](https://github.com/nvk/llm-wiki)) tells the AI how to organize knowledge — it's not code, it's instructions in AGENTS.md that the LLM follows.

### Without llm-wiki

You message the bot, it chats back. Nothing persists. Next conversation, it forgot everything.

### With llm-wiki

Every piece of knowledge gets saved, organized, linked, and searchable. The vault is the bot's long-term brain. You see everything in Obsidian in near-real-time (~90 seconds).

### The Data Pipeline

```
Input sources                    Raw (immutable)              Wiki (synthesized)
─────────────                    ──────────────               ─────────────────
URLs you send      ──ingest──►   raw/articles/*.md  ─┐
Papers/arxiv       ──ingest──►   raw/papers/*.md    ─┤──compile──►  wiki/concepts/*.md
Text you paste     ──ingest──►   raw/notes/*.md     ─┤              wiki/topics/*.md
GitHub repos       ──ingest──►   raw/repos/*.md     ─┘              wiki/references/*.md
Web research       ──auto───►   (all of the above)                  wiki/theses/*.md
                                                                         │
                                                                    ──output──►  output/*.md
                                                                    (reports, summaries, guides)
```

**Raw** = verbatim source material. Never modified after ingestion. Timestamped. This is your evidence chain — you can always check what the original source said vs what the LLM synthesized.

**Wiki** = synthesized articles. Meteor writes these by combining multiple raw sources, adding context, linking related concepts, scoring confidence. These are living documents that get updated as new sources arrive.

**Output** = deliverables you ask for: summaries, comparisons, study guides, reports.

### What the Structure Adds

- **Every claim traces back to a source** (wiki article → raw source → original URL)
- **Confidence scoring** — `high` (multiple peer-reviewed sources agree), `medium` (single credible source), `low` (anecdotal/unverified)
- **Dual-linking** — Obsidian's graph view shows how concepts connect
- **Indexes** — the LLM reads `_index.md` first, navigates efficiently instead of scanning 100 files
- **Immutable raw** — originals are preserved, synthesis is separate

### Your Role

You're the editor-in-chief. Meteor does the research grunt work, you steer:

- **"Research X"** → Meteor searches the web, ingests sources, compiles articles
- **"This is wrong"** → Meteor corrects the article
- **"Retract that source"** → Meteor removes it and cleans up all references
- **"Compile"** → Meteor synthesizes unprocessed sources into wiki articles
- **"Lint"** → Meteor checks its own work (broken links, missing sources, stale indexes)
- **Browse Obsidian** → edit notes directly, they sync back within 30 seconds

### Example Session

```
You:     "research bitcoin mining energy consumption"
Meteor:  searches from 5 angles (academic, technical, applied, news, contrarian)
         → scores sources for credibility
         → ingests 4 articles to raw/articles/
         → compiles wiki/concepts/bitcoin-mining-energy.md
         → updates indexes, logs activity
         (you see it in Obsidian ~90 seconds later)

You:     "this misses renewable energy adoption in mining"
Meteor:  searches specifically for that angle
         → ingests new sources → updates the article
         → adds links to related concepts

You:     "what do we know about proof of work vs proof of stake?"
Meteor:  reads its own wiki (NOT training data) → answers with citations
         → notes confidence levels → identifies gaps

You:     "thesis: bitcoin mining actually accelerates renewable energy development"
Meteor:  researches FOR and AGAINST evidence
         → builds evidence table → delivers verdict with confidence
         → second round focuses on the weaker side (anti-confirmation-bias)
```

---

## Quick Start

1. Open Telegram
2. Search for `@MeteorBotBot`
3. Send: `research bitcoin`
4. Meteor searches the web, ingests sources, compiles wiki articles, and reports back

That's it. Everything below is reference for specific operations.

---

## Service Management

### Start / Stop / Restart

```bash
cd ~/instances/meteor

# Start (or recreate after config change)
docker compose up -d

# Restart (keeps container, reloads config)
docker compose restart

# Stop
docker compose down
```

### Check Status

```bash
# Is it running?
docker ps --format "table {{.Names}}\t{{.Status}}" | grep meteor

# Health check
curl -s http://127.0.0.1:18791/healthz
# Expected: {"ok":true,"status":"live"}
```

### View Logs

```bash
# Docker container logs (startup, errors)
docker logs meteor-openclaw-gateway-1 --tail 50

# Follow logs live
docker logs meteor-openclaw-gateway-1 -f

# Detailed agent logs (inside container)
docker exec meteor-openclaw-gateway-1 tail -50 /tmp/openclaw/openclaw-$(date +%F).log
```

### Rebuild After OpenClaw Update

```bash
cd ~/openclaw && docker build -t openclaw:local .
cd ~/instances/meteor && docker compose up -d
# Also restart Atlas:
cd ~/instances/atlas && docker compose up -d
```

---

## Using the Wiki via Telegram

Meteor understands natural language. You don't need slash commands — just describe what you want.

### Ingest Sources

Add knowledge to the wiki by giving Meteor URLs or text:

```
ingest https://arxiv.org/abs/2301.00000
```
```
ingest this: "The transformer architecture uses self-attention to process sequences in parallel rather than sequentially."
```
```
add https://github.com/bitcoin/bitcoin
```

Meteor will:
1. Fetch the content
2. Classify it (article, paper, repo, note, data)
3. Save to `raw/<type>/YYYY-MM-DD-slug.md` with frontmatter
4. Update indexes
5. Suggest compilation if 5+ uncompiled sources

### Compile

Turn raw sources into synthesized wiki articles:

```
compile
```
```
compile everything (full recompile)
```

Meteor will:
1. Find uncompiled sources
2. Extract key concepts
3. Create/update articles in `wiki/concepts/`, `wiki/topics/`, `wiki/references/`
4. Add dual-links and confidence scores
5. Update all indexes

### Query the Wiki

Ask questions — Meteor answers from wiki content only:

```
what do we know about proof of work?
```
```
query: how does self-attention relate to transformers?
```
```
deep query: what are the security implications of quantum computing for bitcoin?
```

Three depths:
- **Quick**: Reads indexes only (fastest)
- **Standard**: Reads relevant articles + searches
- **Deep**: Reads everything including raw sources

### Research

Automated pipeline: web search → ingest → compile:

```
research quantum computing
```
```
research "how does CRISPR gene editing work?" (question mode)
```
```
thesis: fiber reduces neuroinflammation via short-chain fatty acids
```

Research modes:
- **Standard**: 5 search angles (academic, technical, applied, news, contrarian)
- The thesis prefix triggers for/against framing with a verdict

### Generate Outputs

Create artifacts from wiki content:

```
create a summary of everything we know about bitcoin
```
```
generate a study guide on transformer architecture
```
```
write a comparison of proof-of-work vs proof-of-stake
```

Output types: summary, report, study-guide, slides, timeline, glossary, comparison

### Lint / Health Check

```
lint the wiki
```
```
check wiki health and fix any issues
```

### Retract a Source

Remove a bad source and clean up references:

```
retract raw/articles/2026-04-13-bad-source.md reason: unreliable data
```

---

## Vault File Locations

All files live on the VPS at:

```
~/.openclaw-meteor/workspace/vault/
```

Inside the Docker container, this appears at:

```
/home/node/.openclaw/workspace/vault/
```

### Key Files

| Path | Purpose |
|------|---------|
| `_index.md` | Master index — start here |
| `config.md` | Wiki scope and conventions |
| `log.md` | Append-only activity log |
| `raw/` | Immutable source material |
| `wiki/` | Compiled articles (Meteor maintains these) |
| `output/` | Generated artifacts |
| `inbox/` | Drop zone for files |

### Reading the Wiki from the VPS

```bash
# List all wiki articles
sudo find ~/.openclaw-meteor/workspace/vault/wiki/ -name "*.md" -not -name "_index.md"

# Read the master index
sudo cat ~/.openclaw-meteor/workspace/vault/_index.md

# Check activity log
sudo cat ~/.openclaw-meteor/workspace/vault/log.md

# Search for a topic
sudo grep -r "bitcoin" ~/.openclaw-meteor/workspace/vault/wiki/
```

---

## Connecting Obsidian (Desktop / Mobile)

The vault is a git repo synced to GitHub. Obsidian clients sync via the **Obsidian Git** community plugin.

### VPS Side (already done)

- **Repo**: [SNooZyy2/meteor-vault](https://github.com/SNooZyy2/meteor-vault) (private)
- **Auto-sync cron**: Every 5 minutes, stages + commits + pushes any changes Meteor made
- **Sync log**: `/tmp/meteor-vault-sync.log`

### Desktop Setup

1. Install [Obsidian](https://obsidian.md) if not already installed
2. Clone the vault repo:
   ```bash
   git clone https://github.com/SNooZyy2/meteor-vault.git ~/Vaults/Meteor
   ```
3. Open Obsidian → **"Open folder as vault"** → select `~/Vaults/Meteor`
4. Go to **Settings → Community plugins → Browse** → search **"Obsidian Git"** → Install → Enable
5. Configure the Obsidian Git plugin settings:
   - **Auto-pull interval**: 5 minutes
   - **Auto-push after commit**: on
   - **Auto-commit interval**: 5 minutes
   - **Pull on startup**: on

Done. Changes from Meteor appear automatically. Your edits push back to GitHub.

### Mobile Setup (Android / iOS)

Obsidian mobile can't run `git clone` directly. Two options:

**Option A: Obsidian Git plugin (recommended)**

1. Open Obsidian mobile → **"Create new vault"** → name it `Meteor`
2. Settings → Community plugins → Browse → install **"Obsidian Git"** → Enable
3. Open the command palette (swipe down or tap the ribbon icon) → run **"Obsidian Git: Clone an existing remote repo"**
4. Paste: `https://github.com/SNooZyy2/meteor-vault.git`
5. It will ask for authentication — use:
   - **Username**: your GitHub username (`SNooZyy2`)
   - **Password**: a **Personal Access Token** (NOT your GitHub password):
     - Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token
     - Select scope: **`repo`** (full control of private repos)
     - Copy the token and paste it as the password
6. Configure the same auto-pull/push settings as desktop (step 5 above)

**Option B: Sync via desktop (simpler, less real-time)**

If Obsidian Git is fiddly on mobile, sync the desktop vault folder to your phone via iCloud / Google Drive / Syncthing, and open it as a local vault in Obsidian mobile. The desktop handles all git operations — the phone just sees the files.

### How Sync Works

```
Meteor (VPS)  ──push every 5min──►  GitHub (private repo)
                                        │
                    ┌───────────────────┤
                    ▼                   ▼
              Desktop Obsidian    Mobile Obsidian
              (auto-pull 5min)    (auto-pull 5min)
              (auto-push edits)   (auto-push edits)
```

All three sync through the GitHub repo. Conflicts are rare (Meteor and a human editing the same note simultaneously). When they happen, git creates merge markers that you resolve in Obsidian.

### Verifying Sync Works

After setup, test the round-trip:

1. Send a message to `@MeteorBotBot`: `ingest this: "Test note for sync verification"`
2. Wait up to 5 minutes (VPS cron pushes)
3. In Obsidian, pull manually (command palette → "Obsidian Git: Pull") or wait for auto-pull
4. Check `raw/notes/` — you should see the new note
5. Edit a note in Obsidian, commit + push
6. On VPS: `sudo git -C ~/.openclaw-meteor/workspace/vault log --oneline -3` — your edit should appear

---

## Changing Meteor's Behavior

### Model

Edit `~/.openclaw-meteor/openclaw.json`:
```json
"agents": {
  "defaults": {
    "model": {
      "primary": "minimax/MiniMax-M2.7",
      "fallbacks": [...]
    }
  }
}
```
Meteor hot-reloads model changes — no restart needed.

### Personality / Instructions

Edit `~/.openclaw-meteor/workspace/AGENTS.md`. Changes are picked up on the next conversation turn.

### Exec Policy

Edit `~/.openclaw-meteor/exec-approvals.json`. Requires container restart.

### API Keys

Edit `~/instances/meteor/.env`. Requires `docker compose up -d` to recreate the container.

### Telegram Owner

Edit `channels.telegram.groupAllowFrom` in `~/.openclaw-meteor/openclaw.json` to add/change allowed Telegram user IDs.

---

## Adding Meteor to a Group Chat

1. Add `@MeteorBotBot` to the Telegram group
2. Edit `~/.openclaw-meteor/openclaw.json`:
   ```json
   "channels": {
     "telegram": {
       "groups": {
         "-100YOUR_GROUP_ID": {
           "requireMention": true,
           "allowFrom": ["*"]
         }
       }
     }
   }
   ```
3. Restart: `cd ~/instances/meteor && docker compose restart`

With `requireMention: true`, Meteor only responds when @mentioned in the group.

---

## Troubleshooting

### Meteor not responding

```bash
# 1. Is the container running?
docker ps | grep meteor

# 2. Check logs for errors
docker logs meteor-openclaw-gateway-1 --tail 30

# 3. Check health
curl -s http://127.0.0.1:18791/healthz

# 4. Restart
cd ~/instances/meteor && docker compose restart
```

### "Unknown model" warmup warning

This appears in logs but is usually harmless. The model still works for actual requests. If Meteor doesn't respond to messages, check:
- `MINIMAX_API_KEY` is set in `~/instances/meteor/.env`
- The key is valid (not expired/revoked)
- `MINIMAX_API_KEY` is passed through in `docker-compose.yml` environment section

### Vault files not visible to Meteor

```bash
# Check ownership (must be ubuntu:ubuntu)
sudo ls -la ~/.openclaw-meteor/workspace/vault/

# Fix if wrong
sudo chown -R ubuntu:ubuntu ~/.openclaw-meteor/
```

### Port conflict

```bash
# Check what's using the port
ss -tlnp | grep 18791

# Change port in ~/instances/meteor/.env and restart
```

### Pairing issues

If a new operator needs access:
```bash
# Create/edit the allowFrom file
sudo tee ~/.openclaw-meteor/credentials/telegram-default-allowFrom.json << 'EOF'
{
  "version": 1,
  "allowFrom": ["TELEGRAM_USER_ID"]
}
EOF
sudo chown ubuntu:ubuntu ~/.openclaw-meteor/credentials/telegram-default-allowFrom.json
cd ~/instances/meteor && docker compose restart
```

### Checking what Meteor did to the vault

```bash
# Recent git commits (from Meteor's writes)
cd ~/.openclaw-meteor/workspace/vault && sudo git log --oneline -10

# What changed recently
sudo git diff HEAD~1

# Activity log
sudo cat ~/.openclaw-meteor/workspace/vault/log.md
```
