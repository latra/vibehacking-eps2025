import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import Navbar from './components/navbar'
import MapPage from './pages/MapPage'
import FarmerPage from './pages/FarmerPage'
import SlaughterPage from './pages/SlaughterPage'
import RouteSummaryPage from './pages/RouteSummaryPage'

function App() {
  return (
    <div className="min-h-screen bg-[#f9f6f1]">
      <Navbar />

      <main className="mx-auto flex max-w-6xl flex-col gap-16 px-4 py-10 sm:px-6 lg:px-8">
        <Routes>
          <Route path="/" element={<Navigate to="/map" replace />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/farmer" element={<FarmerPage />} />
          <Route path="/slaughter" element={<SlaughterPage />} />
          <Route path="/slaughter/summary" element={<RouteSummaryPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
