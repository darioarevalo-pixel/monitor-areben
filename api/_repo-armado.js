// Reposición — el ARMADO con el lector y la transferencia en Gestión Nube (sql/migrate-repo-armado.sql).
//
//   GET  ?recurso=repo-armado&store=zattia&action=hoy&linea=zattia&sentido=llevar → el armado de hoy (o null)
//   GET  ?recurso=repo-armado&store=zattia&action=historial&linea=zattia&limit=60   → los últimos armados, del más nuevo
//   POST ?recurso=repo-armado  { action: 'abrir'|'guardar'|'cancelar'|'transferir'|'resolver', store, … }
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` (12 funciones en Hobby).
// ⛔ Sólo Zattia: BDI sigue con la transferencia a mano.
//
// 🔑 La ficha es `docs/secciones/reposicion.md`. Lo que no se adivina:
// - **La transferencia sale al final y sólo con lo escaneado** (`armado.core.js`). Lo que no se
//   encontró no se mueve, y GN es atómico: si un renglón falla, no mueve ninguno (422).
// - 🔴 **Nunca dos transferencias del mismo armado.** Antes de llamar a GN la fila pasa de
//   `en_curso` a `transfiriendo` con un update condicionado: el segundo clic (o la segunda compu)
//   no encuentra la fila en `en_curso` y no llama. Y ⛔ **el POST a GN no se reintenta** salvo en
//   429 (ahí GN no hizo nada): un 500 o un corte de red pueden haberla hecho igual. En esos casos la
//   fila queda en `revisar` y la pantalla dice que hay que mirarla en GN antes de tocar nada.
import { createClient } from '@supabase/supabase-js'
import { exigirUsuario } from './_auth.js'
import { puedeVerAlguna } from '../lib/permisos.core.js'
import { cfgDeMarca } from './_recepciones-base.js'
import { GN_BASE, GN_TOKENS, dormir } from './_gn.js'
import {
  SENTIDOS,
  fechaAR,
  itemsTransferencia,
  resumenArmado,
  sanearEscaneos,
  sanearFaltantes,
  sanearPedido,
} from '../lib/reposicion/armado.core.js'

/**
 * Los depósitos de Gestión Nube, por id (`GET /inventario` los trae como `store_id`). Medidos el
 * 11-oct-2026 con la transferencia de prueba (7741/7742). ⚠️ En Zattia el depósito se llama
 * `Deposito ` con un espacio al final: por eso va por id y no por nombre.
 */
const DEPOSITOS_GN = { zattia: { deposito: 18210, local: 11780 } }

const LINEAS = ['zattia', 'stunned']
const ABIERTOS = ['en_curso', 'transfiriendo', 'revisar']

/** Lo que la pantalla necesita de una fila (todo menos lo que no usa). */
const COLUMNAS = 'id, store, linea, sentido, fecha, persona, estado, pedido, escaneos, faltantes, transfer, error, creado_en, actualizado_en, cerrado_en'

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res)
  if (!perfil) return

  const b = req.body || {}
  const store = String(req.query.store || b.store || '').toLowerCase()
  const accion = String(req.query.action || b.action || '')
  if (store !== 'zattia') return res.status(400).json({ error: 'El armado con el lector es sólo de Zattia.' })
  // 🔴 `puedeVerAlguna` y ⛔ nunca `puedeVer` pelado: la `store` la elige el request.
  if (!puedeVerAlguna(perfil, store, ['reposicion'])) return res.status(403).json({ error: 'No tenés acceso a Reposición.' })

  const cfg = cfgDeMarca(store)
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` })
  const sb = createClient(cfg.url, cfg.key)

  const leer = async (id) => {
    if (!id) return null
    const { data, error } = await sb.from('repo_armado').select(COLUMNAS).eq('id', id).eq('store', store).maybeSingle()
    if (error) throw new Error(error.message)
    return data || null
  }

  try {
    if (req.method === 'GET') {
      if (accion === 'historial') {
        // El historial (Darío, 12-oct-2026): un renglón por armado, sin los descartados.
        const linea = LINEAS.includes(req.query.linea) ? req.query.linea : 'zattia'
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 60, 1), 200)
        const { data, error } = await sb
          .from('repo_armado')
          .select(COLUMNAS)
          .eq('store', store)
          .eq('linea', linea)
          .neq('estado', 'cancelado')
          .order('creado_en', { ascending: false })
          .limit(limit)
        if (error) throw new Error(error.message)
        return res.status(200).json({ ok: true, armados: data || [] })
      }
      if (accion !== 'hoy') return res.status(400).json({ error: 'action inválida (usá hoy o historial)' })
      const linea = LINEAS.includes(req.query.linea) ? req.query.linea : 'zattia'
      const sentido = SENTIDOS.includes(req.query.sentido) ? req.query.sentido : 'llevar'
      // Primero uno abierto (de cualquier día: uno que quedó de ayer sin cerrar tiene que verse), y
      // si no hay, el último de hoy que no se canceló.
      const base = () => sb.from('repo_armado').select(COLUMNAS).eq('store', store).eq('linea', linea).eq('sentido', sentido)
      const abierto = await base().in('estado', ABIERTOS).order('creado_en', { ascending: false }).limit(1)
      if (abierto.error) throw new Error(abierto.error.message)
      if (abierto.data && abierto.data[0]) return res.status(200).json({ ok: true, armado: abierto.data[0] })
      const hoy = await base().eq('fecha', fechaAR()).neq('estado', 'cancelado').order('creado_en', { ascending: false }).limit(1)
      if (hoy.error) throw new Error(hoy.error.message)
      return res.status(200).json({ ok: true, armado: (hoy.data && hoy.data[0]) || null })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' })

    if (accion === 'abrir') {
      const id = String(b.id || '').trim()
      const linea = LINEAS.includes(b.linea) ? b.linea : null
      const sentido = SENTIDOS.includes(b.sentido) ? b.sentido : null
      if (!id || !linea || !sentido) return res.status(400).json({ error: 'faltan id, línea o sentido' })
      const pedido = sanearPedido(b.pedido)
      if (!pedido.length) return res.status(400).json({ error: 'No hay prendas para reponer.' })
      const row = { id, store, linea, sentido, fecha: fechaAR(), persona: perfil.name || null, estado: 'en_curso', pedido }
      const { error } = await sb.from('repo_armado').insert(row)
      if (error) {
        // El índice de «uno abierto por lista»: ya hay uno. Se devuelve ése, para seguirlo.
        if (error.code === '23505') {
          const { data } = await sb.from('repo_armado').select(COLUMNAS).eq('store', store).eq('linea', linea).eq('sentido', sentido).in('estado', ABIERTOS).limit(1)
          if (data && data[0]) return res.status(200).json({ ok: true, armado: data[0], yaHabia: true })
        }
        throw new Error(error.message)
      }
      return res.status(200).json({ ok: true, armado: await leer(id) })
    }

    const armado = await leer(String(b.id || ''))
    if (!armado) return res.status(404).json({ error: 'Ese armado no está.' })

    if (accion === 'guardar') {
      if (armado.estado !== 'en_curso') return res.status(409).json({ error: 'Este armado ya se cerró.', armado })
      const cambios = {
        escaneos: sanearEscaneos(b.escaneos, armado.pedido),
        faltantes: sanearFaltantes(b.faltantes, armado.pedido),
        actualizado_en: new Date().toISOString(),
      }
      const { error } = await sb.from('repo_armado').update(cambios).eq('id', armado.id).eq('estado', 'en_curso')
      if (error) throw new Error(error.message)
      return res.status(200).json({ ok: true })
    }

    if (accion === 'cancelar') {
      if (armado.estado !== 'en_curso') return res.status(409).json({ error: 'Sólo se puede descartar un armado en curso.', armado })
      const { error } = await sb.from('repo_armado').update({ estado: 'cancelado', cerrado_en: new Date().toISOString() }).eq('id', armado.id).eq('estado', 'en_curso')
      if (error) throw new Error(error.message)
      return res.status(200).json({ ok: true })
    }

    if (accion === 'transferir') return await transferir(sb, res, armado, b, perfil)

    if (accion === 'resolver') {
      // Después de un `revisar`: alguien miró en GN y dice si la transferencia está o no. Si está,
      // el armado se cierra; si no, vuelve a `en_curso` para transferir de nuevo.
      if (armado.estado !== 'revisar') return res.status(409).json({ error: 'Este armado no está para revisar.', armado })
      const hecha = b.hecha === true
      const cambios = hecha
        ? { estado: 'transferido', cerrado_en: new Date().toISOString(), error: null, transfer: { ...(armado.transfer || {}), revisadaPor: perfil.name || null, transfer_id: String(b.transfer_id || '').trim() || null } }
        : { estado: 'en_curso', error: null }
      const { error } = await sb.from('repo_armado').update({ ...cambios, actualizado_en: new Date().toISOString() }).eq('id', armado.id).eq('estado', 'revisar')
      if (error) throw new Error(error.message)
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'action inválida (usá abrir, guardar, cancelar, transferir o resolver)' })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}

async function transferir(sb, res, armado, b, perfil) {
  if (armado.estado !== 'en_curso') return res.status(409).json({ error: 'Este armado ya se cerró.', armado })
  const token = GN_TOKENS[armado.store]
  const dep = DEPOSITOS_GN[armado.store]
  if (!token || !dep) return res.status(500).json({ error: 'Falta la clave de Gestión Nube de Zattia en el servidor.' })

  const escaneos = sanearEscaneos(b.escaneos, armado.pedido)
  const faltantes = sanearFaltantes(b.faltantes, armado.pedido)
  const items = itemsTransferencia(armado.pedido, escaneos)
  if (!items.length) return res.status(400).json({ error: 'No hay prendas escaneadas.' })

  // 🔴 El candado: de `en_curso` a `transfiriendo` en UN update condicionado. Si otro clic llegó
  // primero, acá no vuelve ninguna fila y no se llama a GN.
  const ahora = new Date().toISOString()
  const tomado = await sb
    .from('repo_armado')
    .update({ estado: 'transfiriendo', escaneos, faltantes, actualizado_en: ahora })
    .eq('id', armado.id)
    .eq('estado', 'en_curso')
    .select('id')
  if (tomado.error) throw new Error(tomado.error.message)
  if (!tomado.data || !tomado.data.length) return res.status(409).json({ error: 'Este armado ya se está transfiriendo.' })

  const [desde, hacia] = armado.sentido === 'devolver' ? [dep.local, dep.deposito] : [dep.deposito, dep.local]
  const r = resumenArmado(armado.pedido, escaneos)
  const body = {
    from_store_id: desde,
    to_store_id: hacia,
    date: fechaAR(),
    description: `Reposición ${armado.linea === 'stunned' ? 'Stunned ' : ''}${armado.fecha} · ${perfil.name || armado.persona || ''} · Monitor (${r.escaneadas} u)`.slice(0, 250),
    items: items.map((x) => x.item),
  }

  const marcar = (cambios) => sb.from('repo_armado').update({ ...cambios, actualizado_en: new Date().toISOString() }).eq('id', armado.id)

  let resp
  let datos = null
  try {
    // Sólo el 429 se reintenta: GN avisa que no hizo nada. Cualquier otra cosa puede haberla hecho.
    for (let intento = 1; intento <= 3; intento++) {
      resp = await fetch(`${GN_BASE}/inventario/transferencia`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (resp.status !== 429 || intento === 3) break
      await dormir(Math.min(Math.max(Number(resp.headers.get('retry-after')) || 5, 2), 10) * 1000)
    }
    datos = await resp.json().catch(() => null)
  } catch (e) {
    await marcar({ estado: 'revisar', error: `Se cortó la conexión con Gestión Nube: ${e instanceof Error ? e.message : e}` })
    return res.status(502).json({ error: 'Sin respuesta de Gestión Nube. Verificá si la transferencia figura antes de seguir.', estado: 'revisar' })
  }

  if (resp.ok && datos && (datos.executed === true || datos.transfer_id)) {
    const transfer = { transfer_id: datos.transfer_id ?? null, movement_id: datos.movement_id ?? null, unidades: r.escaneadas, items: body.items }
    await marcar({ estado: 'transferido', transfer, error: null, cerrado_en: new Date().toISOString() })
    return res.status(200).json({ ok: true, transfer })
  }

  if (resp.status === 422 && datos && Array.isArray(datos.items)) {
    // Atómica: no movió nada. Se vuelve a `en_curso` con los renglones rechazados, para sacarlos.
    const rechazados = []
    datos.items.forEach((it, i) => {
      if (it && it.status === 'error' && items[i]) rechazados.push({ vid: items[i].vid, reason: it.reason || null })
    })
    await marcar({ estado: 'en_curso', error: null })
    return res.status(422).json({ error: 'Gestión Nube rechazó estas prendas. No se transfirió nada.', rechazados })
  }

  if (resp.status === 429) {
    await marcar({ estado: 'en_curso', error: null })
    return res.status(429).json({ error: 'Gestión Nube está ocupado. No se transfirió nada: reintentá en un minuto.' })
  }

  if (resp.status === 401 || resp.status === 403) {
    await marcar({ estado: 'en_curso', error: null })
    return res.status(502).json({ error: 'Sin permiso para transferir en Gestión Nube. No se transfirió nada.' })
  }

  const msg = (datos && (datos.message || datos.error)) || `HTTP ${resp.status}`
  await marcar({ estado: 'revisar', error: `Respuesta inesperada de Gestión Nube: ${String(msg).slice(0, 300)}` })
  return res.status(502).json({ error: 'Respuesta inesperada de Gestión Nube. Verificá si la transferencia figura antes de seguir.', estado: 'revisar' })
}
