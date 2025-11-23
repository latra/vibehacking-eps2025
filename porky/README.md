# 🐷 PigChain - Frontend

Sistema de optimización de rutas para recolección de cerdos. Aplicación web construida con React + TypeScript + Vite.

## 🚀 Inicio Rápido

### Prerrequisitos

- Node.js 16+ 
- npm o pnpm
- Backend de PigChain corriendo en `http://localhost:8000`

### Instalación

```bash
npm install
```

### Configuración

1. Crea un archivo `.env` en la raíz del proyecto (copia de `.env.example` si existe):

```env
# Backend API URL
VITE_BACKEND_URL=http://localhost:8000

# Google Maps API Key
VITE_GOOGLE_MAPS_API_KEY=tu_clave_de_google_maps
```

2. Asegúrate de que el backend esté corriendo antes de iniciar el frontend.

### Desarrollo

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

### Build para Producción

```bash
npm run build
```

## 📋 Funcionalidades

### Vista Granja (Farmer View)
- Gestión de granjas y lotes de cerdos
- Seguimiento de consumo de pienso
- Proyección de peso por semana
- Calendario de envío óptimo

### Vista Matadero (Slaughter View)
- Visualización de granjas conectadas
- Recomendaciones de recogida óptima
- **Optimización de rutas**: Conecta con el backend para calcular rutas óptimas de recolección

### Mapa Interactivo
- Registro de ubicaciones de granjas y mataderos
- Visualización de rutas óptimas
- Cálculo de distancias y tiempos

## 🔧 Stack Técnico

- **Framework**: React 18
- **Lenguaje**: TypeScript
- **Build Tool**: Vite
- **Routing**: React Router
- **Maps**: Google Maps API
- **Styling**: Tailwind CSS

## 🔌 Integración con Backend

El frontend se comunica con el backend a través del endpoint `/optimize`:

```typescript
POST http://localhost:8000/optimize

{
  "farms": [...],
  "slaughterhouse": {...},
  "truck_capacity": 250,
  "num_days": 14,
  ...
}
```

El backend responde con un plan de optimización que incluye:
- Rutas por día
- Asignación de camiones
- Secuencia de paradas
- Métricas económicas

---

## Información Técnica (React + Vite)

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
