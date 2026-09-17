# Sample Agent

A modern React + Flask dashboard for querying the Sensolus public API. This application demonstrates how to build agents that integrate with the Sensolus platform using the official design system.

## Requirements

- **Node.js** 20+ (for frontend development)
- **Python** 3.12+ (for backend)
- **Docker** (for running infrastructure locally)
- **PostgreSQL** 17 with PostGIS (for data persistence)

## Quick Start

### Environment Variables (.env)

Copy `.env.example` to `.env` and fill in the map provider keys (ask your team
or check the vault). They are **required** for the map pages (`SntMap`):

```env
MAPBOX_KEY=pk....
LOCATIONIQ_KEY=pk....
```

`MAPBOX_KEY` drives the vector street basemap (Mapbox GL, tinted with the
Sensolus design tokens — the same basemap the platform renders) and the
satellite layer; `LOCATIONIQ_KEY` drives the geocoder and the raster street
fallback used when there is no Mapbox key or no WebGL.

The Flask backend loads `.env` at startup and serves the keys to the frontend
at runtime via `/api/config` (so they are not baked into the build, and one
Docker image can deploy across environments — in Docker, pass them with
`-e MAPBOX_KEY=... -e LOCATIONIQ_KEY=...`). The real `.env` is gitignored;
never commit keys.

### Local Development (Recommended)

Run both the frontend dev server and Flask backend in separate terminals:

**Terminal 1 - Backend (Flask API proxy):**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate    # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

**Terminal 2 - Frontend (Vite dev server with HMR):**
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 in your browser. The Vite dev server proxies `/api/*` requests to Flask on port 5000.

### VS Code Tasks (Recommended)

Use VS Code's built-in task runner to start both servers in side-by-side terminals:

1. Press `Ctrl+Shift+B` (or `Cmd+Shift+B` on Mac)
2. Select **"Start Dev Environment"**

This runs the Flask backend and Vite frontend in parallel. Both terminals appear in the terminal panel.

**Available tasks:**
| Task | Description |
|------|-------------|
| **Start Dev Environment** | Starts both backend and frontend (default build task) |
| Backend: Flask | Start Flask server only |
| Frontend: Vite | Start Vite dev server only |
| Build Production | Build frontend to `frontend/dist/` |
| Docker Build | Build Docker image |
| Docker Run | Run Docker container |

## PostgreSQL Setup

The app uses PostgreSQL for data persistence. The recommended image is `postgis/postgis:17-3.5` (PostgreSQL 17 with PostGIS extensions).

### Option 1: Docker Compose (Recommended)

A compose stack is provided in `infra/`:

```bash
cd infra
docker compose up -d
```

To stop:
```bash
docker compose down
```

To also remove the database volume (wipes all data):
```bash
docker compose down -v
```

### Option 2: Standalone PostgreSQL via Docker

If you're already running PostgreSQL (e.g. from the shared `minimal-infra-stack.yml`), you can use that instance. Otherwise, start one manually:

```bash
docker run -d \
  --name {{APP_NAME}}_db \
  -p 5432:5432 \
  -e POSTGRES_USER=snt \
  -e POSTGRES_PASSWORD=snt \
  -e POSTGRES_DB={{APP_NAME}} \
  -v {{APP_NAME}}_pgdata:/var/lib/postgresql/data \
  postgis/postgis:17-3.5
```

### Database Configuration

The backend reads database settings from environment variables (or a `.env` file in the project root):

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `{{APP_NAME}}` | Database name |
| `DB_USER` | `snt` | Database user |
| `DB_PASSWORD` | `snt` | Database password |

Example `.env` file:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME={{APP_NAME}}
DB_USER=snt
DB_PASSWORD=snt
```

## Architecture

```
{{APP_NAME}}/
├── frontend/                  # React frontend (Vite)
│   ├── src/
│   │   ├── main.jsx           # Entry point
│   │   ├── App.jsx            # Router setup
│   │   ├── pages/             # Page components
│   │   │   ├── OrganisationList.jsx
│   │   │   └── OrganisationDetail.jsx
│   │   ├── i18n/              # App translation keys (framework from kit)
│   │   └── styles/
│   │       └── app.css        # App-specific styles
│   ├── index.html             # Vite entry HTML
│   ├── vite.config.js         # Vite config with proxy
│   └── package.json           # Node dependencies
├── backend/                   # Flask backend
│   ├── app.py                 # API proxy server
│   └── requirements.txt       # Python deps (flask, requests)
├── Dockerfile                 # Multi-stage build
└── openapi.json               # Sensolus API spec (reference)
```

### How It Works

1. **Frontend** (React + Vite): Single-page app with React Router for navigation
2. **Backend** (Flask): Acts as an API proxy to avoid CORS issues when calling the Sensolus API
3. **Development**: Vite serves the frontend on `:3000` and proxies `/api/*` to Flask on `:5000`
4. **Production**: gunicorn (see the Dockerfile `CMD`) serves the Flask app, which serves the built frontend from `frontend/dist/` and handles API requests. `python app.py` is the development server only — Flask-SocketIO refuses to start Werkzeug without a terminal, so it cannot be the container's entry point

### API Proxy Flow

```
Browser → localhost:3000/api/organisations
       → Vite proxy
       → localhost:5000/api/organisations
       → Flask backend
       → cloud.sensolus.com/rest/api/v2/organisations
```

## Sensolus API Authentication

The backend supports two authentication methods:

### 1. Session Cookie (Bearer Token)
If logged into cloud.sensolus.com, the `prod-sensolus-token` cookie is passed as a Bearer token:
```
Authorization: Bearer <token>
```

### 2. API Key (Query Parameter)
API keys are passed as a query parameter:
```
GET /api/organisations?apiKey=<your-key>
```

**Priority:** Session cookie takes precedence over API key if both are present.

---

## Sensolus Design System

This app uses the official Sensolus color palette and widget library. **Always use these components when extending the app.**

### Importing Widgets

```jsx
import {
  SntButton,
  SntInput,
  SntTable,
  SntCard,
  SntBadge,
  SntDialog,
  // ... see full list below
} from '@sensolus/snt-agent-kit'
```

### Available Widgets

| Component | Description |
|-----------|-------------|
| **SntButton** | Primary button with variants (primary, secondary, success, danger, warning, info) |
| **SntInput** | Text input (onChange receives value directly, not event) |
| **SntSelect** | Dropdown select (onChange receives value directly) |
| **SntBadge** | Status badge with color variants |
| **SntCard** | Card container with optional image, title, badge |
| **SntTable** | Sortable, paginated data table |
| **SntSpinner** | Loading spinner (sizes: small, medium, large) |
| **SntLoadingOverlay** | Centered spinner with optional message |
| **SntToolbar** | Horizontal toolbar for grouping actions |
| **SntToolbarSpacer** | Spacer element for toolbars |
| **SntButtonGroup** | Segmented control for exclusive selection |
| **SntProgressBar** | Inline progress bar for percentages |
| **SntPageHeader** | Page header with title, back button, actions |
| **SntTabs** | Tab navigation |
| **SntTabPanel** | Content panel for tabs |
| **SntDialog** | Modal dialog (small, medium, large sizes) |
| **SntSidepanel** | Collapsible filter side panel |
| **SntFilterSection** | Labeled section within sidepanel |
| **SntSwitch** | Toggle switch |
| **SntGrid** | Responsive grid layout |
| **SntGridItem** | Grid item |
| **SntSummaryStat** | Summary statistic display |
| **SntHistogram** | Microchart histogram |
| **SntCheckboxList** | Multi-select checkbox list |
| **SntDateRangePicker** | Date range picker with presets |
| **SntColors** | JavaScript color constants |

---

## Widget API Reference

### SntButton

```jsx
<SntButton
  variant="primary"      // 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info'
  onClick={handleClick}
  icon={<Icon />}        // Optional icon element
  text="Save"            // Button text (or use children)
  title="Tooltip"        // Tooltip text
  disabled={false}
  className=""
>
  Children also work
</SntButton>
```

### SntInput

```jsx
<SntInput
  value={query}
  onChange={setQuery}      // Receives value directly, NOT event
  placeholder="Search..."
  disabled={false}
  readOnly={false}
/>
```

### SntSelect

```jsx
<SntSelect
  options={[
    { value: 'opt1', label: 'Option 1' },
    { value: 'opt2', label: 'Option 2' },
  ]}
  value={selected}
  onChange={setSelected}   // Receives value directly, NOT event
  placeholder="Choose..."
  disabled={false}
/>
```

### SntBadge

```jsx
<SntBadge
  text="ACTIVE"
  variant="success"        // 'primary' | 'secondary' | 'success' | 'warning' | 'danger' |
                           // 'info' | 'light' | 'dark' | 'orange' | 'salmon' | 'purple' | 'emerald'
  compact={false}          // Smaller size
/>
```

### SntCard

```jsx
<SntCard
  image="/path/to/image.jpg"
  title="Card Title"
  titleIcon="/icon.svg"
  badge={{ text: 'NEW', variant: 'success' }}
  titleButton={<SntButton text="Action" />}
  onClick={handleClick}    // Makes card clickable with hover effect
>
  <p>Card body content</p>
</SntCard>
```

### SntTable

```jsx
<SntTable
  data={items}
  columns={[
    { key: 'name', header: 'Name' },
    { key: 'status', header: 'Status', render: (row, val) => <SntBadge text={val} /> },
    { key: 'count', header: 'Count', sortable: false },
    { key: 'date', header: 'Date', getValue: (row) => new Date(row.date).getTime() },
  ]}
  rowKey="id"              // Key to use as unique row identifier
  defaultPageSize={25}
  pageSizeOptions={[25, 50, 100]}
  emptyMessage="No data"
/>
```

**Column options:**
- `key` - Data property name
- `header` - Column header text
- `sortable` - Enable sorting (default: true)
- `sortKey` - Alternative key for sorting
- `getValue` - Custom value getter for sorting: `(row) => value`
- `render` - Custom cell renderer: `(row, value) => ReactNode`

### SntDialog

```jsx
<SntDialog
  open={isOpen}
  onClose={() => setIsOpen(false)}
  title="Dialog Title"
  size="medium"            // 'small' (400px) | 'medium' (600px) | 'large' (1100px)
>
  <p>Dialog content</p>
</SntDialog>
```

### SntTabs

```jsx
const [activeTab, setActiveTab] = useState('tab1')

<SntTabs
  tabs={[
    { key: 'tab1', label: 'First Tab' },
    { key: 'tab2', label: 'Second Tab' },
  ]}
  activeTab={activeTab}
  onChange={setActiveTab}
>
  <SntTabPanel tabKey="tab1" activeTab={activeTab}>
    <p>First tab content</p>
  </SntTabPanel>
  <SntTabPanel tabKey="tab2" activeTab={activeTab}>
    <p>Second tab content</p>
  </SntTabPanel>
</SntTabs>
```

### SntSidepanel

```jsx
const [filtersOpen, setFiltersOpen] = useState(true)

<SntSidepanel
  title="Filters"
  open={filtersOpen}
  onToggle={() => setFiltersOpen(!filtersOpen)}
  width={280}
>
  <SntFilterSection label="Status">
    <SntCheckboxList ... />
  </SntFilterSection>
  <SntFilterSection label="Date Range">
    <SntDateRangePicker ... />
  </SntFilterSection>
</SntSidepanel>
```

### SntSpinner / SntLoadingOverlay

```jsx
<SntSpinner size="medium" />  // 'small' | 'medium' | 'large'

<SntLoadingOverlay message="Loading data..." />
```

### SntButtonGroup

```jsx
<SntButtonGroup
  options={[
    { value: 'cards', label: 'Cards' },
    { value: 'table', label: 'Table' },
  ]}
  value={viewMode}
  onChange={setViewMode}
/>
```

### SntProgressBar

```jsx
<SntProgressBar
  value={75}
  variant="success"        // 'primary' | 'success' | 'warning' | 'danger' | 'info'
  size="medium"            // 'small' | 'medium'
  showLabel={true}
/>
```

### SntPageHeader

```jsx
<SntPageHeader
  title="Page Title"
  onBack={() => navigate(-1)}   // Shows back button
  actions={
    <>
      <SntButton text="Export" />
      <SntButton variant="primary" text="Create" />
    </>
  }
/>
```

---

## Color Palette (CSS Variables)

Use CSS custom properties for consistent styling:

```css
/* Primary Brand Colors */
--snt-blue-darkest: #212851;     /* Headers, primary buttons */
--snt-blue: #0071A1;             /* Links, focus states */
--snt-blue-light: #A0C3D8;

/* Greys */
--snt-grey: #535E6F;             /* Secondary text */
--snt-grey-light: #B8BFCA;       /* Borders */
--snt-grey-lightest: #DEE4E6;

/* Backgrounds */
--snt-bg-lightblue: #EFF3F4;     /* Page background */
--snt-bg-zebra: #F9FAFA;         /* Alternating rows */
--snt-white: #FFFFFF;

/* Status Colors */
--snt-green: #39CB99;            /* Success */
--snt-yellow: #FFCC66;           /* Warning */
--snt-red: #E00000;              /* Danger */
--snt-ui-selected: #00A6ED;      /* Info */

/* Semantic Aliases (preferred) */
--snt-color-primary: var(--snt-blue-darkest);
--snt-color-success: var(--snt-green);
--snt-color-warning: var(--snt-yellow);
--snt-color-danger: var(--snt-red);
--snt-color-text-primary: var(--snt-blue-darkest);
--snt-color-text-secondary: var(--snt-grey);
--snt-color-border: var(--snt-grey-light);
```

### JavaScript Colors

```jsx
import { SntColors } from '@sensolus/snt-agent-kit'

// SntColors.blueDarkest, SntColors.green, etc.
```

---

## Usage Guidelines

1. **Always use CSS variables** for colors instead of hardcoded hex values
2. **Import widgets** from `@sensolus/snt-agent-kit` - they're modular ES modules
3. **Follow existing patterns** in `frontend/src/pages/` for page structure
4. **Use semantic aliases** (`--snt-color-primary`) over raw colors when appropriate
5. **Test both dev and production** modes before deploying

## CI/CD

Jenkins pipeline (`Jenkinsfile`) builds the Docker image using a multi-stage build:
1. Node.js stage builds the React frontend
2. Python stage runs the Flask app under gunicorn (one worker, eight threads — the scheduler and the migrations run in-process, so never more than one worker)

## License

Proprietary - Sensolus
