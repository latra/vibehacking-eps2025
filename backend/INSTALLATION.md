# 🚀 Guía de Instalación Rápida

## Opción 1: Instalación Local con Python

### Paso 1: Instalar Python
Asegúrate de tener Python 3.9+ instalado:
```bash
python --version
```

### Paso 2: Crear entorno virtual
```bash
cd agrocerdos/backend
python -m venv venv
```

### Paso 3: Activar entorno virtual

**En macOS/Linux:**
```bash
source venv/bin/activate
```

**En Windows:**
```bash
venv\Scripts\activate
```

### Paso 4: Instalar dependencias
```bash
pip install -r requirements.txt
```

### Paso 5: Ejecutar servidor
```bash
python main.py
```

El servidor estará disponible en: http://localhost:8000

### Paso 6: Verificar instalación
Abre en tu navegador:
- http://localhost:8000 (página de bienvenida)
- http://localhost:8000/docs (documentación interactiva)

---

## Opción 2: Instalación con Docker

### Prerrequisitos
- Docker instalado
- Docker Compose instalado

### Paso 1: Construir y ejecutar
```bash
cd agrocerdos/backend
docker-compose up -d
```

### Paso 2: Ver logs
```bash
docker-compose logs -f
```

### Paso 3: Detener
```bash
docker-compose down
```

---

## Probar la API

### Opción A: Desde el navegador
Ve a http://localhost:8000/docs y prueba los endpoints interactivamente.

### Opción B: Con el script de prueba
```bash
python test_api.py
```

### Opción C: Con curl
```bash
curl http://localhost:8000/health
```

---

## Solución de Problemas

### Error: "ModuleNotFoundError: No module named 'fastapi'"
**Solución:** Asegúrate de tener el entorno virtual activado y las dependencias instaladas:
```bash
source venv/bin/activate  # o venv\Scripts\activate en Windows
pip install -r requirements.txt
```

### Error: "Address already in use"
**Solución:** El puerto 8000 está ocupado. Cambia el puerto en `main.py`:
```python
uvicorn.run(app, host="0.0.0.0", port=8001)  # Cambiar a 8001
```

### Error: OR-Tools no se instala
**Solución:** Actualiza pip e intenta nuevamente:
```bash
pip install --upgrade pip
pip install ortools==9.8.3296
```

---

## Próximos Pasos

1. ✅ Servidor corriendo
2. 🔧 Integrar con el frontend (ver `INTEGRATION.md`)
3. 📊 Probar con datos reales
4. 🚀 Desplegar en producción

