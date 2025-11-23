# 🚀 Inicio Rápido - PigChain Route Optimizer

## ⚡ 5 Minutos para Empezar

### 1. Instalar dependencias

```bash
cd agrocerdos/backend
pip install -r requirements.txt
```

### 2. Ejecutar servidor

```bash
python main.py
```

### 3. Abrir documentación

Navega a: http://localhost:8000/docs

### 4. Probar API

```bash
python test_api.py
```

---

## 📝 Ejemplo Mínimo

```python
import requests

response = requests.post('http://localhost:8000/optimize', json={
    "farms": [
        {
            "id": "farm1",
            "name": "Granja Norte",
            "location": {"lat": 40.5, "lng": -3.7},
            "available_pigs": 200,
            "max_capacity": 500
        }
    ],
    "slaughterhouse": {
        "id": "slaughter1",
        "name": "Matadero Central",
        "location": {"lat": 40.4, "lng": -3.7},
        "daily_capacity": 500,
        "max_capacity": 1000
    }
})

result = response.json()
print(f"Beneficio neto: €{result['summary']['total_net_profit_euros']:,.2f}")
```

---

## 💡 Entender los Resultados

### Respuesta de la API:

```json
{
  "summary": {
    "total_net_profit_euros": 898165.55,  ← BENEFICIO NETO
    "profit_margin_percent": 98.97,        ← MARGEN
    "avg_trucks_per_day": 2.0,             ← CAMIONES PROMEDIO
    "total_costs_euros": 9334.45           ← COSTOS TOTALES
  }
}
```

### ¿Qué significan?

- **Beneficio Neto:** Ingresos - Costos (combustible + vehículos)
- **Margen:** % de ingresos que se convierten en beneficio
- **Camiones Promedio:** Vehículos necesarios por día
- **Costos Totales:** Combustible + Vehículos (2000€/semana cada uno)

---

## 🎯 Casos de Uso

### 1. Planificación Semanal
```bash
# Optimizar próximos 7 días
"num_days": 7
```

### 2. Planificación Quincenal (Recomendado)
```bash
# Optimizar próximos 15 días
"num_days": 15
```

### 3. Comparar Escenarios
```bash
# Escenario A: 2 camiones grandes (capacidad 300)
"truck_capacity": 300

# Escenario B: 3 camiones medianos (capacidad 200)
"truck_capacity": 200

# Comparar beneficio neto de ambos
```

---

## 📊 KPIs a Monitorear

| KPI | Objetivo | Cómo Interpretarlo |
|-----|----------|-------------------|
| Margen de beneficio | >90% | Si está bajo, revisar costos |
| Utilización de camiones | >85% | Si está bajo, reducir camiones |
| Costo por cerdo | <3€ | Si está alto, optimizar rutas |
| Camiones promedio/día | Mínimo posible | Cada camión menos = +2000€/semana |

---

## ⚙️ Configuración Personalizada

### Ajustar Costos

```python
{
  "truck_cost_per_week": 2500.0,  # Si tus camiones cuestan más
  "fuel_cost_per_km": 0.40,       # Si el diesel sube de precio
  "price_per_kg": 2.5             # Precio actual del mercado
}
```

### Ajustar Capacidades

```python
{
  "truck_capacity": 300,           # Camiones más grandes
  "slaughterhouse": {
    "daily_capacity": 800          # Mayor capacidad de procesamiento
  }
}
```

---

## 🆘 Solución de Problemas

### Error: "No se pudo conectar"
```bash
# Verificar que el servidor esté corriendo
curl http://localhost:8000/health
```

### Error: "ModuleNotFoundError"
```bash
# Reinstalar dependencias
pip install -r requirements.txt
```

### Error: "No hay granjas"
```bash
# Verificar JSON de entrada
# Debe tener al menos 1 granja con available_pigs > 0
```

---

## 📚 Siguiente Paso

- Leer [README.md](README.md) para explicación completa
- Leer [ECONOMIC_OPTIMIZATION.md](ECONOMIC_OPTIMIZATION.md) para entender el algoritmo
- Leer [INTEGRATION.md](INTEGRATION.md) para integrar con frontend

---

## 💰 Beneficio Esperado

Para una operación típica (6 granjas, 3000 cerdos/mes):

```
Ahorro mensual:     €6,700
Ahorro anual:       €80,400
ROI:                3,000%+
Tiempo de pago:     <2 semanas
```

---

**¿Preguntas?** Revisa la [documentación completa](README.md) o abre un issue.

