import { Outlet } from 'react-router-dom'
import { BottomNav } from '@/components/BottomNav'
import { Sidebar } from '@/components/Sidebar'

/* Contenedor principal: sidebar en desktop, bottom nav en móvil */
export function AppLayout() {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Sidebar — solo desktop */}
      <Sidebar />

      {/* Contenido principal */}
      <main className="flex-1 md:ml-16 pb-14 md:pb-0">
        <Outlet />
      </main>

      {/* Bottom nav — solo móvil */}
      <BottomNav />
    </div>
  )
}
