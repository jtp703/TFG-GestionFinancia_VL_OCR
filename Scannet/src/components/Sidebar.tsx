import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  {
    to: '/',
    label: 'Gastos',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  {
    to: '/scan',
    label: 'Escanear',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
        <rect x="7" y="7" width="10" height="10" rx="1" />
      </svg>
    ),
  },
  {
    to: '/cuenta',
    label: 'Cuenta',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
]

/** Barra de navegación lateral — solo visible en desktop (hidden md:flex). Ancho fijo 64px. */
export function Sidebar() {
  return (
    <aside
      className="hidden md:flex flex-col items-center py-6 gap-6 fixed top-0 left-0 bottom-0 z-50"
      style={{
        width: '64px',
        backgroundColor: 'var(--surface)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {NAV_ITEMS.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          title={label}
          className="flex items-center justify-center w-10 h-10 rounded-xl"
          style={({ isActive }) => ({
            color: isActive ? 'var(--color-brand)' : 'var(--text-muted)',
            backgroundColor: isActive ? 'var(--color-brand-light)' : 'transparent',
          })}
        >
          {icon}
        </NavLink>
      ))}
    </aside>
  )
}
