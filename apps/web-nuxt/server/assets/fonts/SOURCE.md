# Vendored fonts (share-card rendering)

These `.woff` files are embedded into the satori OG-image renderer
(`server/utils/share`). satori supports `ttf`/`otf`/`woff` but not `woff2`,
hence `.woff`. Each is the official fontsource subset:

- `Inter-400.woff` / `Inter-700.woff` - Inter, Latin subset
  (covers en/fr/tlh). From `@fontsource/inter@5.2.8`
  (`files/inter-latin-{400,700}-normal.woff`).
- `NotoSansThai-400.woff` / `NotoSansThai-700.woff` - Noto Sans Thai, Thai
  subset (covers th). From `@fontsource/noto-sans-thai@5.2.8`
  (`files/noto-sans-thai-thai-{400,700}-normal.woff`).

satori falls back per-glyph across the font array, so Latin text uses Inter
and Thai text uses Noto Sans Thai automatically.

## Licenses

Both are SIL Open Font License 1.1.

- Inter: https://github.com/rsms/inter (OFL-1.1)
- Noto Sans Thai: https://github.com/notofonts/thai (OFL-1.1)

To refresh: `pnpm add -D @fontsource/inter @fontsource/noto-sans-thai`, copy the
`files/*-{400,700}-normal.woff` files here, then `pnpm remove` the packages.
