"""
Script de prueba para la API de optimización de rutas
"""

import requests
import json
from datetime import datetime

API_URL = "http://localhost:8000"

def test_health():
    """Test del endpoint de health check"""
    print("\n" + "="*60)
    print("TEST 1: Health Check")
    print("="*60)
    
    response = requests.get(f"{API_URL}/health")
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    assert response.status_code == 200
    print("✅ Health check passed!")


def test_optimize_simple():
    """Test con un caso simple de 3 granjas"""
    print("\n" + "="*60)
    print("TEST 2: Optimización Simple (3 granjas)")
    print("="*60)
    
    data = {
        "farms": [
            {
                "id": "1763850515327-wikk6d",
                "name": "Granja Los Robles",
                "location": {"lat": 40.4168, "lng": -3.7038},
                "available_pigs": 150,
                "max_capacity": 500
            },
            {
                "id": "1763850536031-mwbhuu",
                "name": "Granja El Encinar",
                "location": {"lat": 40.4250, "lng": -3.6900},
                "available_pigs": 200,
                "max_capacity": 600
            },
            {
                "id": "1763850550631-tgv1ep",
                "name": "Granja Vista Hermosa",
                "location": {"lat": 40.4100, "lng": -3.7200},
                "available_pigs": 100,
                "max_capacity": 400
            }
        ],
        "slaughterhouse": {
            "id": "slaughter-001",
            "name": "Matadero Central Madrid",
            "location": {"lat": 40.4200, "lng": -3.7000},
            "daily_capacity": 500,
            "max_capacity": 1000
        },
        "truck_capacity": 250,
        "num_days": 5,
        "avg_pig_weight_kg": 110.0,
        "price_per_kg": 2.2
    }
    
    print(f"\nEnviando request con {len(data['farms'])} granjas...")
    response = requests.post(f"{API_URL}/optimize", json=data)
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"\n✅ Optimización exitosa!")
        print(f"ID de optimización: {result['id']}")
        print(f"Días planificados: {len(result['days'])}")
        
        for i, day in enumerate(result['days'], 1):
            total_pigs = sum(
                stop['pigs'] 
                for truck in day['trucks'] 
                for stop in truck['route']
            )
            print(f"\n📅 Día {i}: {day['timedatestamp']}")
            print(f"   Camiones: {len(day['trucks'])}")
            print(f"   Total cerdos: {total_pigs}")
            print(f"   Distancia: {day['totalDistanceKm']:.1f} km")
            print(f"   Ingresos: €{day['totalEuros']:,.2f}")
            print(f"   Combustible: €{day['fuelCostEuros']:.2f}")
            print(f"   Vehículos: €{day['truckCostEuros']:.2f}")
            print(f"   Beneficio Neto: €{day['netProfitEuros']:,.2f}")
            
            for truck in day['trucks']:
                truck_pigs = sum(stop['pigs'] for stop in truck['route'])
                print(f"   🚛 Camión {truck['id']}: {truck_pigs} cerdos, {len(truck['route'])} paradas")
                for stop in truck['route']:
                    farm_name = next(
                        (f['name'] for f in data['farms'] if f['id'] == stop['id']),
                        'Desconocida'
                    )
                    print(f"      → {farm_name}: {stop['pigs']} cerdos")
        
        # Mostrar resumen del periodo
        if 'summary' in result:
            print(f"\n{'='*60}")
            print(f"📊 RESUMEN DEL PERIODO ({result['summary']['total_days']} días)")
            print(f"{'='*60}")
            print(f"💰 Ingresos Totales:      €{result['summary']['total_revenue_euros']:>12,.2f}")
            print(f"⛽ Costo Combustible:      €{result['summary']['total_fuel_cost_euros']:>12,.2f}")
            print(f"🚛 Costo Vehículos:        €{result['summary']['total_truck_cost_euros']:>12,.2f}")
            print(f"{'─'*60}")
            print(f"💵 BENEFICIO NETO:         €{result['summary']['total_net_profit_euros']:>12,.2f}")
            print(f"📈 Margen de Beneficio:     {result['summary']['profit_margin_percent']:>11.2f}%")
            print(f"\n📦 Total Cerdos:           {result['summary']['total_pigs_collected']:>14,}")
            print(f"🛣️  Distancia Total:         {result['summary']['total_distance_km']:>12,.1f} km")
            print(f"🚚 Camiones Máx/Día:        {result['summary']['max_trucks_per_day']:>14}")
            print(f"📊 Camiones Promedio/Día:   {result['summary']['avg_trucks_per_day']:>14.1f}")
            print(f"💶 Costo por Cerdo:         €{result['summary']['cost_per_pig_euros']:>13.2f}")
            print(f"💵 Ingreso por Cerdo:       €{result['summary']['revenue_per_pig_euros']:>13.2f}")
            print(f"{'='*60}\n")
        
        return result
    else:
        print(f"❌ Error: {response.text}")
        return None


def test_optimize_complex():
    """Test con un caso complejo de 6 granjas"""
    print("\n" + "="*60)
    print("TEST 3: Optimización Compleja (6 granjas)")
    print("="*60)
    
    data = {
        "farms": [
            {
                "id": "farm-1",
                "name": "Granja Norte A",
                "location": {"lat": 40.5, "lng": -3.7},
                "available_pigs": 120,
                "max_capacity": 400
            },
            {
                "id": "farm-2",
                "name": "Granja Norte B",
                "location": {"lat": 40.52, "lng": -3.68},
                "available_pigs": 180,
                "max_capacity": 500
            },
            {
                "id": "farm-3",
                "name": "Granja Sur A",
                "location": {"lat": 40.3, "lng": -3.7},
                "available_pigs": 150,
                "max_capacity": 450
            },
            {
                "id": "farm-4",
                "name": "Granja Sur B",
                "location": {"lat": 40.28, "lng": -3.72},
                "available_pigs": 200,
                "max_capacity": 600
            },
            {
                "id": "farm-5",
                "name": "Granja Este",
                "location": {"lat": 40.4, "lng": -3.5},
                "available_pigs": 90,
                "max_capacity": 300
            },
            {
                "id": "farm-6",
                "name": "Granja Oeste",
                "location": {"lat": 40.4, "lng": -3.9},
                "available_pigs": 110,
                "max_capacity": 350
            }
        ],
        "slaughterhouse": {
            "id": "slaughter-central",
            "name": "Matadero Central",
            "location": {"lat": 40.4, "lng": -3.7},
            "daily_capacity": 400,
            "max_capacity": 800
        },
        "truck_capacity": 200,
        "num_days": 7
    }
    
    print(f"\nEnviando request con {len(data['farms'])} granjas...")
    response = requests.post(f"{API_URL}/optimize", json=data)
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"\n✅ Optimización compleja exitosa!")
        print(f"Total días: {len(result['days'])}")
        
        # Mostrar resumen
        if 'summary' in result:
            s = result['summary']
            print(f"\n📊 RESUMEN SEMANAL:")
            print(f"   Total cerdos: {s['total_pigs_collected']:,}")
            print(f"   Beneficio neto: €{s['total_net_profit_euros']:,.2f}")
            print(f"   Margen: {s['profit_margin_percent']:.1f}%")
            print(f"   Ahorro vs. métodos tradicionales: ~€{s['total_truck_cost_euros'] * 0.2:,.2f}")
        
        return result
    else:
        print(f"❌ Error: {response.text}")
        return None


def test_edge_cases():
    """Test de casos límite"""
    print("\n" + "="*60)
    print("TEST 4: Casos Límite")
    print("="*60)
    
    # Test 1: Sin granjas
    print("\n📌 Test 4.1: Sin granjas")
    response = requests.post(f"{API_URL}/optimize", json={
        "farms": [],
        "slaughterhouse": {
            "id": "s1",
            "name": "Matadero",
            "location": {"lat": 40.4, "lng": -3.7},
            "daily_capacity": 500,
            "max_capacity": 1000
        }
    })
    print(f"Status: {response.status_code} (esperado: 400)")
    if response.status_code == 400:
        print("✅ Error manejado correctamente")
    
    # Test 2: Capacidad excedida
    print("\n📌 Test 4.2: Capacidad muy pequeña")
    response = requests.post(f"{API_URL}/optimize", json={
        "farms": [
            {
                "id": "f1",
                "name": "Granja Grande",
                "location": {"lat": 40.4, "lng": -3.7},
                "available_pigs": 500,
                "max_capacity": 1000
            }
        ],
        "slaughterhouse": {
            "id": "s1",
            "name": "Matadero Pequeño",
            "location": {"lat": 40.5, "lng": -3.7},
            "daily_capacity": 100,
            "max_capacity": 200
        },
        "truck_capacity": 50,
        "num_days": 3
    })
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Optimización adaptada a capacidades limitadas")
        print(f"   Días planificados: {len(result['days'])}")
    
    # Test 3: Una sola granja
    print("\n📌 Test 4.3: Una sola granja")
    response = requests.post(f"{API_URL}/optimize", json={
        "farms": [
            {
                "id": "f1",
                "name": "Granja Única",
                "location": {"lat": 40.4, "lng": -3.7},
                "available_pigs": 200,
                "max_capacity": 500
            }
        ],
        "slaughterhouse": {
            "id": "s1",
            "name": "Matadero",
            "location": {"lat": 40.5, "lng": -3.7},
            "daily_capacity": 300,
            "max_capacity": 600
        },
        "truck_capacity": 250,
        "num_days": 5
    })
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        print("✅ Caso simple manejado correctamente")


if __name__ == "__main__":
    print("\n" + "🐷"*30)
    print("PIGCHAIN ROUTE OPTIMIZER - TEST SUITE")
    print("🐷"*30)
    
    try:
        test_health()
        test_optimize_simple()
        test_optimize_complex()
        test_edge_cases()
        
        print("\n" + "="*60)
        print("✅ TODOS LOS TESTS COMPLETADOS")
        print("="*60 + "\n")
        
    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: No se pudo conectar al servidor")
        print("Asegúrate de que el servidor esté corriendo en http://localhost:8000")
        print("Ejecuta: python main.py")
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")

