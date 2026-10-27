// Mapa de locales del CRM — los locales de Google Maps que todavía no compran (ver
// sql/migrate-prospectos.sql y docs/secciones/crm.md § «Mapa»).
//
//   GET  ?recurso=prospectos                                   → { ok, locales, eventos, tandas, sinTabla?, sinTandas? }
//   POST { recurso:'prospectos', action:'contacto', id, medio }                → { ok, local, evento }
//   POST { recurso:'prospectos', action:'estado', id, estado, lead_id?, texto? } → { ok, local, evento }
//   POST { recurso:'prospectos', action:'nota', id, texto }                    → { ok, local, evento }
//   POST { recurso:'prospectos', action:'tanda', nombre, ids }                 → { ok, tanda, locales }
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=prospectos`.
//
// 🔑 Cada toque es una FILA de `prospecto_evento` y ⛔ nunca se reescribe: es el historial, y de ahí
// sale la estadística por medio. El local guarda sólo el resumen (estado, último contacto) para
// pintar el mapa sin recorrer los eventos.
//
// 🔴 El lead NO se crea acá. Vive en el KV (`crm:leads:bdi`), que se escribe con relectura desde el
// navegador (`lib/crm/persistencia.ts`); acá sólo se ata su id. Crearlo de este lado sería una
// segunda forma de escribir esa clave sin la relectura, que es la que ya borró datos.
import { createClient } from '@supabase/supabase-js'
import { exigirUsuario } from './_auth.js'
import { puedeVerAlguna } from '../lib/permisos.core.js'
import { cfgDelMonitor } from './_recepciones-base.js'
import { estadoTrasContacto, validarAccion } from '../lib/crm/prospectos.core.js'

/** PostgREST contesta 42P01 / PGRST205 cuando la tabla ⛔ no existe. */
const faltaLaTabla = (e) => e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find the table/i.test(e.message || ''))

const SIN_TABLA = 'Falta crear las tablas del mapa en la base (sql/migrate-prospectos.sql).'

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res)
  if (!perfil) return

  // El CRM es bdi-only por esquema: mismo gate que `api/_crm.js`.
  if (!puedeVerAlguna(perfil, 'bdi', ['clientes'])) {
    return res.status(403).json({ error: 'No tenés acceso al CRM.' })
  }

  const cfg = cfgDelMonitor()
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' })
  const sb = createClient(cfg.url, cfg.key)

  try {
    if (req.method === 'GET') {
      const { data: locales, error } = await sb.from('prospecto_local').select('*').order('nombre').limit(5000)
      if (error && faltaLaTabla(error)) return res.status(200).json({ ok: true, sinTabla: true, locales: [], eventos: [] })
      if (error) throw new Error(error.message)
      const { data: eventos, error: e2 } = await sb.from('prospecto_evento').select('*').order('en', { ascending: false }).limit(10000)
      if (e2) throw new Error(e2.message)
      // Las tandas son de la parte 2 (sql/migrate-prospectos-tandas.sql): sin su tabla, el mapa anda igual.
      const { data: tandas, error: e3 } = await sb.from('prospecto_tanda').select('*').order('creada_en', { ascending: false })
      if (e3 && !faltaLaTabla(e3)) throw new Error(e3.message)
      return res.status(200).json({ ok: true, locales: locales || [], eventos: eventos || [], tandas: tandas || [], sinTandas: !!e3 })
    }

    if (req.method === 'POST') {
      const v = validarAccion(req.body || {})
      if (!v.ok) return res.status(400).json({ error: v.error })
      const a = v.accion
      if (a.action === 'tanda') return crearTanda(sb, a, perfil, res)

      const { data: actual, error: e1 } = await sb.from('prospecto_local').select('id, estado').eq('id', a.id).maybeSingle()
      if (e1 && faltaLaTabla(e1)) return res.status(503).json({ error: SIN_TABLA })
      if (e1) throw new Error(e1.message)
      if (!actual) return res.status(404).json({ error: 'Ese local no está en el mapa.' })

      const ahora = new Date().toISOString()
      const por = perfil.name || null
      let evento
      let cambio = { actualizado_en: ahora }
      if (a.action === 'contacto') {
        evento = { local_id: a.id, en: ahora, tipo: 'contacto', medio: a.medio, por }
        cambio = { ...cambio, estado: estadoTrasContacto(actual.estado), ultimo_contacto: ahora, ultimo_medio: a.medio }
      } else if (a.action === 'estado') {
        evento = { local_id: a.id, en: ahora, tipo: 'estado', estado: a.estado, texto: a.texto, por }
        cambio = { ...cambio, estado: a.estado }
        if (a.lead_id) cambio.lead_id = a.lead_id
      } else {
        evento = { local_id: a.id, en: ahora, tipo: 'nota', texto: a.texto, por }
      }

      // 🔑 El evento va PRIMERO: si se cae el segundo paso, el historial dice lo que pasó y el
      // resumen queda viejo (se ve y se corrige con otro toque). Al revés, el mapa mostraría un
      // estado que el historial no explica.
      const { data: ev, error: e3 } = await sb.from('prospecto_evento').insert(evento).select('*').single()
      if (e3) throw new Error(e3.message)
      const { data: local, error: e4 } = await sb.from('prospecto_local').update(cambio).eq('id', a.id).select('*').single()
      if (e4) throw new Error(e4.message)
      return res.status(200).json({ ok: true, local, evento: ev })
    }

    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) })
  }
}

/**
 * Arma la tanda y le asigna los locales. 🔑 El filtro va EN EL UPDATE (sin contactar y sin tanda),
 * no sólo en la pantalla: si dos personas arman tandas a la vez, un local no queda en las dos —
 * el segundo se lo saltea. Lo que vuelve es lo que de verdad entró.
 */
async function crearTanda(sb, a, perfil, res) {
  const { data: tanda, error: e1 } = await sb.from('prospecto_tanda').insert({ nombre: a.nombre, por: perfil.name || null }).select('*').single()
  if (e1 && faltaLaTabla(e1)) return res.status(503).json({ error: 'Falta crear la tabla de tandas en la base (sql/migrate-prospectos-tandas.sql).' })
  if (e1) throw new Error(e1.message)
  const { data: locales, error: e2 } = await sb
    .from('prospecto_local')
    .update({ tanda_id: tanda.id, actualizado_en: new Date().toISOString() })
    .in('id', a.ids)
    .eq('estado', 'sin_contactar')
    .is('tanda_id', null)
    .select('*')
  if (e2) throw new Error(e2.message)
  return res.status(200).json({ ok: true, tanda, locales: locales || [] })
}
