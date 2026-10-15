// Reposición — el ARMADO con el lector y la transferencia en Gestión Nube (sql/migrate-repo-armado.sql).
//
//   GET  ?recurso=repo-armado&store=zattia&action=hoy&linea=zattia&sentido=llevar → el armado de hoy (o null)
//   GET  ?recurso=repo-armado&store=zattia&action=historial&linea=zattia&limit=60   → los últimos armados, del más nuevo
//   GET  ?recurso=repo-armado&store=zattia&action=confirmados&linea=zattia                → la solicitud de devolución sin enviar (o null)
//   POST ?recurso=repo-armado  { action: 'abrir'|'guardar'|'cancelar'|'transferir'|'resolver'|'confirmados'|'enviar', store, … }
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` (12 funciones en Hobby).
// Zattia (con su línea Stunned) desde el 11-oct-2026 y BDI desde el 12-oct: cada uno en su base.
//
// 🔑 La ficha es `docs/secciones/reposicion.md`. Lo que no se adivina:
// - **La transferencia sale al final y sólo con lo escaneado** (`armado.core.js`). Lo que no se
//   encontró no se mueve, y GN es atómico: si un renglón falla, no mueve ninguno (422).
// - 🔑 **La devolución es una SOLICITUD** (Darío, 15-oct-2026): Darío o Bruno confirman qué vuelve
//   (`borrador`) y la envían (`enviar`); recién ahí el local la ve y la arma. El borrador vive en esta
//   misma tabla con estado `borrador`: ⛔ no cuenta como armado en ningún lado.
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
  SIN_ENVIAR,
  SENTIDOS,
  esAprobador,
  codigoArmado,
  trabado,
  fechaAR,
  itemsTransferencia,
  sanearEscaneos,
  sanearFaltantes,
  sanearPedido,
  conTransferido,
  depositosDelArmado,
  pendienteDeTransferir,
  sumar,
  transferidoDe,
} from '../lib/reposicion/armado.core.js'

/**
 * Los depósitos de Gestión Nube, por id (`GET /inventario` los trae como `store_id`). Medidos el
 * 11-oct-2026 con la transferencia de prueba (7741/7742). ⚠️ En Zattia el depósito se llama
 * `Deposito ` con un espacio al final: por eso va por id y no por nombre.
 */
const DEPOSITOS_GN = {
  zattia: { deposito: 18210, local: 11780 },
  // BDI: «Deposito Minorista» → «Local». El «Deposito Mayorista» no entra en la reposición.
  bdi: { deposito: 13307, local: 18393 },
}

/** Las líneas de cada base: Stunned vive en la de Zattia (`docs/lineas.md`). */
const LINEAS_DE = { zattia: ['zattia', 'stunned'], bdi: ['bdi'] }

/**
 * 🔴 Lo máximo que se le espera a Gestión Nube, con reintentos de 429 incluidos. El servidor entero
 * se corta a los 30 s (`maxDuration` de `api/datos.js`): si GN se lo comiera todo, el armado quedaba
 * en `transfiriendo` sin que nadie lo marcara (revisión del 12-oct-2026). Con 20 s queda tiempo para
 * anotar `revisar` en la base.
 */
const PLAZO_GN_MS = 20_000
const ABIERTOS = ['en_curso', 'transfiriendo', 'revisar']

/** Lo que la pantalla necesita de una fila (todo menos lo que no usa). */
const COLUMNAS = 'id, store, linea, sentido, fecha, persona, estado, pedido, escaneos, faltantes, transfer, error, creado_en, actualizado_en, cerrado_en'

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res)
  if (!perfil) return

  const b = req.body || {}
  const store = String(req.query.store || b.store || '').toLowerCase()
  const accion = String(req.query.action || b.action || '')
  if (!LINEAS_DE[store]) return res.status(400).json({ error: 'store inválida (bdi o zattia)' })
  const LINEAS = LINEAS_DE[store]
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
        const linea = LINEAS.includes(req.query.linea) ? req.query.linea : LINEAS[0]
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 60, 1), 200)
        const { data, error } = await sb
          .from('repo_armado')
          .select(COLUMNAS)
          .eq('store', store)
          .eq('linea', linea)
          .not('estado', 'in', `(cancelado,${SIN_ENVIAR})`)
          .order('creado_en', { ascending: false })
          .limit(limit)
        if (error) throw new Error(error.message)
        return res.status(200).json({ ok: true, armados: data || [] })
      }
      if (accion === 'confirmados') {
        const linea = LINEAS.includes(req.query.linea) ? req.query.linea : LINEAS[0]
        const { data, error } = await sb.from('repo_armado').select(COLUMNAS).eq('store', store).eq('linea', linea).eq('sentido', 'devolver').eq('estado', SIN_ENVIAR).order('creado_en', { ascending: false }).limit(1)
        if (error) throw new Error(error.message)
        return res.status(200).json({ ok: true, borrador: (data && data[0]) || null })
      }
      if (accion !== 'hoy') return res.status(400).json({ error: 'action inválida (usá hoy, historial o borrador)' })
      const linea = LINEAS.includes(req.query.linea) ? req.query.linea : LINEAS[0]
      const sentido = SENTIDOS.includes(req.query.sentido) ? req.query.sentido : 'llevar'
      // Primero uno abierto (de cualquier día: uno que quedó de ayer sin cerrar tiene que verse), y
      // si no hay, el último de hoy que no se canceló.
      const base = () => sb.from('repo_armado').select(COLUMNAS).eq('store', store).eq('linea', linea).eq('sentido', sentido)
      const abierto = await base().in('estado', ABIERTOS).order('creado_en', { ascending: false }).limit(1)
      if (abierto.error) throw new Error(abierto.error.message)
      if (abierto.data && abierto.data[0]) return res.status(200).json({ ok: true, armado: abierto.data[0] })
      const hoy = await base().eq('fecha', fechaAR()).not('estado', 'in', `(cancelado,${SIN_ENVIAR})`).order('creado_en', { ascending: false }).limit(1)
      if (hoy.error) throw new Error(hoy.error.message)
      return res.status(200).json({ ok: true, armado: (hoy.data && hoy.data[0]) || null })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' })

    if (accion === 'abrir') {
      const id = String(b.id || '').trim()
      const linea = LINEAS.includes(b.linea) ? b.linea : null
      const sentido = SENTIDOS.includes(b.sentido) ? b.sentido : null
      if (!id || !linea || !sentido) return res.status(400).json({ error: 'faltan id, línea o sentido' })
      // La devolución se arma sólo desde una solicitud enviada (`enviar`), nunca de una lista suelta.
      if (sentido === 'devolver') return res.status(400).json({ error: 'La devolución se arma desde una solicitud.' })
      const pedido = sanearPedido(b.pedido)
      if (!pedido.length) return res.status(400).json({ error: 'La lista está vacía.' })
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

    if (accion === 'confirmados') {
      // Guardar lo confirmado (entero: el último guardado gana). Vacío = se descarta.
      if (!esAprobador(perfil)) return res.status(403).json({ error: 'La devolución la deciden Darío o Bruno.' })
      const linea = LINEAS.includes(b.linea) ? b.linea : null
      if (!linea) return res.status(400).json({ error: 'falta la línea' })
      const pedido = sanearPedido(b.pedido)
      const prev = await sb.from('repo_armado').select('id').eq('store', store).eq('linea', linea).eq('sentido', 'devolver').eq('estado', SIN_ENVIAR).limit(1)
      if (prev.error) throw new Error(prev.error.message)
      const ahora = new Date().toISOString()
      const previo = prev.data && prev.data[0]
      if (!pedido.length) {
        if (previo) {
          const { error } = await sb.from('repo_armado').update({ estado: 'cancelado', cerrado_en: ahora, actualizado_en: ahora }).eq('id', previo.id).eq('estado', SIN_ENVIAR)
          if (error) throw new Error(error.message)
        }
        return res.status(200).json({ ok: true, borrador: null })
      }
      if (previo) {
        const { error } = await sb.from('repo_armado').update({ pedido, actualizado_en: ahora }).eq('id', previo.id).eq('estado', SIN_ENVIAR)
        if (error) throw new Error(error.message)
        return res.status(200).json({ ok: true, borrador: await leer(previo.id) })
      }
      const id = String(b.id || '').trim()
      if (!id) return res.status(400).json({ error: 'falta el id' })
      const { error } = await sb.from('repo_armado').insert({ id, store, linea, sentido: 'devolver', fecha: fechaAR(), persona: null, estado: SIN_ENVIAR, pedido })
      if (error) throw new Error(error.message)
      return res.status(200).json({ ok: true, borrador: await leer(id) })
    }

    const armado = await leer(String(b.id || ''))
    if (!armado) return res.status(404).json({ error: 'Ese armado no está.' })

    if (accion === 'enviar') {
      // La solicitud pasa al local: desde acá es un armado de devolución como cualquiera.
      if (!esAprobador(perfil)) return res.status(403).json({ error: 'La devolución la deciden Darío o Bruno.' })
      if (armado.estado !== SIN_ENVIAR) return res.status(409).json({ error: 'Esta solicitud ya se envió.' })
      const ahora = new Date().toISOString()
      const { data, error } = await sb
        .from('repo_armado')
        .update({ estado: 'en_curso', fecha: fechaAR(), creado_en: ahora, actualizado_en: ahora, persona: null, transfer: { solicitud: { por: perfil.name || null, hora: ahora } } })
        .eq('id', armado.id)
        .eq('estado', SIN_ENVIAR)
        .select('id')
      if (error) {
        // 🔴 Uno abierto por lista: el local todavía no terminó la solicitud anterior.
        if (error.code === '23505') return res.status(409).json({ error: 'El local todavía no terminó la solicitud anterior. Esta queda guardada para enviarla después.' })
        throw new Error(error.message)
      }
      if (!data || !data.length) return res.status(409).json({ error: 'Esta solicitud ya se envió.' })
      return res.status(200).json({ ok: true, armado: await leer(armado.id) })
    }

    if (accion === 'guardar') {
      if (armado.estado !== 'en_curso') return res.status(409).json({ error: 'Este armado ya se cerró.', armado })
      const cambios = {
        // Lo ya transferido en una tanda anterior no puede volver atrás (ya está en el otro depósito).
        escaneos: conTransferido(sanearEscaneos(b.escaneos, armado.pedido), transferidoDe(armado.transfer)),
        faltantes: sanearFaltantes(b.faltantes, armado.pedido),
        actualizado_en: new Date().toISOString(),
        // Una solicitud enviada nace sin persona: es quien la arma en el local.
        ...(armado.persona ? {} : { persona: perfil.name || null }),
      }
      const { error } = await sb.from('repo_armado').update(cambios).eq('id', armado.id).eq('estado', 'en_curso')
      if (error) throw new Error(error.message)
      return res.status(200).json({ ok: true })
    }

    if (accion === 'cancelar') {
      if (armado.estado !== 'en_curso') return res.status(409).json({ error: 'Sólo se puede descartar un armado en curso.', armado })
      // Con tandas ya transferidas, esas prendas cambiaron de depósito: descartarlo las escondería del historial.
      if (Object.keys(transferidoDe(armado.transfer)).length) return res.status(409).json({ error: 'Ya hay prendas transferidas: finalizá el armado.' })
      const { error } = await sb.from('repo_armado').update({ estado: 'cancelado', cerrado_en: new Date().toISOString() }).eq('id', armado.id).eq('estado', 'en_curso')
      if (error) throw new Error(error.message)
      return res.status(200).json({ ok: true })
    }

    if (accion === 'transferir') return await transferir(sb, res, armado, b, perfil)

    if (accion === 'resolver') {
      // Después de un `revisar`: alguien miró en GN y dice si la transferencia está o no. Si está,
      // la tanda que quedó en el aire (`enCurso`) se da por hecha; si no, vuelve a `en_curso` para
      // transferir de nuevo. Si esa tanda era un «Transferir y continuar», el armado sigue abierto.
      // 🔑 Uno TRABADO en `transfiriendo` (el servidor se cortó o no pudo anotar la respuesta de GN) se
      // resuelve igual: nadie lo está transfiriendo y no se sabe si salió.
      if (armado.estado !== 'revisar' && !trabado(armado)) return res.status(409).json({ error: 'Este armado no está para revisar.', armado })
      const hecha = b.hecha === true
      const t = armado.transfer || {}
      const enCurso = t.enCurso || {}
      // 🔑 La tanda guarda QUÉ prendas movió y de dónde a dónde: el libro de stock la lee prenda por prenda.
      const [desdeR, haciaR] = DEPOSITOS_GN[armado.store] ? depositosDelArmado(armado.sentido, DEPOSITOS_GN[armado.store]) : [null, null]
      const tandaRevisada = { transfer_id: String(b.transfer_id || '').trim() || null, unidades: Object.values(enCurso).reduce((x, n) => x + n, 0), hora: new Date().toISOString(), revisadaPor: perfil.name || null, prendas: enCurso, desde: desdeR, hacia: haciaR }
      const transferHecha = { ...t, enCurso: null, seguir: null, descripcion: null, unidadesEnCurso: null, transferido: sumar(transferidoDe(t), enCurso), tandas: [...(t.tandas || []), tandaRevisada] }
      transferHecha.unidades = Object.values(transferHecha.transferido).reduce((x, n) => x + n, 0)
      const cambios = hecha
        ? t.seguir
          ? { estado: 'en_curso', error: null, transfer: transferHecha }
          : { estado: 'transferido', cerrado_en: new Date().toISOString(), error: null, transfer: transferHecha }
        : { estado: 'en_curso', error: null, transfer: { ...t, enCurso: null, seguir: null, descripcion: null, unidadesEnCurso: null } }
      const { error } = await sb.from('repo_armado').update({ ...cambios, actualizado_en: new Date().toISOString() }).eq('id', armado.id).eq('estado', armado.estado)
      if (error) throw new Error(error.message)
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'action inválida (usá abrir, guardar, cancelar, transferir o resolver)' })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}

/**
 * Transfiere lo escaneado que todavía no pasó. Con `seguir` («Transferir y continuar», la limpieza
 * grande: Darío, 12-oct-2026) el armado queda abierto para la próxima tanda del carro; sin `seguir`,
 * se cierra. Lo ya transferido vive en `transfer.transferido` y cada tanda en `transfer.tandas`:
 * 🔴 una prenda nunca viaja dos veces, porque cada tanda manda sólo la diferencia.
 */
async function transferir(sb, res, armado, b, perfil) {
  if (armado.estado !== 'en_curso') return res.status(409).json({ error: 'Este armado ya se cerró.', armado })
  const token = GN_TOKENS[armado.store]
  const dep = DEPOSITOS_GN[armado.store]
  if (!token || !dep) return res.status(500).json({ error: `Falta la clave de Gestión Nube de ${armado.store === 'bdi' ? 'BDI' : 'Zattia'} en el servidor.` })

  const seguir = b.seguir === true
  const previo = armado.transfer || {}
  const transferido = transferidoDe(previo)
  const escaneos = conTransferido(sanearEscaneos(b.escaneos, armado.pedido), transferido)
  const faltantes = sanearFaltantes(b.faltantes, armado.pedido)
  const pendiente = pendienteDeTransferir(escaneos, transferido)
  const items = itemsTransferencia(armado.pedido, pendiente)
  const ahora = new Date().toISOString()

  if (!items.length) {
    // Todo lo escaneado ya pasó en tandas anteriores: cerrar no llama a GN.
    // «Transferir y continuar» sin nada nuevo, con tandas hechas: la respuesta de la tanda anterior se
    // perdió (internet) y la pantalla reintenta. No hay nada que mandar: se le devuelve cómo está.
    if (seguir && (previo.tandas || []).length) return res.status(200).json({ ok: true, transfer: previo, tanda: null })
    if (!seguir && (previo.tandas || []).length) {
      const { error } = await sb.from('repo_armado').update({ estado: 'transferido', escaneos, faltantes, cerrado_en: ahora, actualizado_en: ahora }).eq('id', armado.id).eq('estado', 'en_curso')
      if (error) throw new Error(error.message)
      return res.status(200).json({ ok: true, transfer: previo, tanda: null })
    }
    return res.status(400).json({ error: 'No hay nada escaneado para transferir.' })
  }
  const unidades = Object.values(pendiente).reduce((x, n) => x + n, 0)

  const devolucion = armado.sentido === 'devolver'
  const [desde, hacia] = depositosDelArmado(armado.sentido, dep)
  // 🔑 El código del armado (#K3X9AB) va en la descripción: es lo que se busca en GN cuando la
  // transferencia queda sin confirmar, y lo que muestra el cartel de la pantalla.
  const description = `${devolucion ? 'Devolución' : 'Reposición'} ${armado.linea === 'stunned' ? 'Stunned ' : ''}${armado.fecha} · ${perfil.name || armado.persona || ''} · Monitor #${codigoArmado(armado.id)} (${unidades} u)`.slice(0, 250)
  const body = { from_store_id: desde, to_store_id: hacia, date: fechaAR(), description, items: items.map((x) => x.item) }

  // 🔴 El candado: de `en_curso` a `transfiriendo` en UN update condicionado. Si otro clic llegó
  // primero, acá no vuelve ninguna fila y no se llama a GN. Lo que va en esta tanda queda anotado
  // (`enCurso`) por si GN no contesta y hay que resolverlo a mano.
  const tomado = await sb
    .from('repo_armado')
    .update({ estado: 'transfiriendo', escaneos, faltantes, transfer: { ...previo, enCurso: pendiente, seguir, descripcion: description, unidadesEnCurso: unidades }, actualizado_en: ahora })
    .eq('id', armado.id)
    .eq('estado', 'en_curso')
    .select('id')
  if (tomado.error) throw new Error(tomado.error.message)
  if (!tomado.data || !tomado.data.length) return res.status(409).json({ error: 'Este armado ya se está transfiriendo.' })

  // 🔴 Anotar cómo salió, con dos reintentos: si la base no contesta, el armado queda en
  // `transfiriendo` y a los 90 s se puede resolver desde la pantalla (`trabado`). Nunca tira: la
  // respuesta de GN tiene que llegar a la pantalla igual.
  const marcar = async (cambios) => {
    for (let intento = 1; intento <= 3; intento++) {
      try {
        const { error } = await sb.from('repo_armado').update({ ...cambios, actualizado_en: new Date().toISOString() }).eq('id', armado.id)
        if (!error) return true
      } catch {
        /* reintenta */
      }
      if (intento < 3) await dormir(500)
    }
    return false
  }
  const sinTanda = { ...previo, enCurso: null, seguir: null, descripcion: null, unidadesEnCurso: null }
  const limite = Date.now() + PLAZO_GN_MS

  let resp
  let datos = null
  try {
    // Sólo el 429 se reintenta: GN avisa que no hizo nada. Cualquier otra cosa puede haberla hecho.
    // Cada intento tiene su tope (`AbortSignal.timeout`) y entre todos no pasan de `PLAZO_GN_MS`.
    for (let intento = 1; intento <= 3; intento++) {
      resp = await fetch(`${GN_BASE}/inventario/transferencia`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.max(1000, limite - Date.now())),
      })
      if (resp.status !== 429 || intento === 3) break
      const espera = Math.min(Math.max(Number(resp.headers.get('retry-after')) || 5, 2), 10) * 1000
      // Sin tiempo para esperar y reintentar: se contesta el 429 (GN no hizo nada).
      if (Date.now() + espera + 3000 > limite) break
      await dormir(espera)
    }
    datos = await resp.json().catch(() => null)
  } catch (e) {
    const tardo = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    await marcar({ estado: 'revisar', error: tardo ? `Gestión Nube no contestó en ${PLAZO_GN_MS / 1000} s` : `Se cortó la conexión con Gestión Nube: ${e instanceof Error ? e.message : e}` })
    return res.status(502).json({ error: 'Sin respuesta de Gestión Nube. Verificá si la transferencia figura antes de seguir.', estado: 'revisar' })
  }

  if (resp.ok && datos && (datos.executed === true || datos.transfer_id)) {
    // 🔑 `prendas`, `desde` y `hacia`: el libro de stock lee cada tanda prenda por prenda (con varias
    // tandas, `transferido` sólo da el acumulado y ya no se sabe qué viajó en cuál).
    const tanda = { transfer_id: datos.transfer_id ?? null, movement_id: datos.movement_id ?? null, unidades, hora: new Date().toISOString(), prendas: pendiente, desde, hacia }
    const nuevoTransferido = sumar(transferido, pendiente)
    const transfer = {
      tandas: [...(previo.tandas || []), tanda],
      transferido: nuevoTransferido,
      // Lo que lee la pantalla de un vistazo: la última transferencia y el total.
      transfer_id: tanda.transfer_id,
      unidades: Object.values(nuevoTransferido).reduce((x, n) => x + n, 0),
      enCurso: null,
      seguir: null,
      descripcion: null,
      unidadesEnCurso: null,
    }
    await marcar(seguir ? { estado: 'en_curso', transfer, error: null } : { estado: 'transferido', transfer, error: null, cerrado_en: new Date().toISOString() })
    return res.status(200).json({ ok: true, transfer, tanda })
  }

  if (resp.status === 422 && datos && Array.isArray(datos.items)) {
    // Atómica: no movió nada. Se vuelve a `en_curso` con los renglones rechazados, para sacarlos.
    const rechazados = []
    datos.items.forEach((it, i) => {
      if (it && it.status === 'error' && items[i]) rechazados.push({ vid: items[i].vid, reason: it.reason || null })
    })
    await marcar({ estado: 'en_curso', error: null, transfer: sinTanda })
    return res.status(422).json({ error: 'Gestión Nube rechazó estas prendas. No se transfirió nada.', rechazados })
  }

  if (resp.status === 429) {
    await marcar({ estado: 'en_curso', error: null, transfer: sinTanda })
    return res.status(429).json({ error: 'Gestión Nube está ocupado. No se transfirió nada: reintentá en un minuto.' })
  }

  if (resp.status === 401 || resp.status === 403) {
    await marcar({ estado: 'en_curso', error: null, transfer: sinTanda })
    return res.status(502).json({ error: 'Sin permiso para transferir en Gestión Nube. No se transfirió nada.' })
  }

  const msg = (datos && (datos.message || datos.error)) || `HTTP ${resp.status}`
  await marcar({ estado: 'revisar', error: `Respuesta inesperada de Gestión Nube: ${String(msg).slice(0, 300)}` })
  return res.status(502).json({ error: 'Respuesta inesperada de Gestión Nube. Verificá si la transferencia figura antes de seguir.', estado: 'revisar' })
}
