/**
 * Las dos escrituras del CRM que releen el KV antes de guardar.
 *
 * 🔴 **POR QUÉ EXISTE ESTE ARCHIVO, Y NO ES ORGANIZACIÓN.** `crm:seg:bdi` y `crm:leads:bdi` se
 * guardan **enteras** en cada POST (ver `lib/kv/cliente.ts`). Cualquier pantalla que arme el mapa
 * nuevo sobre una copia que bajó hace rato no guarda su cambio: **reescribe las 773 fichas con su
 * foto vieja**, y todo lo que otra pantalla escribió mientras tanto desaparece sin un error, sin
 * un aviso y sin backup más allá del dump diario.
 *
 * Vivían en `panel.ts` porque el panel fue el primero en necesitarlas —queda abierto horas al
 * costado de WhatsApp— y se pensó el problema en una sola dirección: que el panel no pisara a la
 * sección. **La dirección inversa quedó abierta y se pagó.**
 *
 * ## Lo que pasó el 27-ago-2026, que es la razón de este archivo
 *
 * Se marcaron 327 clientes como 🧊 fríos a las 14:50. A las 16:30 no quedaba ninguno. Entre esas
 * dos horas, alguien atendió **3 o 4 clientes** desde la pestaña del CRM: notas nuevas, fechas de
 * recontacto, un Instagram. Trabajo legítimo, guardado bien. Pero esa pestaña estaba abierta desde
 * antes de las 14:50, así que cada guardado posteó el mapa entero **de antes** de las
 * temperaturas.
 *
 * **Cuatro guardados correctos borraron 327 marcas.** Reconstruido comparando ocho dumps
 * consecutivos; la ventana se acotó porque esa foto ya tenía los 43 descartados (escritos ~13:50)
 * y todavía no las temperaturas.
 *
 * 🔑 **El patrón es el arreglo, no un detalle de implementación.** `patch` recibe el mapa **recién
 * leído** y devuelve el nuevo. Se pasa como función y no como objeto ya armado por exactamente la
 * misma razón por la que se relee: si el llamador arma el mapa con su copia vieja, releer no sirve
 * de nada. Una firma que aceptara el mapa ya hecho volvería a abrir el agujero, y se vería igual
 * de bien.
 *
 * ⚠️ Si la lectura falla NO se escribe. Es la regla de `lib/kv/cliente.ts`: un GET que falló deja
 * el mapa en `{}`, y `{}` es un objeto que pasa la guarda del servidor y borra la clave entera.
 * Releer cuesta ~100 ms.
 */

import { guardarMapa, leerMapa } from '../kv/cliente'
import type { MapaLeads } from './leads'
import type { MapaSeguimiento } from './tipos'

export type GuardadoSeg = { ok: true; mapa: MapaSeguimiento } | { ok: false; motivo: string }

/**
 * Guarda un cambio de seguimiento releyendo el mapa primero.
 *
 * La usan **las dos** pantallas que tocan `crm:seg:bdi`: el panel de WhatsApp
 * (`PanelWhatsApp.tsx`) y la sección Clientes (`useCRM.guardarSeg`). Que las dos pasen por acá es
 * lo que cierra la ventana en las dos direcciones.
 */
export async function guardarConRelectura(
  patch: (mapa: MapaSeguimiento) => MapaSeguimiento,
): Promise<GuardadoSeg> {
  const previo = await leerMapa<MapaSeguimiento[string]>('crmseg', 'bdi')
  if (!previo.ok) return { ok: false, motivo: previo.motivo }
  const mapa = patch(previo.dato)
  const r = await guardarMapa({ kind: 'crmseg', store: 'bdi', mapa, cargado: true })
  return r.ok ? { ok: true, mapa } : { ok: false, motivo: r.motivo }
}

export type GuardadoLeads = { ok: true; mapa: MapaLeads } | { ok: false; motivo: string }

/**
 * Lo mismo para los leads, y por el mismo motivo: `crm:leads:bdi` también se reescribe entera.
 *
 * El panel queda abierto horas mientras la pestaña de Leads, en el CRM, toca la misma clave. Sin
 * la relectura, poner una fecha desde WhatsApp a la tarde pisaría todo lo que se cargó a la mañana.
 */
export async function guardarLeadsConRelectura(
  patch: (mapa: MapaLeads) => MapaLeads,
): Promise<GuardadoLeads> {
  const previo = await leerMapa<MapaLeads[string]>('crmleads', 'bdi')
  if (!previo.ok) return { ok: false, motivo: previo.motivo }
  const mapa = patch(previo.dato)
  const r = await guardarMapa({ kind: 'crmleads', store: 'bdi', mapa, cargado: true })
  return r.ok ? { ok: true, mapa } : { ok: false, motivo: r.motivo }
}
