// Mapa del local — el armado de los percheros del salón (ver sql/migrate-mapa-local.sql).
//
//   GET  ?recurso=mapa-local&store=zattia                       → { ok, mapa|null, actualizadoEn, actualizadoPor, puede }
//   POST { recurso:'mapa-local', store, action:'guardar', mapa, base }  → { ok, actualizadoEn }
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=mapa-local`. El plan Hobby
// de Vercel admite 12 funciones y hay 7 usadas.
//
// ⛔ **Acá no se ubica ninguna prenda.** Se guarda el ARMADO (qué tipos van en cada barra, alturas,
// cupos); dónde cae cada prenda se deriva en la pantalla con el stock del momento
// (`lib/mapa-local/core.ts`). Guardar el resultado lo dejaría viejo con la primera venta.
//
// 🔑 `mapa: null` en el GET = nadie lo guardó todavía ⇒ la pantalla muestra el mapa inicial del código.
import { createClient } from '@supabase/supabase-js'
import { exigirUsuario } from './_auth.js'
import { marcaDePermisos, puedeSub, puedeVerAlguna } from '../lib/permisos.core.js'
import { cfgDeMarca } from './_recepciones-base.js'
import { sanearMapa } from '../lib/mapa-local/validar.core.js'

/** PostgREST contesta 42P01 / PGRST205 cuando la tabla ⛔ no existe. */
const faltaLaTabla = (e) => e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find the table/i.test(e.message || ''))

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res)
  if (!perfil) return

  const store = String(req.query.store || (req.body && req.body.store) || '').toLowerCase()
  if (store !== 'zattia') return res.status(400).json({ error: 'El mapa del local es sólo de Zattia (store=zattia).' })

  // 🔴 `puedeVerAlguna` y ⛔ nunca `puedeVer` pelado: la `store` la elige el request.
  if (!puedeVerAlguna(perfil, store, ['mapa-local'])) {
    return res.status(403).json({ error: 'No tenés acceso al mapa del local.' })
  }
  const marca = marcaDePermisos(store)
  const editar = !!marca && puedeSub(perfil, marca, 'mapa-local', 'editar')

  const cfg = cfgDeMarca(store)
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase para zattia.' })
  const sb = createClient(cfg.url, cfg.key)

  try {
    if (req.method === 'GET') {
      const { data, error } = await sb.from('mapa_local').select('mapa, actualizado_en, actualizado_por').eq('store', store).maybeSingle()
      // 🔑 Sin la tabla (la migración todavía ⛔ no se corrió) el mapa se puede MIRAR igual, con el armado
      // inicial: es lectura de stock. Lo que ⛔ no se puede es guardar, y eso lo dice el POST.
      if (error && !faltaLaTabla(error)) throw new Error(error.message)
      return res.status(200).json({
        sinTabla: !!error,
        ok: true,
        mapa: (data && data.mapa) || null,
        actualizadoEn: (data && data.actualizado_en) || null,
        actualizadoPor: (data && data.actualizado_por) || null,
        puede: { editar },
      })
    }

    if (req.method === 'POST') {
      const b = req.body || {}
      if (b.action !== 'guardar') return res.status(400).json({ error: 'action inválida (usá guardar)' })
      if (!editar) return res.status(403).json({ error: 'No tenés permiso para editar el mapa del local.' })

      const s = sanearMapa(b.mapa)
      if (!s.ok) return res.status(400).json({ error: s.error })

      // 🔴 El candado: `base` es el `actualizado_en` que la pantalla leyó (null = leyó «nunca se
      // guardó»). Si cambió en el medio, otro guardó y ⛔ no se lo pisa: se contesta 409 y la pantalla
      // pide recargar. El mapa se reescribe entero, así que pisar es perder lo del otro sin aviso.
      const { data: actual, error: e1 } = await sb.from('mapa_local').select('actualizado_en').eq('store', store).maybeSingle()
      if (e1 && faltaLaTabla(e1)) return res.status(503).json({ error: 'Falta crear la tabla del mapa en la base (sql/migrate-mapa-local.sql). Hasta entonces se puede mirar, no guardar.' })
      if (e1) throw new Error(e1.message)
      const base = b.base || null
      const hoy = (actual && actual.actualizado_en) || null
      if (hoy !== base && !(hoy && base && Date.parse(hoy) === Date.parse(base))) {
        return res.status(409).json({ error: 'Alguien guardó el mapa mientras lo editabas. Recargá para ver su versión.' })
      }

      const fila = { store, mapa: s.mapa, actualizado_en: new Date().toISOString(), actualizado_por: perfil.name || null }
      const { error: e2 } = await sb.from('mapa_local').upsert(fila, { onConflict: 'store' })
      if (e2) throw new Error(e2.message)
      return res.status(200).json({ ok: true, actualizadoEn: fila.actualizado_en, actualizadoPor: fila.actualizado_por })
    }

    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) })
  }
}
