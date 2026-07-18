/**
 * Fallback mientras se descarga el chunk de una sección (lazy con next/dynamic).
 * Se ve un instante al entrar por primera vez a cada sección; después el chunk
 * queda cacheado por el navegador.
 */
export function Cargando() {
  return <div style={{ padding: 24, color: '#9CA3AF', fontSize: 13 }}>Cargando…</div>
}
