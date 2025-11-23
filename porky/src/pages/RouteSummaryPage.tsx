import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import GoogleMap from '../components/GoogleMap'

type EntityType = 'farm' | 'slaughterhouse'

type StoredEntity = {
  id: string
  type: EntityType
  name: string
  maxCapacity: number
  lat: number
  lng: number
}

type RouteStop = {
  id: string
  pigs: number
}

type TruckRoute = {
  id: number
  route: RouteStop[]
  distance_km?: number
}

type OptimizationDay = {
  timedatestamp: string
  trucks: TruckRoute[]
  // Totales agregados que devuelve la API para este día
  totalKg?: number
  totalEuros?: number
  totalDistanceKm?: number
  fuelCostEuros?: number
  truckCostEuros?: number
  netProfitEuros?: number
}

type OptimizationResponse = {
  id: string
  days: OptimizationDay[]
  summary?: {
    total_days: number
    total_revenue_euros: number
    total_fuel_cost_euros: number
    total_truck_cost_euros: number
    total_costs_euros: number
    total_net_profit_euros: number
    profit_margin_percent: number
    total_pigs_collected: number
    total_distance_km: number
    max_trucks_per_day: number
    avg_trucks_per_day: number
    cost_per_pig_euros: number
    revenue_per_pig_euros: number
  }
}

type LocationState = {
  optimizationResult?: OptimizationResponse
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

const ROUTE_COLORS = ['#0ea5e9', '#22c55e', '#f97316', '#e11d48', '#6366f1']

function RouteSummaryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [storedEntities, setStoredEntities] = useState<StoredEntity[]>([])
  const [selectedDayIndex, setSelectedDayIndex] = useState(0)
  const [hoveredTruckId, setHoveredTruckId] = useState<number | null>(null)
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null)

  useEffect(() => {
    setStoredEntities(loadStoredEntities())
  }, [])

  const optimizationResult: OptimizationResponse | null = useMemo(() => {
    const state = location.state as LocationState | null
    if (state?.optimizationResult) {
      return state.optimizationResult
    }
    return null
  }, [location.state])

  const days = optimizationResult?.days ?? []

  const slaughterhouses = useMemo(
    () => storedEntities.filter((e) => e.type === 'slaughterhouse'),
    [storedEntities],
  )

  const slaughterhouse = useMemo(
    () => (slaughterhouses.length > 0 ? slaughterhouses[0] : null),
    [slaughterhouses],
  )

  const selectedDay: OptimizationDay | null =
    days.length > 0
      ? days[Math.min(selectedDayIndex, days.length - 1)]
      : null

  const dateLabel = selectedDay
    ? new Date(selectedDay.timedatestamp).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : 'Sin fecha'

  const totalSlaughterCapacity = useMemo(
    () =>
      slaughterhouses.reduce(
        (sum, plant) => sum + (plant.maxCapacity || 0),
        0,
      ),
    [slaughterhouses],
  )

  const selectedDayTotalPigs = useMemo(() => {
    if (!selectedDay) return 0
    return selectedDay.trucks.reduce((sum, truck) => {
      const pigsInTruck = truck.route.reduce(
        (innerSum, stop) => innerSum + (stop.pigs ?? 0),
        0,
      )
      return sum + pigsInTruck
    }, 0)
  }, [selectedDay])

  const selectedDayUtilizationPct = useMemo(() => {
    if (!totalSlaughterCapacity || totalSlaughterCapacity <= 0) return 0
    if (!selectedDayTotalPigs || selectedDayTotalPigs <= 0) return 0
    return Math.min(
      100,
      (selectedDayTotalPigs / totalSlaughterCapacity) * 100,
    )
  }, [selectedDayTotalPigs, totalSlaughterCapacity])

  const selectedDayTotalDistanceKm = selectedDay?.totalDistanceKm ?? 0
  const selectedDayFuelCostEuros = selectedDay?.fuelCostEuros ?? 0
  const selectedDayTruckCostEuros = selectedDay?.truckCostEuros ?? 0
  const selectedDayNetProfitEuros = selectedDay?.netProfitEuros ?? 0

  const routesForMap = useMemo(() => {
    if (!selectedDay) return []

    return selectedDay.trucks.map((truck, index) => {
      const baseStops = truck.route
        .map((stop) => {
          const entity = storedEntities.find((e) => e.id === stop.id)
          if (!entity) return null
          return { entity, pigs: stop.pigs }
        })
        .filter(
          (
            item,
          ): item is {
            entity: StoredEntity
            pigs: number
          } => Boolean(item),
        )

      const stopsWithEndpoints =
        slaughterhouse && baseStops.length > 0
          ? (() => {
              const result = [...baseStops]
              const first = result[0]
              const last = result[result.length - 1]

              if (first.entity.id !== slaughterhouse.id) {
                result.unshift({ entity: slaughterhouse, pigs: 0 })
              }
              if (last.entity.id !== slaughterhouse.id) {
                result.push({ entity: slaughterhouse, pigs: 0 })
              }

              return result
            })()
          : baseStops

      const path = stopsWithEndpoints.map((item) => ({
        lat: item.entity.lat,
        lng: item.entity.lng,
      }))

      return {
        id: truck.id,
        path,
        color: ROUTE_COLORS[index % ROUTE_COLORS.length],
      }
    })
  }, [selectedDay, storedEntities, slaughterhouse])

  const trucksWithStops = useMemo(() => {
    if (!selectedDay) return []

    return selectedDay.trucks.map((truck, index) => ({
      ...truck,
      color: ROUTE_COLORS[index % ROUTE_COLORS.length],
      stops: (() => {
        const baseStops = truck.route
          .map((stop) => {
            const entity = storedEntities.find((e) => e.id === stop.id)
            if (!entity) return null
            return { entity, pigs: stop.pigs }
          })
          .filter(
            (
              item,
            ): item is {
              entity: StoredEntity
              pigs: number
            } => Boolean(item),
          )

        if (!slaughterhouse || baseStops.length === 0) {
          return baseStops
        }

        const result = [...baseStops]
        const first = result[0]
        const last = result[result.length - 1]

        if (first.entity.id !== slaughterhouse.id) {
          result.unshift({ entity: slaughterhouse, pigs: 0 })
        }
        if (last.entity.id !== slaughterhouse.id) {
          result.push({ entity: slaughterhouse, pigs: 0 })
        }

        return result
      })(),
    }))
  }, [selectedDay, storedEntities, slaughterhouse])

  const activeRouteEntityIdsByTruck = useMemo(() => {
    const mapping: Record<number, string[]> = {}

    trucksWithStops.forEach((truck) => {
      mapping[truck.id] = truck.stops.map((stop) => stop.entity.id)
    })

    return mapping
  }, [trucksWithStops])

  const routeStopTooltips = useMemo(() => {
    if (!selectedDay) return []

    const byEntity = new Map<
      string,
      {
        entity: StoredEntity
        trucks: { truckId: number; pigs: number }[]
      }
    >()

    selectedDay.trucks.forEach((truck) => {
      truck.route.forEach((stop) => {
        const entity = storedEntities.find((e) => e.id === stop.id)
        if (!entity) return

        const key = entity.id
        const existing = byEntity.get(key)
        if (existing) {
          existing.trucks.push({ truckId: truck.id, pigs: stop.pigs })
        } else {
          byEntity.set(key, {
            entity,
            trucks: [{ truckId: truck.id, pigs: stop.pigs }],
          })
        }
      })
    })

    return Array.from(byEntity.values()).map((entry) => ({
      entityId: entry.entity.id,
      lines: [
        entry.entity.name,
        ...entry.trucks.map(
          (t) =>
            `Camión ${t.truckId}: ${t.pigs.toLocaleString('es-ES')} cerdos`,
        ),
      ],
    }))
  }, [selectedDay, storedEntities])

  if (!optimizationResult) {
    return (
      <section className="space-y-6">
        <header className="space-y-2 text-center">
          <p className="text-sm font-bold uppercase tracking-wider text-[#c85a54]">
            🚚 Vista Matadero
          </p>
          <h2 className="text-3xl font-bold text-[#3d3d3d] sm:text-4xl">
            Resumen de Ruta Óptima
          </h2>
        </header>
        <div className="rounded-lg border-3 border-dashed border-red-400 bg-red-50 p-8 text-center">
          <p className="text-lg font-bold text-red-700">
            ⚠️ No hay datos de optimización
          </p>
          <p className="mt-2 text-red-600">
            Por favor, regresa a la vista del matadero y consulta la ruta óptima.
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => navigate('/slaughter')}
              className="btn-primary"
            >
              ← Volver al matadero
            </button>
          </div>
        </div>
      </section>
    )
  }

  const summary = optimizationResult.summary

  return (
    <section className="space-y-6">
      <header className="space-y-2 text-center">
        <p className="text-sm font-bold uppercase tracking-wider text-[#c85a54]">
          🚚 Vista Matadero
        </p>
        <h2 className="text-3xl font-bold text-[#3d3d3d] sm:text-4xl">
          Resumen de Ruta Óptima
        </h2>
        <p className="max-w-2xl mx-auto text-base text-[#5a5a5a]">
          Resultado de la optimización de rutas para dos semanas. Se muestran las
          paradas por camión, los km recorridos y el beneficio económico estimado.
        </p>
        <div className="flex flex-wrap gap-3 pt-2 justify-center">
          <span className="inline-flex items-center rounded border-2 border-[#6b8e23] bg-[#f5deb3] px-4 py-2 text-sm font-bold text-[#3d3d3d]">
            📅 Día planificado: {dateLabel}
          </span>
          <button
            type="button"
            onClick={() => navigate('/slaughter')}
            className="btn-secondary"
          >
            ← Volver al matadero
          </button>
        </div>

        {summary && (
          <div className="mt-4 grid gap-4 rounded-lg border-3 border-[#8b7355] bg-white p-6 shadow-md sm:grid-cols-4">
            <div className="rounded-lg bg-[#f5deb3]/40 p-4 border-2 border-[#ddd]">
              <p className="text-xs font-bold uppercase text-[#6b8e23]">
                Beneficio neto total
              </p>
              <p className="mt-2 text-2xl font-bold text-[#166534]">
                {summary.total_net_profit_euros.toLocaleString('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                  maximumFractionDigits: 0,
                })}
              </p>
              <p className="mt-1 text-xs text-[#5a5a5a]">
                Margen:{' '}
                <span className="font-semibold">
                  {summary.profit_margin_percent.toFixed(1)}%
                </span>
              </p>
            </div>
            <div className="rounded-lg bg-[#f5deb3]/40 p-4 border-2 border-[#ddd]">
              <p className="text-xs font-bold uppercase text-[#6b8e23]">
                Cerdos y km totales
              </p>
              <p className="mt-2 text-2xl font-bold text-[#3d3d3d]">
                {summary.total_pigs_collected.toLocaleString('es-ES')}
              </p>
              <p className="mt-1 text-xs text-[#5a5a5a]">
                Distancia:{' '}
                <span className="font-semibold">
                  {summary.total_distance_km.toLocaleString('es-ES', {
                    maximumFractionDigits: 0,
                  })}{' '}
                  km
                </span>
              </p>
            </div>
            <div className="rounded-lg bg-[#f5deb3]/40 p-4 border-2 border-[#ddd]">
              <p className="text-xs font-bold uppercase text-[#6b8e23]">
                Costes logísticos
              </p>
              <p className="mt-2 text-sm font-bold text-[#c85a54]">
                Transporte:{' '}
                {summary.total_fuel_cost_euros.toLocaleString('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                  maximumFractionDigits: 0,
                })}
              </p>
              <p className="mt-1 text-sm font-bold text-[#c85a54]">
                Camiones:{' '}
                {summary.total_truck_cost_euros.toLocaleString('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                  maximumFractionDigits: 0,
                })}
              </p>
            </div>
            <div className="rounded-lg bg-[#f5deb3]/40 p-4 border-2 border-[#ddd]">
              <p className="text-xs font-bold uppercase text-[#6b8e23]">
                Uso de flota
              </p>
              <p className="mt-2 text-2xl font-bold text-[#3d3d3d]">
                {summary.avg_trucks_per_day.toFixed(1)} camiones/día
              </p>
              <p className="mt-1 text-xs text-[#5a5a5a]">
                Máximo por día:{' '}
                <span className="font-semibold">
                  {summary.max_trucks_per_day}
                </span>
              </p>
              <p className="mt-1 text-xs text-[#5a5a5a]">
                Coste/canal:{' '}
                <span className="font-semibold">
                  {summary.cost_per_pig_euros.toLocaleString('es-ES', {
                    style: 'currency',
                    currency: 'EUR',
                    maximumFractionDigits: 2,
                  })}{' '}
                  /cerdo
                </span>
              </p>
            </div>
          </div>
        )}

        {selectedDay && (
          <div className="mt-4 grid gap-4 rounded-lg border-3 border-[#8b7355] bg-white p-6 shadow-md sm:grid-cols-3">
            <div className="rounded-lg bg-[#f5deb3]/40 p-4 border-2 border-[#ddd]">
              <p className="text-xs font-bold uppercase text-[#6b8e23]">
                Cerdos del día
              </p>
              <p className="mt-2 text-3xl font-bold text-[#3d3d3d]">
                {selectedDayTotalPigs.toLocaleString('es-ES')}
              </p>
              <p className="mt-1 text-sm text-[#5a5a5a]">
                {selectedDay.trucks.length} camiones
              </p>
            </div>
            
            <div className="rounded-lg bg-[#f5deb3]/40 p-4 border-2 border-[#ddd]">
              <p className="text-xs font-bold uppercase text-[#6b8e23]">
                % Utilización
              </p>
              <p className="mt-2 text-3xl font-bold text-[#3d3d3d]">
                {selectedDayUtilizationPct.toFixed(1)}%
              </p>
              <p className="mt-1 text-sm text-[#5a5a5a]">
                Capacidad: {totalSlaughterCapacity.toLocaleString('es-ES')} cerdos
              </p>
            </div>
            
            <div className="rounded-lg bg-[#f5deb3]/40 p-4 border-2 border-[#ddd]">
              <p className="text-xs font-bold uppercase text-[#6b8e23]">
                Kg, € y beneficio
              </p>
              <p className="mt-2 text-lg font-bold text-[#3d3d3d]">
                {(selectedDay.totalKg ?? 0).toLocaleString('es-ES')} kg
              </p>
              <p className="mt-1 text-base font-bold text-[#6b8e23]">
                {(selectedDay.totalEuros ?? 0).toLocaleString('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                  maximumFractionDigits: 0,
                })}
              </p>
              <p className="mt-1 text-xs text-[#5a5a5a]">
                Distancia:{' '}
                <span className="font-semibold">
                  {selectedDayTotalDistanceKm.toLocaleString('es-ES', {
                    maximumFractionDigits: 1,
                  })}{' '}
                  km
                </span>
              </p>
              <p className="mt-1 text-xs text-[#5a5a5a]">
                Coste transporte:{' '}
                <span className="font-semibold text-[#c85a54]">
                  {selectedDayFuelCostEuros.toLocaleString('es-ES', {
                    style: 'currency',
                    currency: 'EUR',
                    maximumFractionDigits: 0,
                  })}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-[#5a5a5a]">
                Coste camiones:{' '}
                <span className="font-semibold text-[#c85a54]">
                  {selectedDayTruckCostEuros.toLocaleString('es-ES', {
                    style: 'currency',
                    currency: 'EUR',
                    maximumFractionDigits: 0,
                  })}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-[#5a5a5a]">
                Beneficio neto:{' '}
                <span className="font-semibold text-[#166534]">
                  {selectedDayNetProfitEuros.toLocaleString('es-ES', {
                    style: 'currency',
                    currency: 'EUR',
                    maximumFractionDigits: 0,
                  })}
                </span>
              </p>
            </div>
          </div>
        )}

        {days.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-2 justify-center">
            {days.map((day, index) => {
              const label = new Date(day.timedatestamp).toLocaleDateString(
                'es-ES',
                {
                  day: '2-digit',
                  month: 'short',
                },
              )
              const isActive = index === selectedDayIndex

              return (
                <button
                  key={day.timedatestamp + index}
                  type="button"
                  onClick={() => setSelectedDayIndex(index)}
                  className={`inline-flex items-center rounded border-2 px-4 py-2 text-sm font-bold ${
                    isActive
                      ? 'bg-[#6b8e23] text-white border-[#6b8e23]'
                      : 'bg-white text-[#5a5a5a] border-[#ddd] hover:bg-[#f5deb3] hover:border-[#6b8e23]'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}
      </header>

      {!selectedDay ? (
        <div className="rounded-lg border-3 border-dashed border-[#6b8e23] bg-[#f5deb3]/30 p-8 text-center">
          <p className="text-lg font-bold text-[#3d3d3d]">
            No hay información de rutas en la respuesta de optimización
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            <div className="rounded-lg border-3 border-[#8b7355] bg-white p-6 shadow-md">
              <div className="mb-4 flex items-center justify-between border-b-2 border-[#f5deb3] pb-3">
                <p className="text-base font-bold text-[#6b8e23]">
                  🚛 Camiones y paradas
                </p>
                <span className="rounded border-2 border-[#6b8e23] bg-[#f5deb3] px-3 py-1 text-sm font-bold text-[#3d3d3d]">
                  {selectedDay.trucks.length} camiones
                </span>
              </div>

              <div className="space-y-4">
                {trucksWithStops.map((truck) => (
                  <div
                    key={truck.id}
                    className="rounded-lg border-2 border-[#ddd] bg-[#f9f6f1] p-4"
                    onMouseEnter={() => setHoveredTruckId(truck.id)}
                    onMouseLeave={() => setHoveredTruckId((current) => (current === truck.id ? null : current))}
                  >
                    <div className="flex items-center justify-between border-b border-[#ddd] pb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white border-2 border-white"
                          style={{ backgroundColor: truck.color }}
                        >
                          {truck.id}
                        </span>
                        <p className="text-base font-bold text-[#3d3d3d]">
                          Camión #{truck.id}
                        </p>
                      </div>
                      <p className="text-xs uppercase font-bold text-[#5a5a5a]">
                        {truck.stops.length} paradas
                      </p>
                    </div>

                    <ol className="mt-3 space-y-2 text-sm">
                      {truck.stops.length === 0 ? (
                        <li className="italic text-[#5a5a5a]">
                          No se encontraron ubicaciones registradas para esta
                          ruta. Asegúrate de haber guardado las granjas y
                          mataderos en el mapa.
                        </li>
                      ) : (
                        truck.stops.map((stop, index) => (
                          <li
                            key={stop.entity.id + index}
                            className="flex items-start gap-3 rounded border border-[#ddd] bg-white px-3 py-2"
                            onMouseEnter={() => setHoveredEntityId(stop.entity.id)}
                            onMouseLeave={() =>
                              setHoveredEntityId((current) =>
                                current === stop.entity.id ? null : current,
                              )
                            }
                          >
                            <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#6b8e23] text-xs font-bold text-white">
                              {index + 1}
                            </span>
                            <div>
                              <p className="text-sm font-bold text-[#3d3d3d]">
                                {stop.entity.name}
                              </p>
                              <p className="text-xs text-[#5a5a5a]">
                                {stop.entity.type === 'farm'
                                  ? 'Granja'
                                  : 'Matadero'}
                                {stop.entity.maxCapacity
                                  ? ` · Capacidad: ${stop.entity.maxCapacity.toLocaleString(
                                      'es-ES',
                                    )} cerdos`
                                  : ''}
                                {stop.pigs > 0
                                  ? ` · Cerdos a recoger: ${stop.pigs.toLocaleString(
                                      'es-ES',
                                    )}`
                                  : ''}
                              </p>
                            </div>
                          </li>
                        ))
                      )}
                    </ol>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-lg border-4 border-[#8b7355] bg-white shadow-md">
            <div className="border-b-2 border-[#f5deb3] bg-[#f5deb3] px-4 py-3 text-sm font-bold uppercase tracking-wider text-[#3d3d3d] sm:px-6">
              🗺️ Ruta trazada en el mapa
            </div>
            <div className="relative h-[360px] sm:h-[440px]">
              <GoogleMap
                className="absolute inset-0"
                routes={routesForMap}
                interactive={false}
                routeStopTooltips={routeStopTooltips}
                activeRouteId={hoveredTruckId}
                highlightedEntityId={hoveredEntityId}
                activeRouteEntityIds={
                  hoveredTruckId != null
                    ? activeRouteEntityIdsByTruck[hoveredTruckId] ?? []
                    : null
                }
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default RouteSummaryPage


