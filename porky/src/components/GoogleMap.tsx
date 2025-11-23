import { useEffect, useRef, useState } from 'react'

declare const google: any

type GoogleMapProps = {
  /** Optional: center of the map. Defaults to Catalonia, Spain if omitted. */
  center?: { lat: number; lng: number }
  /** Optional: zoom level. Defaults to a regional view over Catalonia. */
  zoom?: number
  /** Optional className to control height/width from the parent. */
  className?: string
  /** Optional: routes to render as polylines on top of the map (used in summary view). */
  routes?: RouteOverlay[]
  /** Optional: whether the map allows editing/registration of locations. Defaults to true. */
  interactive?: boolean
  /** Optional: per-location tooltip info for routes (e.g. pigs per truck at each stop). */
  routeStopTooltips?: RouteStopTooltip[]
  /** Optional: id of the active route (e.g. hovered truck) to visually highlight on the map. */
  activeRouteId?: string | number | null
  /** Optional: id of the entity (farm/slaughterhouse) to highlight on the map. */
  highlightedEntityId?: string | null
  /** Optional: set of entity IDs that belong to the active route, used to adjust marker opacity. */
  activeRouteEntityIds?: string[] | null
}

type EntityType = 'farm' | 'slaughterhouse'

type StoredEntity = {
  id: string
  type: EntityType
  name: string
  maxCapacity: number
  lat: number
  lng: number
}

type RouteOverlay = {
  id: string | number
  path: { lat: number; lng: number }[]
  color?: string
}

type RouteStopTooltip = {
  entityId: string
  lines: string[]
}

const STORAGE_KEY = 'pigchain_locations'

function loadStoredEntities(): StoredEntity[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw) as any[]
    if (!Array.isArray(parsed)) return []

    return parsed
      .map(
        (item): StoredEntity => ({
          id: String(item.id),
          type: item.type === 'slaughterhouse' ? 'slaughterhouse' : 'farm',
          name: String(item.name ?? ''),
          maxCapacity: Number(item.maxCapacity ?? 0),
          lat: Number(item.lat),
          lng: Number(item.lng),
        }),
      )
      .filter(
        (item) =>
          Number.isFinite(item.lat) &&
          Number.isFinite(item.lng) &&
          item.name,
      )
  } catch {
    return []
  }
}

function saveStoredEntities(entities: StoredEntity[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entities))
  } catch {
    // Ignore write errors (e.g. quota exceeded or private mode)
  }
}

function GoogleMap({
  center,
  zoom = 7,
  className,
  routes,
  interactive = true,
  routeStopTooltips,
  activeRouteId,
  highlightedEntityId,
  activeRouteEntityIds,
}: GoogleMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any | null>(null)
  const markersRef = useRef<Record<string, any>>({})
  const polylinesRef = useRef<Record<string, { polyline: any; color: string }>>({})
  const defaultMarkerTitlesRef = useRef<Record<string, string>>({})
  const defaultMarkerIconsRef = useRef<Record<string, any>>({})
  const highlightedMarkerIdRef = useRef<string | null>(null)
  const oinkSoundRef = useRef<HTMLAudioElement | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [entityType, setEntityType] = useState<EntityType>('farm')
  const [name, setName] = useState('')
  const [maxCapacity, setMaxCapacity] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined

  // Initialize and preload audio for squeak sound
  useEffect(() => {
    const audio = new Audio('/squeak.mp3')
    audio.volume = 0.5
    audio.preload = 'auto'
    
    // Preload the audio by loading it immediately
    audio.load()
    
    // Try to play and immediately pause to ensure the audio is ready
    // This helps reduce delay on first play
    const preloadPlay = () => {
      audio.play().then(() => {
        audio.pause()
        audio.currentTime = 0
      }).catch(() => {
        // Ignore errors during preload
      })
    }
    
    // Preload after user interaction (required by browsers)
    const handleFirstInteraction = () => {
      preloadPlay()
      document.removeEventListener('click', handleFirstInteraction)
      document.removeEventListener('touchstart', handleFirstInteraction)
    }
    
    document.addEventListener('click', handleFirstInteraction, { once: true })
    document.addEventListener('touchstart', handleFirstInteraction, { once: true })
    
    oinkSoundRef.current = audio
    
    return () => {
      if (oinkSoundRef.current) {
        oinkSoundRef.current.pause()
        oinkSoundRef.current = null
      }
      document.removeEventListener('click', handleFirstInteraction)
      document.removeEventListener('touchstart', handleFirstInteraction)
    }
  }, [])

  const playSqueakSound = () => {
    if (oinkSoundRef.current) {
      // Reset to start and play immediately
      oinkSoundRef.current.currentTime = 0
      oinkSoundRef.current.play().catch((error) => {
        // Ignore play errors (e.g., user hasn't interacted with page yet)
        console.debug('Could not play squeak sound:', error)
      })
    }
  }

  const createMarker = (entity: StoredEntity, enableInteraction: boolean = true) => {
    if (!mapRef.current || !(window as any).google?.maps) return

    const isFarm = entity.type === 'farm'

    const marker = new google.maps.Marker({
      position: { lat: entity.lat, lng: entity.lng },
      map: mapRef.current,
      title: entity.name,
      label: {
        text: isFarm ? '🐷' : '🏭',
        fontSize: '26px',
      },
      icon: {
        path: (google.maps.SymbolPath && google.maps.SymbolPath.CIRCLE) || 0,
        scale: 15,
        fillColor: isFarm ? '#16a34a' : '#f97316',
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: '#ffffff',
      },
    })

    if (enableInteraction) {
      marker.addListener('click', () => {
        setSelectedLocation({ lat: entity.lat, lng: entity.lng })
        setEntityType(entity.type)
        setName(entity.name)
        setMaxCapacity(String(entity.maxCapacity))
        setEditingId(entity.id)
      })
    }

    // Add hover sound and icon dilation for farm markers (pigs)
    if (isFarm) {
      const originalIcon = marker.getIcon()
      const originalLabel = marker.getLabel()
      const originalScale = originalIcon.scale || 15
      const originalFontSize = originalLabel?.fontSize || '26px'
      const fontSizeNumber = parseInt(originalFontSize.replace('px', ''), 10)

      marker.addListener('mouseover', () => {
        playSqueakSound()
        // Dilate the icon by increasing its scale
        const dilatedIcon = {
          ...originalIcon,
          scale: originalScale * 1.3,
        }
        marker.setIcon(dilatedIcon)
        // Increase emoji size
        marker.setLabel({
          ...originalLabel,
          fontSize: `${Math.round(fontSizeNumber * 1.3)}px`,
        })
      })

      marker.addListener('mouseout', () => {
        // Restore original icon size and label
        marker.setIcon(originalIcon)
        marker.setLabel(originalLabel)
      })
    }

    markersRef.current[entity.id] = marker
    defaultMarkerTitlesRef.current[entity.id] = entity.name
    defaultMarkerIconsRef.current[entity.id] = marker.getIcon()
  }

  useEffect(() => {
    if (!containerRef.current || !apiKey) {
      if (!apiKey) {
        setHasError(true)
        setIsLoading(false)
      }
      return
    }

    // Default center over Catalonia, Spain
    const defaultCenter = center ?? { lat: 41.8, lng: 1.6 }

    function initMap() {
      try {
        const map = new google.maps.Map(containerRef.current, {
          center: defaultCenter,
          zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        })

        mapRef.current = map

        // Load existing entities from local storage and create markers
        const storedEntities = loadStoredEntities()
        storedEntities.forEach((entity) => {
          createMarker(entity, interactive ?? true)
        })

        // Listen for clicks on the map to open the registration popup (new location)
        if (interactive ?? true) {
          map.addListener('click', (e: any) => {
            const lat = e.latLng.lat()
            const lng = e.latLng.lng()
            setSelectedLocation({ lat, lng })
            setEntityType('farm')
            setName('')
            setMaxCapacity('')
            setEditingId(null)
          })
        }

        setIsLoading(false)
      } catch (error) {
        console.error('Error initializing Google Map', error)
        setHasError(true)
        setIsLoading(false)
      }
    }

    // If script already exists, reuse it
    const existingScript = document.getElementById('google-maps-script') as HTMLScriptElement | null
    if (existingScript) {
      if ((window as any).google?.maps) {
        initMap()
      } else {
        existingScript.addEventListener('load', initMap)
      }
      return () => {
        existingScript.removeEventListener('load', initMap)
      }
    }

    const script = document.createElement('script')
    script.id = 'google-maps-script'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = initMap
    script.onerror = () => {
      console.error('Failed to load Google Maps script')
      setHasError(true)
      setIsLoading(false)
    }

    document.head.appendChild(script)

    return () => {
      script.onload = null
      script.onerror = null
    }
  }, [apiKey, center, zoom])

  // Draw or update route polylines whenever routes change
  useEffect(() => {
    if (!mapRef.current || !(window as any).google?.maps) return

    // Clear existing polylines
    Object.values(polylinesRef.current).forEach(({ polyline }) => {
      polyline.setMap(null)
    })
    polylinesRef.current = {}

    if (!routes || routes.length === 0) return

    const bounds = new google.maps.LatLngBounds()

    routes.forEach((route) => {
      if (!route.path || route.path.length === 0) return

      const color = route.color ?? '#2563eb'
      const isActive =
        activeRouteId != null &&
        String(route.id) === String(activeRouteId)

      const polyline = new google.maps.Polyline({
        path: route.path,
        geodesic: true,
        strokeColor: color,
        strokeOpacity: isActive ? 0.9 : 0.3,
        strokeWeight: 4,
        map: mapRef.current,
        icons: [
          {
            icon: {
              path:
                (google.maps.SymbolPath &&
                  google.maps.SymbolPath.FORWARD_CLOSED_ARROW) ||
                0,
              scale: 3,
              strokeColor: color,
              strokeOpacity: isActive ? 0.9 : 0.3,
            },
            offset: '0',
            repeat: '60px',
          },
        ],
      })

      polylinesRef.current[String(route.id)] = { polyline, color }

      route.path.forEach((point) => {
        bounds.extend(new google.maps.LatLng(point.lat, point.lng))
      })
    })

    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds)
    }
  }, [routes, activeRouteId])

  // When the active route (e.g. hovered truck) changes, update polyline opacity/intensity
  useEffect(() => {
    if (!mapRef.current || !(window as any).google?.maps) return

    Object.entries(polylinesRef.current).forEach(([id, entry]) => {
      const { polyline, color } = entry
      const isActive =
        activeRouteId != null && String(id) === String(activeRouteId)

      polyline.setOptions({
        strokeOpacity: isActive ? 0.9 : 0.3,
        icons: [
          {
            icon: {
              path:
                (google.maps.SymbolPath &&
                  google.maps.SymbolPath.FORWARD_CLOSED_ARROW) ||
                0,
              scale: 3,
              strokeColor: color,
              strokeOpacity: isActive ? 0.9 : 0.3,
            },
            offset: '0',
            repeat: '60px',
          },
        ],
      })
    })
  }, [activeRouteId])

  // Update marker titles based on routeStopTooltips (used in summary view)
  useEffect(() => {
    if (!routeStopTooltips || routeStopTooltips.length === 0) {
      // Restore default titles if we have them
      Object.entries(markersRef.current).forEach(([id, marker]) => {
        const defaultTitle = defaultMarkerTitlesRef.current[id]
        if (defaultTitle) {
          marker.setTitle(defaultTitle)
        }
      })
      return
    }

    // First reset all markers to their default title
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      const defaultTitle = defaultMarkerTitlesRef.current[id]
      if (defaultTitle) {
        marker.setTitle(defaultTitle)
      }
    })

    // Then apply enriched titles for the locations involved in the routes
    routeStopTooltips.forEach((tooltip) => {
      const marker = markersRef.current[tooltip.entityId]
      if (!marker) return

      const title = tooltip.lines.join('\n')
      marker.setTitle(title)
    })
  }, [routeStopTooltips])

  // Adjust marker opacity based on active route and highlighted entity
  useEffect(() => {
    const hasRoutes = !!routes && routes.length > 0

    // If this map is not showing routes (e.g. plain Map view), keep default opacity
    if (!hasRoutes) {
      Object.values(markersRef.current).forEach((marker) => {
        if (marker && typeof marker.setOpacity === 'function') {
          marker.setOpacity(1)
        }
      })
      return
    }

    const activeIdsSet = new Set(activeRouteEntityIds ?? [])

    Object.entries(markersRef.current).forEach(([id, marker]) => {
      if (!marker || typeof marker.setOpacity !== 'function') return

      // If a specific entity is highlighted (e.g. hover on a farm in the list), keep it fully visible
      if (highlightedEntityId && id === highlightedEntityId) {
        marker.setOpacity(1)
        return
      }

      if (activeIdsSet.size > 0) {
        marker.setOpacity(activeIdsSet.has(id) ? 0.9 : 0.3)
      } else {
        // No truck hovered: keep all route markers at 30% so lines + icons se ven suaves
        marker.setOpacity(0.3)
      }
    })
  }, [routes, activeRouteEntityIds, highlightedEntityId])

  // Highlight a specific entity marker (e.g. when hovering a farm in the list)
  useEffect(() => {
    if (!(window as any).google?.maps) return

    const previousId = highlightedMarkerIdRef.current

    // Reset previously highlighted marker
    if (previousId && markersRef.current[previousId]) {
      const marker = markersRef.current[previousId]
      const defaultIcon = defaultMarkerIconsRef.current[previousId]
      if (defaultIcon) {
        marker.setIcon(defaultIcon)
      }
      marker.setZIndex(undefined)
    }

    if (!highlightedEntityId) {
      highlightedMarkerIdRef.current = null
      return
    }

    const marker = markersRef.current[highlightedEntityId]
    if (!marker) {
      highlightedMarkerIdRef.current = null
      return
    }

    const baseIcon =
      defaultMarkerIconsRef.current[highlightedEntityId] ??
      marker.getIcon() ??
      {
        path:
          (google.maps.SymbolPath &&
            google.maps.SymbolPath.CIRCLE) || 0,
        scale: 15,
        fillColor: '#16a34a',
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: '#ffffff',
      }

    defaultMarkerIconsRef.current[highlightedEntityId] = baseIcon

    const highlightIcon = {
      ...baseIcon,
      scale: (baseIcon.scale ?? 15) * 1.3,
      strokeColor: '#0f172a',
      strokeWeight: 3,
    }

    marker.setIcon(highlightIcon)
    marker.setZIndex(google.maps.Marker?.MAX_ZINDEX ?? 999999)
    highlightedMarkerIdRef.current = highlightedEntityId
  }, [highlightedEntityId])

  return (
    <div className={className}>
      <div className="relative h-full w-full">
        <div ref={containerRef} className="h-full w-full rounded-xl bg-slate-100" />

        {isLoading && !hasError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-2 text-xs text-slate-600 shadow-sm backdrop-blur">
              Loading Google Map…
            </div>
          </div>
        )}

        {hasError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="max-w-xs rounded-xl border border-rose-200 bg-rose-50/95 px-4 py-3 text-xs text-rose-700 shadow-sm backdrop-blur">
              There was a problem loading Google Maps. Check that your API key in <code>.env</code>{' '}
              is exposed as <code>VITE_GOOGLE_MAPS_API_KEY</code> and that billing is enabled.
            </div>
          </div>
        )}

        {/* Popup to register / edit a farm or slaughterhouse */}
        {selectedLocation && !isLoading && !hasError && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/30 px-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-800 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {editingId ? 'Edit location' : 'New location'}
                </p>
                <h2 className="mt-1 text-base font-semibold text-slate-900">
                  {editingId
                    ? `Edit ${entityType === 'farm' ? 'Farm' : 'Slaughterhouse'}`
                    : `Register ${entityType === 'farm' ? 'Farm' : 'Slaughterhouse'}`}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedLocation(null)
                  setEditingId(null)
                }}
                className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (!selectedLocation || !name || !maxCapacity) return

                const numericCapacity = Number(maxCapacity)
                if (!Number.isFinite(numericCapacity) || numericCapacity < 0) return

                const existingEntities = loadStoredEntities()

                if (editingId) {
                  // Update existing entity
                  const updatedEntities = existingEntities.map((entity) =>
                    entity.id === editingId
                      ? {
                          ...entity,
                          type: entityType,
                          name,
                          maxCapacity: numericCapacity,
                          lat: selectedLocation.lat,
                          lng: selectedLocation.lng,
                        }
                      : entity,
                  )

                  saveStoredEntities(updatedEntities)

                  const marker = markersRef.current[editingId]
                  if (marker) {
                    marker.setPosition(selectedLocation)
                    marker.setTitle(name)

                    const isFarm = entityType === 'farm'
                    marker.setLabel({
                      text: isFarm ? '🐷' : '🏭',
                      fontSize: '16px',
                    })
                    marker.setIcon({
                      path: (google.maps.SymbolPath && google.maps.SymbolPath.CIRCLE) || 0,
                      scale: 10,
                      fillColor: isFarm ? '#16a34a' : '#f97316',
                      fillOpacity: 1,
                      strokeWeight: 2,
                      strokeColor: '#ffffff',
                    })
                  }
                } else {
                  // Create new entity
                  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                  const newEntity: StoredEntity = {
                    id,
                    type: entityType,
                    name,
                    maxCapacity: numericCapacity,
                    lat: selectedLocation.lat,
                    lng: selectedLocation.lng,
                  }

                  const updatedEntities = [...existingEntities, newEntity]
                  saveStoredEntities(updatedEntities)
                  createMarker(newEntity, true)
                }

                setSelectedLocation(null)
                setEditingId(null)
              }}
            >
              <div className="space-y-1">
                <label className="block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Type
                </label>
                <div className="flex gap-3 text-xs">
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="radio"
                      className="h-3 w-3"
                      checked={entityType === 'farm'}
                      onChange={() => setEntityType('farm')}
                    />
                    <span>Farm</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="radio"
                      className="h-3 w-3"
                      checked={entityType === 'slaughterhouse'}
                      onChange={() => setEntityType('slaughterhouse')}
                    />
                    <span>Slaughterhouse</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                    Location X (lat)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={selectedLocation.lat.toFixed(5)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                    Location Y (lng)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={selectedLocation.lng.toFixed(5)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  {entityType === 'farm' ? 'Farm name' : 'Slaughterhouse name'}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={entityType === 'farm' ? 'e.g. Santa Rosa Farm' : 'e.g. Central Plant'}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none ring-slate-900/5 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  {entityType === 'farm' ? 'Max pig numbers' : 'Max processing per day'}
                </label>
                <input
                  type="number"
                  min={0}
                  value={maxCapacity}
                  onChange={(e) => setMaxCapacity(e.target.value)}
                  placeholder={entityType === 'farm' ? 'e.g. 1200' : 'e.g. 800'}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none ring-slate-900/5 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
                  required
                />
              </div>

              <div className="flex justify-between gap-2 pt-1">
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!editingId) return

                      const existingEntities = loadStoredEntities()
                      const updatedEntities = existingEntities.filter((entity) => entity.id !== editingId)
                      saveStoredEntities(updatedEntities)

                      const marker = markersRef.current[editingId]
                      if (marker) {
                        marker.setMap(null)
                        delete markersRef.current[editingId]
                      }

                      setSelectedLocation(null)
                      setEditingId(null)
                    }}
                    className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100"
                  >
                    Delete
                  </button>
                )}

                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLocation(null)
                      setEditingId(null)
                    }}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-full bg-slate-900 px-4 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-slate-800"
                  >
                    Save location
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}

export default GoogleMap

