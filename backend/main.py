"""
FastAPI Backend para optimización de rutas de recolección de cerdos
Algoritmo: Vehicle Routing Problem (VRP) con restricciones de capacidad

Características principales:
- Capacidad de camión: 20 toneladas (≈181 cerdos de 110kg)
- Disminución semanal de cerdos disponibles (configurable, por defecto 15% por semana)
- Optimización económica que minimiza costos de transporte y número de vehículos
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import math
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp

app = FastAPI(
    title="PigChain Route Optimizer",
    description="API de optimización de rutas para recolección de cerdos",
    version="1.0.0"
)

# Configurar CORS para permitir peticiones desde el frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción, especificar dominios permitidos
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# MODELOS DE DATOS (Pydantic)
# ============================================================================

class Location(BaseModel):
    """Ubicación geográfica"""
    lat: float = Field(..., description="Latitud")
    lng: float = Field(..., description="Longitud")


class Farm(BaseModel):
    """Granja con cerdos disponibles"""
    id: str = Field(..., description="ID único de la granja")
    name: str = Field(..., description="Nombre de la granja")
    location: Location = Field(..., description="Ubicación GPS")
    available_pigs: int = Field(..., ge=0, description="Cerdos disponibles para recolección")
    max_capacity: int = Field(..., ge=0, description="Capacidad máxima de la granja")
    # Campos opcionales para modelos más ricos (crecimiento y pesos)
    avg_weight_kg: Optional[float] = Field(
        default=None,
        description="Peso medio actual de los cerdos en esta granja (kg). "
        "Si no se especifica, se usa el peso medio global del request."
    )


class Slaughterhouse(BaseModel):
    """Matadero destino"""
    id: str = Field(..., description="ID único del matadero")
    name: str = Field(..., description="Nombre del matadero")
    location: Location = Field(..., description="Ubicación GPS")
    daily_capacity: int = Field(..., ge=0, description="Capacidad diaria de procesamiento")
    max_capacity: int = Field(..., ge=0, description="Capacidad máxima")


class OptimizationRequest(BaseModel):
    """Solicitud de optimización de rutas"""
    farms: List[Farm] = Field(..., description="Lista de granjas")
    slaughterhouse: Slaughterhouse = Field(..., description="Matadero destino")
    truck_capacity: int = Field(default=181, ge=1, description="Capacidad de cada camión en número de cerdos (20 toneladas ≈ 181 cerdos de 110kg)")
    # En el reto trabajamos con 2 semanas * 5 días laborables = 10 días.
    # El campo sigue siendo configurable para mantener compatibilidad.
    num_days: int = Field(default=10, ge=1, le=30, description="Número de días a planificar (por defecto 2 semanas laborables = 10 días)")
    planning_days_per_week: int = Field(
        default=5,
        ge=1,
        le=7,
        description="Número de días operativos por semana (para restringir una visita/semana por granja)"
    )
    avg_pig_weight_kg: float = Field(default=110.0, ge=0, description="Peso promedio por cerdo en kg")
    # Precio del reto para kg canal
    price_per_kg: float = Field(default=1.56, ge=0, description="Precio por kg en euros (canal)")
    truck_cost_per_week: float = Field(default=2000.0, ge=0, description="Costo de alquiler/operación de cada camión por semana en euros")
    fuel_cost_per_km: float = Field(default=0.35, ge=0, description="Costo de combustible por kilómetro en euros")
    # Coste económico por km usado en la fórmula del reto:
    # trip_cost = distance_km × cost_per_km × (current_load / capacity)
    # Si no se especifica, se usa fuel_cost_per_km.
    cost_per_km: Optional[float] = Field(
        default=None,
        ge=0,
        description="Costo económico por kilómetro para calcular trip_cost. "
        "Si es None se usa fuel_cost_per_km."
    )
    # Crecimiento semanal de peso (si se quiere simular que los cerdos ganan peso
    # semana a semana). Si es 0, el peso se considera constante.
    weekly_weight_gain_kg: float = Field(
        default=0.0,
        ge=0.0,
        description="Incremento medio de peso (kg) por cerdo y semana. "
        "Si es 0, el peso medio se mantiene constante."
    )
    weekly_decline_rate: float = Field(default=0.15, ge=0, le=1, description="Tasa de disminución semanal de cerdos disponibles (0.15 = 15% menos cada semana)")


class RouteStop(BaseModel):
    """Parada en una ruta"""
    id: str = Field(..., description="ID de la granja")
    pigs: int = Field(..., description="Número de cerdos a recoger")


class TruckRoute(BaseModel):
    """Ruta de un camión"""
    id: int = Field(..., description="ID del camión")
    route: List[RouteStop] = Field(..., description="Secuencia de paradas")
    distance_km: float = Field(
        default=0.0,
        description="Distancia total recorrida por este camión en km (ida y vuelta al matadero)"
    )


class OptimizationDay(BaseModel):
    """Planificación para un día"""
    timedatestamp: str = Field(..., description="Fecha en formato ISO")
    totalKg: float = Field(..., description="Total de kg procesados")
    totalEuros: float = Field(..., description="Total de euros generados")
    trucks: List[TruckRoute] = Field(..., description="Camiones y sus rutas")
    totalDistanceKm: float = Field(default=0.0, description="Distancia total recorrida en km")
    fuelCostEuros: float = Field(default=0.0, description="Costo de combustible en euros")
    truckCostEuros: float = Field(default=0.0, description="Costo de camiones (prorrateado) en euros")
    netProfitEuros: float = Field(default=0.0, description="Beneficio neto (ingresos - costos) en euros")


class OptimizationResponse(BaseModel):
    """Respuesta de optimización"""
    id: str = Field(..., description="ID de la optimización")
    days: List[OptimizationDay] = Field(..., description="Planificación por días")
    summary: Dict[str, float] = Field(default_factory=dict, description="Resumen de la optimización completa")


# ============================================================================
# FUNCIONES DE UTILIDAD
# ============================================================================

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calcula la distancia en kilómetros entre dos puntos geográficos
    usando la fórmula de Haversine
    
    Args:
        lat1, lon1: Coordenadas del primer punto
        lat2, lon2: Coordenadas del segundo punto
    
    Returns:
        Distancia en kilómetros
    """
    R = 6371  # Radio de la Tierra en km
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = (math.sin(delta_lat / 2) ** 2 + 
         math.cos(lat1_rad) * math.cos(lat2_rad) * 
         math.sin(delta_lon / 2) ** 2)
    c = 2 * math.asin(math.sqrt(a))
    
    return R * c


def create_distance_matrix(locations: List[Location]) -> List[List[float]]:
    """
    Crea una matriz de distancias entre todas las ubicaciones
    
    Args:
        locations: Lista de ubicaciones GPS
    
    Returns:
        Matriz de distancias en metros (para OR-Tools)
    """
    n = len(locations)
    distance_matrix = [[0.0] * n for _ in range(n)]
    
    for i in range(n):
        for j in range(n):
            if i != j:
                dist_km = haversine_distance(
                    locations[i].lat, locations[i].lng,
                    locations[j].lat, locations[j].lng
                )
                distance_matrix[i][j] = dist_km * 1000  # Convertir a metros
    
    return distance_matrix


# ============================================================================
# ALGORITMO DE OPTIMIZACIÓN
# ============================================================================


def compute_weight_penalty(
    avg_weight_kg: float,
    ideal_min: float = 105.0,
    ideal_max: float = 115.0,
    moderate_penalty: float = 0.15,
    extreme_penalty: float = 0.20,
) -> float:
    """
    Calcula el factor de penalización por peso según el reto.

    - Rango ideal: 105–115 kg → 0% penalización
    - Parte significativa del lote fuera del rango ideal → 15%
    - Pesos extremos (<100kg o >120kg) → 20%

    Dado que aquí no tenemos la distribución completa, aproximamos
    usando el peso medio entregado.
    """
    if avg_weight_kg <= 0:
        return 0.0

    # Rango ideal
    if ideal_min <= avg_weight_kg <= ideal_max:
        return 0.0

    # Pesos muy bajos o muy altos
    if avg_weight_kg < 100.0 or avg_weight_kg > 120.0:
        return extreme_penalty

    # Resto de casos fuera del rango ideal
    return moderate_penalty

def optimize_routes_for_day(
    farms: List[Farm],
    slaughterhouse: Slaughterhouse,
    truck_capacity: int,
    daily_capacity: int,
    minimize_vehicles: bool = True,
    max_stops_per_route: int = 3,
) -> tuple[List[TruckRoute], float]:
    """
    Optimiza las rutas de recolección para un día usando VRP
    (Vehicle Routing Problem con restricciones de capacidad)
    
    El algoritmo utiliza Google OR-Tools para resolver un problema de
    enrutamiento de vehículos que:
    1. Minimiza el COSTO TOTAL (distancia + número de vehículos)
    2. Respeta la capacidad de cada camión
    3. Respeta la capacidad diaria del matadero
    4. Asegura que cada granja sea visitada máximo una vez
    5. Optimiza económicamente reduciendo vehículos cuando es posible
    
    Args:
        farms: Granjas con cerdos disponibles
        slaughterhouse: Matadero destino
        truck_capacity: Capacidad de cada camión
        daily_capacity: Capacidad diaria del matadero
        minimize_vehicles: Si True, penaliza el uso de vehículos adicionales
    
    Returns:
        Tupla de (Lista de rutas optimizadas, Distancia total en km)
    """
    if not farms:
        return [], 0.0
    
    # Filtrar granjas con cerdos disponibles
    active_farms = [f for f in farms if f.available_pigs > 0]
    if not active_farms:
        return [], 0.0
    
    # Preparar datos para OR-Tools
    # Índice 0 = matadero (depósito)
    # Índices 1..n = granjas
    locations = [slaughterhouse.location] + [f.location for f in active_farms]
    demands = [0] + [f.available_pigs for f in active_farms]
    
    # Crear matriz de distancias
    distance_matrix = create_distance_matrix(locations)
    
    # Calcular número MÍNIMO de camiones necesarios
    # Esto es crítico para optimización económica
    total_pigs = sum(demands)
    total_pigs_to_collect = min(total_pigs, daily_capacity)
    min_vehicles = max(1, math.ceil(total_pigs_to_collect / truck_capacity))
    
    # Intentar con el mínimo de vehículos primero
    # Si no funciona, incrementar gradualmente
    num_vehicles = min_vehicles
    
    # Configurar el problema de enrutamiento
    manager = pywrapcp.RoutingIndexManager(
        len(distance_matrix),  # Número de ubicaciones
        num_vehicles,          # Número de vehículos
        0                      # Índice del depósito (matadero)
    )
    
    routing = pywrapcp.RoutingModel(manager)
    
    # Callback de distancia
    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return int(distance_matrix[from_node][to_node])
    
    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)
    
    # Callback de demanda (cerdos)
    def demand_callback(from_index):
        from_node = manager.IndexToNode(from_index)
        return demands[from_node]
    
    demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
    
    # Agregar restricción de capacidad
    routing.AddDimensionWithVehicleCapacity(
        demand_callback_index,
        0,              # Slack (capacidad extra permitida)
        [truck_capacity] * num_vehicles,  # Capacidad de cada vehículo
        True,           # Forzar inicio a cero
        'Capacity'
    )
    
    # Configurar parámetros de búsqueda
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_parameters.time_limit.seconds = 15  # Más tiempo para mejor optimización
    
    # OPTIMIZACIÓN ECONÓMICA: Penalizar vehículos adicionales
    # Esto hace que el algoritmo prefiera menos camiones con rutas más largas
    # si el ahorro en costos de vehículos compensa el combustible extra
    if minimize_vehicles:
        for vehicle_id in range(num_vehicles):
            # Coste fijo elevado por vehículo para que el solver
            # prefiera usar menos camiones siempre que sea posible.
            # La magnitud (5e5) equivale aproximadamente a cientos de km
            # adicionales de ruta en la función objetivo.
            routing.SetFixedCostOfVehicle(500_000, vehicle_id)
    
    # Resolver el problema
    solution = routing.SolveWithParameters(search_parameters)
    
    if not solution:
        # Si no se encuentra solución óptima, usar algoritmo greedy simple
        routes, distance = greedy_route_assignment(active_farms, slaughterhouse.location, truck_capacity, daily_capacity)
        return routes, distance
    
    # Extraer rutas de la solución y calcular distancia total
    truck_routes = []
    total_distance_km = 0.0
    total_collected = 0  # Cerdos totales recogidos en el día (para respetar capacidad diaria)
    
    for vehicle_id in range(num_vehicles):
        index = routing.Start(vehicle_id)
        route_stops = []
        route_load = 0
        route_distance = 0
        previous_node = 0  # Empezar en el matadero
        stops_count = 0
        
        while not routing.IsEnd(index):
            # Si ya alcanzamos la capacidad diaria del matadero,
            # recorremos el resto del camino solo para sumar distancia
            # pero sin recoger más cerdos.
            remaining_daily_capacity = max(0, daily_capacity - total_collected)

            node_index = manager.IndexToNode(index)
            
            # Acumular distancia
            if previous_node != node_index:
                route_distance += distance_matrix[previous_node][node_index]
            
            # Si no es el depósito (matadero)
            if node_index > 0:
                farm_index = node_index - 1
                farm = active_farms[farm_index]
                # Respetar máximo de paradas por ruta
                if stops_count < max_stops_per_route:
                    # Nunca superar capacidad de camión ni del matadero en el día
                    pigs_to_collect = min(
                        farm.available_pigs,
                        truck_capacity - route_load,
                        remaining_daily_capacity
                    )

                    if pigs_to_collect > 0:
                        route_stops.append(RouteStop(
                            id=farm.id,
                            pigs=pigs_to_collect
                        ))
                        route_load += pigs_to_collect
                        total_collected += pigs_to_collect
                        stops_count += 1
            
            previous_node = node_index
            index = solution.Value(routing.NextVar(index))
        
        # Agregar distancia de regreso al matadero
        route_distance += distance_matrix[previous_node][0]
        
        # Solo agregar rutas no vacías
        if route_stops:
            distance_km = route_distance / 1000.0  # Convertir metros a km
            truck_routes.append(TruckRoute(
                id=vehicle_id + 1,
                route=route_stops,
                distance_km=round(distance_km, 2)
            ))
            total_distance_km += distance_km
    
    return truck_routes, total_distance_km


def greedy_route_assignment(
    farms: List[Farm],
    slaughterhouse_location: Location,
    truck_capacity: int,
    daily_capacity: int
) -> tuple[List[TruckRoute], float]:
    """
    Algoritmo greedy de respaldo para asignar rutas cuando OR-Tools falla
    
    Estrategia OPTIMIZADA ECONÓMICAMENTE:
    1. Ordenar granjas por distancia al matadero (más cercanas primero)
    2. Llenar cada camión al máximo antes de crear uno nuevo
    3. Respetar límite diario del matadero
    
    Args:
        farms: Granjas activas
        slaughterhouse_location: Ubicación del matadero
        truck_capacity: Capacidad por camión
        daily_capacity: Capacidad diaria
    
    Returns:
        Tupla de (Lista de rutas, Distancia total en km)
    """
    # Ordenar por distancia al matadero (más cercanas primero para eficiencia)
    sorted_farms = sorted(
        farms,
        key=lambda f: haversine_distance(
            f.location.lat, f.location.lng,
            slaughterhouse_location.lat, slaughterhouse_location.lng
        )
    )
    
    trucks: List[TruckRoute] = []
    current_truck_id = 1
    current_route: List[RouteStop] = []
    current_route_distance_km = 0.0
    current_load = 0
    total_collected = 0
    total_distance_km = 0.0
    
    for farm in sorted_farms:
        pigs_available = farm.available_pigs
        
        while pigs_available > 0 and total_collected < daily_capacity:
            pigs_to_collect = min(
                pigs_available,
                truck_capacity - current_load,
                daily_capacity - total_collected
            )
            
            if pigs_to_collect > 0:
                # Calcular distancia de esta parada
                if current_route:
                    # Distancia desde última granja
                    last_stop_farm = next(f for f in farms if f.id == current_route[-1].id)
                    dist = haversine_distance(
                        last_stop_farm.location.lat, last_stop_farm.location.lng,
                        farm.location.lat, farm.location.lng
                    )
                    current_route_distance_km += dist
                else:
                    # Distancia desde matadero
                    dist = haversine_distance(
                        slaughterhouse_location.lat, slaughterhouse_location.lng,
                        farm.location.lat, farm.location.lng
                    )
                    current_route_distance_km += dist
                
                current_route.append(RouteStop(
                    id=farm.id,
                    pigs=pigs_to_collect
                ))
                current_load += pigs_to_collect
                pigs_available -= pigs_to_collect
                total_collected += pigs_to_collect
            
            # Si el camión está lleno o no queda capacidad diaria, crear nuevo camión
            if current_load >= truck_capacity or total_collected >= daily_capacity:
                if current_route:
                    # Agregar distancia de regreso al matadero
                    last_farm = next(f for f in farms if f.id == current_route[-1].id)
                    dist_return = haversine_distance(
                        last_farm.location.lat, last_farm.location.lng,
                        slaughterhouse_location.lat, slaughterhouse_location.lng
                    )
                    current_route_distance_km += dist_return

                    trucks.append(TruckRoute(
                        id=current_truck_id,
                        route=current_route,
                        distance_km=round(current_route_distance_km, 2)
                    ))
                    total_distance_km += current_route_distance_km

                    current_truck_id += 1
                current_route = []
                current_route_distance_km = 0.0
                current_load = 0
            
            if total_collected >= daily_capacity:
                break
        
        if total_collected >= daily_capacity:
            break
    
    # Agregar último camión si tiene paradas
    if current_route:
        # Agregar distancia de regreso
        last_farm = next(f for f in farms if f.id == current_route[-1].id)
        dist_return = haversine_distance(
            last_farm.location.lat, last_farm.location.lng,
            slaughterhouse_location.lat, slaughterhouse_location.lng
        )
        current_route_distance_km += dist_return

        trucks.append(TruckRoute(
            id=current_truck_id,
            route=current_route,
            distance_km=round(current_route_distance_km, 2)
        ))
        total_distance_km += current_route_distance_km
    
    return trucks, total_distance_km


# ============================================================================
# ENDPOINTS DE LA API
# ============================================================================

@app.get("/")
def root():
    """Endpoint de bienvenida"""
    return {
        "message": "PigChain Route Optimizer API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
def health_check():
    """Endpoint de health check"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


@app.post("/optimize", response_model=OptimizationResponse)
def optimize_routes(request: OptimizationRequest):
    """
    Endpoint principal: optimiza rutas de recolección de cerdos
    
    Recibe información de granjas y matadero, y devuelve un plan
    de recolección optimizado para varios días.
    
    Args:
        request: Datos de granjas, matadero y parámetros
    
    Returns:
        Plan de optimización con rutas por día
    
    Raises:
        HTTPException: Si hay errores en los datos de entrada
    """
    try:
        if not request.farms:
            raise HTTPException(status_code=400, detail="Se requiere al menos una granja")
        
        # Simulación de inventario y pesos día a día siguiendo el reto:
        # - Horizonte: num_days (por defecto 2 semanas laborales = 10 días)
        # - Una visita/semana por granja (semana = planning_days_per_week)
        # - Inventario decrementa con los envíos
        # - Peso medio puede crecer semana a semana

        days_data: List[OptimizationDay] = []
        start_date = datetime.now()

        # Estado de inventario y peso por granja
        base_farms: Dict[str, Farm] = {f.id: f for f in request.farms}
        farm_state: Dict[str, Dict[str, float]] = {}
        for farm in request.farms:
            # Inventario inicial = available_pigs (si no, usamos max_capacity como aproximación)
            remaining_pigs = farm.available_pigs if farm.available_pigs is not None else farm.max_capacity
            # Peso inicial: específico de granja o global
            initial_weight = farm.avg_weight_kg if farm.avg_weight_kg is not None else request.avg_pig_weight_kg
            farm_state[farm.id] = {
                "remaining_pigs": float(max(0, remaining_pigs)),
                "avg_weight_kg": float(max(0.0, initial_weight)),
            }

        # Control de visitas: una visita por semana (bloques de planning_days_per_week)
        farm_weeks_visited: Dict[str, set] = {f.id: set() for f in request.farms}

        # Rastrear camiones únicos usados en toda la planificación y métricas de uso
        trucks_used_per_day: List[int] = []
        unique_trucks_used = set()

        # Ganancia de peso diaria (si se configura)
        daily_weight_gain_kg = 0.0
        if request.weekly_weight_gain_kg > 0 and request.planning_days_per_week > 0:
            daily_weight_gain_kg = request.weekly_weight_gain_kg / float(request.planning_days_per_week)

        # Coste por km efectivo para el cálculo de trip_cost
        effective_cost_per_km = request.cost_per_km if request.cost_per_km is not None else request.fuel_cost_per_km

        for day_offset in range(request.num_days):
            current_date = start_date + timedelta(days=day_offset)

            # Determinar semana "lógica" (basada en días operativos, no en calendario real)
            current_week = day_offset // request.planning_days_per_week if request.planning_days_per_week > 0 else 0

            # Pesos medios al inicio del día (se usan para calcular kg entregados y penalizaciones)
            farm_weight_snapshot: Dict[str, float] = {
                farm_id: state["avg_weight_kg"] for farm_id, state in farm_state.items()
            }

            # Construir las granjas disponibles para hoy:
            # - Aún tienen inventario
            # - No han sido visitadas esta semana lógica
            day_farms: List[Farm] = []
            for farm_id, state in farm_state.items():
                if state["remaining_pigs"] <= 0:
                    continue
                if current_week in farm_weeks_visited[farm_id]:
                    continue

                base = base_farms[farm_id]
                day_farms.append(Farm(
                    id=base.id,
                    name=base.name,
                    location=base.location,
                    available_pigs=int(state["remaining_pigs"]),
                    max_capacity=base.max_capacity,
                    avg_weight_kg=state["avg_weight_kg"],
                ))

            # Si no hay granjas operativas hoy, registramos un día "en blanco"
            if not day_farms:
                days_data.append(OptimizationDay(
                    timedatestamp=current_date.strftime("%Y-%m-%d"),
                    totalKg=0.0,
                    totalEuros=0.0,
                    trucks=[],
                    totalDistanceKm=0.0,
                    fuelCostEuros=0.0,
                    truckCostEuros=0.0,
                    netProfitEuros=0.0,
                ))
                trucks_used_per_day.append(0)

                # Aun así simulamos crecimiento de peso para los días siguientes
                if daily_weight_gain_kg > 0:
                    for state in farm_state.values():
                        if state["remaining_pigs"] > 0:
                            state["avg_weight_kg"] += daily_weight_gain_kg
                continue

            # Optimizar rutas para este día (con optimización económica y límite de paradas)
            truck_routes, _ = optimize_routes_for_day(
                farms=day_farms,
                slaughterhouse=request.slaughterhouse,
                truck_capacity=request.truck_capacity,
                daily_capacity=request.slaughterhouse.daily_capacity,
                minimize_vehicles=True,  # OPTIMIZACIÓN ECONÓMICA ACTIVADA
                max_stops_per_route=3,
            )

            # Rastrear camiones usados
            num_trucks_today = len(truck_routes)
            trucks_used_per_day.append(num_trucks_today)
            for truck in truck_routes:
                unique_trucks_used.add(truck.id)

            # Actualizar inventario de granjas y registrar visita semanal
            total_pigs = 0
            total_kg = 0.0
            total_distance_km = 0.0
            total_trip_cost_euros = 0.0

            for truck in truck_routes:
                # Distancia de este camión (ya calculada por el optimizador)
                total_distance_km += truck.distance_km

                # Carga de este camión en cerdos
                truck_pigs = 0
                for stop in truck.route:
                    farm_id = stop.id
                    pigs = stop.pigs
                    truck_pigs += pigs
                    total_pigs += pigs

                    # Kg entregados desde esta granja según su peso medio al inicio del día
                    farm_weight = farm_weight_snapshot.get(farm_id, request.avg_pig_weight_kg)
                    total_kg += pigs * farm_weight

                    # Actualizar inventario y registro de visita semanal
                    if farm_id in farm_state:
                        farm_state[farm_id]["remaining_pigs"] = max(
                            0.0,
                            farm_state[farm_id]["remaining_pigs"] - pigs
                        )
                        farm_weeks_visited[farm_id].add(current_week)

                # Coste del viaje de este camión según la fórmula del reto:
                # trip_cost = distance_km × cost_per_km × (current_load / capacity)
                if request.truck_capacity > 0 and truck.distance_km > 0 and truck_pigs > 0:
                    load_ratio = truck_pigs / float(request.truck_capacity)
                    trip_cost = truck.distance_km * effective_cost_per_km * load_ratio
                    total_trip_cost_euros += trip_cost

            # Calcular ingresos con penalización por peso medio entregado
            if total_pigs > 0:
                avg_delivered_weight_kg = total_kg / float(total_pigs)
            else:
                avg_delivered_weight_kg = request.avg_pig_weight_kg

            penalty_factor = compute_weight_penalty(avg_delivered_weight_kg)
            total_revenue_euros = total_kg * request.price_per_kg * (1.0 - penalty_factor)

            # Costo de camiones (prorrateado por día)
            # 2000€/semana = ~285.71€/día por camión
            truck_cost_per_day = request.truck_cost_per_week / 7.0
            truck_cost_euros = num_trucks_today * truck_cost_per_day

            # Beneficio neto por día
            net_profit_euros = total_revenue_euros - total_trip_cost_euros - truck_cost_euros

            days_data.append(OptimizationDay(
                timedatestamp=current_date.strftime("%Y-%m-%d"),
                totalKg=round(total_kg, 2),
                totalEuros=round(total_revenue_euros, 2),
                trucks=truck_routes,
                totalDistanceKm=round(total_distance_km, 2),
                # Reutilizamos campos existentes:
                # fuelCostEuros → costes de viaje (trip_cost)
                fuelCostEuros=round(total_trip_cost_euros, 2),
                truckCostEuros=round(truck_cost_euros, 2),
                netProfitEuros=round(net_profit_euros, 2)
            ))

            # Actualizar pesos medios para el siguiente día (crecimiento)
            if daily_weight_gain_kg > 0:
                for state in farm_state.values():
                    if state["remaining_pigs"] > 0:
                        state["avg_weight_kg"] += daily_weight_gain_kg
        
        optimization_id = f"opt-{int(datetime.now().timestamp())}"
        
        # Calcular resumen total
        total_revenue = sum(day.totalEuros for day in days_data)
        total_fuel_cost = sum(day.fuelCostEuros for day in days_data)
        total_truck_cost = sum(day.truckCostEuros for day in days_data)
        total_net_profit = sum(day.netProfitEuros for day in days_data)
        total_pigs_period = sum(
            sum(stop.pigs for truck in day.trucks for stop in truck.route)
            for day in days_data
        )
        total_distance = sum(day.totalDistanceKm for day in days_data)
        max_trucks_per_day = max(trucks_used_per_day) if trucks_used_per_day else 0
        avg_trucks_per_day = sum(trucks_used_per_day) / len(trucks_used_per_day) if trucks_used_per_day else 0
        
        summary = {
            "total_days": request.num_days,
            "total_revenue_euros": round(total_revenue, 2),
            "total_fuel_cost_euros": round(total_fuel_cost, 2),
            "total_truck_cost_euros": round(total_truck_cost, 2),
            "total_costs_euros": round(total_fuel_cost + total_truck_cost, 2),
            "total_net_profit_euros": round(total_net_profit, 2),
            "profit_margin_percent": round((total_net_profit / total_revenue * 100) if total_revenue > 0 else 0, 2),
            "total_pigs_collected": total_pigs_period,
            "total_distance_km": round(total_distance, 2),
            "max_trucks_per_day": max_trucks_per_day,
            "avg_trucks_per_day": round(avg_trucks_per_day, 2),
            "cost_per_pig_euros": round((total_fuel_cost + total_truck_cost) / total_pigs_period if total_pigs_period > 0 else 0, 2),
            "revenue_per_pig_euros": round(total_revenue / total_pigs_period if total_pigs_period > 0 else 0, 2)
        }
        
        return OptimizationResponse(
            id=optimization_id,
            days=days_data,
            summary=summary
        )
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Error en los datos: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

