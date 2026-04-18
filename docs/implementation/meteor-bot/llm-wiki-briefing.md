# LLM Wiki Agent Briefing

> North star document for Meteor's wiki protocol. Written by Claude Opus, based on Andrej Karpathy's original vision. This is the quality bar — AGENTS.md is the implementation.

You are maintaining an LLM Wiki system. This document is written by a senior AI (Claude Opus) to help you align your implementation with Andrej Karpathy's original vision and avoid common failure modes. Read this carefully before making any changes to the wiki system.

---

## Part 1: Karpathy's Core Vision (Non-Negotiable Principles)

### The wiki is a COMPILED artifact, not a note dump

The central insight: a wiki is to raw sources what a compiled binary is to source code. The LLM reads raw material and **compiles** it into structured, interlinked knowledge. This is NOT:
- Copy-pasting summaries of source documents
- Creating one wiki page per source document
- Dumping extracted text into markdown files

This IS:
- Reading a source, understanding it, then updating MULTIPLE existing wiki pages with the new information
- A single source touching 10-15 wiki pages across entities, concepts, and topic summaries
- Cross-references and contradictions being resolved at write time, not left for the reader

**Self-check question:** When you ingest a new source, do you create one new page, or do you update many existing pages? If the answer is "one new page," you are doing RAG with extra steps, not building a wiki.

### Three layers, strict separation

1. **raw/** — Immutable. You NEVER modify files here. These are the source of truth. Articles, papers, transcripts, notes. The human curates what goes in here. You read from it.

2. **wiki/** — YOUR domain. You own every file here. You create, update, rewrite, merge, and delete pages. The human reads from here but does not write. Every page should have backlinks, cross-references, and a clear relationship to other pages. The wiki is a web of knowledge, not a list of documents.

3. **Schema** (CLAUDE.md / AGENTS.md / equivalent) — The contract between you and the human. Defines conventions, templates, workflows. You and the human co-evolve this over time. When you discover a pattern that works, propose adding it to the schema.

**Self-check question:** Is there ANY file in wiki/ that the human wrote by hand? If yes, that violates the separation. Move it to raw/ and re-ingest it.

### The human's job vs. your job

Human does: curate sources, direct analysis, ask good questions, think about meaning, make strategic decisions about what to investigate next.

You do: ALL the grunt work. Summarizing, cross-referencing, filing, updating backlinks, maintaining the index, flagging contradictions, keeping pages consistent, suggesting new questions to investigate, suggesting new sources to find. The human should never have to do bookkeeping.

### Knowledge compounds — this is the whole point

Every ingest should make the wiki richer. Every query that produces a good answer should be filed back into the wiki as a new page. Every lint pass should strengthen the structure. The wiki gets MORE valuable over time, not stale. If you find yourself re-deriving the same relationships on every query, the wiki is failing at its job.

---

## Part 2: Common Failure Modes — What NOT To Do

### DO NOT create a 1:1 mapping between sources and wiki pages

Wrong: `raw/paper-on-attention.pdf` → `wiki/paper-on-attention.md`
Right: `raw/paper-on-attention.pdf` → updates to `wiki/attention-mechanisms.md`, `wiki/transformer-architecture.md`, `wiki/vaswani-et-al.md`, `wiki/self-attention.md`, `wiki/key-query-value.md`, plus index update, plus log entry.

A source is INPUT. Wiki pages are organized by CONCEPT, ENTITY, TOPIC — never by source.

### DO NOT let the wiki sprawl into hundreds of tiny pages

Each page should be substantial enough to be useful on its own. A page that is just a title and two sentences should be merged into a parent concept page. Orphan pages (no inbound links) are a code smell — they mean the knowledge isn't integrated.

### DO NOT skip the index

`index.md` is not optional decoration. It is how you (and the human) navigate the wiki. Every page must be listed with a one-line summary. Organized by category. Updated on every ingest. When answering a query, you read the index FIRST to find relevant pages, then drill into the pages themselves. Without a maintained index, the wiki becomes a folder of files, not a knowledge base.

### DO NOT skip the log

`log.md` is your chronological memory. Append-only. Every ingest, every significant query, every lint pass gets an entry. Format entries consistently so they're grep-parseable:

```
## [2026-04-13] ingest | Source Title
- Updated: page-a.md, page-b.md, page-c.md
- Created: page-d.md
- Key finding: [one sentence]

## [2026-04-13] query | "What is the relationship between X and Y?"
- Answer filed as: wiki/x-y-relationship.md

## [2026-04-13] lint | Full pass
- Fixed: 3 broken backlinks
- Flagged: page-e.md contradicts page-f.md on [topic]
- Suggested: create page for [concept] (mentioned 4 times, no dedicated page)
```

### DO NOT treat all claims as equal

When you write "X uses Y for Z," that claim has a source, a date, and an implicit confidence. If two sources disagree, don't just pick one — flag the contradiction explicitly on the page. When newer information supersedes older information, mark the old claim as superseded with a link to the update. This is how the wiki earns trust.

### DO NOT over-engineer the tooling before the content is there

No vector databases, no embedding pipelines, no complex search infrastructure until the wiki has 200+ pages and grep/index-based navigation demonstrably fails. The index file + simple text search works surprisingly well at moderate scale. Build the knowledge first, optimize retrieval later.

### DO NOT ingest garbage

Not everything deserves to be in the wiki. Low-quality sources, redundant content, tangential material — skip it or summarize it in one line on a related page. The human curates what goes into raw/, but you should push back if a source adds noise rather than signal. Quality over quantity.

### DO NOT forget to file good query answers back into the wiki

When someone asks a question and you synthesize a good answer from multiple wiki pages, that answer is NEW KNOWLEDGE. It connected things that weren't explicitly connected before. File it as a new wiki page. This is how queries compound into the knowledge base. Chat history is ephemeral. Wiki pages persist.

---

## Part 3: Operational Checklist

### On every INGEST, do all of these:

1. Read the source completely
2. Discuss key takeaways with the human (if interactive) or note them in the log
3. Write or update a summary/source page (what this source contains, when it was written, key claims)
4. Update ALL relevant entity pages (people, organizations, tools mentioned)
5. Update ALL relevant concept pages (topics, techniques, theories discussed)
6. Update the overview/synthesis page if the source changes the big picture
7. Check for contradictions with existing wiki content — flag them explicitly
8. Update index.md with any new or significantly changed pages
9. Append to log.md

### On every QUERY:

1. Read index.md to identify relevant pages
2. Read the relevant pages (usually 2-5)
3. Synthesize an answer with citations to wiki pages
4. If the answer is substantive and novel, offer to file it as a new wiki page
5. If the query reveals a gap in the wiki, note it

### On every LINT pass:

1. Find orphan pages (no inbound links) — merge or link them
2. Find broken or missing backlinks — fix them
3. Find contradictions between pages — flag them with `[CONTRADICTION]` markers
4. Find stale claims that newer sources have superseded — update them
5. Find important concepts mentioned but lacking their own page — suggest creating them
6. Check that index.md is complete and accurate
7. Suggest new questions to investigate and new sources to look for
8. Log the lint results

---

## Part 4: Questions to Audit Your Current Implementation

Answer these honestly. Each "no" is an improvement opportunity.

### Structure

1. Is raw/ strictly immutable? Does the agent ever modify files in raw/?
2. Does every wiki page have at least one backlink TO another page and one backlink FROM another page?
3. Is index.md a complete catalog of every wiki page with one-line summaries?
4. Is log.md being maintained with consistent, grep-parseable entries?
5. Are wiki pages organized by concept/entity/topic, NOT by source document?

### Ingest quality

6. When a new source is ingested, how many wiki pages get touched? If the answer is consistently 1, the compilation step is broken.
7. Are contradictions between sources explicitly flagged on the relevant pages?
8. Is there a clear distinction between facts, claims, and opinions on wiki pages?
9. Does the summary page for each source link to every wiki page it contributed to?

### Query quality

10. When answering a query, does the agent read index.md first?
11. Are good query answers being filed back as new wiki pages?
12. Can the agent answer multi-hop questions (questions that require connecting information from 3+ pages)?

### Maintenance

13. Has a lint pass ever been run? What did it find?
14. Are there orphan pages? How many?
15. Are there concepts mentioned on multiple pages that don't have their own dedicated page?
16. Is the overview page (if one exists) actually a synthesis, or just a list of topics?

### Schema

17. Is there a template for wiki pages that ensures consistency (frontmatter, summary line, backlinks section)?
18. Are the conventions documented in the schema file, or are they just implicit?
19. Has the schema evolved since initial setup, or is it still the first version?

---

## Part 5: The North Star

Karpathy's description of his own workflow: the LLM agent is open on one side, Obsidian is open on the other. The LLM makes edits based on conversation, and the human browses the results in real time — following links, checking the graph view, reading updated pages. **Obsidian is the IDE. The LLM is the programmer. The wiki is the codebase.**

The test of whether the wiki is working: can someone who has never seen the raw sources open the wiki in Obsidian, browse the interlinked pages, and come away with a deep understanding of the domain? If yes, the wiki is doing its job. If they'd need to read the raw sources anyway, the compilation step is failing.

The wiki should feel like a well-maintained Wikipedia for your specific domain — not like a folder of AI-generated summaries.

---

## Part 6: Implementation Notes for MiniMax M2.7 on OpenClaw

- You have ~200K context. Use it. Read the full index + 5-10 relevant pages in one pass for queries. Don't be stingy with context on ingest either — read the full source + all pages that might need updating.
- M2.7 has 97% skill adherence on complex skills. The schema file IS the skill definition. Make it precise, make it detailed, make it explicit about every convention.
- Token cost matters. Batch ingests where possible. Don't re-read the entire wiki on every operation — read index first, then targeted pages.
- File things as markdown with `[[wikilinks]]` so Obsidian renders the graph view. This is how the human inspects your work.
- Use consistent frontmatter on every wiki page:

```yaml
---
title: Page Title
summary: One sentence describing this page.
sources: [source-a.md, source-b.md]
related: [[page-x]], [[page-y]], [[page-z]]
created: 2026-04-13
updated: 2026-04-13
---
```

- The log should be the first thing you check at session start to understand what happened recently. The index should be the second thing.
