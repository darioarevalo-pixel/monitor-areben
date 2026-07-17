import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async rewrites() {
    // `beforeFiles` corre ANTES del filesystem routing: sin esto, cualquier
    // app/page.tsx ganaría en `/` y la app quedaría tapada.
    // Mientras el shell no exista, `/` sirve el legacy y el usuario no ve
    // ninguna diferencia. Se elimina cuando la Fase 3 traiga el shell real.
    return {
      beforeFiles: [{ source: '/', destination: '/legacy/index.html' }],
      afterFiles: [],
      fallback: [],
    }
  },
}

export default nextConfig
