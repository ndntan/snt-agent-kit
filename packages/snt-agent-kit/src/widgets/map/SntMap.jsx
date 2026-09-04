/**
 * SntMap — base Leaflet map primitive.
 * ============================================================================
 * Owns the shared chrome (base layers, street/satellite toggle, zoom + scale
 * controls, geocoder). Renders no domain layers. Children that call
 * useSntMap() can add their own Leaflet layers via useEffect (with cleanup).
 *
 * The street basemap is the Mapbox GL vector basemap tinted with the Sensolus
 * design tokens — the same basemap the Sensolus platform renders (see
 * vectorBasemap.js). It needs `mapboxKey` and WebGL2; without either, the map
 * falls back to raster street tiles (LocationIQ when `locationiqKey` is set,
 * OpenStreetMap otherwise).
 *
 * The ready-to-use layer components are <SntGeozoneLayer>, <SntDeviceLayer>,
 * and <SntMarkerClusterLayer>. For the legacy "device + geozones in one prop
 * bag" API, see <SntDeviceMap>.
 *
 * Props:
 *   mapboxKey            - Mapbox token, used for both the vector street
 *                          basemap and the raster satellite tiles. Optional —
 *                          without it the street basemap falls back to raster
 *                          and the satellite layer + toggle are hidden.
 *   streetStyle          - vector street style: 'default' (Sensolus transport
 *                          tints), 'colorful', 'light' or 'dark'. See
 *                          SNT_STREET_STYLES. Changing it re-styles in place.
 *   locationiqKey        - LocationIQ key for the raster street fallback.
 *                          Optional — falls back to OpenStreetMap tiles.
 *   height               - default '500px'
 *   width                - default '100%'
 *   center               - [lat, lng], default [50, 10]
 *   zoom                 - default 5
 *   showSatelliteToggle  - default true
 *   showGeocoder         - default true
 *   showZoomControl      - default true
 *   showScale            - default true
 *   showCurrentLocation  - default true (geolocates and pans the map)
 *   onZoomToAll(map)     - if provided, renders a "zoom to all" button that
 *                          invokes the callback (consumer decides what "all" is)
 *   onMapReady(map)      - escape hatch for imperative consumers
 *   children             - layer components calling useSntMap()
 * ============================================================================
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-control-geocoder'
import 'leaflet-control-geocoder/dist/Control.Geocoder.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { useSntUi } from '../../SntUiProvider'
import { makeGeocoderAdapter } from './mapUtils'
import {
  MERCATOR_MAX_BOUNDS,
  SNT_DEFAULT_STREET_STYLE,
  createVectorStreetLayer,
  disableWebGl,
  glSafeMinZoom,
  isWebGlSupported,
} from './vectorBasemap'

import streetImg from '../../assets/map/street.png'
import satelliteImg from '../../assets/map/line.png'
import currentLocationIcon from '../../assets/map/current_location.svg'
import zoomToAllIcon from '../../assets/map/zoom_to_all.svg'

const SntMapContext = createContext(null)

/**
 * Layer components access the Leaflet map via this hook.
 *
 * Returns:
 *   { map, L, registerLayerToggle }
 *
 * registerLayerToggle({ id, label, icon, visible, onToggle }) -> unregister fn
 *   Adds an entry to the map's hover-expanded layer panel. Re-call with the
 *   same id to update; cleanup function removes the entry.
 */
export function useSntMap() {
  const ctx = useContext(SntMapContext)
  if (!ctx) throw new Error('useSntMap must be called inside <SntMap>')
  return ctx
}

export function SntMap({
  mapboxKey,
  locationiqKey,
  streetStyle = SNT_DEFAULT_STREET_STYLE,
  height = '500px',
  width = '100%',
  center = [50, 10],
  zoom = 5,
  showSatelliteToggle = true,
  showGeocoder = true,
  showZoomControl = true,
  showScale = true,
  showCurrentLocation = true,
  onZoomToAll,
  onMapReady,
  children,
}) {
  const { api } = useSntUi()

  const containerRef = useRef(null)
  const streetLayerRef = useRef(null)
  const satelliteLayerRef = useRef(null)
  const hoverTimeout = useRef(null)
  const onZoomToAllRef = useRef(onZoomToAll)
  onZoomToAllRef.current = onZoomToAll
  const streetStyleRef = useRef(streetStyle)

  const [map, setMap] = useState(null)
  const [activeLayer, setActiveLayer] = useState('street') // 'street' | 'satellite'
  const [showShortLayer, setShowShortLayer] = useState(false)
  const [layerToggles, setLayerToggles] = useState([])

  const hasSatellite = Boolean(mapboxKey)
  // Retina screens get 512px @2x tiles, matching the platform's raster layer.
  const retina = L.Browser.retina ? '@2x' : ''
  const tileStreets = locationiqKey
    ? `https://{s}-tiles.locationiq.com/v3/streets/r/{z}/{x}/{y}${retina}.png?key=${locationiqKey}`
    : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  const tileSatellite = hasSatellite
    ? `https://api.tiles.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}${retina}.png?access_token=${mapboxKey}`
    : null

  // Initialize the Leaflet map once.
  useEffect(() => {
    // Street basemap: Mapbox GL vector, tinted with the Sensolus tokens. No
    // token or no WebGL2 means raster street tiles instead.
    let useRasterStreets = !mapboxKey || !isWebGlSupported()
    const buildStreets = () => useRasterStreets
      ? L.tileLayer(tileStreets, {
          subdomains: 'abc',
          minZoom: 2,
          maxZoom: 22,
          maxNativeZoom: locationiqKey ? 20 : 19,
        })
      : createVectorStreetLayer({ mapboxKey, styleKey: streetStyleRef.current })

    let streets = buildStreets()
    streetLayerRef.current = streets

    if (tileSatellite) {
      satelliteLayerRef.current = L.tileLayer(tileSatellite, {
        minZoom: 2,
        maxZoom: 22,
        maxNativeZoom: 20,
      })
    }

    // Mapbox GL clamps its camera so the world always fills its viewport
    // vertically; if Leaflet zooms out past that floor, GL renders at a higher
    // zoom and basemap/overlays drift apart. Keep Leaflet's minZoom at GL's
    // floor, and pin maxZoom on the map itself — the GL layer's zoom limits
    // don't register reliably, leaving map.getMaxZoom() = Infinity, which
    // NaN-crashes every project()/unproject() against it.
    const minZoom = glSafeMinZoom(containerRef.current?.clientHeight)

    const leafletMap = L.map(containerRef.current, {
      center,
      zoom: Math.max(zoom, minZoom),
      minZoom,
      maxZoom: 22,
      maxBounds: MERCATOR_MAX_BOUNDS,
      attributionControl: false,
      zoomControl: false,
    })

    // The GL map is built inside the layer's onAdd, so a failed WebGL context
    // surfaces here as a synchronous throw. isWebGlSupported() already excluded
    // browsers that never had WebGL; what's left is a context budget exhausted
    // at runtime (browsers cap live contexts, ~16 in Chrome). Swap in raster
    // rather than letting the throw escape this effect — unhandled it reaches
    // the app's error boundary and replaces the whole page.
    try {
      leafletMap.addLayer(streets)
    } catch (error) {
      if (useRasterStreets) throw error
      // Leaflet registers the layer before onAdd throws, so the half-added
      // layer stays bound to the map's move/zoom events with no GL map behind
      // it. Drop it before retrying.
      try {
        leafletMap.removeLayer(streets)
      } catch {
        // never finished adding — nothing to unwind
      }
      disableWebGl()
      useRasterStreets = true
      streets = buildStreets()
      streetLayerRef.current = streets
      leafletMap.addLayer(streets)
    }

    if (showZoomControl) {
      L.control.zoom({ position: 'topright' }).addTo(leafletMap)
    }

    const makeIconButton = ({ icon, title, onClick, iconSize = '18px' }) => {
      const ButtonControl = L.Control.extend({
        options: { position: 'topright' },
        onAdd() {
          const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control')
          container.style.marginTop = '10px'
          const link = L.DomUtil.create('a', '', container)
          link.href = '#'
          link.title = title
          link.setAttribute('role', 'button')
          link.style.backgroundImage = `url("${icon}")`
          link.style.backgroundRepeat = 'no-repeat'
          link.style.backgroundPosition = 'center'
          link.style.backgroundSize = iconSize
          L.DomEvent.disableClickPropagation(container)
          L.DomEvent.on(link, 'click', (e) => {
            L.DomEvent.preventDefault(e)
            onClick()
          })
          L.DomEvent.on(link, 'dblclick', L.DomEvent.stopPropagation)
          return container
        },
      })
      return new ButtonControl()
    }

    if (showCurrentLocation) {
      makeIconButton({
        icon: currentLocationIcon,
        title: 'Current location',
        iconSize: '20px',
        onClick: () => {
          if (!navigator.geolocation) return
          navigator.geolocation.getCurrentPosition((position) => {
            leafletMap.setView(
              [position.coords.latitude, position.coords.longitude],
              leafletMap.getMaxZoom() - 3,
            )
          })
        },
      }).addTo(leafletMap)
    }

    if (onZoomToAllRef.current) {
      makeIconButton({
        icon: zoomToAllIcon,
        title: 'Zoom to all',
        iconSize: '16px',
        onClick: () => onZoomToAllRef.current?.(leafletMap),
      }).addTo(leafletMap)
    }

    if (showScale) {
      L.control.scale({ imperial: false }).addTo(leafletMap)
    }

    let searchMarker = null
    if (showGeocoder) {
      const geocoder = new (L.Control.Geocoder)({
        position: 'topleft',
        collapsed: false,
        defaultMarkGeocode: false,
        geocoder: makeGeocoderAdapter(api.geocode),
        placeholder: 'Search for a location',
      })
      geocoder.on('markgeocode', (e) => {
        const bbox = e.geocode.bbox
        let position
        if (bbox.getSouthEast().distanceTo(bbox.getNorthWest()) === 0) {
          leafletMap.setView(bbox.getSouthEast(), 21)
          position = bbox.getSouthEast()
        } else {
          leafletMap.fitBounds(bbox)
          position = leafletMap.getCenter()
        }
        if (searchMarker) searchMarker.remove()
        searchMarker = L.circleMarker(position, {
          radius: 8,
          color: '#212851',
          fillColor: '#0071A1',
          fillOpacity: 0.8,
          weight: 2,
        }).addTo(leafletMap)
      })
      geocoder.addTo(leafletMap)
    }

    setMap(leafletMap)
    onMapReady?.(leafletMap)

    return () => {
      leafletMap.remove()
      if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live street-style switching — re-styles the GL map in place instead of
  // rebuilding the Leaflet layer. No-op on the raster fallback.
  useEffect(() => {
    streetStyleRef.current = streetStyle
    streetLayerRef.current?.setSntStreetStyle?.(streetStyle)
  }, [streetStyle])

  // Street/satellite toggle effect.
  useEffect(() => {
    if (!map) return
    const streets = streetLayerRef.current
    const satellite = satelliteLayerRef.current
    if (!satellite) return

    if (activeLayer === 'satellite') {
      if (map.hasLayer(streets)) map.removeLayer(streets)
      if (!map.hasLayer(satellite)) map.addLayer(satellite)
    } else {
      if (map.hasLayer(satellite)) map.removeLayer(satellite)
      if (!map.hasLayer(streets)) map.addLayer(streets)
    }
  }, [activeLayer, map])

  // Layer components call this to publish a toggle into the hover panel.
  // Re-calling with the same id replaces the entry; the returned cleanup
  // removes it. Layers re-call from a useEffect when their `visible` changes.
  const registerLayerToggle = useCallback((toggle) => {
    const { id } = toggle
    setLayerToggles(prev => {
      const idx = prev.findIndex(t => t.id === id)
      if (idx === -1) return [...prev, toggle]
      const next = prev.slice()
      next[idx] = toggle
      return next
    })
    return () => {
      setLayerToggles(prev => prev.filter(t => t.id !== id))
    }
  }, [])

  const isStreet = activeLayer === 'street'
  const toggleThumb = isStreet ? satelliteImg : streetImg
  const toggleLabel = isStreet ? 'Satellite' : 'Street'

  const handleMouseEnter = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    hoverTimeout.current = setTimeout(() => setShowShortLayer(true), 100)
  }
  const handleMouseLeave = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    setShowShortLayer(false)
  }

  return (
    <div style={{ position: 'relative', width, height }}>
      <div ref={containerRef} className="snt-map" style={{ width: '100%', height: '100%' }} />

      {map && (
        <SntMapContext.Provider value={{ map, L, registerLayerToggle }}>
          {children}
        </SntMapContext.Provider>
      )}

      {showSatelliteToggle && hasSatellite && (
        <div
          style={{ position: 'absolute', bottom: 30, left: 10, zIndex: 1000, display: 'flex', alignItems: 'flex-end' }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div
            onClick={() => setActiveLayer(prev => prev === 'street' ? 'satellite' : 'street')}
            style={{
              position: 'relative',
              width: 48,
              height: 48,
              border: '3px solid #fff',
              borderRadius: 4,
              cursor: 'pointer',
              overflow: 'hidden',
              boxShadow: '0px 1px 2px rgba(29, 40, 60, 0.4)',
              marginRight: 8,
              flexShrink: 0,
            }}
          >
            <div style={{
              width: '100%',
              height: '100%',
              background: `url(${toggleThumb})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }} />
            <div style={{
              position: 'absolute',
              top: showShortLayer ? 37 : 3,
              left: 0,
              width: 42,
              height: 42,
              background: 'linear-gradient(0deg, rgba(0,0,0,0.5) 7.86%, rgba(83,94,111,0) 84.9%)',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute',
              bottom: 3,
              left: 0,
              right: 0,
              textAlign: 'center',
              color: '#fff',
              fontSize: 10,
              fontWeight: 600,
            }}>
              {showShortLayer ? toggleLabel : 'Layers'}
            </div>
          </div>

          {showShortLayer && layerToggles.length > 0 && (
            <div
              style={{
                background: '#fff',
                border: '1px solid #B8BFCA',
                boxShadow: '0px 1px 2px rgba(29, 40, 60, 0.4)',
                borderRadius: 4,
                padding: '8px 8px 0',
                display: 'flex',
                alignItems: 'flex-start',
              }}
            >
              {layerToggles.map(toggle => (
                <div
                  key={toggle.id}
                  onClick={toggle.onToggle}
                  style={{
                    width: 70,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    width: 52,
                    height: 52,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderRadius: 6,
                    border: toggle.visible ? '3px solid #a8d4e6' : '2px solid #e0e0e0',
                    background: toggle.visible ? '#f0f8fb' : '#fff',
                  }}>
                    <img src={toggle.icon} alt={toggle.label} width={42} height={42} />
                  </div>
                  <div style={{
                    marginTop: 4,
                    fontSize: 11,
                    color: '#535E6F',
                    fontWeight: 400,
                  }}>
                    {toggle.label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
