import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Login } from '@/pages/Login'
import { Registro } from '@/pages/Registro'
import { Onboarding } from '@/pages/Onboarding'
import { ProtectedRoute } from '@/components/ProtectedRoute'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rutas públicas */}
        <Route path="/login"      element={<Login />} />
        <Route path="/registro"   element={<Registro />} />
        <Route path="/onboarding" element={<Onboarding />} />

        {/* Rutas protegidas — se añadirán en Fase 4 */}
        <Route path="/" element={
          <ProtectedRoute>
            <div style={{ color: 'var(--text-primary)', padding: '2rem' }}>
              App — en construcción
            </div>
          </ProtectedRoute>
        } />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
