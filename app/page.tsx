// Placeholder de la Fase 2: sirve para verificar si Vercel detecta Next.
// Si esta página aparece en la preview, el framework preset está en auto-detect.
// El shell real (login, sidebar, router) llega en la Fase 3.
export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 40, lineHeight: 1.6 }}>
      <h1 style={{ margin: 0 }}>Next detectado ✓</h1>
      <p style={{ color: '#6B7280' }}>
        Sonda de la Fase 2. Vercel buildeó Next en este deployment.
      </p>
      <p>
        La app actual sigue viva en{' '}
        <a href="/legacy/index.html">/legacy/index.html</a>.
      </p>
    </main>
  )
}
