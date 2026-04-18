# Meteor Bot — Backlog

> Tasks the operator (you) still needs to complete. Not agent work — human actions.

---

## Blocking: Obsidian Setup

These must be done before the vault sync loop works end-to-end.

- [ ] **Desktop: Clone vault and install Obsidian Git plugin**
  ```bash
  git clone https://github.com/SNooZyy2/meteor-vault.git ~/Vaults/Meteor
  ```
  Open as vault in Obsidian → install "Obsidian Git" plugin → set auto-pull to **1 minute**, auto-push on commit, pull on startup.

- [ ] **Mobile: Clone vault via Obsidian Git plugin**
  Create vault → install "Obsidian Git" → command palette → "Clone an existing remote repo" → paste `https://github.com/SNooZyy2/meteor-vault.git` → auth with GitHub username + Personal Access Token (scope: `repo`). Set auto-pull to **1 minute**.

- [ ] **Create GitHub Personal Access Token** (if not already done)
  GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate → scope: `repo`. Needed for mobile Obsidian Git auth.

## Blocking: Verify Sync

- [ ] **Test round-trip sync**
  1. Message `@MeteorBotBot`: `ingest this: "Sync test note"`
  2. Wait ~90 seconds
  3. Check Obsidian — note should appear in `raw/notes/`
  4. Edit a note in Obsidian, push
  5. On VPS: `sudo git -C ~/.openclaw-meteor/workspace/vault log --oneline -3` — your edit should appear

## Non-Blocking: Configuration

- [ ] **Decide Meteor operator**
  Currently your Telegram ID (`467473650`) is the owner. If someone else will operate Meteor, update `channels.telegram.groupAllowFrom` and `tools.elevated.allowFrom.telegram` in `~/.openclaw-meteor/openclaw.json`.

- [ ] **Add Meteor to group chats** (if desired)
  Add `@MeteorBotBot` to the group, then add the group ID to `channels.telegram.groups` in `~/.openclaw-meteor/openclaw.json`. See [tutorial.md](tutorial.md#adding-meteor-to-a-group-chat).

- [ ] **Customize Meteor's personality**
  Edit `~/.openclaw-meteor/workspace/AGENTS.md` to adjust tone, language defaults, wiki conventions. Changes are picked up on the next conversation turn.

## Non-Blocking: Nice to Have

- [ ] **Set git identity for VPS vault commits**
  Currently commits as `root <root@srv1176342>`. To fix:
  ```bash
  sudo git -C ~/.openclaw-meteor/workspace/vault config user.name "Meteor Bot"
  sudo git -C ~/.openclaw-meteor/workspace/vault config user.email "meteor@yourdomain.com"
  ```

- [ ] **Set up Obsidian templates** (optional)
  Add note templates in `.obsidian/templates/` for quick manual note creation that follows the llm-wiki frontmatter conventions.

- [ ] **Monitor sync log** after first few days
  ```bash
  tail -20 /tmp/meteor-vault-sync.log
  ```
  If clean, no action needed. If errors, check GitHub auth token expiry.

---

*Last updated: 2026-04-13*
