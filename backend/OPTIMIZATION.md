## Optimización de rutas en PigChain

Este backend utiliza **algoritmos de optimización** para planificar las rutas de recolección de cerdos entre granjas y matadero.

### 1. ¿Qué problema resolvemos?

- **Tipo de problema**: Vehicle Routing Problem (VRP) con restricciones de capacidad.  
- **Objetivo**:  
  - Recoger cerdos de varias granjas.  
  - Llevarlos a un matadero.  
  - **Minimizar la distancia total recorrida** y, al mismo tiempo, **usar el menor número posible de camiones**, respetando:
    - Capacidad máxima de cada camión (número de cerdos).  
    - Capacidad diaria del matadero (máximo de cerdos que puede procesar en un día).  

### 2. Librerías de optimización usadas

- **Google OR-Tools** (`ortools.constraint_solver`):
  - Es un conjunto de algoritmos de optimización de Google.
  - Aquí usamos el **Routing Solver**, pensado para problemas de rutas y logística.

### 3. Cómo se construye el problema

En el código, la lógica principal está en la función `optimize_routes_for_day` de `main.py`:

- **Ubicaciones**:
  - Se crea una lista con:
    - Índice `0`: el matadero (depósito).
    - Índices `1..n`: cada granja activa ese día.
  - Con estas ubicaciones se genera una **matriz de distancias** (en metros) usando la fórmula de Haversine.

- **Demanda y capacidad**:
  - A cada granja se le asigna una **demanda** = número de cerdos disponibles.
  - Cada camión tiene una **capacidad máxima** = `truck_capacity` (número máximo de cerdos que puede transportar).
  - Se añade una **dimensión de capacidad** en OR-Tools para que nunca se supere la capacidad de cada camión.

- **Número de camiones**:
  - Se calcula el número mínimo teórico de camiones necesarios como:  
    \[
    \text{camiones mínimos} = \left\lceil \frac{\min(\text{cerdos totales}, \text{capacidad diaria matadero})}{\text{capacidad camión}} \right\rceil
    \]
  - Ese valor se usa como número de vehículos en el solver.

### 4. Función objetivo (qué se minimiza)

- El solver minimiza una **función de coste** que combina:
  - **Distancia total recorrida** (kilómetros).
  - Un **coste fijo por vehículo**: se usa `routing.SetFixedCostOfVehicle(500_000, vehicle_id)` para cada camión.
    - Esto hace que usar un camión extra sea “muy caro” en la función objetivo.
    - Resultado: el algoritmo prefiere **usar menos camiones**, siempre que no se rompan las restricciones de capacidad.

En resumen: se buscan rutas que recorran poca distancia y que usen el menor número posible de camiones.

### 5. Cómo se respetan las capacidades (camión y matadero)

Al extraer la solución del solver:

- Se recorre la ruta de cada camión y, para cada parada (granja):
  - Se calcula cuántos cerdos se pueden recoger como el mínimo de:
    - Cerdos disponibles en la granja.
    - Espacio libre en el camión.
    - Capacidad diaria restante del matadero.
  - Se actualizan:
    - La carga del camión.
    - El total de cerdos recogidos en el día.
- Cuando se alcanza la capacidad diaria del matadero, se siguen sumando **distancias** pero ya **no se cargan más cerdos**, de forma que:
  - Nunca se superan los cerdos que el matadero puede procesar ese día.
  - Nunca se supera la capacidad de ningún camión.

### 6. ¿Qué pasa si OR-Tools no encuentra solución?

En casos extremos (por ejemplo, datos extraños o inconsistentes), OR-Tools puede no devolver solución.  
En ese caso se usa un **algoritmo greedy de respaldo** (`greedy_route_assignment`):

- Ordena las granjas por distancia al matadero (las más cercanas primero).
- Va llenando un camión al máximo antes de crear el siguiente.
- Respeta la capacidad diaria del matadero.

Este algoritmo no es tan “inteligente” como OR-Tools, pero garantiza una solución razonable y rápida.

### 7. Cálculo económico

Una vez fijadas las rutas:

- Se calcula, por día:
  - **Kg totales entregados** (número de cerdos × peso medio).
  - **Ingresos** = kg × precio/kg, ajustados por una penalización según el peso medio (`compute_weight_penalty`).
  - **Coste de viaje** = distancia del camión × coste por km × (carga media / capacidad del camión).
  - **Coste de camiones** = coste semanal por camión prorrateado a coste diario.
  - **Beneficio neto** = ingresos − costes de viaje − costes de camiones.

Todo esto se devuelve al frontend en el endpoint `/optimize` para poder visualizar:

- Rutas por camión y día.
- Distancias.
- Costes.
- Beneficio neto.

De esta forma, el backend no solo calcula rutas factibles, sino que lo hace **optimizando económicamente** el uso de camiones y la logística diaria.


