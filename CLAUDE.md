# Nostragoalus - project instructions

## Keep the planning docs current as you work

- **TODO.md** (tech debt, deferred work): tick items your change resolves, in
  the same commit or PR. When a review or feature pass defers something, add
  it under the matching section with enough context to act on later. New
  feature = new debt section if it left any.
- **ROADMAP.md** (feature backlog + design notes): tick items when they ship
  (note the release version). When a feature is discussed and decisions are
  made, capture them on the item - decisions not written down are lost.
  When starting a feature, also seed it as IN_PROGRESS in
  `mise-tasks/roadmap-seed` and mention the public title/description so it
  can be added to the prod roadmap.
- Both files live on `main`; update them there even when feature work happens
  in a worktree branch.
- Surprise/secret features stay out of every committed doc (changelog,
  ROADMAP.md, seeds) - track them in session memory only.
