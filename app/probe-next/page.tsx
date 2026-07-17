// Sonda de la Fase 2. Sirve para saber, desde afuera y sin el panel, si Vercel
// buildeó Next en un deployment: si /probe-next responde 200, buildeó; si da
// 404, el preset volvió a "Other". `/` no pasa por acá: lo reescribe
// next.config al legacy. Borrable cuando el shell de la Fase 3 esté en pie.
export default function ProbeNext() {
  return <pre>next-ok</pre>
}
