/**
 * La Biblioteca de anuncios: cómo se convierten las filas diarias de la foto en **un renglón por
 * aviso**, y qué días entran según el rango elegido.
 *
 * # Qué problema resuelve
 *
 * Los creativos se veían campaña por campaña y a demanda: había que entrar a Campañas, desplegar
 * una fila y recién ahí aparecían sus avisos. Nunca se veían todos juntos, así que la pregunta
 * «¿cuál de todas las piezas que hicimos funcionó mejor?» no tenía dónde hacerse.
 *
 * # De dónde sale cada cosa, y por qué no de un solo lado
 *
 * 🔑 **Los números salen de la foto diaria y el estado sale de Meta.** No es una inconsistencia: la
 * foto escribe la configuración (`estado`, `diario_crudo`) **sólo en la fila del día en que se
 * sacó** —Meta no expone la configuración hacia atrás—, así que en una ventana que no incluya hoy
 * no hay ni un estado guardado. Leerlo igual daría «pausado» para todo, que es peor que no saber.
 *
 * Es `.js` plano porque lo importa `api/_meta-biblioteca.js`, que corre en Node sin pasar por el
 * compilador de Next. `lib/meta-ads/biblioteca.ts` es el re-export tipado, y ahí viven además el
 * orden y los filtros, que son de la pantalla.
 */

import { isoDia, sumarDias } from './snapshot.core.js'

/**
 * Los rangos de la pantalla traducidos a días de la foto.
 *
 * ⚠️ **`last_7d` y compañía NO incluyen hoy**, y eso es de Meta, no una decisión de acá: sus
 * `date_preset` relativos terminan ayer. Si esta ventana incluyera hoy, el gasto de la Biblioteca no
 * cerraría con el de Rendimiento sobre el mismo rango, y nadie sabría cuál de los dos está mal.
 */
export function ventanaDe(rango, hoy = new Date()) {
  const dia = (n) => {
    const d = new Date(hoy)
    d.setDate(d.getDate() + n)
    return isoDia(d)
  }
  const relativos = { last_7d: 7, last_14d: 14, last_30d: 30, last_90d: 90 }
  if (relativos[rango]) return { desde: dia(-relativos[rango]), hasta: dia(-1) }
  if (rango === 'today') return { desde: dia(0), hasta: dia(0) }
  if (rango === 'yesterday') return { desde: dia(-1), hasta: dia(-1) }
  if (rango === 'hoy_ayer') return { desde: dia(-1), hasta: dia(0) }
  if (rango === 'this_month') {
    return { desde: `${isoDia(hoy).slice(0, 7)}-01`, hasta: dia(0) }
  }
  if (rango === 'last_month') {
    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
    return { desde: `${isoDia(fin).slice(0, 7)}-01`, hasta: isoDia(fin) }
  }
  // `maximum` es todo lo que haya en la foto. No es «todo el historial de Meta»: la foto arrancó el
  // 11-may-2026 y el nivel aviso el 21-may. La pantalla lo dice con la fecha real de la respuesta,
  // que sale de los datos y no de una constante que envejece.
  return { desde: null, hasta: dia(0) }
}

/**
 * Una fila por aviso, con sus métricas sumadas y sus fechas.
 *
 * Los ratios los recalcula `sumarDias()` desde los agregados —no se promedian— y devuelve
 * `alcance`/`frecuencia` en `null` a propósito, porque son deduplicados dentro del período que se le
 * pidió a Meta y sumarlos entre días infla el número sin que se note. La Biblioteca no los muestra.
 *
 * 🔑 **`diasConGasto` no es `dias`.** `dias` cuenta las filas que hay —un aviso puede tener fila con
 * gasto cero— y `diasConGasto` cuenta los días que de verdad entregó. Es la diferencia entre «este
 * aviso lleva 40 días» y «este aviso entregó 3 días»: el segundo número es el que dice si el ROAS
 * que está al lado se puede creer.
 */
export function agruparAvisos(filas) {
  const porAviso = new Map()
  for (const f of Array.isArray(filas) ? filas : []) {
    if (!f || !f.objeto_id) continue
    const id = String(f.objeto_id)
    if (!porAviso.has(id)) porAviso.set(id, [])
    porAviso.get(id).push(f)
  }

  const salida = []
  for (const [id, suyas] of porAviso) {
    // De más vieja a más nueva: el nombre y los padres se toman de la ÚLTIMA que los traiga. Un
    // aviso renombrado tiene el nombre viejo en sus filas viejas, y el que sirve para buscarlo hoy
    // es el nuevo. (La foto guarda el nombre del día a propósito: ver el SQL.)
    suyas.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    const ultimoCon = (campo) => {
      for (let i = suyas.length - 1; i >= 0; i--) if (suyas[i][campo] != null && suyas[i][campo] !== '') return suyas[i][campo]
      return null
    }
    const t = sumarDias(suyas)
    const conGasto = suyas.filter((f) => Number(f.spend) > 0)
    salida.push({
      id,
      nombre: ultimoCon('nombre'),
      linea: ultimoCon('linea'),
      cuentaId: ultimoCon('cuenta_id'),
      campaignId: ultimoCon('campaign_id'),
      adsetId: ultimoCon('adset_id'),
      spend: t.spend,
      impresiones: t.impresiones,
      clicks: t.clicks,
      compras: t.compras,
      revenue: t.revenue,
      ctr: t.ctr,
      cpc: t.cpc,
      cpm: t.cpm,
      roas: t.roas,
      // El costo por compra. Sin compras va en `null` y no en 0: un CPA de 0 se lee como gratis, y
      // lo que pasó es que no hubo ninguna.
      cpa: t.compras ? t.spend / t.compras : null,
      dias: t.dias,
      diasConGasto: conGasto.length,
      primera: suyas[0].fecha,
      ultima: suyas[suyas.length - 1].fecha,
      // El último día en que gastó: es lo que contesta «¿esto sigue vivo?» sin depender del estado.
      ultimaConGasto: conGasto.length ? conGasto[conGasto.length - 1].fecha : null,
    })
  }
  return salida.sort((a, b) => b.spend - a.spend)
}
