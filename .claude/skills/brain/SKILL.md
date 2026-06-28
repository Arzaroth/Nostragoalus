---
name: brain
description: Use and maintain the brain/ knowledge base - the committed docs describing how Nostragoalus works (architecture, features, decisions, glossary). Invoke when the user asks how/where something works ("how does scoring work", "where does X live", "explain the chat feature"), when onboarding, or when asked to update, audit, or fix the brain after a change. Read brain/BRAIN.md first; navigate via the indexes, not a whole-tree grep.
---

# The brain

`brain/` is the committed knowledge base: how the app works, written so you can
answer without reading the source. Use it as the first stop for understanding,
and keep it true to the code.

## Navigating (to answer a question)

1. Open `brain/BRAIN.md` - the entry index. It has a topic table and a **Find by
   question** table.
2. Drill via the sub-indexes: `brain/architecture/index.md` (the how) and
   `brain/features/index.md` (the what). Don't grep the whole tree; the indexes
   are the routing layer.
3. Land on the leaf doc. It is self-contained and ends with a `## Sources` list
   of the real code paths - follow those only if the doc isn't enough or you
   suspect drift.
4. Terms -> `brain/glossary.md`. Rationale / "why" -> `brain/decisions.md`.

Structure:

```
brain/BRAIN.md                 root index + find-by-question
brain/stack.md  operations.md  glossary.md  decisions.md
brain/architecture/index.md    overview server client database auth realtime
                               storage rendering providers testing i18n
brain/features/index.md        one doc per feature (incl. easter-eggs.md)
```

## Maintaining (after a change)

The brain is load-bearing and the rule is in `CLAUDE.md` ("The brain"). The code
is the source of truth - if a doc disagrees with reality, fix the doc.

- A change that makes a brain doc wrong fixes that doc in the **same commit/PR**.
- New feature -> add `brain/features/<name>.md`, then a row in
  `brain/features/index.md` and the catalog table in `brain/BRAIN.md`. New
  cross-cutting tech/subsystem -> add or update a `brain/architecture/*.md`.
- New non-obvious decision -> append it to `brain/decisions.md` with its "why".
  New domain/technical term -> add it to `brain/glossary.md`.
- Style: dense, skimmable, present tense, normal prose (not caveman). No
  em-dashes. Cross-link siblings with relative markdown links. Cite source paths
  instead of restating code. End each doc with `## Sources`.

## Auditing (drift check on request)

When asked to verify the brain matches reality:

1. Scope it to the relevant leaf doc(s) - don't re-audit everything.
2. For each, read the `## Sources` paths and confirm the doc's claims still hold
   (table/enum names, file locations, behavior). Reconcile against the live
   schema (`db/app-schema.ts`), routes, and services.
3. Where they diverge, the code wins: correct the doc. Note what you changed.
4. If a whole subsystem moved or a feature shipped/was removed, update the
   indexes (`BRAIN.md`, the two `index.md`) too so navigation stays accurate.

For a broad audit, fan out read-only agents (one per architecture or feature
doc) that each diff their doc against its `## Sources`, then apply the fixes.
