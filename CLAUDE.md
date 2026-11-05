# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

npm workspaces monorepo with two published packages and one private dev playground:

| Path | Published as | Role |
|---|---|---|
| `packages/snt-agent-kit/` | `@sensolus/snt-agent-kit` | The library: `Snt*` widgets, theme CSS, `SntColors`, i18n framework, `SntMap` + layer components. Locked source — apps import, never copy. |
| `packages/create-snt-agent-app/` | `@sensolus/create-snt-agent-app` | npm `create-` scaffolder. Generates a new app from `template/` (Vite + React frontend + Flask API-proxy backend). |
| `packages/widget-showcase/` | *(private — `"private": true`, never published)* | Dev playground that renders every `Snt*` widget. Vite-aliases `@sensolus/snt-agent-kit` to the kit's `src/` (see [packages/widget-showcase/vite.config.js](packages/widget-showcase/vite.config.js)), so kit edits HMR straight into the browser with no `npm run build` cycle. Run with `npm run showcase` (port 3100). Map keys come from `packages/widget-showcase/.env` (gitignored). Needs Node ≥20.19 — Vite 7. |

Note: `packages/create-snt-agent-app/template/` is the *seed* copied into a generated app. Its `CLAUDE.md`, `Jenkinsfile`, `package.json`, etc. are NOT the monorepo's — they ship into scaffolded apps. Don't conflate them with the repo-level files at the root.

## Commands

```bash
npm install                          # install all workspaces
npm run build                        # build the kit only (vite lib build → packages/snt-agent-kit/dist/)
npm run showcase                     # widget playground at http://localhost:3100/ (HMRs kit src)
npm test                             # scaffolder tests (node's built-in runner, packages/create-snt-agent-app/test/)
npm run publish:kit                  # manual publish of @sensolus/snt-agent-kit (package owners only: npm login + 2FA)
npm run publish:create               # manual publish of @sensolus/create-snt-agent-app (same)
```

No lint script at the repo root, and no tests for the kit itself. Verification = `npm run build`
succeeds, plus `npm test` when the scaffolder or its template changed.

## Release / publishing

The **Publish to npm** GitHub Actions workflow (`.github/workflows/publish.yml`, run by hand from the Actions tab on `main`) publishes BOTH packages. It uses npm trusted publishing: npm swaps the job's GitHub OIDC token for a one-off publish token, so there is no npm token to store or rotate, and every version gets a provenance attestation. It skips a package whose version is already on npm, so a run that failed half-way can simply be re-run, and it fails when neither version is new.

The trusted-publisher setting of each package on npmjs.com names the workflow file (`publish.yml`) and the GitHub environment (`npm`, deployments limited to `main`). Renaming either breaks publishing until a package owner recreates those settings.

**Every code change to a publishable package requires bumping BOTH `package.json` versions in the same commit** — not batched, not "at release time". If you touched either package, bump both:

- `packages/snt-agent-kit/package.json`
- `packages/create-snt-agent-app/package.json`

The package you didn't touch still needs at least a patch bump (publish parity), so every release ships both packages under one `CHANGELOG.md` heading. Without it the workflow skips that package (a notice, not a failure) and the two drift apart; if neither version moved, the run fails.

`packages/widget-showcase/package.json` is `"private": true` and is **not** published — leave its version alone.

Also update `CHANGELOG.md` (repo root) in the same commit — one heading per version (matching the kit's version), with a subsection per package. Use `- Version bump only (publish parity).` for the package that didn't change.

## Kit architecture

Public surface lives in `packages/snt-agent-kit/src/index.js`. It re-exports:

- `SntUiProvider` / `useSntUi` — injects the backend `api` adapter and `navigate` fn. Apps wrap their tree in this; widgets that hit the API read from `useSntUi().api`.
- `widgets/index.js` — all `Snt*` widgets, including the map module.
- `i18n/index.js` — `LocaleProvider`, `useLocale`, formatters.

Map module (`src/widgets/map/`) is the most layered piece. `SntMap` is a thin base primitive (tiles, geocoder, layers panel); domain layers like `SntGeozoneLayer`, `SntDeviceLayer`, `SntMarkerClusterLayer` opt in via `useSntMap()`. The bottom-left "Layers" chip control is populated through `useLayerToggle({ id, label, icon?, defaultVisible?, visible?, onChange? })` — built-in layers (`SntGeozoneLayer`) dogfood the same hook the docs tell consumers to use.

When adding/modifying a widget:
- Wire any backend call through `useSntUi().api`, never `fetch` directly.
- For text shown to users, add a translation key under `src/i18n/translations/` (en is the fallback) and use `useLocale().t(...)`.
- New widgets must be exported from `src/widgets/index.js` to reach consumers.

## Build artifacts

`packages/snt-agent-kit/dist/` is gitignored — it's built into the npm tarball at publish time (kit `package.json` runs `prepublishOnly: vite build` and ships `files: ["dist", "docs"]`), so there's nothing to keep in sync in the repo. Vite externalizes `react`, `react-dom`, `react/jsx-runtime`, and `leaflet*` — these stay as peer/regular deps and are resolved by the consuming app's bundler.

## House rules (from README)

- Apps **import** the kit; they never copy widget source.
- No deep imports (`@sensolus/snt-agent-kit/dist/...`) — generated apps' ESLint blocks this.
- No re-declaring `Snt*` components in app code — ESLint blocks this too.
- Customization happens via widget slots/render props or a PR to this repo. **No eject.**
