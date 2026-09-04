/**
 * SntDeviceMap — opinionated "devices + geozones" composition.
 *
 * Convenience wrapper preserving the pre-split SntMap API. New code should
 * compose <SntMap> with the layer components it actually needs.
 *
 * Props (mirroring the old SntMap):
 *   mapboxKey, locationiqKey, streetStyle, height, width, center, zoom,
 *   onMapReady
 *   geozones, orgId, showGeozones, showGeozoneSelector
 *   devices, showDevices
 */
import { SntMap } from './SntMap'
import { SntGeozoneLayer } from './SntGeozoneLayer'
import { SntDeviceLayer } from './SntDeviceLayer'

export function SntDeviceMap({
  mapboxKey,
  locationiqKey,
  streetStyle,
  height,
  width,
  center,
  zoom,
  onMapReady,
  geozones,
  orgId,
  showGeozones = true,
  showGeozoneSelector = true,
  devices,
  showDevices = true,
}) {
  const hasDevices = showDevices && devices && devices.length > 0
  return (
    <SntMap
      mapboxKey={mapboxKey}
      locationiqKey={locationiqKey}
      streetStyle={streetStyle}
      height={height}
      width={width}
      center={center}
      zoom={zoom}
      onMapReady={onMapReady}
    >
      {showGeozones !== false && (
        <SntGeozoneLayer
          geozones={geozones}
          orgId={orgId}
          showSelector={showGeozoneSelector}
          fitBounds={!hasDevices}
        />
      )}
      {hasDevices && (
        <SntDeviceLayer devices={devices} />
      )}
    </SntMap>
  )
}
