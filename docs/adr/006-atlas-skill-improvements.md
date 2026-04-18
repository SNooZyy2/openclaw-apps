# ADR-006: Improve Atlas Workspace Skills — fact_check and mediation

**Status**: Proposed
**Date**: 2026-04-13
**Author**: snoozyy

---

## Context

Atlas exposes two workspace skills as Telegram slash commands: `/fact_check` and `/mediation`. Both are defined as SKILL.md prompt templates in `/home/node/.openclaw/workspace/skills/` inside the Docker container. They work, but have reliability and durability gaps discovered during the 2026-04-13 debugging session.

### Current State

| Skill | File (in container) | Tools used | Storage |
|-------|-------------------|------------|---------|
| `/fact_check` | `skills/fact-check/SKILL.md` | `web_search`, `web_fetch`, `write` | `workspace/fact-checks/YYYY-MM-DD_slug.txt` |
| `/mediation` | `skills/mediation/SKILL.md` | `web_search`, `web_fetch` | None |

### Problems Identified

1. **Fragile fact-checker lookups.** The skill instructs Atlas to `web_fetch` URLs like `https://www.snopes.com/?s=<keywords>`. This is brittle — URL formats change, results may be empty, and not all fact-checkers have a predictable search URL. A failed fetch silently degrades verdict quality.

2. **Source logs lost on rebuild.** Fact-check source logs are written to `workspace/fact-checks/` inside the container. A `docker build && docker compose up -d` wipes them. There is no mounted volume for this data.

3. **Mediation has no context window guidance.** The skill says "look at the recent conversation context" but doesn't specify how many messages to consider. Atlas may look at too few (missing the argument) or too many (wasting tokens on unrelated chatter).

4. **Image messages break the skill pipeline.** DeepSeek v3.2 (primary model) is text-only. If a user replies to an image with `/fact_check`, DeepSeek rejects the request. The fallback chain handles it eventually, but the session can get auto-locked to a fallback model (see architecture.md § Provider Chain).

---

## Decision

Address each problem with a targeted change to the SKILL.md files and one infrastructure change for persistence.

### 1. Replace direct URL fetching with `web_search site:` queries

**Current:**
```
Use `web_fetch` with a URL like `https://www.snopes.com/?s=<keywords>`
```

**Proposed:**
```
Use `web_search` with site-scoped queries for fact-checkers:
  - `web_search("<claim keywords> site:snopes.com")`
  - `web_search("<claim keywords> site:politifact.com")`
  - `web_search("<claim keywords> site:correctiv.org")`
Then `web_fetch` the top result URL if one is found.
```

**Rationale:** `web_search` with `site:` is provider-agnostic and handles URL format changes, pagination, and empty results gracefully. The two-step approach (search → fetch top hit) is more robust than guessing a search URL.

### 2. Mount a persistent volume for fact-check logs

Add a bind mount in `docker-compose.yml`:

```yaml
volumes:
  - ./workspace-data/fact-checks:/home/node/.openclaw/workspace/fact-checks
```

Create `~/openclaw/workspace-data/fact-checks/` on the host. Fact-check source logs survive container rebuilds.

**Rationale:** Source logs are the audit trail for `/fact_check`. Users can request them later ("show me the sources from last week"). Losing them on every rebuild defeats the purpose.

### 3. Add explicit context window to mediation skill

Add to the mediation SKILL.md process step 1:

```markdown
1. **Read back.** Review the last 20–30 messages in the conversation to understand the
   disagreement. If the user replied to a specific message with `/mediation`, anchor on
   that message and the surrounding thread. If the disagreement is unclear after reading
   context, ask: "What's the disagreement? Tag both people or summarize."
```

**Rationale:** Explicit guidance prevents Atlas from either under-reading (missing key arguments) or over-reading (burning tokens on hours of unrelated chat). The reply-anchor heuristic leverages Telegram's built-in threading.

### 4. Add image-awareness fallback instructions to both skills

Add to both SKILL.md files:

```markdown
## Image Handling

If the claim or context includes images (photos, screenshots, documents), and your current
model cannot process images, acknowledge this explicitly:
"⚠️ I can see there's an image attached but my current model can't analyze images.
Please describe what's in the image, or I'll work with the text context only."
```

**Rationale:** Rather than silently failing or producing a confused response when the model can't see the image, Atlas acknowledges the limitation and asks for help. This is better UX than a model error or silent fallback.

---

## Implementation Plan

| Step | Change | Where | Risk |
|------|--------|-------|------|
| 1 | Update `web_fetch` → `web_search site:` in fact_check SKILL.md | Container workspace | Low — prompt-only change |
| 2 | Add bind mount for fact-checks directory | `docker-compose.yml` + host dir | Low — additive |
| 3 | Add context window guidance to mediation SKILL.md | Container workspace | Low — prompt-only change |
| 4 | Add image-awareness section to both SKILL.md files | Container workspace | Low — prompt-only change |

Steps 1, 3, and 4 are prompt-only changes applied inside the running container (or via a workspace mount). Step 2 requires a `docker-compose.yml` edit and container restart.

### Workspace Persistence Note

SKILL.md files themselves live inside the container and are also lost on rebuild unless the workspace is mounted. Consider mounting the full workspace directory if skill iteration becomes frequent:

```yaml
volumes:
  - ./workspace:/home/node/.openclaw/workspace
```

This is out of scope for this ADR but worth noting for future work.

---

## Consequences

- **Positive:** Fact-check source lookups become more reliable across fact-checker site changes.
- **Positive:** Source logs persist across container rebuilds — users can request old sources.
- **Positive:** Mediation produces more consistent results with explicit context bounds.
- **Positive:** Image-related queries degrade gracefully instead of failing silently.
- **Negative:** `web_search site:` adds one extra LLM tool call per fact-checker vs. direct URL fetch. Marginal cost increase.
- **Risk:** Mounting workspace volumes creates a host dependency — the directory must exist before `docker compose up`.
