/**
 * Dispara el sync rápido de stock en el servidor de GN y espera a que termine.
 * Port del núcleo compartido por dispararSyncInv (index.html:10588) y cadActualizarGN
 * (12477): toma el run de referencia, hace el POST y hace polling (~cada 8s, hasta 7
 * min) hasta ver un run nuevo `completed`. Devuelve `true` si terminó, `false` si se
 * agotó el tiempo. NO recarga datos: eso lo decide cada llamador (uno recarga el
 * store, otro sus propios fetches).
 *
 * Sólo DISPARA el sync de la plataforma; no escribe stock ni ventas.
 */
import type { Marca } from './nav'

const SYNC_API = 'https://bdi-catalogo.vercel.app/api/sync'

export async function dispararSyncStock(marca: Marca, setLabel: (t: string) => void): Promise<boolean> {
  // Run de referencia para detectar cuándo arranca uno nuevo.
  let baseId: string | null = null
  try {
    const r0 = await fetch(`${SYNC_API}?store=${marca}&nc=${Math.random()}`)
    const d0 = await r0.json()
    baseId = d0.run ? d0.run.id : null
  } catch {
    /* seguimos sin baseId */
  }

  setLabel('⏳ Pidiendo a GN…')
  const r = await fetch(SYNC_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store: marca }),
  })
  const d = await r.json()
  if (!d.ok) {
    throw new Error((d.error || 'No se pudo iniciar la actualización.') + (d.detalle ? '\n' + d.detalle : ''))
  }

  const t0 = Date.now()
  const MAX = 7 * 60 * 1000
  while (Date.now() - t0 < MAX) {
    await new Promise((res) => setTimeout(res, 8000))
    const secs = Math.round((Date.now() - t0) / 1000)
    setLabel(`⏳ Actualizando… ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`)
    try {
      const rr = await fetch(`${SYNC_API}?store=${marca}&nc=${secs}`)
      const dd = await rr.json()
      if (dd.run && dd.run.id !== baseId && dd.run.status === 'completed') return true
    } catch {
      /* reintenta */
    }
  }
  return false
}
