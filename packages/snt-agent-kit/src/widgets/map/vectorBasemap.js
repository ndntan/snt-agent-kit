/**
 * vectorBasemap — Mapbox GL vector street basemap for <SntMap>.
 * ============================================================================
 * Ported from the Sensolus platform (stickntrack-react
 * src/cleanup/containers/CommonMapReact/Layers/LayerVectorGL.ts) so agent apps
 * render the same basemap the platform does. Keep the two in sync.
 *
 * The Mapbox light-v11 vector style is recolored at runtime with the Sensolus
 * design tokens, so the basemap recedes behind markers and geozones — the same
 * effect as a custom Mapbox Studio theme, but versioned here in git.
 * mapbox-gl-leaflet wraps it as a Leaflet layer, so every existing Leaflet
 * overlay (clusters, geozones, popups) keeps working on top of it.
 *
 * Browsers without WebGL2 fall back to the raster basemap — see
 * isWebGlSupported() and its caller in SntMap.
 * ============================================================================
 */
import L from 'leaflet'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl-leaflet'
import 'mapbox-gl/dist/mapbox-gl.css'
import { SntColors } from '../SntColors'

// DERIVED, not an official brand token: SntColors.green (#39CB99) washed ~90%
// toward the background so greenery keeps a hint of green without competing
// with overlays.
const GREEN_WASH = '#DFEEE8'

// [style layer id in light-v11, paint property, color or Mapbox GL expression].
// Land is near-white so the tinted landuse/water/buildings read against it.
const SENSOLUS_BASEMAP_TINTS = [
  ['land', 'background-color', SntColors.bgZebra],
  // Green landuse classes keep a hint of green; the rest goes neutral grey.
  [
    'landuse',
    'fill-color',
    [
      'match',
      ['get', 'class'],
      ['park', 'grass', 'pitch', 'cemetery', 'wood', 'scrub'],
      GREEN_WASH,
      SntColors.bgDarkgrey,
    ],
  ],
  ['national-park', 'fill-color', GREEN_WASH],
  ['water', 'fill-color', SntColors.blueLighter],
  ['waterway', 'line-color', SntColors.blueLighter],
  ['building', 'fill-color', SntColors.greyLighter],
  // Roads: flat soft grey instead of light-v11's white (which glowed against
  // the tinted land). Flattens the road hierarchy — see the transport theme.
  ['road-simple', 'line-color', SntColors.greyLightest],
  ['bridge-simple', 'line-color', SntColors.greyLightest],
  ['bridge-case-simple', 'line-color', SntColors.greyLighter],
  ['tunnel-simple', 'line-color', SntColors.bgLightgrey],
  ['admin-0-boundary', 'line-color', SntColors.greyLight],
  ['admin-1-boundary', 'line-color', SntColors.greyLight],
  ['water-point-label', 'text-color', SntColors.blueLight],
  ['water-line-label', 'text-color', SntColors.blueLight],
  ['waterway-label', 'text-color', SntColors.blueLight],
  ['poi-label', 'text-color', SntColors.grey],
  ['settlement-subdivision-label', 'text-color', SntColors.grey],
  ['settlement-minor-label', 'text-color', SntColors.greyDarker],
  ['settlement-major-label', 'text-color', SntColors.greyDarker],
  ['state-label', 'text-color', SntColors.greyLight],
  ['country-label', 'text-color', SntColors.greyDarker],
]

// Transport theme: identical muted basemap, but the road hierarchy pops so
// dispatchers can tell motorways from local streets at a glance.
// streets-v8 road classes: motorway, trunk, primary, secondary, tertiary, ...
const roadHierarchy = (minorColor) => [
  'match',
  ['get', 'class'],
  ['motorway', 'motorway_link', 'trunk', 'trunk_link'],
  SntColors.yellow,
  ['primary'],
  SntColors.greyLight,
  ['secondary', 'tertiary'],
  SntColors.greyLighter,
  minorColor,
]

const TRANSPORT_BASEMAP_TINTS = [
  ...SENSOLUS_BASEMAP_TINTS.filter(
    ([id]) => !['road-simple', 'bridge-simple', 'tunnel-simple'].includes(id),
  ),
  ['road-simple', 'line-color', roadHierarchy(SntColors.greyLightest)],
  ['bridge-simple', 'line-color', roadHierarchy(SntColors.greyLightest)],
  ['tunnel-simple', 'line-color', roadHierarchy(SntColors.bgLightgrey)],
]

const THEMES = {
  sensolus: SENSOLUS_BASEMAP_TINTS,
  transport: TRANSPORT_BASEMAP_TINTS,
}

/**
 * Recolor a live Mapbox GL map with a Sensolus tint set.
 *
 *   theme: a THEMES key  -> apply that tint set
 *   theme: null          -> apply NO tints (raw Mapbox style)
 */
export function applySntBasemapTints(glMap, theme) {
  const tints = theme === null || theme === undefined ? [] : THEMES[theme] || []
  tints.forEach(([layerId, prop, color]) => {
    if (glMap.getLayer(layerId)) {
      glMap.setPaintProperty(layerId, prop, color)
    }
  })
}

/**
 * Selectable street basemap styles. Each pairs a Mapbox GL style with the
 * Sensolus tint treatment applied on top (`theme: null` = raw Mapbox style).
 * Apps can map over this to build a style picker; pass the chosen `key` as
 * <SntMap streetStyle>.
 */
export const SNT_STREET_STYLES = [
  {
    key: 'default',
    glStyle: 'mapbox://styles/mapbox/light-v11',
    theme: 'transport',
    label: 'Default',
  },
  {
    key: 'colorful',
    glStyle: 'mapbox://styles/mapbox/streets-v12',
    theme: null,
    label: 'Colorful',
  },
  {
    key: 'light',
    glStyle: 'mapbox://styles/mapbox/light-v11',
    theme: null,
    label: 'Light',
  },
  {
    key: 'dark',
    glStyle: 'mapbox://styles/mapbox/dark-v11',
    theme: null,
    label: 'Dark',
  },
]

export const SNT_DEFAULT_STREET_STYLE = 'default'

const streetStyleEntry = (key) =>
  SNT_STREET_STYLES.find(s => s.key === key) || SNT_STREET_STYLES[0]

/** Resolve a (possibly unknown) style key to its { key, glStyle, theme, label }. */
export const getSntStreetStyle = (key) => streetStyleEntry(key)

/**
 * Preview tile for a style picker: a real render of the style via the Mapbox
 * Static Images API. `default` and `light` share light-v11, so their tiles look
 * alike — the label beneath disambiguates.
 */
export function sntStreetStyleThumbnailUrl(styleKey, mapboxKey) {
  const styleId = streetStyleEntry(styleKey).glStyle.replace('mapbox://styles/', '')
  // A recognizable urban area at a modest zoom.
  const lon = 4.35
  const lat = 50.85
  const zoom = 11
  return `https://api.mapbox.com/styles/v1/${styleId}/static/${lon},${lat},${zoom}/120x120@2x?access_token=${mapboxKey}&attribution=false&logo=false`
}

// mapbox-gl v3 needs a WebGL2 context and throws "Failed to initialize WebGL."
// straight out of `new mapboxgl.Map()` when it can't get one — no GPU, hardware
// acceleration off, blocklisted driver, or the page has used up its live WebGL
// contexts (browsers cap them, ~16 in Chrome). That throw escapes the map's
// useEffect and can take the whole page down, so callers probe first and use
// the raster basemap instead. mapboxgl.supported() builds a throwaway context
// on every call — resolve it once.
let webGlSupported

export function isWebGlSupported() {
  if (webGlSupported === undefined) {
    try {
      webGlSupported = mapboxgl.supported()
    } catch {
      webGlSupported = false
    }
  }
  return webGlSupported
}

/**
 * Called when a GL map actually fails to build despite the probe saying yes
 * (context exhaustion is the realistic case — the probe ran before the page
 * filled its context budget). Keeps the rest of the session on raster rather
 * than retrying a failing constructor on every map.
 */
export function disableWebGl() {
  webGlSupported = false
}

/**
 * Build the vector street layer as a Leaflet layer.
 *
 * The returned layer carries `setSntStreetStyle(key)` for live style switching
 * without rebuilding the Leaflet layer, and `sntStreetStyle` with the current key.
 */
export function createVectorStreetLayer({ mapboxKey, styleKey = SNT_DEFAULT_STREET_STYLE }) {
  let entry = streetStyleEntry(styleKey)

  const layer = L.mapboxGL({
    style: entry.glStyle,
    // Leaflet derives map.getMaxZoom() from its layers (the raster layer sets
    // 22). Without this it returns Infinity and every project()/unproject()
    // against getMaxZoom() yields NaN. GL-side this is the default anyway.
    // Don't add minZoom here: it would clamp the GL camera (which runs at
    // leaflet zoom - 1) — the map's minZoom is set in SntMap.
    maxZoom: 22,
    // Leaflet projects overlays on flat Mercator; without this, GL v3 switches
    // to a 3D globe at low zoom and markers drift off the map.
    projection: 'mercator',
    // No oversized GL canvas: keep the GL viewport identical to Leaflet's so
    // GL's world-edge clamping matches Leaflet's maxBounds exactly (no drift at
    // min zoom). Costs a sliver of grey at the edges during fast pans.
    padding: 0,
    accessToken: mapboxKey,
    attribution:
      '&copy; <a href="https://www.mapbox.com/about/maps/" target="_blank">Mapbox</a>, &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> Contributors',
  })

  const applyCurrentTheme = () => {
    const glMap = layer.getMapboxMap()
    if (!glMap) return
    if (glMap.isStyleLoaded()) {
      applySntBasemapTints(glMap, entry.theme)
    } else {
      glMap.once('style.load', () => applySntBasemapTints(glMap, entry.theme))
    }
  }

  layer.on('add', applyCurrentTheme)

  // Updating `entry` first means the "add" handler applies the right tints even
  // when the GL map does not exist yet (e.g. Street is not the active layer).
  layer.setSntStreetStyle = (nextKey) => {
    const next = streetStyleEntry(nextKey)
    if (next.key === entry.key) return
    entry = next
    layer.sntStreetStyle = next.key
    const glMap = layer.getMapboxMap()
    if (!glMap) return
    glMap.setStyle(next.glStyle)
    glMap.once('style.load', () => applySntBasemapTints(glMap, next.theme))
  }
  layer.sntStreetStyle = entry.key

  return layer
}

// Mapbox GL never pans past the Mercator edge (±85.051129°) — it clamps its
// zoom/center so the world always fills its viewport vertically. Letting
// Leaflet show the grey void beyond it makes the two engines drift apart at low
// zoom, so SntMap clamps maxBounds to the real edge instead of ±90. Raster
// tiles never had imagery beyond this latitude either.
export const MERCATOR_MAX_BOUNDS = [[-85.051129, -180], [85.051129, 180]]

/**
 * Lowest Leaflet zoom at which the GL canvas still fills the container.
 * Below it, GL renders at a higher zoom than Leaflet and basemap/overlays
 * drift apart — so SntMap uses this as the map's minZoom.
 */
export function glSafeMinZoom(containerHeight) {
  return Math.max(2, Math.ceil(Math.log2((containerHeight || 512) / 256)))
}
