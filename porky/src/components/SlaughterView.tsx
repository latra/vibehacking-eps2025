import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

type EntityType = 'farm' | 'slaughterhouse'

type StoredEntity = {
  id: string
  type: EntityType
  name: string
  maxCapacity: number
  lat: number
  lng: number
}

type Farm = StoredEntity

type FarmerHerdState = {
  currentPigs: number
  ageWeeks: number
}

type BodyWeightPoint = {
  week: number
  meanKg: number
  sdKg: number
}

const STORAGE_KEY = 'pigchain_locations'
const FARMER_STATE_STORAGE_KEY = 'pigchain_farmer_state'

// Backend API URL - puedes cambiar esto o usar VITE_BACKEND_URL en un archivo .env
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

// Body weight (kg) per pig and week – same table as FarmerView
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

function loadFarms(): Farm[] {
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
          item.type === 'farm' &&
          Number.isFinite(item.lat) &&
          Number.isFinite(item.lng) &&
          item.name,
      )
  } catch {
    return []
  }
}

function loadHerds(): Record<string, FarmerHerdState> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(FARMER_STATE_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as any
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

        herds[farmId] = {
          currentPigs: pigs,
          ageWeeks: age,
        }
      }
    }

    return herds
  } catch {
    return {}
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: 1,
  }).format(value)
}

// Peso óptimo para envío (kg)
const OPTIMAL_MIN_WEIGHT_KG = 105
const OPTIMAL_MAX_WEIGHT_KG = 115

type FarmShippingSuggestion = {
  farm: Farm
  herd: FarmerHerdState | null
  currentWeightKg: number | null
  bestShippingDate: Date | null
  bestWeek: number | null
  bestScore: number
  daysFromToday: number | null
  statusLabel: string
}

// Penalización estimada según peso canal (simplificada sobre el peso vivo estimado)
// - 20% si < 100 kg o > 120 kg
// - 15% si entre 100–105 kg o entre 115–120 kg
// - 0% en el resto de casos
function computePenaltyPercentage(weightKg: number | null): number | null {
  if (weightKg == null) return null

  if (weightKg < 100 || weightKg > 120) {
    return 20
  }

  if (
    (weightKg >= 100 && weightKg <= 105) ||
    (weightKg >= 115 && weightKg <= 120)
  ) {
    return 15
  }

  return 0
}

function computeBestShippingForFarm(
  today: Date,
  herd: FarmerHerdState | null,
): Omit<
  FarmShippingSuggestion,
  'farm' | 'herd' | 'statusLabel'
> & { statusLabel: string } {
  if (!herd || herd.currentPigs <= 0) {
    return {
      currentWeightKg: null,
      bestShippingDate: null,
      bestWeek: null,
      bestScore: 0,
      daysFromToday: null,
      statusLabel: 'Sin datos de lote',
    }
  }

  const { ageWeeks } = herd
  const currentPoint = BODY_WEIGHT_TABLE.find((p) => p.week === ageWeeks)
  const currentWeightKg = currentPoint?.meanKg ?? null

  // Calculamos una puntuación para cada semana futura (incluyendo la actual)
  const options = BODY_WEIGHT_TABLE.map((point) => {
    const offsetWeeks = point.week - ageWeeks
    const date = new Date(today)
    date.setDate(today.getDate() + offsetWeeks * 7)

    let score: number
    if (
      point.meanKg >= OPTIMAL_MIN_WEIGHT_KG &&
      point.meanKg <= OPTIMAL_MAX_WEIGHT_KG
    ) {
      score = 1
    } else if (point.meanKg < OPTIMAL_MIN_WEIGHT_KG) {
      const distance = OPTIMAL_MIN_WEIGHT_KG - point.meanKg
      score = Math.max(0, 1 - distance / 25) // penalizamos cuanto más lejos esté
    } else {
      const distance = point.meanKg - OPTIMAL_MAX_WEIGHT_KG
      score = Math.max(0, 1 - distance / 25)
    }

    return {
      point,
      date,
      score,
      offsetWeeks,
    }
  })

  // Preferimos semanas desde hoy hacia adelante; si todas son pasadas, nos quedamos con la más cercana
  const futureOrToday = options.filter((o) => o.offsetWeeks >= 0)
  const candidates = futureOrToday.length > 0 ? futureOrToday : options

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.date.getTime() - b.date.getTime()
  })

  const best = candidates[0]

  const daysFromToday =
    best && Number.isFinite(best.offsetWeeks)
      ? best.offsetWeeks * 7
      : null

  let statusLabel = 'Planificar'
  if (best.score >= 0.9 && (daysFromToday ?? 0) <= 3) {
    statusLabel = 'Recoger ya'
  } else if (daysFromToday !== null && daysFromToday > 3 && daysFromToday <= 14) {
    statusLabel = `Planificar en ~${Math.round(daysFromToday)} días`
  } else if (daysFromToday !== null && daysFromToday > 14) {
    statusLabel = 'Ventana óptima lejana'
  }

  return {
    currentWeightKg,
    bestShippingDate: best?.date ?? null,
    bestWeek: best?.point.week ?? null,
    bestScore: best?.score ?? 0,
    daysFromToday,
    statusLabel,
  }
}

function SlaughterView() {
  const navigate = useNavigate()
  const [farms, setFarms] = useState<Farm[]>([])
  const [herds, setHerds] = useState<Record<string, FarmerHerdState>>({})
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optimizationError, setOptimizationError] = useState<string | null>(null)
  const [selectedTruckType, setSelectedTruckType] = useState<'small' | 'normal'>(
    'normal',
  )

  useEffect(() => {
    setFarms(loadFarms())
    setHerds(loadHerds())
  }, [])

  const today = useMemo(() => new Date(), [])

  const suggestions: FarmShippingSuggestion[] = useMemo(() => {
    return farms.map((farm) => {
      const herd = herds[farm.id] ?? null

      const {
        currentWeightKg,
        bestShippingDate,
        bestWeek,
        bestScore,
        daysFromToday,
        statusLabel,
      } = computeBestShippingForFarm(today, herd)

      return {
        farm,
        herd,
        currentWeightKg,
        bestShippingDate,
        bestWeek,
        bestScore,
        daysFromToday,
        statusLabel,
      }
    })
  }, [farms, herds, today])

  const sortedSuggestions = useMemo(() => {
    return [...suggestions].sort((a, b) => {
      const aDays = a.daysFromToday ?? Number.POSITIVE_INFINITY
      const bDays = b.daysFromToday ?? Number.POSITIVE_INFINITY
      if (aDays !== bDays) return aDays - bDays
      return b.bestScore - a.bestScore
    })
  }, [suggestions])

  const totalPigs = useMemo(
    () =>
      suggestions.reduce(
        (sum, s) => sum + (s.herd?.currentPigs ?? 0),
        0,
      ),
    [suggestions],
  )

  const pigsReadyNow = useMemo(
    () =>
      suggestions.reduce((sum, s) => {
        if (!s.herd || !s.bestWeek) return sum
        // Consideramos "listos" si la semana óptima es la actual o la siguiente, y la puntuación es alta
        const isSoon =
          s.herd.ageWeeks >= (s.bestWeek ?? 0) - 1 &&
          s.herd.ageWeeks <= (s.bestWeek ?? 0) + 1
        if (isSoon && s.bestScore >= 0.8) {
          return sum + (s.herd.currentPigs ?? 0)
        }
        return sum
      }, 0),
    [suggestions],
  )

  const handleConsultOptimalRoute = async () => {
    setIsOptimizing(true)
    setOptimizationError(null)

    try {
      // Cargar todas las entidades para obtener el matadero
      const allEntities = loadAllEntities()
      const slaughterhouse = allEntities.find((e) => e.type === 'slaughterhouse')

      if (!slaughterhouse) {
        setOptimizationError(
          'No se ha registrado ningún matadero. Por favor, añade uno en la sección Mapa.'
        )
        setIsOptimizing(false)
        return
      }

      if (farms.length === 0) {
        setOptimizationError(
          'No hay granjas registradas. Por favor, añade al menos una granja en la sección Mapa.'
        )
        setIsOptimizing(false)
        return
      }

      // Derivar parámetros de optimización según el reto
      // Capacidad de camión en número de cerdos (aprox.)
      const truckCapacityPigs =
        selectedTruckType === 'small' ? 90 /* ~10T */ : 181 /* ~20T */

      // Coste por km según tipo de camión
      const costPerKm = selectedTruckType === 'small' ? 1.15 : 1.25

      // Estimamos ganancia de peso semanal promedio a partir de la tabla
      const avgWeeklyGainKg = (() => {
        if (BODY_WEIGHT_TABLE.length < 2) return 0
        let totalDiff = 0
        let count = 0
        for (let i = 1; i < BODY_WEIGHT_TABLE.length; i++) {
          totalDiff += BODY_WEIGHT_TABLE[i].meanKg - BODY_WEIGHT_TABLE[i - 1].meanKg
          count++
        }
        return count > 0 ? totalDiff / count : 0
      })()

      // Peso medio global aproximado (media ponderada por cerdos declarados)
      const avgPigWeightGlobal = (() => {
        let totalPigs = 0
        let totalWeight = 0
        for (const farm of farms) {
          const herd = herds[farm.id]
          if (!herd || herd.currentPigs <= 0) continue
          const point = BODY_WEIGHT_TABLE.find((p) => p.week === herd.ageWeeks)
          const weight = point?.meanKg ?? 0
          totalPigs += herd.currentPigs
          totalWeight += herd.currentPigs * weight
        }
        if (totalPigs <= 0) return 110
        return totalWeight / totalPigs
      })()

      // Preparar los datos en el formato esperado por el backend
      const requestData = {
        farms: farms.map((farm) => ({
          id: farm.id,
          name: farm.name,
          location: {
            lat: farm.lat,
            lng: farm.lng,
          },
          available_pigs: herds[farm.id]?.currentPigs ?? 0,
          max_capacity: farm.maxCapacity,
          avg_weight_kg: (() => {
            const herd = herds[farm.id]
            if (!herd) return undefined
            const point = BODY_WEIGHT_TABLE.find((p) => p.week === herd.ageWeeks)
            return point?.meanKg
          })(),
        })),
        slaughterhouse: {
          id: slaughterhouse.id,
          name: slaughterhouse.name,
          location: {
            lat: slaughterhouse.lat,
            lng: slaughterhouse.lng,
          },
          daily_capacity: slaughterhouse.maxCapacity,
          max_capacity: slaughterhouse.maxCapacity,
        },
        truck_capacity: truckCapacityPigs,
        num_days: 10, // 2 semanas laborales (5 días/sem)
        planning_days_per_week: 5,
        avg_pig_weight_kg: avgPigWeightGlobal,
        price_per_kg: 1.56,
        cost_per_km: costPerKm,
        weekly_weight_gain_kg: avgWeeklyGainKg,
      }

      // Llamar al endpoint del backend
      const response = await fetch(`${BACKEND_URL}/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData.detail || `Error del servidor: ${response.status}`
        )
      }

      const optimizationResult = await response.json()

      // Navegar a la página de resumen con los resultados
      navigate('/slaughter/summary', {
        state: {
          optimizationResult,
        },
      })
    } catch (error) {
      console.error('Error al optimizar rutas:', error)
      setOptimizationError(
        error instanceof Error
          ? error.message
          : 'Error desconocido al conectar con el servidor'
      )
    } finally {
      setIsOptimizing(false)
    }
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

  return (
    <section className="space-y-6">
      <header className="space-y-2 text-center">
        <p className="text-sm font-bold uppercase tracking-wider text-[#c85a54]">
          🏭 Vista Matadero
        </p>
        <h2 className="text-3xl font-bold text-[#3d3d3d] sm:text-4xl">
          Programación Óptima de Recogida por Granja
        </h2>
        <p className="max-w-2xl mx-auto text-base text-[#5a5a5a]">
          Vista desde el matadero: para cada granja conectada, estima el peso
          actual del lote y propone el mejor momento para ir a recoger los
          cerdos según la ventana de peso objetivo (105–115&nbsp;kg).
        </p>
        {farms.length > 0 && (
          <div className="pt-4 space-y-3">
            <button
              type="button"
              onClick={handleConsultOptimalRoute}
              disabled={isOptimizing}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isOptimizing ? '⏳ Optimizando rutas...' : '📋 Consultar ruta óptima'}
            </button>
            {optimizationError && (
              <div className="rounded-lg border-2 border-red-400 bg-red-50 p-4 text-sm text-red-700">
                <p className="font-bold">❌ Error al optimizar:</p>
                <p className="mt-1">{optimizationError}</p>
              </div>
            )}
          </div>
        )}
      </header>

      {farms.length === 0 ? (
        <div className="rounded-lg border-3 border-dashed border-[#6b8e23] bg-[#f5deb3]/30 p-8 text-center">
          <p className="text-lg font-bold text-[#3d3d3d]">
            🐷 Todavía no hay granjas registradas
          </p>
          <p className="mt-2 text-[#5a5a5a]">
            Abre la sección <span className="font-bold text-[#6b8e23]">Mapa</span> y haz
            clic en el mapa para registrar ubicaciones de tipo{' '}
            <span className="font-bold text-[#6b8e23]">Granja</span>. Después vuelve aquí
            para ver cuándo conviene recoger los cerdos de cada una.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Resumen global */}
          <div className="grid gap-4 rounded-lg border-3 border-[#8b7355] bg-white p-6 shadow-md sm:grid-cols-3">
            <div className="space-y-2 rounded-lg bg-[#f5deb3]/40 p-4 border-2 border-[#ddd]">
              <p className="text-xs font-bold uppercase text-[#6b8e23]">
                Total cerdos en red
              </p>
              <p className="text-2xl font-bold text-[#3d3d3d]">
                {formatNumber(totalPigs)}
              </p>
              <p className="text-xs text-[#5a5a5a]">
                Suma de los lotes declarados en todas las granjas
              </p>
            </div>
            <div className="space-y-2 rounded-lg bg-[#f5deb3]/40 p-4 border-2 border-[#ddd]">
              <p className="text-xs font-bold uppercase text-[#6b8e23]">
                Cerdos listos o casi listos
              </p>
              <p className="text-2xl font-bold text-[#c85a54]">
                {formatNumber(pigsReadyNow)}
              </p>
              <p className="text-xs text-[#5a5a5a]">
                Lotes cuya ventana óptima es la actual o la próxima semana
              </p>
            </div>
            <div className="space-y-2 rounded-lg bg-[#f5deb3]/40 p-4 border-2 border-[#ddd]">
              <p className="text-xs font-bold uppercase text-[#6b8e23]">
                Horizonte de planificación
              </p>
              <p className="text-2xl font-bold text-[#3d3d3d]">
                2 semanas (10 días)
              </p>
              <p className="text-xs text-[#5a5a5a]">
                Plan de recogida quincenal orientado a ventana de peso óptimo
              </p>
            </div>
          </div>

          {/* Parámetros de optimización (tipo de camión) */}
          <div className="rounded-lg border-3 border-[#8b7355] bg-white p-4 shadow-md">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-[#6b8e23]">
                  Parámetros logísticos para la optimización
                </p>
                <p className="text-xs text-[#5a5a5a]">
                  Selecciona el tipo de camión que usará el algoritmo económico del backend.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-[#3d3d3d]">
                  <span className="font-bold text-[#6b8e23]">Tipo de camión:</span>
                  <select
                    value={selectedTruckType}
                    onChange={(e) =>
                      setSelectedTruckType(
                        e.target.value === 'small' ? 'small' : 'normal',
                      )
                    }
                    className="rounded border-2 border-[#ddd] bg-[#fefefe] px-3 py-1.5 text-sm text-[#3d3d3d] focus:border-[#6b8e23] focus:outline-none focus:ring-2 focus:ring-[#6b8e23]/20"
                  >
                    <option value="small">Camión pequeño · 10T · 1,15 €/km</option>
                    <option value="normal">Camión normal · 20T · 1,25 €/km</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          {/* Tabla principal de sugerencias por granja */}
          <div className="overflow-hidden rounded-lg border-3 border-[#8b7355] bg-white shadow-md">
            <div className="border-b-2 border-[#f5deb3] bg-[#f5deb3] px-4 py-3 text-sm font-bold uppercase tracking-wider text-[#3d3d3d] sm:px-6">
              📋 Orden de recogida sugerido por granja
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#ddd] text-sm">
                <thead className="bg-[#f9f6f1]">
                  <tr className="text-xs uppercase tracking-wider font-bold text-[#6b8e23]">
                    <th className="px-4 py-3 text-left sm:px-6">Granja</th>
                    <th className="px-4 py-3 text-right sm:px-6">
                      Cerdos lote
                    </th>
                    <th className="px-4 py-3 text-center sm:px-6">
                      Edad (sem)
                    </th>
                    <th className="px-4 py-3 text-center sm:px-6">
                      Peso estimado hoy
                    </th>
                    <th className="px-4 py-3 text-center sm:px-6">
                      Mejor día de recogida
                    </th>
                    <th className="px-4 py-3 text-center sm:px-6">
                      Ventana / estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ddd]">
                  {sortedSuggestions.map((s) => {
                    const herd = s.herd
                    const penaltyPct = computePenaltyPercentage(s.currentWeightKg)
                    const todayLabel = s.bestShippingDate
                      ? new Intl.DateTimeFormat('es-ES', {
                          day: '2-digit',
                          month: 'short',
                        }).format(s.bestShippingDate)
                      : '—'

                    const windowLabel =
                      s.currentWeightKg != null
                        ? s.currentWeightKg >= OPTIMAL_MIN_WEIGHT_KG &&
                          s.currentWeightKg <= OPTIMAL_MAX_WEIGHT_KG
                          ? 'En ventana óptima'
                          : s.currentWeightKg < OPTIMAL_MIN_WEIGHT_KG
                            ? 'Aún ligero'
                            : 'Más pesado'
                        : 'Sin datos'

                    const scorePct = Math.round(s.bestScore * 100)

                    return (
                      <tr key={s.farm.id} className="align-middle hover:bg-[#f5deb3]/20">
                        <td className="px-4 py-3 text-sm font-semibold text-[#3d3d3d] sm:px-6">
                          <div className="space-y-0.5">
                            <p>{s.farm.name}</p>
                            <p className="text-xs text-[#5a5a5a] font-normal">
                              Capacidad:{' '}
                              <span className="font-semibold">
                                {formatNumber(s.farm.maxCapacity)} cerdos
                              </span>
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-[#3d3d3d] sm:px-6">
                          {herd ? formatNumber(herd.currentPigs) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-semibold text-[#3d3d3d] sm:px-6">
                          {herd ? herd.ageWeeks : '—'}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-semibold text-[#3d3d3d] sm:px-6">
                          {s.currentWeightKg != null
                            ? `${formatNumber(s.currentWeightKg)} kg`
                            : '—'}
                          <div className="mt-0.5 text-[11px] text-[#5a5a5a]">
                            {windowLabel}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-semibold text-[#3d3d3d] sm:px-6">
                          {todayLabel}
                          <div className="mt-0.5 text-[11px] text-[#5a5a5a]">
                            {s.daysFromToday != null
                              ? s.daysFromToday === 0
                                ? 'Hoy'
                                : s.daysFromToday > 0
                                  ? `En ~${Math.round(s.daysFromToday)} días`
                                  : `Hace ${Math.abs(Math.round(s.daysFromToday))} días`
                              : 'Sin planificación'}
                          </div>
                        </td>
                        <td className="px-4 py-3 sm:px-6">
                          <div className="flex flex-col items-center gap-1 text-xs">
                            <span
                              className={`inline-flex rounded border-2 px-3 py-1 font-bold ${
                                s.statusLabel === 'Recoger ya'
                                  ? 'bg-green-100 text-green-700 border-green-600'
                                  : s.statusLabel.startsWith('Planificar')
                                    ? 'bg-yellow-100 text-yellow-700 border-yellow-600'
                                    : 'bg-gray-100 text-gray-700 border-gray-400'
                              }`}
                            >
                              {s.statusLabel}
                            </span>
                            <div className="flex w-32 items-center gap-2">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e5e5e5] border border-[#ddd]">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-red-400 via-yellow-400 to-green-500"
                                  style={{ width: `${scorePct}%` }}
                                />
                              </div>
                              <span className="w-9 text-right text-[11px] font-semibold text-[#5a5a5a]">
                                {scorePct}%
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-[#5a5a5a]">
                              {penaltyPct == null
                                ? 'Penalización: sin datos'
                                : penaltyPct === 0
                                  ? 'Penalización: 0%'
                                  : `Penalización: ${penaltyPct}%`}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default SlaughterView


