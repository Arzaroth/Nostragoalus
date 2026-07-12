# Nostragoalus Design System

A standalone, renderable mirror of the live app's visual language, kept in sync
with the **Nostragoalus Design System** project on
[claude.ai/design](https://claude.ai/design) so UI/UX stays consistent.

## Source of truth

The app theme is authored in code; this folder reflects it. When the look
changes, edit the code **first**, then re-sync:

| Concern | Code source |
| --- | --- |
| Colors, primary/surface scales, light/dark schemes | `lib/theme.ts` (PrimeVue Aura `definePreset`) |
| Brand semantics (`--ng-star`, `--ng-danger`, `--ng-success`), gradient backdrop, `.ng-card` | `app/assets/css/main.css` |
| Dark-mode selector (`.app-dark`) | `nuxt.config.ts` + `uno.config.ts` |
| Components | `app/components/*.vue` |
| Brand assets | `public/brand/*` (copied into `brand/assets/`) |

`tokens.css` is the distilled token set; each preview card inlines an
equivalent block so it renders standalone in the Design pane.

## Layout

```
design-system/
  tokens.css              # distilled design tokens (light + dark + gradient)
  index.html              # overview card
  foundations/            # colors, typography, surfaces & elevation
  components/             # buttons, cards, score-input, pill, bracket, countdown,
                          # champion-pick, password-strength, prediction row
  brand/                  # logo lockup + assets/ (mark, avatar, banner-mini)
```

Every preview's first line is a `<!-- @dsCard group="..." name="..." -->` marker;
the Design pane builds its card index from those.

## Syncing to claude.ai/design

Driven by the `DesignSync` tool (see the `/design-sync` workflow). Incremental,
one component at a time - never a wholesale replace:

1. `list_projects` -> find the **Nostragoalus Design System** project.
2. `list_files` / `get_file` -> diff against this folder.
3. `finalize_plan` with `localDir` = repo root, writes = `design-system/**`.
4. `write_files` (reads from `localPath`, uploads only changed cards).

## Editing rules

- Keep token values identical to `lib/theme.ts` / `main.css`. Don't fork them here.
- Show both light and dark in every card (`.app-dark` panel).
- New shared component in the app -> add a matching card here, then re-sync.
