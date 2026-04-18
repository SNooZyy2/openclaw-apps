# ADR-008: Meteor Vault Extensions — Tasks, Meetings, Projects, People

**Status**: Proposed
**Date**: 2026-04-13
**Author**: snoozyy

---

## Context

Meteor currently runs the llm-wiki v0.2 protocol: a research-oriented knowledge base with `raw/` → `wiki/` → `output/` pipeline. The vault structure and AGENTS.md are optimized for ingesting sources, compiling articles, and querying synthesized knowledge.

However, the intended use goes beyond research. Meteor should also serve as:

1. **Business orchestration** — Track projects, decisions, dependencies, deadlines
2. **Task keeping** — Manage action items with status, assignees, due dates
3. **Meeting notes organizer** — Ingest raw meeting notes, extract action items, link to projects and people
4. **Contact/people context** — Track who's who, their roles, and relationship to projects

The llm-wiki structure already supports this — it's organized markdown with frontmatter and indexes. The extension is adding new top-level directories with their own conventions, while keeping the existing research pipeline unchanged.

---

## Decision

**Extend the vault with four new top-level directories**: `tasks/`, `meetings/`, `projects/`, `people/`. Each follows the same index + frontmatter pattern as the existing wiki structure. Meteor's AGENTS.md gets new protocol sections describing how to handle each type.

### Why not separate vaults?

The llm-wiki hub model supports multiple topic wikis (`vault/topics/business/`, `vault/topics/research/`). But the power is in **cross-linking**: a meeting produces tasks, tasks belong to projects, projects reference research articles, people attend meetings. Splitting into separate vaults breaks these connections. One vault, multiple concerns.

### Why not just use wiki/ for everything?

Tasks and meetings are fundamentally different from wiki articles:

- **Wiki articles** are synthesized, living documents. They get rewritten as sources change.
- **Tasks** have lifecycle state (open → in-progress → done). They're closed, not rewritten.
- **Meeting notes** are timestamped records. They're immutable once filed (like raw sources).
- **Projects** are containers that aggregate tasks, meetings, and wiki articles.

Mixing these into `wiki/concepts/` would pollute the research pipeline and confuse the compilation step.

---

## Proposed Structure

```
vault/
├── raw/              (unchanged — research sources)
├── wiki/             (unchanged — synthesized articles)
├── output/           (unchanged — reports, deliverables)
├── inbox/            (unchanged — drop zone)
├── tasks/            (NEW)
│   ├── _index.md
│   └── *.md
├── meetings/         (NEW)
│   ├── _index.md
│   └── *.md
├── projects/         (NEW)
│   ├── _index.md
│   └── <slug>/
│       ├── _index.md
│       └── *.md
└── people/           (NEW)
    ├── _index.md
    └── *.md
```

### tasks/

Action items with lifecycle state.

```yaml
---
title: "Follow up with supplier on pricing"
status: open|in-progress|done|cancelled
assignee: "Name or @handle"
due: YYYY-MM-DD
priority: high|medium|low
project: projects/slug
source: meetings/YYYY-MM-DD-meeting-name.md
tags: [tag1, tag2]
created: YYYY-MM-DD
completed: YYYY-MM-DD
---
```

**Naming**: `YYYY-MM-DD-descriptive-slug.md` (date of creation)

**Operations**:
- "Add task: X by Friday" → creates task with due date
- "What's overdue?" → reads index, filters by date
- "Mark X done" → updates status + completed date
- "What tasks does project Y have?" → filters by project field

### meetings/

Timestamped meeting records. Immutable once filed (like raw sources).

```yaml
---
title: "Weekly sync — supplier negotiations"
date: YYYY-MM-DD
attendees: [Name1, Name2]
project: projects/slug
tags: [tag1, tag2]
action_items: [tasks/YYYY-MM-DD-task-slug.md, ...]
---
```

**Naming**: `YYYY-MM-DD-descriptive-slug.md`

**Operations**:
- User pastes raw notes or voice transcript → Meteor ingests, extracts structure
- Meteor auto-extracts action items → creates tasks in `tasks/`, links back
- Meteor links attendees to `people/` entries
- Meteor links to relevant `projects/` and `wiki/` articles

### projects/

Project containers. Each project is a directory with its own index.

```yaml
---
title: "Supplier Renegotiation Q2"
status: active|paused|completed|cancelled
lead: "Name"
started: YYYY-MM-DD
due: YYYY-MM-DD
tags: [tag1, tag2]
summary: "One-line project description"
---
```

**Naming**: Directory slug: `descriptive-slug/`

**Structure**:
```
projects/supplier-renegotiation/
├── _index.md         # Project overview, linked tasks/meetings/articles
├── brief.md          # Goals, scope, constraints
└── *.md              # Project-specific notes, decisions
```

**Operations**:
- "Create project: X" → creates directory + brief.md
- "What's the status of project X?" → reads index, aggregates linked tasks
- "Link this meeting to project X" → updates both frontmatter

### people/

Contact context. Who's who, their roles, relationship to projects.

```yaml
---
title: "Name"
role: "Title / Company"
contact: "email, phone, telegram"
tags: [tag1, tag2]
projects: [projects/slug1, projects/slug2]
---
```

**Naming**: `firstname-lastname.md`

**Operations**:
- Auto-created when a new name appears in meeting attendees
- "Who is X?" → reads their file + linked projects/meetings
- "What meetings has X been in?" → searches meetings/ for attendee

---

## Cross-Linking

The power is in connections. Every type links to every other:

```
meetings/2026-04-13-supplier-sync.md
  → attendees link to people/
  → action_items link to tasks/
  → project links to projects/

tasks/2026-04-13-follow-up-pricing.md
  → source links to meetings/
  → project links to projects/

projects/supplier-renegotiation/_index.md
  → aggregates tasks/, meetings/, wiki/ articles

wiki/topics/supplier-market-analysis.md
  → sources link to raw/
  → referenced by projects/
```

Obsidian's graph view shows all of this visually.

---

## AGENTS.md Changes

New protocol sections to add:

1. **Task management** — How to create, update, query, and close tasks. Auto-extract from meetings.
2. **Meeting processing** — How to ingest raw notes, extract structure, create action items.
3. **Project management** — How to create projects, link artifacts, report status.
4. **People tracking** — How to create and maintain contact records. Auto-create from meetings.
5. **Cross-linking rules** — When and how to link between all types. Bidirectional links.

The existing research protocol (ingest, compile, query, research, lint) stays unchanged.

---

## Implementation Plan

### WP-1: Create directory structure

- Create `tasks/`, `meetings/`, `projects/`, `people/` with `_index.md` files
- Update master `_index.md` with new quick navigation links
- Update `config.md` with expanded scope

### WP-2: Update AGENTS.md

- Add task management protocol
- Add meeting processing protocol
- Add project management protocol
- Add people tracking protocol
- Add cross-linking rules
- Keep existing research protocol unchanged

### WP-3: Update TOOLS.md

- Add patterns for frontmatter-based filtering (status, due dates, assignees)
- Add patterns for cross-directory linking

### WP-4: Test

- Create a sample project, meeting, task, and person
- Verify cross-linking works
- Verify Obsidian graph shows connections
- Verify indexes stay consistent

---

## Risks

| Risk | Mitigation |
|------|------------|
| Vault becomes too large for LLM context | 3-hop navigation via indexes. LLM never reads everything. |
| Task/meeting volume overwhelms indexes | Archive completed items periodically (move to `tasks/.archive/`) |
| Cross-linking creates maintenance burden | Structural guardian auto-checks bidirectional links on every write |
| Scope creep — Meteor tries to be a full PM tool | AGENTS.md explicitly bounds what Meteor does vs dedicated PM tools |

---

## Open Questions

1. **Archive policy** — When should completed tasks/old meetings be archived? After 30 days? After project completion? Manual only?
2. **Recurring tasks** — Support `recurrence: weekly|monthly` in frontmatter, or keep it simple with manual creation?
3. **Meeting transcription** — If users send voice notes via Telegram, can Meteor transcribe? (Depends on OpenClaw audio tool support.)
4. **Integration with Atlas** — Should Atlas be able to query Meteor's vault? Currently fully isolated. Cross-instance queries would require shared access.

---

## References

- [ADR-007](007-multi-instance-openclaw-meteor.md) — Meteor deployment
- [llm-wiki](https://github.com/nvk/llm-wiki) — Base protocol
- [Meteor tutorial](../implementation/meteor-bot/tutorial.md) — Current setup docs
