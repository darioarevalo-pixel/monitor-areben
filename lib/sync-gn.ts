/**
 * Dispara el sync rápido de stock en el servidor de GN y espera a que termine.
 * Port del núcleo compartido por dispararSyncInv (index.html:10588) y cadActualizarGN
 * (12477): toma el run de referencia, hace el POST y hace polling (~cada 8s, hasta 7
 * min) hasta ver un run nuevo `completed`. Devuelve `true` si terminó BIEN, `false` si se
 * agotó el tiempo, y TIRA si el sync terminó en falla — los cinco llamadores lo agarran y
 * muestran el error en rojo. NO recarga datos: eso lo decide cada llamador (uno recarga el
 * store, otro sus propios fetches).
 *
 * Sólo DISPARA el sync de la plataforma; no escribe stock ni ventas.
 *
 * Va con `apiFetch` para mandar la credencial del Monitor: el endpoint de bdi-catalogo dispara
 * workflows de GitHub Actions con un token de la empresa, y estaba abierto — cualquiera podía
 * pedirlos a repetición.
 */
import { apiFetch } from './api-fetch'
import type { Marca } from './nav'

const SYNC_API = 'https://bdi-catalogo.vercel.app/api/sync'

export async function dispararSyncStock(marca: Marca, setLabel: (t: string) => void): Promise<boolean> {
  // Run de referencia para detectar cuándo arranca uno nuevo.
  let baseId: string | null = null
  try {
    const r0 = await apiFetch(`${SYNC_API}?store=${marca}&nc=${Math.random()}`)
    const d0 = await r0.json()
    baseId = d0.run ? d0.run.id : null
  } catch {
    /* seguimos sin baseId */
  }

  setLabel('⏳ Pidiendo a GN…')
  const r = await apiFetch(SYNC_API, {
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
    let run: { id: string; status: string; conclusion: string | null } | null = null
    try {
      const rr = await apiFetch(`${SYNC_API}?store=${marca}&nc=${secs}`)
      const dd = await rr.json()
      run = dd.run ?? null
    } catch {
      /* falla de red mirando el estado: se reintenta en la próxima vuelta */
    }
    if (run && run.id !== baseId && run.status === 'completed') {
      // `status: 'completed'` sólo dice que el run TERMINÓ, no que haya salido bien. Mirar sólo
      // eso es lo que el 12-ago-2026 dejó a Reposición mostrando el stock del día anterior con el
      // botón en verde: GN cortó por límite de solicitudes, el sync murió a mitad de camino sin
      // escribir una fila (baja el inventario entero a memoria y recién al final lo guarda), y acá
      // se lo daba por hecho. El corte ya se aguanta en los scripts (`scripts/lib/gn-rate-limit.mjs`),
      // pero eso no arregla el aviso: cualquier otra falla del sync se seguía viendo como éxito.
      if (run.conclusion !== 'success') {
        throw new Error(
          `la sincronización con Gestión Nube falló (${run.conclusion || 'sin resultado'}). ` +
            'Lo que ves sigue siendo lo de la última sincronización buena.',
        )
      }
      return true
    }
  }
  return false
}
