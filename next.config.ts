import type { NextConfig } from 'next'

// La reescritura `/ → /legacy/index.html` (Fase 2/3) se removió el 20-jul-2026:
// la migración a Next está completa y el shell sirve la raíz. Con la reescritura,
// entrar a la raíz seguía cayendo en la app vieja (y una pestaña vieja podía
// pisar el conteo en progreso guardado en localStorage). Ahora `/` la sirve la
// catch-all `app/[[...seccion]]/page.tsx` (abre la sección por defecto).
const nextConfig: NextConfig = {}

export default nextConfig
