import { NavLink } from 'react-router-dom'

function Navbar() {
  return (
    <nav className="w-full bg-white border-b-4 border-[#6b8e23] shadow-md">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <NavLink to="/" className="flex items-center gap-3 group">
          <img
            src="/pigchain.png"
            alt="Pigchain Logistics"
            className="h-12 w-auto"
          />
          <div className="leading-tight">
            <p className="text-xs font-bold uppercase tracking-wider text-[#6b8e23]">
              Pigchain
            </p>
            <p className="text-xl font-bold tracking-tight text-[#8b7355]">
              Logistics
            </p>
          </div>
        </NavLink>

        <div className="hidden items-center gap-8 text-base font-semibold text-[#5a5a5a] md:flex">
          <NavLink
            to="/map"
            className={({ isActive }) =>
              `pb-1 border-b-3 transition-all ${
                isActive 
                  ? 'text-[#6b8e23] border-[#6b8e23]' 
                  : 'border-transparent hover:text-[#6b8e23] hover:border-[#9cb369]'
              }`
            }
          >
            Mapa
          </NavLink>
          <NavLink
            to="/farmer"
            className={({ isActive }) =>
              `pb-1 border-b-3 transition-all ${
                isActive 
                  ? 'text-[#6b8e23] border-[#6b8e23]' 
                  : 'border-transparent hover:text-[#6b8e23] hover:border-[#9cb369]'
              }`
            }
          >
            Vista Granja
          </NavLink>
          <NavLink
            to="/slaughter"
            className={({ isActive }) =>
              `pb-1 border-b-3 transition-all ${
                isActive 
                  ? 'text-[#6b8e23] border-[#6b8e23]' 
                  : 'border-transparent hover:text-[#6b8e23] hover:border-[#9cb369]'
              }`
            }
          >
            Vista Matadero
          </NavLink>
        </div>
      </div>
    </nav>
  )
}

export default Navbar