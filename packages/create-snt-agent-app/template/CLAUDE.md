# CLAUDE.md

> **Widgets, theme, colors and the i18n framework come from `@sensolus/snt-agent-kit`** —
> import from the package, never copy widget source into this repo. ESLint enforces:
> no deep imports into the kit, no re-declaring `Snt*` components. App-owned translation
> keys live in `frontend/src/i18n/translations/` and are merged via `<LocaleProvider messages>`.
> Theme: `import '@sensolus/snt-agent-kit/theme.css'` (in `main.jsx`).

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Run Commands

```bash
# Local development (frontend + backend)
cd frontend && npm install       # Install frontend dependencies
cd frontend && npm run dev       # Start Vite dev server on :3000 (proxies /api to Flask)
python backend/app.py            # Start Flask backend on :5000 (in separate terminal)

# Production build
cd frontend && npm run build     # Build frontend to frontend/dist/
python backend/app.py            # Serves from frontend/dist/ (dev server; the image runs gunicorn — see Dockerfile CMD)

# Docker build and run
docker build -t {{APP_NAME}} .
docker run -p 5000:5000 {{APP_NAME}}
```

Development: http://localhost:3000 (Vite with HMR)
Production: http://localhost:5000 (Flask serves built frontend)

## Architecture

This is a Flask + React (Vite) dashboard for querying the Sensolus public API.

### Project Structure

```
{{APP_NAME}}/
├── frontend/              # React frontend (Vite)
│   ├── src/
│   │   ├── main.jsx       # Entry point
│   │   ├── App.jsx        # Main app component
│   │   ├── i18n/          # App translation keys (framework from kit)
│   │   └── styles/
│   │       └── app.css    # App-specific styles
│   ├── index.html         # Vite entry HTML
│   ├── vite.config.js     # Vite configuration
│   ├── package.json       # Node dependencies
│   └── eslint.config.js   # ESLint config
├── backend/               # Flask backend
│   ├── app.py             # Flask app (API proxy)
│   └── requirements.txt   # Python dependencies
├── sensolus-app.yaml      # App descriptor — single source of truth
└── openapi.json           # Sensolus API spec (reference)
```

The backend acts as a proxy to avoid CORS issues - the frontend calls `/api/organisations` which forwards to the Sensolus API.

### App descriptor (sensolus-app.yaml)

`sensolus-app.yaml` at the repo root is the single source of truth for the app manifest (landing pages, secrets, database, cron jobs). The Agent Manager reads it from the git repo at registration time (its `build:` block drives the Jenkins pipeline), and the Dockerfile bakes it into the image so the backend serves it at `/.well-known/sensolus-app` (the `build:` block is stripped at runtime). Edit the YAML — never hardcode descriptor content in `app.py`.

## Sensolus API Authentication

The backend supports two authentication methods for the Sensolus API:

### 1. Session Cookie (Bearer Token)
If the user has a `prod-sensolus-token` cookie (from being logged into cloud.sensolus.com), it is passed as a Bearer token in the Authorization header:
```
Authorization: Bearer <token>
```

### 2. API Key (Query Parameter)
API keys are passed as a query parameter to the Sensolus API:
```
GET /rest/api/v2/organisations?apiKey=<key>
```

**Priority:** Session cookie takes precedence over API key if both are present.

## CI/CD

Jenkins pipeline (Jenkinsfile) builds the Docker image using multi-stage build (Node for frontend, Python for backend).

## Sensolus Design System

This app uses the official Sensolus color palette and widgets. **Always use these when extending this app.**

### Importing Widgets

```jsx
import { SntButton, SntInput, SntBadge, SntTable } from '@sensolus/snt-agent-kit'
```

### Available Widgets

| Component | Description |
|-----------|-------------|
| `SntButton` | Button. Default (white, `secondary`) is the everyday primary action; use `emphasis` (dark blue) sparingly for the single most important action. Other variants: success, danger, warning, info. (`primary` is a deprecated alias for `emphasis`.) The first letter of the label is auto-capitalised. |
| `SntIcon` | Named SVG icon (`export`, `download`, `edit`, `settings`, `pdf`, `report`, …). Inherits text color via `currentColor`; `size` to scale. |
| `SntLink` | Brand-blue text link (underline on hover). `href` → `<a>`; `onClick` only → link-styled `<button>` for tertiary actions (e.g. a dialog's "Learn more"). |
| `SntInput` | Text input (onChange receives value directly, not event) |
| `SntBadge` | Status badge with color variants |
| `SntCard` | Card container with optional image, title, badge |
| `SntSection` | Titled page section (title + optional description + body) for grouping content. Use for page regions; `SntCard` is for content tiles. |
| `SntTable` | Sortable, paginated data table |
| `SntSpinner` | Loading spinner (sizes: small, medium, large) |
| `SntLoadingOverlay` | Centered spinner with optional message |
| `SntToolbar` | Horizontal toolbar for grouping actions |
| `SntButtonGroup` | Segmented control for exclusive selection |
| `SntColors` | JavaScript color constants |

### Color Palette (CSS Variables)

```css
/* Primary Brand Colors */
--snt-blue-darkest: #212851;  /* Primary - headers, buttons */
--snt-blue: #0071A1;          /* Links, focus states */

/* Greys */
--snt-grey: #535E6F;          /* Secondary text */
--snt-grey-light: #B8BFCA;    /* Borders */

/* Backgrounds */
--snt-bg-zebra: #F9FAFA;      /* Alternating rows */
--snt-white: #FFFFFF;

/* Status Colors */
--snt-green: #39CB99;         /* Success */
--snt-yellow: #FFCC66;        /* Warning */
--snt-red: #E00000;           /* Danger */
--snt-ui-selected: #00A6ED;   /* Info */
```

### Widget Examples

```jsx
// Button — the white default is the everyday primary action
<SntButton onClick={handleClick}>Save</SntButton>

// Use emphasis (dark blue) only for the single most important action on a screen
<SntButton variant="emphasis" onClick={handleConfirm}>Confirm</SntButton>

// Input
<SntInput value={query} onChange={setQuery} placeholder="Search..." />

// Badge
<SntBadge variant="success" text="ACTIVE" />

// Button Group (toggle)
<SntButtonGroup
  options={[
    { value: 'cards', label: 'Cards' },
    { value: 'table', label: 'Table' }
  ]}
  value={viewMode}
  onChange={setViewMode}
/>

// Table
<SntTable
  data={items}
  columns={[
    { key: 'name', header: 'Name' },
    { key: 'status', header: 'Status', render: (row, val) => <SntBadge text={val} /> }
  ]}
/>

// Loading
<SntLoadingOverlay message="Loading data..." />
```

### Usage Guidelines

1. **Always use CSS variables** for colors instead of hardcoded hex values
2. **Import widgets** from `@sensolus/snt-agent-kit` - they're modular ES modules
3. **Follow existing patterns** in `frontend/src/App.jsx` for examples
4. **Reference the baseline** at `/sensolus/work/baseline/` for additional components not yet ported
5. **Put the matching `SntIcon` in the primary button** whenever a mockup has an Export, Download, Edit, Settings, PDF, or Report action — e.g. `<SntButton icon={<SntIcon name="export" />}>Export</SntButton>`.
6. **Button order in forms:** put the blue (`variant="emphasis"`) action **first** and the white (default) action **second** (e.g. Save before Cancel). This is a deliberate exception to the white-is-primary default and applies only to forms.
7. **Overlay / dialog footer order (always):** blue (`variant="emphasis"`) first → white (default) second → link (`SntLink`) third, in that sequence — e.g. Delete, Cancel, Learn more. The tertiary action is always an `SntLink`, never a button.

### Page layout rules

These govern how widgets are composed on a page. Follow them when building or editing pages.

1. **Page wrapper:** render page content inside `.page-root` — it carries the standard padding (24px top, 16px sides/bottom). Don't add your own outer padding.
2. **Page header:** start every page with `SntPageHeader` for the title (and back button / actions). Don't hand-roll an `h1` + back chevron.
3. **`SntSummaryStat` is never wrapped in a panel.** Place stat tiles directly in a `.summary-stats-row` on the page background — never inside an `SntCard`/panel. The row gaps give them enough white space to live on the page on their own. Non-clickable stats are flat white tiles (no border); clickable ones carry a grey fill + border, which is distinctive enough on its own — they don't need an enclosing card to set them apart. Reserve `SntCard` for content tiles further down.
4. **Group sections with `SntSection`, content tiles with `SntCard`.** Use `SntSection` for titled page regions (a heading + body); use `SntCard` for individual content tiles within a region. Don't nest a section inside a card.
5. **Avoid pie charts — use bar charts.** For part-to-whole or category comparisons, render a bar chart, not a pie/donut. Bars are easier to read and compare than angles/slices. Reserve pies for nothing by default.
6. **Every chart axis has a label.** Both the x- and y-axis must carry a name (with units where relevant, e.g. "Distance (km)"). Never ship a chart with unlabelled axes.
7. **Cards are auto-height; siblings in a row match the tallest.** A card sizes to its own content by default — don't set fixed heights. When cards sit side by side (e.g. an `SntGrid` row), they stretch to the height of the tallest card in that row so their tops and bottoms align (use `align-items: stretch`, the default for flex/grid rows). Don't hand-tune per-card heights to fake alignment.
8. **Form fields are auto-width with a 100px minimum.** Input fields size to their container/content rather than a fixed width, but never shrink below `min-width: 100px`. Don't hardcode field widths.
9. **Form labels are right-aligned.** In a label + field form layout, align label text to the right (toward the field it describes).
10. **Filters sit in a white panel.** Filter controls (e.g. an `SntSidepanel` / `SntFilterSection`, or a filter bar) have a white panel background that sets them apart from the page. This is the opposite of summary stats (rule 3): filters are framed, stats are not.
11. **Toolbars and date range pickers go under a title.** Place an `SntToolbar` or `SntDateRangePicker` directly beneath the section/page title it controls, not in the title row. When both are present, stack them (one under the other) with the toolbar first and the date range picker second.
12. **Body text is capped at 750px wide.** For readability, running text (paragraphs, descriptions, help copy) never exceeds `max-width: 750px`. Full-width containers (tables, maps, cards) are exempt — this applies to prose.
13. **Vertical filter panels are at most 2 columns wide.** A filter panel laid out vertically (e.g. an `SntSidepanel` of stacked `SntFilterSection`s) spans no more than 2 of the 12 page columns. Keep filters as a narrow side rail; give the freed width to the content area.

## Internationalization (i18n)

The app fetches user preferences (language, timezone, units) from `/api/loginInfo` on startup and provides them via React context.

### Supported Languages

en, nl, fr, de, es — English is the fallback for any missing keys.

### Using Translations in Components

```jsx
import { useLocale, formatNumber, formatShortDate } from '../i18n'

function MyComponent() {
  const { t, intlLocale, timezone } = useLocale()

  return (
    <div>
      <h1>{t('orgList.title')}</h1>
      <span>{formatNumber(1234, intlLocale)}</span>
      <span>{formatShortDate('2026-03-23', intlLocale, timezone)}</span>
    </div>
  )
}
```

### Adding Translations

Translation files are in `frontend/src/i18n/translations/`. Each file exports a flat object with dot-namespaced keys:

```js
// Simple string
'common.cancel': 'Cancel',

// Interpolated string (use function)
'table.showing': (from, to, total) => `Showing ${from} - ${to} of ${total} items`,
```

### Date/Number Formatting

Always use `intlLocale` and `timezone` from `useLocale()` — never hardcode locales:

```jsx
import { formatShortDate, formatDateTime, formatNumber } from '../i18n'

formatShortDate('2026-03-23', intlLocale, timezone) // "23 mrt. 2026" (nl)
formatNumber(1234, intlLocale)                       // "1.234" (nl) vs "1,234" (en)
```

### Available Context Values

`useLocale()` provides: `language`, `intlLocale`, `timezone`, `firstDayOfWeek`, `unitDistance`, `unitTemperature`, `t()`, `loading`
