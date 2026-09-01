// "Lo que entró" — lectura de las recepciones de órdenes de compra (ver sql/migrate-recepciones.sql).
//
//   GET ?recurso=recepciones&store=bdi|zattia[&dias=90]  → { ok, recepciones, eventos }
//   GET ?recurso=recepciones&store=…&oc=<store:oc_id>    → { ok, recepcion, lineas }
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=recepciones`. El plan
// Hobby de Vercel admite 12 funciones y hay 7 usadas.
//
// 🔑 **Sólo lee.** Lo único que escribe estas tablas es el webhook, y vive en OTRO archivo
// (`_oc-webhook.js`) porque aquél no pide sesión y éste sí. Un verbo abierto no convive con verbos
// con login en el mismo archivo.
import { createClient } from '@supabase/supabase-js'
import { exigirUsuario } from './_auth.js'
import { esAdmin, marcaDePermisos, puedeSub, puedeVerAlguna } from '../lib/permisos.core.js'
import { cfgDelMonitor, cfgDeMarca } from './_recepciones-base.js'

const PARA_VER = ['recepciones']
/** El sub que destapa de quién vino cada orden. Sin él, la sección contesta todo menos eso. */
const SUB_PROVEEDORES = 'proveedores'

/**
 * Le saca a la fila de quién vino.
 *
 * 🔴 **Va acá, en el servidor, y ⛔ no en la pantalla.** Esconder la columna en el componente deja
 * el nombre viajando en la respuesta: se lee abriendo la pestaña de red del navegador, que es un
 * gesto que hace cualquiera. Un dato que no se puede ver es un dato que no se manda. Es la misma
 * regla que en `_reclamos.js` con la plata.
 *
 * ⚠️ Se borra también `proveedor_id`: el id solo ya agrupa las órdenes por proveedor, y de ahí a
 * ponerle nombre hay un paso —el que compra los conoce—. Además, dejarlo haría que el agregado
 * "Por proveedor" de la pantalla siguiera armando filas, con el nombre vacío.
 */
const sinProveedor = (fila) => {
  const { proveedor_id: _id, proveedor_nombre: _nombre, ...resto } = fila
  return resto
}
/** Techo de la lista. 500 OCs son más de un año de importaciones; la ventana la pone `dias`. */
const TOPE = 500

/**
 * Vuelve a cruzar los renglones contra el espejo de GN **hoy**.
 *
 * 🔑 Por qué se rehace si ya está guardado: `en_gn` es la foto del momento en que llegó la OC, y el
 * caso normal de una importación es que el producto **todavía no esté** en Gestión Nube — se da de
 * alta después. Sin este segundo cruce, la lista de "falta darlo de alta" nunca se vaciaría y en
 * una semana nadie la miraría más.
 *
 * Devuelve `null` si no se pudo preguntar, que ⛔ no es lo mismo que "ninguno está".
 */
async function cruceDeHoy(store, lineas) {
  const cfg = cfgDeMarca(store)
  if (!cfg.url || !cfg.key) return null
  const skus = [...new Set(lineas.map((l) => l.sku).filter(Boolean))]
  if (!skus.length) return null
  try {
    const sb = createClient(cfg.url, cfg.key)
    const encontrados = new Map()
    for (let i = 0; i < skus.length; i += 200) {
      const { data, error } = await sb.from('inventario').select('sku, product_id').in('sku', skus.slice(i, i + 200))
      if (error) throw new Error(error.message)
      for (const f of data || []) if (f.sku) encontrados.set(String(f.sku), String(f.product_id ?? ''))
    }
    return encontrados
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res)
  if (!perfil) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'método no permitido' })

  const store = String(req.query.store || '').toLowerCase()
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' })
  if (!puedeVerAlguna(perfil, store, PARA_VER)) {
    return res.status(403).json({ error: 'No tenés acceso a las recepciones de esta marca.' })
  }

  // 🔑 El admin lo ve siempre; el resto sólo con el sub tildado a mano. Un sub ⛔ NUNCA lo trae la
  // función, así que "es de compras" no alcanza — ver `puedeSub` en `lib/permisos.core.js`.
  const verProveedores = esAdmin(perfil) || puedeSub(perfil, marcaDePermisos(store), 'recepciones', SUB_PROVEEDORES)

  const cfg = cfgDelMonitor()
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' })
  const sb = createClient(cfg.url, cfg.key)

  try {
    const oc = String(req.query.oc || '')
    if (oc) {
      const { data: cab, error: eCab } = await sb.from('recepcion_oc').select('*').eq('id', oc).maybeSingle()
      if (eCab) throw new Error(eCab.message)
      if (!cab) return res.status(404).json({ error: 'esa orden no está.' })
      // Se compara con el `store` de la fila y no se confía en el del query: el id lleva la marca
      // adentro, así que sin esto un `oc=zattia:42` con `store=bdi` mostraría la otra marca.
      if (cab.store !== store) return res.status(403).json({ error: 'esa orden no es de esta marca.' })

      const { data: lineas, error: eLin } = await sb.from('recepcion_linea').select('*').eq('oc_ref', oc).order('orden')
      if (eLin) throw new Error(eLin.message)

      const hoy = await cruceDeHoy(store, lineas || [])
      const conCruce = (lineas || []).map((l) => ({
        ...l,
        // Tres estados, no dos: está / no está / no se pudo preguntar.
        en_gn_hoy: hoy ? hoy.has(String(l.sku || '')) : null,
        producto_id_hoy: hoy ? hoy.get(String(l.sku || '')) || null : null,
      }))
      return res.status(200).json({
        ok: true,
        recepcion: verProveedores ? cab : sinProveedor(cab),
        lineas: conCruce,
        espejo_consultado: Boolean(hoy),
        // Viaja el permiso y ⛔ no se deduce de que el campo venga vacío: hay órdenes que de verdad
        // llegaron sin proveedor, y la pantalla tiene que decir cosas distintas en cada caso.
        puede: { proveedores: verProveedores },
      })
    }

    const dias = Math.min(Math.max(Number(req.query.dias) || 180, 1), 730)
    const desde = new Date(Date.now() - dias * 86400000).toISOString()
    const { data, error } = await sb
      .from('recepcion_oc')
      .select('*')
      .eq('store', store)
      .gte('recibido_en', desde)
      // 🔑 Ordena por CUÁNDO SE CONFIRMÓ, desempata por cuándo la agarramos.
      //
      // ⛔ `recibido_en` solo no sirve de orden: el día que se prendió el envío entraron las 79 del
      // historial **en el mismo minuto**, así que ordenar por eso dejaba una OC de junio arriba de
      // una de agosto según el azar del backfill.
      //
      // ⚠️ Y el FILTRO sigue siendo por `recibido_en` a propósito: si filtrara por `confirmada_at`,
      // una OC que llegara sin ese campo quedaría fuera de la lista —`gte` descarta los nulos— y
      // desaparecer es peor que ordenarse mal. `nullsFirst: false` la manda al final, no arriba.
      .order('confirmada_at', { ascending: false, nullsFirst: false })
      .order('recibido_en', { ascending: false })
      .limit(TOPE)
    if (error) throw new Error(error.message)

    // Los eventos que quedaron en `error` viajan aparte y siempre: son los que llegaron firmados y
    // no se pudieron procesar. Si no se muestran, la lista se ve completa y no lo está — que es
    // exactamente el modo de falla que un receptor de webhooks no puede tener.
    const { data: rotos, error: eRotos } = await sb
      .from('recepcion_evento')
      .select('webhook_id, tipo, store, oc_id, error, recibido_en')
      .eq('estado', 'error')
      .order('recibido_en', { ascending: false })
      .limit(20)
    if (eRotos) throw new Error(eRotos.message)

    const { data: ultimo } = await sb
      .from('recepcion_evento')
      .select('recibido_en')
      .order('recibido_en', { ascending: false })
      .limit(1)

    return res.status(200).json({
      ok: true,
      recepciones: verProveedores ? data || [] : (data || []).map(sinProveedor),
      puede: { proveedores: verProveedores },
      // 🔑 `rotos` no se filtra por marca: un evento que no se pudo procesar puede no tener marca
      // todavía —el error puede ser justamente que no se entendió de quién era—.
      eventos: { rotos: rotos || [], ultimo: (ultimo && ultimo[0] && ultimo[0].recibido_en) || null },
    })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message })
  }
}
