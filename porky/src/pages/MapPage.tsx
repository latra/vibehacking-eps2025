import GoogleMap from '../components/GoogleMap'

function MapPage() {
  return (
    <section className="space-y-6">
      <header className="text-center">
        <p className="text-sm font-bold uppercase tracking-wider text-[#6b8e23]">
          Red de Distribución
        </p>
        <h1 className="mt-2 text-3xl font-bold text-[#3d3d3d] sm:text-4xl">
          Pigchain Logistics Network
        </h1>
        <p className="mt-3 text-base text-[#5a5a5a] sm:text-lg">
          Visualiza las granjas y mataderos conectados en toda la región
        </p>
      </header>

      <div className="relative overflow-hidden rounded-lg border-4 border-[#8b7355] bg-white shadow-lg">
        <div className="border-b-2 border-[#ddd] bg-[#f5deb3] px-4 py-3 text-sm font-bold uppercase tracking-wider text-[#3d3d3d] sm:px-6">
          📍 Mapa de Ubicaciones
        </div>
        <div className="relative h-[420px] sm:h-[520px]">
          <GoogleMap className="absolute inset-0" />
        </div>
      </div>
    </section>
  )
}

export default MapPage


