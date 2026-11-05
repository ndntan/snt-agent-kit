# snt-agent-kit (monorepo)

Foundation for Sensolus "agent apps".

## Packages

| Package | What | Who owns the code |
|---|---|---|
| [`packages/snt-agent-kit`](packages/snt-agent-kit/README.md) → `@sensolus/snt-agent-kit` | Widgets, theme CSS, `SntColors`, i18n framework + common strings | Platform team (locked, versioned) |
| [`packages/create-snt-agent-app`](packages/create-snt-agent-app/README.md) → `@sensolus/create-snt-agent-app` | Scaffolder generating a new app (App.jsx, Flask backend, configs) | Generated code is app-owned |

## Develop

```bash
npm install          # installs all workspaces
npm run build        # builds the kit (dist/, minified, no sourcemaps)
```

## Publish (npmjs.com)

- Registry: public npmjs, `@sensolus` org. Config in `.npmrc`.
- The **Publish to npm** GitHub Actions workflow (`.github/workflows/publish.yml`) publishes both packages. Run it from the Actions tab once the version bumps are on `main`. It uses npm trusted publishing (OIDC), so no npm token is stored anywhere, and every version gets a provenance attestation.
- Manual publish (package owners only, `npm login` with 2FA): `npm run publish:kit` / `npm run publish:create`

## Create a new app

```bash
npm create @sensolus/snt-agent-app my-app
cd my-app && npm install && npm run dev
```

## Rules (the point of all this)

- Apps **import** the kit; they never copy widget source into their tree.
- No deep imports (`@sensolus/snt-agent-kit/dist/...`) — ESLint blocks this in generated apps.
- No re-declaring `Snt*` components in app code — ESLint blocks this too.
- Need a customization? Use widget slots/render props, or PR this repo. **No eject.**

## Sizing model

Fill-capable components (`SntTable`, `SntTabs`, `SntSidepanel`, the `SntDialog`
body) size to their parent. Their parent must give them a bounded height —
either an explicit `height`, or by being a flex column with `min-height: 0` and
`flex: 1` on the child.

Use the props the components expose to opt into the layout you want:

| Component | Prop | Values |
|---|---|---|
| `SntTable` | `scroll` | `'internal'` (default — table fills parent, body scrolls inside with sticky header/footer), `'none'` (natural height, page/parent owns scroll), `'viewport'` (cap at `calc(100vh - viewportOffset)`, opt-in for top-level pages) |
| `SntTable` | `viewportOffset` | Pixels subtracted from `100vh` when `scroll='viewport'` (default `120`) |
| `SntTabs` | `fillHeight` | `false` (default — natural height) / `true` (stretch tab strip + active panel to fill parent — pair with bounded-height parent) |
| `SntDialog` | `scroll` | `'auto'` (default — dialog body scrolls), `'none'` (defer scroll to a fill-capable child like `<SntTable scroll="internal">`, prevents double scrollbars) |

Don't override agent-kit internal selectors from consumer CSS — if a layout
needs something the props don't cover, open an issue.
