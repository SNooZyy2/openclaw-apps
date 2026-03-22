# Active Patches

## Image Generation Model Override Patch

**Problem**: OpenClaw's `image_generate` tool exposes a `model` parameter to the LLM agent. The agent (Gemini 2.5 Flash) consistently passes `model: "google/gemini-3.1-flash-image-preview"` (branded "Nano Banana 2", paid tier) regardless of what's configured in `agents.defaults.imageGenerationModel.primary`.

The config only acts as a fallback — the agent's `model` arg always takes priority in the code at `src/agents/tools/image-generate-tool.ts` line 551 and `src/image-generation/runtime.ts` line 75.

**Fix**: Patch the compiled dist to ignore the model override:

```bash
# File: /app/dist/auth-profiles-DXyJppZ2.js
# Line: 109166
# Before:
const model = readStringParam(params, "model");
# After:
const model = undefined; // PATCHED: ignore agent model override
```

**Apply**:
```bash
docker exec openclaw-openclaw-gateway-1 sed -i '109166s/.*/\t\t\tconst model = undefined; \/\/ PATCHED: ignore agent model override/' /app/dist/auth-profiles-DXyJppZ2.js
docker compose restart openclaw-gateway
```

**Warning**: Lost on container rebuild or OpenClaw update. The line number may change — search for `readStringParam(params, "model")` near the `#region src/agents/tools/image-generate-tool.ts` comment.

**Upstream fix**: OpenClaw should either respect `imageGenerationModel.primary` as a hard override, or provide a config option to lock/restrict which models the tool can use. Consider filing as a bug.
