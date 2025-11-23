# 🔗 Integración del Backend con el Frontend React

Esta guía explica cómo integrar el backend de optimización de rutas con el frontend React de PigChain.

## 📋 Resumen

El frontend (React + TypeScript) enviará datos de granjas y matadero al backend (FastAPI), que devolverá rutas optimizadas. Estas rutas se mostrarán en el `RouteSummaryPage`.

---

## 1️⃣ Crear Servicio de API en el Frontend

Crea un archivo para manejar las llamadas a la API:

**Archivo:** `porky/src/services/routeOptimizationService.ts`

```typescript
// porky/src/services/routeOptimizationService.ts

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface Location {
  lat: number;
  lng: number;
}

export interface Farm {
  id: string;
  name: string;
  location: Location;
  available_pigs: number;
  max_capacity: number;
}

export interface Slaughterhouse {
  id: string;
  name: string;
  location: Location;
  daily_capacity: number;
  max_capacity: number;
}

export interface OptimizationRequest {
  farms: Farm[];
  slaughterhouse: Slaughterhouse;
  truck_capacity?: number;
  num_days?: number;
  avg_pig_weight_kg?: number;
  price_per_kg?: number;
}

export interface RouteStop {
  id: string;
  pigs: number;
}

export interface TruckRoute {
  id: number;
  route: RouteStop[];
}

export interface OptimizationDay {
  timedatestamp: string;
  totalKg: number;
  totalEuros: number;
  trucks: TruckRoute[];
}

export interface OptimizationResponse {
  id: string;
  days: OptimizationDay[];
}

/**
 * Llama al backend para optimizar rutas de recolección
 */
export async function optimizeRoutes(
  request: OptimizationRequest
): Promise<OptimizationResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/optimize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail || `Error ${response.status}: ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Error al optimizar rutas: ${error.message}`);
    }
    throw new Error('Error desconocido al optimizar rutas');
  }
}

/**
 * Verifica que el backend esté disponible
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
```

---

## 2️⃣ Modificar SlaughterView para Llamar al Backend

**Archivo:** `porky/src/components/SlaughterView.tsx`

Agrega un botón que llame a la API de optimización:

```typescript
import { optimizeRoutes } from '../services/routeOptimizationService'
import { useNavigate } from 'react-router-dom'

// ... dentro del componente SlaughterView

const navigate = useNavigate()
const [isOptimizing, setIsOptimizing] = useState(false)
const [optimizationError, setOptimizationError] = useState<string | null>(null)

const handleOptimizeRoutes = async () => {
  setIsOptimizing(true)
  setOptimizationError(null)
  
  try {
    // Obtener granjas y matadero del localStorage
    const farms = loadAllEntities()
      .filter(e => e.type === 'farm')
      .map(farm => ({
        id: farm.id,
        name: farm.name,
        location: { lat: farm.lat, lng: farm.lng },
        available_pigs: 150, // Obtener del estado real
        max_capacity: farm.maxCapacity
      }))
    
    const slaughterhouses = loadAllEntities().filter(e => e.type === 'slaughterhouse')
    
    if (slaughterhouses.length === 0) {
      throw new Error('No hay mataderos configurados')
    }
    
    const slaughterhouse = {
      id: slaughterhouses[0].id,
      name: slaughterhouses[0].name,
      location: { lat: slaughterhouses[0].lat, lng: slaughterhouses[0].lng },
      daily_capacity: slaughterhouses[0].maxCapacity,
      max_capacity: slaughterhouses[0].maxCapacity
    }
    
    // Llamar al backend
    const result = await optimizeRoutes({
      farms,
      slaughterhouse,
      truck_capacity: 250,
      num_days: 14,
      avg_pig_weight_kg: 110,
      price_per_kg: 2.2
    })
    
    // Navegar a la página de resumen con los resultados
    navigate('/route-summary', { 
      state: { optimizationResult: result } 
    })
    
  } catch (error) {
    console.error('Error al optimizar rutas:', error)
    setOptimizationError(
      error instanceof Error ? error.message : 'Error desconocido'
    )
  } finally {
    setIsOptimizing(false)
  }
}

// En el JSX, agregar el botón:
<button
  onClick={handleOptimizeRoutes}
  disabled={isOptimizing}
  className="btn-primary"
>
  {isOptimizing ? 'Optimizando rutas...' : '🚀 Optimizar Rutas con IA'}
</button>

{optimizationError && (
  <div className="error-message">
    ❌ {optimizationError}
  </div>
)}
```

---

## 3️⃣ Configurar Variables de Entorno

**Archivo:** `porky/.env`

```env
VITE_API_URL=http://localhost:8000
```

**Archivo:** `porky/.env.production`

```env
VITE_API_URL=https://api.pigchain.com
```

---

## 4️⃣ Actualizar RouteSummaryPage

El `RouteSummaryPage` ya está preparado para recibir los resultados vía `location.state`. No necesita cambios si la estructura de datos del backend coincide.

Verifica que los tipos coincidan:

```typescript
// En RouteSummaryPage.tsx
const optimizationResult: OptimizationResponse = useMemo(() => {
  const state = location.state as LocationState | null
  if (state?.optimizationResult) {
    return state.optimizationResult
  }
  return dummyResponse as OptimizationResponse
}, [location.state])
```

---

## 5️⃣ Manejo de CORS

El backend ya tiene CORS configurado en `main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción, especificar dominios
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Para producción**, cambia `allow_origins` a tu dominio específico:

```python
allow_origins=["https://pigchain.com", "https://www.pigchain.com"],
```

---

## 6️⃣ Probar la Integración

### Paso 1: Iniciar Backend
```bash
cd agrocerdos/backend
source venv/bin/activate  # o venv\Scripts\activate en Windows
python main.py
```

### Paso 2: Iniciar Frontend
```bash
cd agrocerdos/porky
npm run dev
```

### Paso 3: Usar la Aplicación
1. Abre http://localhost:5173
2. Ve a la vista de Matadero
3. Haz clic en "Optimizar Rutas con IA"
4. Los resultados se mostrarán en la página de resumen

---

## 7️⃣ Ejemplo Completo de Integración

**Archivo completo de ejemplo:** `porky/src/pages/SlaughterPage.tsx`

```typescript
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SlaughterView from '../components/SlaughterView'
import { optimizeRoutes, checkBackendHealth } from '../services/routeOptimizationService'

export default function SlaughterPage() {
  const navigate = useNavigate()
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const handleOptimize = async () => {
    setIsOptimizing(true)
    setError(null)
    
    try {
      // Verificar que el backend esté disponible
      const isHealthy = await checkBackendHealth()
      if (!isHealthy) {
        throw new Error('El servidor de optimización no está disponible')
      }
      
      // Obtener datos del localStorage
      const storedData = localStorage.getItem('pigchain_locations')
      const entities = storedData ? JSON.parse(storedData) : []
      
      const farms = entities
        .filter((e: any) => e.type === 'farm')
        .map((f: any) => ({
          id: f.id,
          name: f.name,
          location: { lat: f.lat, lng: f.lng },
          available_pigs: Math.floor(f.maxCapacity * 0.6),
          max_capacity: f.maxCapacity
        }))
      
      const slaughterhouses = entities.filter((e: any) => e.type === 'slaughterhouse')
      
      if (farms.length === 0) {
        throw new Error('No hay granjas configuradas')
      }
      
      if (slaughterhouses.length === 0) {
        throw new Error('No hay mataderos configurados')
      }
      
      const result = await optimizeRoutes({
        farms,
        slaughterhouse: {
          id: slaughterhouses[0].id,
          name: slaughterhouses[0].name,
          location: {
            lat: slaughterhouses[0].lat,
            lng: slaughterhouses[0].lng
          },
          daily_capacity: slaughterhouses[0].maxCapacity,
          max_capacity: slaughterhouses[0].maxCapacity
        },
        truck_capacity: 250,
        num_days: 14
      })
      
      navigate('/route-summary', { 
        state: { optimizationResult: result } 
      })
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setIsOptimizing(false)
    }
  }
  
  return (
    <div>
      <SlaughterView />
      
      <div className="mt-6 text-center">
        <button
          onClick={handleOptimize}
          disabled={isOptimizing}
          className="btn-primary px-8 py-3 text-lg"
        >
          {isOptimizing ? (
            <>⏳ Optimizando rutas...</>
          ) : (
            <>🚀 Calcular Rutas Óptimas</>
          )}
        </button>
        
        {error && (
          <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            ❌ {error}
          </div>
        )}
      </div>
    </div>
  )
}
```

---

## 8️⃣ Despliegue en Producción

### Backend (FastAPI)

**Opción A: Railway / Render / Heroku**
1. Conecta tu repositorio
2. Configura build command: `pip install -r requirements.txt`
3. Configura start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

**Opción B: Docker en servidor propio**
```bash
docker-compose up -d
```

### Frontend (React)

**Opción A: Vercel / Netlify**
1. Conecta tu repositorio
2. Build command: `npm run build`
3. Output directory: `dist`
4. Configura variable de entorno: `VITE_API_URL=https://tu-backend.com`

---

## 🔍 Debugging

### Ver requests en el navegador
Abre DevTools → Network → Filtra por "optimize"

### Ver logs del backend
```bash
# Si usas Python directamente
python main.py

# Si usas Docker
docker-compose logs -f
```

### Probar endpoint manualmente
```bash
curl -X POST http://localhost:8000/optimize \
  -H "Content-Type: application/json" \
  -d @test_request.json
```

---

## ✅ Checklist de Integración

- [ ] Backend corriendo en puerto 8000
- [ ] Frontend corriendo en puerto 5173
- [ ] Archivo `routeOptimizationService.ts` creado
- [ ] Variable `VITE_API_URL` configurada
- [ ] CORS habilitado en el backend
- [ ] Botón de optimización agregado
- [ ] Manejo de errores implementado
- [ ] Navegación a `/route-summary` funcional
- [ ] Datos se muestran correctamente en el mapa

---

**¿Problemas?** Revisa la consola del navegador y los logs del backend para más detalles.

