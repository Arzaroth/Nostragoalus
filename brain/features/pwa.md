# PWA (install + update UX)

Nostragoalus is an installable Progressive Web App. This page covers the
install / download / reload experience; the service-worker mechanics live in
[../architecture/rendering.md](../architecture/rendering.md) and the push receiver
in [web push](web-push.md).

## One banner, three phases

A single component `PwaBanner.vue` renders one of three priority-ordered phases:

1. `ready` (highest) - an update is downloaded and waiting. Shows a reload prompt
   (driven by the outdated-build poll or `$pwa.needRefresh`), with a
   deterministic `controllerchange` reload.
2. `downloading` - a new worker is precaching. Shows a spinner, no buttons,
   transient.
3. `installable` - `$pwa.showInstallPrompt && !isPWAInstalled`. Shows Install
   (`$pwa.install()`) and a dismiss that persists the opt-out
   (`$pwa.cancelInstall()`).

## Download tracking

`app/plugins/pwa-status.client.ts` hooks the vite-pwa `service-worker:registered`
event and tracks the incoming worker through `updatefound` + `statechange`,
writing a `sw-downloading` `useState`. It guards with
`if (!navigator.serviceWorker.controller) return` so a first-visit precache is
not mistaken for an update download. The component reads the `useState`, which
keeps it decoupled and testable without a real service worker.

## Registration + update polling

`registerType: 'prompt'` means the user controls activation, which avoids an
asset swap mid-prediction. `periodicSyncForUpdates: 3600` makes long-lived
tabs / installed instances notice deploys hourly, and
`app/plugins/update-check.client.ts` polls the build manifest as a backstop.

## Layout

Mobile gets a full-width bottom banner (`inset-x-3 bottom-3`); desktop gets a
centered top card (`sm:top-4 sm:mx-auto sm:w-max sm:max-w-md`). The transition is
translateY-only. i18n keys under `update.*` in all five locales.

Shipped in v2.1.0. The live install and the real download -> ready progression
are flagged for a real-browser verify pass.

## Sources

- `app/components/PwaBanner.vue`, `app/plugins/pwa-status.client.ts`,
  `app/plugins/update-check.client.ts`
- PWA config in `nuxt.config.ts`; service worker in `app/service-worker/sw.ts`
