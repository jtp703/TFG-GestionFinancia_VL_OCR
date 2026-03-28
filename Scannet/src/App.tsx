import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Login } from '@/pages/Login'
import { Registro } from '@/pages/Registro'
import { Onboarding } from '@/pages/Onboarding'
import { Home } from '@/pages/Home'
import { Scan } from '@/pages/Scan'
import { Cuenta } from '@/pages/Cuenta'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/AppLayout'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rutas públicas — sin layout */}
        <Route path="/login"      element={<Login />} />
        <Route path="/registro"   element={<Registro />} />
        <Route path="/onboarding" element={<Onboarding />} />

        {/* Rutas protegidas — con AppLayout (nav + sidebar) */}
        <Route element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }>
          <Route path="/"       element={<Home />} />
          <Route path="/scan"   element={<Scan />} />
          <Route path="/cuenta" element={<Cuenta />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
