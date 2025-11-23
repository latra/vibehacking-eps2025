import { useEffect, useMemo, useState } from 'react'

declare const google: any

type EntityType = 'farm' | 'slaughterhouse'

type StoredEntity = {
  id: string
  type: EntityType
  name: string
  maxCapacity: number
  lat: number
  lng: number
}

type TravelTimeToEntity = {
  targetId: string
  targetName: string
  distanceText: string
  durationText: string
}

const STORAGE_KEY = 'pigchain_locations'
const FARMER_STATE_STORAGE_KEY = 'pigchain_farmer_state'

type Farm = StoredEntity & {
  /**
   * ID numérica secuencial (1, 2, 3, ...) que usaremos para identificar
   * de forma estable cada granja en integraciones externas / llamadas a API.
   *
   * No depende del identificador interno almacenado en localStorage,
   * sino de la posición de la granja dentro de la lista actual de granjas.
   */
  sequentialId?: number
  travelTimes?: TravelTimeToEntity[]
}

type FeedIntakePoint = {
  week: number
  meanKg: number
  sdKg: number
}

type BodyWeightPoint = {
  week: number
  meanKg: number
  sdKg: number
}

type FarmerHerdState = {
  currentPigs: number
  ageWeeks: number
  currentFoodKg: number
}

type FarmerViewPersistedState = {
  selectedFarmId: string | null
  herds: Record<string, FarmerHerdState>
}

async function loadGoogleMapsApi(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return

  if ((window as any).google?.maps) {
    return
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.getElementById(
      'google-maps-script',
    ) as HTMLScriptElement | null

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), {
        once: true,
      })
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Failed to load Google Maps script')),
        { once: true },
      )
      return
    }

    const script = document.createElement('script')
    script.id = 'google-maps-script'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () =>
      reject(new Error('Failed to load Google Maps script'))

    document.head.appendChild(script)
  })
}

function loadAllEntities(): StoredEntity[] {
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

// Intake (kg) per pig and week – values from provided table
const FEED_INTAKE_TABLE: FeedIntakePoint[] = [
  { week: 10, meanKg: 5.1, sdKg: 5.5 },
  { week: 11, meanKg: 12.1, sdKg: 8.5 },
  { week: 12, meanKg: 20.5, sdKg: 12.1 },
  { week: 13, meanKg: 30.2, sdKg: 15.9 },
  { week: 14, meanKg: 41.3, sdKg: 19.7 },
  { week: 15, meanKg: 53.4, sdKg: 23.6 },
  { week: 16, meanKg: 66.4, sdKg: 27.5 },
  { week: 17, meanKg: 80.3, sdKg: 31.4 },
  { week: 18, meanKg: 94.9, sdKg: 35.3 },
  { week: 19, meanKg: 110.1, sdKg: 39.2 },
  { week: 20, meanKg: 125.7, sdKg: 43.2 },
  { week: 21, meanKg: 141.6, sdKg: 47.1 },
  { week: 22, meanKg: 157.6, sdKg: 51 },
  { week: 23, meanKg: 173.7, sdKg: 54.9 },
  { week: 24, meanKg: 189.6, sdKg: 58.9 },
  { week: 25, meanKg: 205.3, sdKg: 62.8 },
  { week: 26, meanKg: 220.2, sdKg: 66.7 },
  { week: 27, meanKg: 243.1, sdKg: 70.3 },
  { week: 28, meanKg: 262.3, sdKg: 74.2 },
]

// Body weight (kg) per pig and week – values from provided table
const BODY_WEIGHT_TABLE: BodyWeightPoint[] = [
  { week: 10, meanKg: 29.7, sdKg: 3.9 },
  { week: 11, meanKg: 33.4, sdKg: 4.6 },
  { week: 12, meanKg: 37.8, sdKg: 5.4 },
  { week: 13, meanKg: 42.6, sdKg: 6.3 },
  { week: 14, meanKg: 47.9, sdKg: 7.4 },
  { week: 15, meanKg: 53.5, sdKg: 8.4 },
  { week: 16, meanKg: 59.3, sdKg: 9.5 },
  { week: 17, meanKg: 65.3, sdKg: 10.6 },
  { week: 18, meanKg: 71.3, sdKg: 11.8 },
  { week: 19, meanKg: 77.4, sdKg: 12.9 },
  { week: 20, meanKg: 83.4, sdKg: 14 },
  { week: 21, meanKg: 89.2, sdKg: 15.2 },
  { week: 22, meanKg: 94.8, sdKg: 16.3 },
  { week: 23, meanKg: 100, sdKg: 17.5 },
  { week: 24, meanKg: 104.8, sdKg: 18.7 },
  { week: 25, meanKg: 109.1, sdKg: 19.8 },
  { week: 26, meanKg: 112.8, sdKg: 21 },
  { week: 27, meanKg: 120.7, sdKg: 21.8 },
  { week: 28, meanKg: 126.2, sdKg: 22.9 },
]

function loadFarmerViewState(): FarmerViewPersistedState | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(FARMER_STATE_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as any

    const selectedFarmId =
      parsed && typeof parsed === 'object' && typeof parsed.selectedFarmId === 'string'
        ? parsed.selectedFarmId
        : null

    // Hacemos la carga de herds igual de robusta que en SlaughterView.loadHerds
    const herdsRaw = parsed?.herds
    const herds: Record<string, FarmerHerdState> = {}

    if (herdsRaw && typeof herdsRaw === 'object') {
      for (const [farmId, value] of Object.entries(
        herdsRaw as Record<string, any>,
      )) {
        const pigs =
          typeof value.currentPigs === 'number' &&
          Number.isFinite(value.currentPigs)
            ? value.currentPigs
            : 0
        const age =
          typeof value.ageWeeks === 'number' &&
          Number.isFinite(value.ageWeeks)
            ? value.ageWeeks
            : 20
        const food =
          typeof value.currentFoodKg === 'number' &&
          Number.isFinite(value.currentFoodKg)
            ? value.currentFoodKg
            : 0

        herds[farmId] = {
          currentPigs: pigs,
          ageWeeks: age,
          currentFoodKg: food,
        }
      }
    }

    return {
      selectedFarmId,
      herds,
    }
  } catch {
    return null
  }
}

function saveFarmerViewState(state: FarmerViewPersistedState) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      FARMER_STATE_STORAGE_KEY,
      JSON.stringify(state),
    )
  } catch {
    // Silently ignore persistence errors
  }
}

function loadFarms(): Farm[] {
  // Cargamos todas las entidades tipo "farm" y les asignamos
  // una ID numérica secuencial (1, 2, 3, ...) que podremos
  // utilizar en la llamada a la API.
  const baseFarms = loadAllEntities().filter(
    (item) => item.type === 'farm',
  ) as Farm[]

  return baseFarms.map((farm, index) => ({
    ...farm,
    sequentialId: index + 1,
  }))
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: 1,
  }).format(value)
}

function FarmerView() {
  const [farms, setFarms] = useState<Farm[]>([])
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null)
  const [herdByFarm, setHerdByFarm] = useState<
    Record<string, FarmerHerdState>
  >({})
  const [hasHydratedFromStorage, setHasHydratedFromStorage] = useState(false)
  const [isRoutesLoading, setIsRoutesLoading] = useState(false)
  const [routesError, setRoutesError] = useState<string | null>(null)
  const [hasComputedRoutes, setHasComputedRoutes] = useState(false)
  const [entitiesHash, setEntitiesHash] = useState<string>('')
  const [forceRecompute, setForceRecompute] = useState(0)

  useEffect(() => {
    // 1) Cargamos primero el estado persistido (granja seleccionada + lotes)
    const stored = loadFarmerViewState()
    if (stored) {
      setSelectedFarmId(stored.selectedFarmId)
      setHerdByFarm(stored.herds ?? {})
    }
    // Marcamos que ya hemos intentado hidratar desde localStorage
    setHasHydratedFromStorage(true)
  }, [])

  useEffect(() => {
    // 2) Cargamos las granjas una sola vez y alineamos la selección
    //    respetando, si existe, la granja seleccionada desde el estado previo.
    const loaded = loadFarms()
    setFarms(loaded)
    setSelectedFarmId((prevSelected) => {
      if (loaded.length === 0) return null

      // Si ya había una granja seleccionada y sigue existiendo, la mantenemos.
      if (prevSelected && loaded.some((farm) => farm.id === prevSelected)) {
        return prevSelected
      }

      // Si no había selección válida, usamos la primera disponible.
      return loaded[0].id
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (farms.length === 0) return

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as
      | string
      | undefined

    if (!apiKey) {
      setRoutesError(
        'No se ha definido la clave VITE_GOOGLE_MAPS_API_KEY para calcular rutas.',
      )
      return
    }

    // Crear un hash de las entidades para detectar cambios
    const destinationsEntities = loadAllEntities()
    const currentHash = JSON.stringify(
      destinationsEntities.map((e) => `${e.id}-${e.lat}-${e.lng}`).sort()
    )

    // Si el hash no ha cambiado, no recalcular
    if (currentHash === entitiesHash && hasComputedRoutes) return

    let cancelled = false

    const computeRoutes = async () => {
      try {
        setIsRoutesLoading(true)
        setRoutesError(null)

        await loadGoogleMapsApi(apiKey)
        if (cancelled) return

        const service = new google.maps.DistanceMatrixService()

        if (destinationsEntities.length === 0) {
          setIsRoutesLoading(false)
          setHasComputedRoutes(true)
          setEntitiesHash(currentHash)
          return
        }

        // Límite de Google Maps Distance Matrix API: 100 elementos por petición
        // Elementos = origins × destinations
        // Para evitar MAX_ELEMENTS_EXCEEDED, procesamos de a una granja a la vez
        const MAX_DESTINATIONS_PER_REQUEST = 25
        const allRoutesByFarm: Record<string, TravelTimeToEntity[]> = {}

        // Procesar cada granja individualmente para evitar exceder el límite
        for (let farmIndex = 0; farmIndex < farms.length; farmIndex++) {
          if (cancelled) return

          const farm = farms[farmIndex]
          const origin = { lat: farm.lat, lng: farm.lng }
          
          // Dividir destinos en lotes si hay muchos
          const travelTimesForFarm: TravelTimeToEntity[] = []
          
          for (let destIndex = 0; destIndex < destinationsEntities.length; destIndex += MAX_DESTINATIONS_PER_REQUEST) {
            if (cancelled) return

            const destBatch = destinationsEntities.slice(
              destIndex,
              Math.min(destIndex + MAX_DESTINATIONS_PER_REQUEST, destinationsEntities.length)
            )

            const destinations = destBatch.map((entity) => ({
              lat: entity.lat,
              lng: entity.lng,
            }))

            try {
              const response = await new Promise<any>((resolve, reject) => {
                service.getDistanceMatrix(
                  {
                    origins: [origin],
                    destinations,
                    travelMode: google.maps.TravelMode.DRIVING,
                    unitSystem: google.maps.UnitSystem.METRIC,
                  },
                  (resp: any, status: string) => {
                    if (status === 'OK' && resp?.rows) {
                      resolve(resp)
                    } else {
                      reject(new Error(`API status: ${status}`))
                    }
                  },
                )
              })

              if (cancelled) return

              const row = response.rows[0]
              if (!row) continue

              const elements = row.elements ?? []
              
              elements.forEach((element: any, colIndex: number) => {
                const target = destBatch[colIndex]
                if (!target) return

                // Omitimos la distancia de la granja a sí misma
                if (target.id === farm.id) return

                if (element.status !== 'OK') {
                  console.warn(`Element status not OK for ${target.name}: ${element.status}`)
                  return
                }

                const distanceText = element.distance?.text ?? ''
                const durationText = element.duration?.text ?? ''

                travelTimesForFarm.push({
                  targetId: target.id,
                  targetName: target.name,
                  distanceText,
                  durationText,
                })
              })

              // Pequeña pausa entre peticiones para no saturar la API
              await new Promise(resolve => setTimeout(resolve, 200))
            } catch (error) {
              console.error(`Error processing batch for ${farm.name}:`, error)
              // Continuar con el siguiente lote incluso si este falla
            }
          }

          if (travelTimesForFarm.length > 0) {
            allRoutesByFarm[farm.id] = travelTimesForFarm
          }
        }

        if (cancelled) return

        setFarms((prev) =>
          prev.map((farm) => ({
            ...farm,
            travelTimes: allRoutesByFarm[farm.id] ?? [],
          })),
        )

        setIsRoutesLoading(false)
        setHasComputedRoutes(true)
        setEntitiesHash(currentHash)
      } catch (error) {
        if (cancelled) return
        console.error('Error calculating routes:', error)
        setRoutesError(
          'Ha ocurrido un error al cargar Google Maps para calcular las rutas.',
        )
        setIsRoutesLoading(false)
        setHasComputedRoutes(true)
        setEntitiesHash(currentHash)
      }
    }

    void computeRoutes()

    return () => {
      cancelled = true
    }
  }, [farms.length, hasComputedRoutes, entitiesHash, forceRecompute])

  useEffect(() => {
    // Evitamos sobreescribir el estado persistido con valores por defecto
    // antes de haber intentado hidratar desde localStorage.
    if (!hasHydratedFromStorage) return

    const state: FarmerViewPersistedState = {
      selectedFarmId,
      herds: herdByFarm,
    }
    saveFarmerViewState(state)
  }, [selectedFarmId, herdByFarm, hasHydratedFromStorage])

  const selectedFarm = useMemo(
    () => farms.find((farm) => farm.id === selectedFarmId) ?? null,
    [farms, selectedFarmId],
  )

  const selectedHerd: FarmerHerdState =
    selectedFarmId && herdByFarm[selectedFarmId]
      ? herdByFarm[selectedFarmId]
      : {
          currentPigs: 0,
          ageWeeks: 20,
          currentFoodKg: 0,
        }

  const { currentPigs, ageWeeks, currentFoodKg } = selectedHerd

  const capacityUsagePct = useMemo(() => {
    if (!selectedFarm || selectedFarm.maxCapacity <= 0) return 0
    if (currentPigs <= 0) return 0
    return Math.min(100, (currentPigs / selectedFarm.maxCapacity) * 100)
  }, [selectedFarm, currentPigs])

  const intakeForCurrentAge = useMemo(() => {
    const point = FEED_INTAKE_TABLE.find((p) => p.week === ageWeeks)
    return point ?? null
  }, [ageWeeks])

  const weightForCurrentAge = useMemo(() => {
    const point = BODY_WEIGHT_TABLE.find((p) => p.week === ageWeeks)
    return point ?? null
  }, [ageWeeks])

  const weeklyFeedTotalKg = useMemo(() => {
    if (!intakeForCurrentAge || currentPigs <= 0) return 0
    return intakeForCurrentAge.meanKg * currentPigs
  }, [intakeForCurrentAge, currentPigs])

  // Calcular días de comida restantes considerando el crecimiento de los cerdos
  // Calcular días de comida restantes y proyección semana a semana
  const { daysOfFoodRemaining, weeklyProjection } = useMemo(() => {
    if (currentFoodKg <= 0 || currentPigs <= 0) {
      return { daysOfFoodRemaining: 0, weeklyProjection: [] }
    }
    
    let remainingFood = currentFoodKg
    let currentAge = ageWeeks
    let totalDays = 0
    const projection: Array<{
      week: number
      weeklyConsumption: number
      remainingFood: number
      daysInWeek: number
    }> = []
    
    // Simulamos el consumo semana a semana hasta que se acabe la comida o lleguemos al límite de la tabla
    while (remainingFood > 0 && currentAge <= 28) {
      // Buscamos el consumo para la edad actual
      const intakePoint = FEED_INTAKE_TABLE.find((p) => p.week === currentAge)
      
      if (!intakePoint) {
        // Si no hay datos para esta edad, usamos el último valor disponible
        const lastPoint = FEED_INTAKE_TABLE[FEED_INTAKE_TABLE.length - 1]
        const weeklyConsumption = lastPoint.meanKg * currentPigs
        const dailyConsumption = weeklyConsumption / 7
        
        if (dailyConsumption <= 0) break
        
        const daysWithRemainingFood = remainingFood / dailyConsumption
        totalDays += daysWithRemainingFood
        
        projection.push({
          week: currentAge,
          weeklyConsumption,
          remainingFood: 0,
          daysInWeek: daysWithRemainingFood,
        })
        break
      }
      
      const weeklyConsumption = intakePoint.meanKg * currentPigs
      const dailyConsumption = weeklyConsumption / 7
      
      if (dailyConsumption <= 0) break
      
      // Verificamos si podemos completar toda la semana
      if (remainingFood >= weeklyConsumption) {
        // Tenemos comida para toda la semana
        remainingFood -= weeklyConsumption
        totalDays += 7
        
        projection.push({
          week: currentAge,
          weeklyConsumption,
          remainingFood,
          daysInWeek: 7,
        })
        
        currentAge += 1
      } else {
        // Solo podemos cubrir parte de la semana
        const daysInPartialWeek = remainingFood / dailyConsumption
        totalDays += daysInPartialWeek
        
        projection.push({
          week: currentAge,
          weeklyConsumption,
          remainingFood: 0,
          daysInWeek: daysInPartialWeek,
        })
        
        remainingFood = 0
        break
      }
    }
    
    return { daysOfFoodRemaining: totalDays, weeklyProjection: projection }
  }, [currentFoodKg, currentPigs, ageWeeks])

  const maxIntakeMean = useMemo(
    () =>
      FEED_INTAKE_TABLE.reduce(
        (max, point) => (point.meanKg > max ? point.meanKg : max),
        0,
      ),
    [],
  )

  const maxBodyWeightMean = useMemo(
    () =>
      BODY_WEIGHT_TABLE.reduce(
        (max, point) => (point.meanKg > max ? point.meanKg : max),
        0,
      ),
    [],
  )

  // Peso óptimo para envío (kg)
  const OPTIMAL_MIN_WEIGHT_KG = 105
  const OPTIMAL_MAX_WEIGHT_KG = 115

  // Desviación máxima respecto a la ventana óptima, para escalar colores
  const maxWeightDeviationKg = useMemo(() => {
    if (BODY_WEIGHT_TABLE.length === 0) return 1

    const minMean = BODY_WEIGHT_TABLE.reduce(
      (min, point) => (point.meanKg < min ? point.meanKg : min),
      BODY_WEIGHT_TABLE[0].meanKg,
    )
    const maxMean = BODY_WEIGHT_TABLE.reduce(
      (max, point) => (point.meanKg > max ? point.meanKg : max),
      BODY_WEIGHT_TABLE[0].meanKg,
    )

    return Math.max(
      Math.abs(minMean - OPTIMAL_MIN_WEIGHT_KG),
      Math.abs(maxMean - OPTIMAL_MAX_WEIGHT_KG),
      1,
    )
  }, [])

  // Calendario de envío óptimo (semanas vs fechas, coloreado de rojo a verde)
  const today = useMemo(() => new Date(), [])

  const shippingCalendar = useMemo(
    () => {
      if (!selectedFarm) return []

      return BODY_WEIGHT_TABLE.map((point) => {
        const offsetWeeks = point.week - ageWeeks
        const date = new Date(today)
        date.setDate(today.getDate() + offsetWeeks * 7)

        const meanWeight = point.meanKg
        let score: number

        if (
          meanWeight >= OPTIMAL_MIN_WEIGHT_KG &&
          meanWeight <= OPTIMAL_MAX_WEIGHT_KG
        ) {
          // Zona óptima: totalmente verde
          score = 1
        } else {
          const distance =
            meanWeight < OPTIMAL_MIN_WEIGHT_KG
              ? OPTIMAL_MIN_WEIGHT_KG - meanWeight
              : meanWeight - OPTIMAL_MAX_WEIGHT_KG

          score = Math.max(0, 1 - distance / maxWeightDeviationKg)
        }

        const hue = score * 120 // 0 = rojo, 120 = verde
        const backgroundColor = `hsl(${hue}, 75%, ${
          score > 0.6 ? 45 : 40
        }%)`

        return {
          point,
          date,
          score,
          backgroundColor,
          isCurrent: point.week === ageWeeks,
        }
      })
    },
    [selectedFarm, ageWeeks, today, maxWeightDeviationKg],
  )

  return (
    <section id="farmer-view" className="space-y-6">
      <header className="space-y-2 text-center">
        <p className="text-sm font-bold uppercase tracking-wider text-[#6b8e23]">
          🌾 Vista Granja
        </p>
        <h2 className="text-3xl font-bold text-[#3d3d3d] sm:text-4xl">
          Estado de Granjas y Consumo de Pienso
        </h2>
        <p className="max-w-2xl mx-auto text-base text-[#5a5a5a]">
          Selecciona una granja creada en el mapa, indica el número y la edad
          de los cerdos, y visualiza la ocupación de capacidad y el consumo
          estimado de comida según la curva de ingesta.
        </p>
      </header>

      {farms.length === 0 ? (
        <div className="rounded-lg border-3 border-dashed border-[#6b8e23] bg-[#f5deb3]/30 p-8 text-center">
          <p className="text-lg font-bold text-[#3d3d3d]">
            🐷 Todavía no hay granjas registradas
          </p>
          <p className="mt-2 text-[#5a5a5a]">
            Abre la sección <span className="font-bold text-[#6b8e23]">Mapa</span> y haz
            clic en el mapa para registrar al menos una ubicación de tipo{' '}
            <span className="font-bold text-[#6b8e23]">Granja</span>. Después volverás aquí
            para analizar su ocupación y consumo de pienso.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Selector de granja (arriba del todo) */}
          <div className="space-y-4 rounded-lg border-3 border-[#8b7355] bg-white p-6 shadow-md">
            <h3 className="text-lg font-bold text-[#3d3d3d] border-b-2 border-[#f5deb3] pb-2">
              🏠 Selección de Granja
            </h3>

            <div className="space-y-3">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[#6b8e23]">
                  Granja:
                </label>
                <select
                  className="w-full rounded border-2 border-[#ddd] bg-[#fefefe] px-3 py-2.5 text-base text-[#3d3d3d] focus:border-[#6b8e23] focus:outline-none focus:ring-2 focus:ring-[#6b8e23]/20"
                  value={selectedFarm?.id ?? ''}
                  onChange={(e) => setSelectedFarmId(e.target.value)}
                >
                  {farms.map((farm) => (
                    <option key={farm.id} value={farm.id}>
                      {farm.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedFarm && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg bg-[#f5deb3]/40 p-4 border-2 border-[#ddd]">
                      <p className="text-xs font-bold uppercase text-[#6b8e23]">
                        Capacidad Máxima
                      </p>
                      <p className="mt-2 text-xl font-bold text-[#3d3d3d]">
                        {formatNumber(selectedFarm.maxCapacity)} cerdos
                      </p>
                      <p className="mt-1 text-sm text-[#5a5a5a]">
                        Ocupación actual:{' '}
                        <span className="font-bold text-[#c85a54]">
                          {formatNumber(capacityUsagePct)}%
                        </span>
                      </p>
                    </div>
                    <div className="rounded-lg bg-[#f5deb3]/40 p-4 border-2 border-[#ddd]">
                      <p className="text-xs font-bold uppercase text-[#6b8e23]">
                        Localización
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[#3d3d3d]">
                        Lat {selectedFarm.lat.toFixed(4)}, Lng{' '}
                        {selectedFarm.lng.toFixed(4)}
                      </p>
                      <p className="mt-1 text-xs text-[#5a5a5a]">
                        Datos del mapa de Pigchain
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg bg-[#f9f6f1] p-4 border-2 border-[#ddd]">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-bold text-[#6b8e23]">
                        🚗 Tiempos de viaje a otras granjas y mataderos
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setHasComputedRoutes(false)
                          setEntitiesHash('')
                          setForceRecompute(prev => prev + 1)
                        }}
                        disabled={isRoutesLoading}
                        className="text-xs px-3 py-1 rounded border border-[#6b8e23] bg-white text-[#6b8e23] hover:bg-[#6b8e23] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isRoutesLoading ? '⏳ Calculando...' : '🔄 Recalcular'}
                      </button>
                    </div>
                    {isRoutesLoading && (
                      <p className="mt-2 text-sm text-[#5a5a5a]">
                        Calculando distancias entre granjas y mataderos…
                      </p>
                    )}
                    {!isRoutesLoading && routesError && (
                      <div className="mt-2 space-y-2">
                        <p className="text-sm text-[#c85a54]">
                          {routesError}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setHasComputedRoutes(false)
                            setEntitiesHash('')
                            setRoutesError(null)
                            setForceRecompute(prev => prev + 1)
                          }}
                          className="text-xs px-3 py-1.5 rounded bg-[#6b8e23] text-white hover:bg-[#5a7a1c] transition-colors"
                        >
                          Reintentar cálculo
                        </button>
                      </div>
                    )}
                    {!isRoutesLoading &&
                      !routesError &&
                      (!selectedFarm.travelTimes ||
                        selectedFarm.travelTimes.length === 0) && (
                        <p className="mt-2 text-sm text-[#5a5a5a]">
                          No hay suficientes puntos registrados. Añade ubicaciones de
                          tipo{' '}
                          <span className="font-bold text-[#6b8e23]">Granja</span> o{' '}
                          <span className="font-bold text-[#6b8e23]">
                            Matadero
                          </span>{' '}
                          en el mapa.
                        </p>
                      )}
                    {!isRoutesLoading &&
                      !routesError &&
                      selectedFarm.travelTimes &&
                      selectedFarm.travelTimes.length > 0 && (
                        <ul className="mt-2 space-y-2">
                          {selectedFarm.travelTimes.map((route) => (
                            <li
                              key={route.targetId}
                              className="flex items-center justify-between rounded border border-[#ddd] bg-white px-3 py-2"
                            >
                              <span className="font-semibold text-[#3d3d3d]">
                                {route.targetName}
                              </span>
                              <span className="text-sm text-[#5a5a5a]">
                                {route.durationText}
                                {route.distanceText
                                  ? ` · ${route.distanceText}`
                                  : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Panel principal: % ocupación + número de cerdos y edad */}
          {selectedFarm && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              {/* Ocupación visual */}
              <div className="space-y-4 rounded-lg border-3 border-[#8b7355] bg-white p-6 shadow-md">
                <h3 className="text-lg font-bold text-[#3d3d3d] border-b-2 border-[#f5deb3] pb-2">
                  📊 Ocupación de la Granja
                </h3>
                <p className="text-sm text-[#5a5a5a]">
                  Visualiza qué porcentaje de la capacidad de esta
                  granja está ocupada con el lote actual.
                </p>

                <div className="pt-2">
                  <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                    <div className="flex flex-1 items-center justify-center">
                      <div className="relative h-40 w-40">
                        <div
                          className="absolute inset-0 rounded-full shadow-md border-4 border-[#ddd]"
                          style={{
                            background: `conic-gradient(#6b8e23 ${capacityUsagePct * 3.6}deg, #e5e5e5 0deg)`,
                          }}
                        />
                        <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-white border-2 border-[#f5deb3]">
                          <span className="text-[10px] font-bold uppercase text-[#8b7355]">
                            Ocupación
                          </span>
                          <span className="text-2xl font-bold text-[#3d3d3d]">
                            {formatNumber(capacityUsagePct)}%
                          </span>
                          <span className="text-2xl font-bold text-[#3d3d3d]">
                            {formatNumber(currentFoodKg)} kg
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 space-y-3 text-sm text-[#5a5a5a]">
                      <p>
                        La ocupación se calcula como{' '}
                        <span className="font-bold text-[#3d3d3d]">
                          cerdos actuales / capacidad máxima
                        </span>
                        .
                      </p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span>Cerdos actuales:</span>
                          <span className="font-bold text-[#3d3d3d]">
                            {formatNumber(currentPigs)} /{' '}
                            {formatNumber(selectedFarm.maxCapacity)}
                          </span>
                        </div>  
                        <div className="h-3 w-full overflow-hidden rounded-full bg-[#e5e5e5] border border-[#ddd]">
                          <div
                            className="h-full rounded-full bg-[#6b8e23]"
                            style={{ width: `${capacityUsagePct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Datos del lote: número de cerdos y edad (editable) */}
              <div className="space-y-4 rounded-lg border-3 border-[#8b7355] bg-white p-6 shadow-md">
                <h3 className="text-lg font-bold text-[#3d3d3d] border-b-2 border-[#f5deb3] pb-2">
                  🐖 Datos del Lote de Cerdos
                </h3>

                <div className="grid gap-4 sm:grid-cols-1">
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-[#6b8e23]">
                      Número de cerdos actuales:
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={selectedFarm.maxCapacity || undefined}
                      value={Number.isFinite(currentPigs) ? currentPigs : 0}
                      onChange={(e) => {
                        const value = Number(e.target.value)
                        const numeric = Number.isNaN(value)
                          ? 0
                          : Math.max(0, value)

                        if (!selectedFarmId) return

                        setHerdByFarm((prev) => {
                          const prevForFarm =
                            prev[selectedFarmId] ?? ({
                              currentPigs: 0,
                              ageWeeks: 20,
                              currentFoodKg: 0,
                            } as FarmerHerdState)

                          return {
                            ...prev,
                            [selectedFarmId]: {
                              ...prevForFarm,
                              currentPigs: numeric,
                            },
                          }
                        })
                      }}
                      placeholder="Ej. 850"
                      className="w-full rounded border-2 border-[#ddd] bg-[#fefefe] px-3 py-2.5 text-base text-[#3d3d3d] focus:border-[#6b8e23] focus:outline-none focus:ring-2 focus:ring-[#6b8e23]/20"
                    />
                    <p className="text-xs text-[#5a5a5a]">
                      Idealmente menor o igual a la capacidad máxima declarada.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-[#6b8e23]">
                      Edad actual (semanas):
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={10}
                        max={28}
                        step={1}
                        value={ageWeeks}
                        onChange={(e) => {
                          const value = Number(e.target.value)
                          if (!selectedFarmId || Number.isNaN(value)) return

                          const clamped = Math.min(28, Math.max(10, value))

                          setHerdByFarm((prev) => {
                            const prevForFarm =
                              prev[selectedFarmId] ?? ({
                                currentPigs: 0,
                                ageWeeks: 20,
                                currentFoodKg: 0,
                              } as FarmerHerdState)

                            return {
                              ...prev,
                              [selectedFarmId]: {
                                ...prevForFarm,
                                ageWeeks: clamped,
                              },
                            }
                          })
                        }}
                        className="flex-1 accent-[#6b8e23]"
                      />
                      <input
                        type="number"
                        min={10}
                        max={28}
                        value={ageWeeks}
                        onChange={(e) => {
                          const value = Number(e.target.value)
                          if (!selectedFarmId || Number.isNaN(value)) return
                          const clamped = Math.min(28, Math.max(10, value))
                          setHerdByFarm((prev) => {
                            const prevForFarm =
                              prev[selectedFarmId] ?? ({
                                currentPigs: 0,
                                ageWeeks: 20,
                                currentFoodKg: 0,
                              } as FarmerHerdState)

                            return {
                              ...prev,
                              [selectedFarmId]: {
                                ...prevForFarm,
                                ageWeeks: clamped,
                              },
                            }
                          })
                        }}
                        className="w-20 rounded border-2 border-[#ddd] bg-[#fefefe] px-2 py-2 text-base text-[#3d3d3d] text-center font-bold focus:border-[#6b8e23] focus:outline-none focus:ring-2 focus:ring-[#6b8e23]/20"
                      />
                    </div>
                    <p className="text-xs text-[#5a5a5a]">
                      Rango disponible: 10–28 semanas (tabla de ingesta).
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-[#6b8e23]">
                      🌾 Comida actual disponible (kg):
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={100}
                      value={Number.isFinite(currentFoodKg) ? currentFoodKg : 0}
                      onChange={(e) => {
                        const value = Number(e.target.value)
                        const numeric = Number.isNaN(value)
                          ? 0
                          : Math.max(0, value)

                        if (!selectedFarmId) return

                        setHerdByFarm((prev) => {
                          const prevForFarm =
                            prev[selectedFarmId] ?? ({
                              currentPigs: 0,
                              ageWeeks: 20,
                              currentFoodKg: 0,
                            } as FarmerHerdState)

                          return {
                            ...prev,
                            [selectedFarmId]: {
                              ...prevForFarm,
                              currentFoodKg: numeric,
                            },
                          }
                        })
                      }}
                      placeholder="Ej. 5000"
                      className="w-full rounded border-2 border-[#ddd] bg-[#fefefe] px-3 py-2.5 text-base text-[#3d3d3d] focus:border-[#6b8e23] focus:outline-none focus:ring-2 focus:ring-[#6b8e23]/20"
                    />
                    {daysOfFoodRemaining > 0 ? (
                      <div className="space-y-3">
                        <div className="rounded-lg bg-[#f5deb3]/60 border-2 border-[#6b8e23]/30 p-3">
                          <p className="text-sm font-bold text-[#3d3d3d]">
                            📊 Días de comida restantes:{' '}
                            <span className={`text-lg ${daysOfFoodRemaining < 7 ? 'text-[#c85a54]' : daysOfFoodRemaining < 14 ? 'text-[#d97706]' : 'text-[#6b8e23]'}`}>
                              {formatNumber(daysOfFoodRemaining)} días
                            </span>
                          </p>
                          <p className="text-xs text-[#5a5a5a] mt-1">
                            Consumo actual (semana {ageWeeks}): {formatNumber(weeklyFeedTotalKg / 7)} kg/día
                            ({formatNumber(weeklyFeedTotalKg)} kg/semana)
                          </p>
                          <p className="text-xs text-[#5a5a5a] mt-1">
                            ⚡ El cálculo considera que los cerdos crecen y aumentan su consumo cada semana
                          </p>
                          {daysOfFoodRemaining < 7 && (
                            <p className="text-xs text-[#c85a54] font-bold mt-2">
                              ⚠️ ¡Atención! Quedan menos de 7 días de comida
                            </p>
                          )}
                          {daysOfFoodRemaining >= 7 && daysOfFoodRemaining < 14 && (
                            <p className="text-xs text-[#d97706] font-bold mt-2">
                              ⚠️ Atención: Quedan menos de 2 semanas de comida
                            </p>
                          )}
                        </div>

                        {weeklyProjection.length > 0 && (
                          <div className="rounded-lg border-2 border-[#ddd] bg-white p-3">
                            <p className="text-sm font-bold text-[#6b8e23] mb-2">
                              📈 Proyección de consumo por semanas
                            </p>
                            <div className="space-y-1.5 max-h-48 overflow-y-auto">
                              {weeklyProjection.slice(0, 6).map((proj, index) => {
                                const isPartialWeek = proj.daysInWeek < 7
                                const isLastWeek = proj.remainingFood === 0
                                
                                return (
                                  <div
                                    key={proj.week}
                                    className={`rounded border px-2 py-1.5 text-xs ${
                                      isLastWeek
                                        ? 'bg-[#c85a54]/10 border-[#c85a54]/30'
                                        : index === 0
                                          ? 'bg-[#6b8e23]/10 border-[#6b8e23]/30'
                                          : 'bg-[#f9f6f1] border-[#ddd]'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-[#3d3d3d]">
                                        Semana {proj.week}
                                        {index === 0 && ' (actual)'}
                                      </span>
                                      {isPartialWeek && (
                                        <span className="text-[#c85a54] font-bold">
                                          ⚠️ {formatNumber(proj.daysInWeek)} días
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-1 text-[#5a5a5a]">
                                      Consumo: {formatNumber(proj.weeklyConsumption)} kg/semana
                                    </div>
                                    <div className="text-[#5a5a5a]">
                                      Restante: {formatNumber(proj.remainingFood)} kg
                                      {isLastWeek && (
                                        <span className="text-[#c85a54] font-bold ml-1">
                                          (se agota)
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                            {weeklyProjection.length > 6 && (
                              <p className="text-xs text-[#5a5a5a] mt-2 text-center italic">
                                ... y {weeklyProjection.length - 6} semanas más
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-[#5a5a5a]">
                        Introduce la cantidad de comida disponible para calcular los días restantes.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {farms.length > 0 && (
        <div className="space-y-4 rounded-lg border-4 border-[#8b7355] bg-[#fff] p-6 shadow-lg">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b-2 border-[#f5deb3] pb-4">
            <div>
              <h3 className="text-xl font-bold text-[#3d3d3d]">
                📈 Panel de Métricas de Consumo y Peso
              </h3>
              <p className="text-sm text-[#5a5a5a] mt-1">
                Consumo por edad, peso vivo medio y estimaciones para el lote actual
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded border-2 border-[#6b8e23] bg-[#f5deb3] px-3 py-1.5 font-bold text-[#3d3d3d]">
                <span className="h-2 w-2 rounded-full bg-[#6b8e23]" />
                Semana {ageWeeks}
              </span>
              {intakeForCurrentAge && (
                <span className="inline-flex items-center gap-1 rounded border border-[#ddd] bg-white px-3 py-1 text-[#5a5a5a]">
                  Consumo:{' '}
                  <span className="font-bold text-[#3d3d3d]">
                    {formatNumber(intakeForCurrentAge.meanKg)} kg/sem
                  </span>
                </span>
              )}
              {weightForCurrentAge && (
                <span className="inline-flex items-center gap-1 rounded border border-[#ddd] bg-white px-3 py-1 text-[#5a5a5a]">
                  Peso:{' '}
                  <span className="font-bold text-[#3d3d3d]">
                    {formatNumber(weightForCurrentAge.meanKg)} kg
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            {/* Curva de consumo (tipo gráfico de barras) */}
            <div className="space-y-3 rounded-lg border-2 border-[#ddd] bg-[#f9f6f1] p-4">
              <div className="flex items-center justify-between gap-2 border-b border-[#ddd] pb-2">
                <div>
                  <p className="text-sm font-bold text-[#6b8e23]">
                    Consumo de pienso por edad
                  </p>
                  <p className="text-xs text-[#5a5a5a]">
                    Cada barra es kg/cerdo/sem según la tabla facilitada
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-4 rounded bg-[#c85a54]" />
                    Actual
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-4 rounded bg-[#9cb369]" />
                    Histórico
                  </span>
                </div>
              </div>

              <div className="mt-2 overflow-x-auto pb-2">
                <div className="flex min-w-[520px] items-end gap-2 border-b-2 border-[#8b7355] pb-2 h-48">
                  {FEED_INTAKE_TABLE.map((point) => {
                    const heightPct =
                      maxIntakeMean > 0
                        ? (point.meanKg / maxIntakeMean) * 100
                        : 0
                    const isCurrent = point.week === ageWeeks
                    const barClasses = isCurrent
                      ? 'bg-[#c85a54] border-2 border-[#a64740]'
                      : 'bg-[#9cb369] border border-[#ddd]'

                    return (
                      <div
                        key={point.week}
                        className="flex flex-1 flex-col items-center justify-end gap-1"
                      >
                        <div
                          className={`w-5 rounded-t ${barClasses}`}
                          style={{ height: `${heightPct}%` }}
                        />
                        <span className="text-[10px] text-[#5a5a5a] font-semibold">
                          {point.week}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Crecimiento de peso a lo largo del tiempo */}
              <div className="mt-4 space-y-2 rounded-lg border-2 border-[#ddd] bg-white p-3">
                <div className="flex items-center justify-between gap-2 border-b border-[#ddd] pb-2">
                  <div>
                    <p className="text-sm font-bold text-[#6b8e23]">
                      Crecimiento del peso a lo largo del tiempo
                    </p>
                    <p className="text-xs text-[#5a5a5a]">
                      Cada columna muestra el peso vivo medio por semana
                    </p>
                  </div>
                  <div className="hidden text-xs text-[#5a5a5a] sm:block">
                    Actual:{' '}
                    <span className="font-bold text-[#3d3d3d]">
                      semana {ageWeeks}
                    </span>
                  </div>
                </div>

                <div className="mt-2 overflow-x-auto pb-2">
                  <div className="flex min-w-[520px] items-end gap-2 border-b-2 border-[#8b7355] pb-2 h-48">
                    {BODY_WEIGHT_TABLE.map((point) => {
                      const heightPct =
                        maxBodyWeightMean > 0
                          ? (point.meanKg / maxBodyWeightMean) * 100
                          : 0

                      let score: number
                      if (
                        point.meanKg >= OPTIMAL_MIN_WEIGHT_KG &&
                        point.meanKg <= OPTIMAL_MAX_WEIGHT_KG
                      ) {
                        score = 1
                      } else {
                        const distance =
                          point.meanKg < OPTIMAL_MIN_WEIGHT_KG
                            ? OPTIMAL_MIN_WEIGHT_KG - point.meanKg
                            : point.meanKg - OPTIMAL_MAX_WEIGHT_KG
                        score = Math.max(0, 1 - distance / maxBodyWeightMean)
                      }

                      const hue = score * 120
                      const isCurrent = point.week === ageWeeks

                      return (
                        <div
                          key={point.week}
                          className="flex flex-1 flex-col items-center justify-end gap-1"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <div
                              className="relative w-5 overflow-hidden rounded-t border border-[#ddd]"
                              style={{ 
                                height: `${heightPct}%`,
                                background: `hsl(${hue},40%,${isCurrent ? '45' : '55'}%)`
                              }}
                            >
                              {isCurrent && (
                                <div className="absolute -top-2 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#c85a54] border border-white" />
                              )}
                            </div>
                            <span className="text-[9px] text-[#5a5a5a]">
                              {formatNumber(point.meanKg)}
                            </span>
                          </div>
                          <span className="text-[10px] text-[#5a5a5a] font-semibold">
                            {point.week}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Tarjetas tipo panel para consumo y peso */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 rounded-lg border-2 border-[#ddd] bg-[#f9f6f1] p-4">
                <p className="text-sm font-bold text-[#6b8e23] border-b border-[#ddd] pb-2">
                  Detalle de la semana {ageWeeks}
                </p>
                {intakeForCurrentAge ? (
                  <>
                    <p className="text-sm text-[#5a5a5a]">
                      Consumo medio por cerdo:{' '}
                      <span className="font-bold text-[#3d3d3d]">
                        {formatNumber(intakeForCurrentAge.meanKg)} kg/sem
                      </span>
                    </p>
                    <p className="text-sm text-[#5a5a5a]">
                      Desviación estándar:{' '}
                      <span className="font-bold text-[#3d3d3d]">
                        {formatNumber(intakeForCurrentAge.sdKg)} kg
                      </span>
                    </p>
                    <p className="text-sm text-[#5a5a5a]">
                      Peso vivo medio:{' '}
                      <span className="font-bold text-[#3d3d3d]">
                        {weightForCurrentAge
                          ? `${formatNumber(weightForCurrentAge.meanKg)} kg`
                          : '–'}
                      </span>
                    </p>
                    <p className="text-sm text-[#5a5a5a]">
                      Desv. estándar peso:{' '}
                      <span className="font-bold text-[#3d3d3d]">
                        {weightForCurrentAge
                          ? `${formatNumber(weightForCurrentAge.sdKg)} kg`
                          : '–'}
                      </span>
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-[#5a5a5a]">
                    No hay datos de ingesta para esta edad.
                  </p>
                )}
              </div>

              <div className="space-y-2 rounded-lg border-2 border-[#ddd] bg-[#f9f6f1] p-4">
                <p className="text-sm font-bold text-[#6b8e23] border-b border-[#ddd] pb-2">
                  Estimación de consumo para el lote
                </p>
                {weeklyFeedTotalKg > 0 ? (
                  <>
                    <p className="text-sm text-[#5a5a5a]">
                      Consumo semanal total:{' '}
                      <span className="font-bold text-[#c85a54]">
                        {formatNumber(weeklyFeedTotalKg)} kg
                      </span>{' '}
                      (
                      <span className="font-bold text-[#c85a54]">
                        {formatNumber(weeklyFeedTotalKg / 1000)} t
                      </span>
                      )
                    </p>
                    <p className="text-xs text-[#5a5a5a]">
                      Estimación basada en consumo medio × número de cerdos
                      actuales
                    </p>
                    <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-[#e5e5e5] border border-[#ddd]">
                      <div
                        className="h-full rounded-full bg-[#6b8e23]"
                        style={{
                          width: `${Math.min(
                            100,
                            (weeklyFeedTotalKg / (selectedFarm?.maxCapacity || 1)) *
                              2,
                          )}%`,
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-[#5a5a5a]">
                    Introduce un número de cerdos y una edad para ver la
                    estimación de consumo.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Calendario de envío óptimo según peso vivo */}
          <div className="space-y-3 rounded-lg border-2 border-[#ddd] bg-white p-4">
            <div className="flex items-center justify-between gap-2 border-b border-[#ddd] pb-2">
              <div>
                <p className="text-sm font-bold text-[#6b8e23]">
                  📅 Calendario de envío óptimo
                </p>
                <p className="text-xs text-[#5a5a5a]">
                  Verde = mejor momento (105–115 kg), rojo = menos óptimo.
                  Fechas calculadas desde hoy.
                </p>
              </div>
              <div className="hidden text-xs text-[#5a5a5a] sm:block">
                Ventana óptima:{' '}
                <span className="font-bold text-[#3d3d3d]">
                  {OPTIMAL_MIN_WEIGHT_KG}–{OPTIMAL_MAX_WEIGHT_KG} kg
                </span>
              </div>
            </div>

            <div className="mt-2 overflow-x-auto pb-2">
              <div className="flex min-w-[520px] gap-2">
                {shippingCalendar.map(
                  ({ point, date, backgroundColor, score, isCurrent }) => (
                    <div
                      key={point.week}
                      className="flex flex-col items-stretch"
                    >
                      <div
                        className="w-24 rounded-lg border border-slate-800/70 px-2 py-2 text-center text-[11px] shadow-sm"
                        style={{
                          background: `linear-gradient(to bottom, ${backgroundColor}, rgba(15,23,42,0.98))`,
                          boxShadow:
                            score > 0.8
                              ? '0 0 16px rgba(74,222,128,0.65)'
                              : score < 0.3
                                ? '0 0 12px rgba(248,113,113,0.5)'
                                : '0 0 10px rgba(148,163,184,0.4)',
                        }}
                      >
                        <div className="font-semibold text-[11px] text-slate-50">
                          {new Intl.DateTimeFormat('es-ES', {
                            day: '2-digit',
                            month: 'short',
                          }).format(date)}
                        </div>
                        <div className="text-[10px] text-slate-100/90">
                          {formatNumber(point.meanKg)} kg
                        </div>
                        <div className="mt-1 text-[9px] text-slate-100/80">
                          {point.meanKg >= OPTIMAL_MIN_WEIGHT_KG &&
                          point.meanKg <= OPTIMAL_MAX_WEIGHT_KG
                            ? 'Óptimo'
                            : point.meanKg < OPTIMAL_MIN_WEIGHT_KG
                              ? 'Aún ligero'
                              : 'Más pesado'}
                        </div>
                        {isCurrent && (
                          <div className="mt-1 rounded-full border border-amber-300/60 bg-amber-400/20 px-1 py-px text-[9px] text-amber-100">
                            Hoy
                          </div>
                        )}
                      </div>
                      <div className="mt-1 text-center text-[9px] text-slate-400">
                        Sem {point.week}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default FarmerView


