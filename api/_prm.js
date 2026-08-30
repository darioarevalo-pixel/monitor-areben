// PRM y Recorridas — la relación con el proveedor y el viaje a comprarle (ver sql/migrate-prm.sql).
//
//   GET  ?recurso=prm&store=…                      → el padrón, con el resumen de cada local
//   GET  ?recurso=prm&store=…&action=local&id=…    → la ficha entera de un proveedor
//   GET  ?recurso=prm&store=…&action=recorridas    → los viajes
//   GET  ?recurso=prm&store=…&action=recorrida&id= → UN viaje entero, con todo lo de cada parada
//   GET  ?recurso=prm&store=…&action=opciones      → los nombres para los dos desplegables de enganche
//   POST ?recurso=prm&store=…  { action, … }       → las escrituras
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=prm`. El plan Hobby de
// Vercel admite 12 funciones y hay 7 usadas.
//
// 🔑 **Un handler para las DOS secciones.** `recorridas` (área Compras) escribe lo que pasa en la
// calle y `prm` (área Proveedores) lee la ficha, pero es el mismo dato: partirlo en dos handlers
// sería partir en dos la lista blanca de tablas y el gate, que es donde nacen las divergencias.
// Lo que sí se separa es el PERMISO, acción por acción.
//
// 🔴 **Lo que este archivo NO calcula: el cumplimiento por proveedor.** Eso ya vive en
// `lib/recepciones/core.ts` (`porProveedor`) y es TypeScript, que un handler no puede importar. Acá
// se devuelven las OCs crudas y el agregado lo hace la pantalla con esa función. ⛔ Copiarlo sería
// una segunda regla sobre la misma plata.
import { createClient } from '@supabase/supabase-js'
import { exigirUsuario } from './_auth.js'
import { geocodificarEnEscalera } from './_georef.js'
import { puedeVerAlguna } from '../lib/permisos.core.js'
import { cfgDelMonitor, cfgDeMarca } from './_recepciones-base.js'
import { consultaDeLocal, ordenarPorCercania } from '../lib/prm/geo.core.js'
import { puntoDeGeoref } from '../lib/envios/direccion.core.js'

/** Leer el padrón lo puede cualquiera de las dos secciones: es el mismo dato mirado de dos lados. */
const PARA_LEER = ['prm', 'recorridas']
/** Escribir lo que pasa en la calle es de Recorridas: la visita, el interés, el compromiso, el viaje. */
const PARA_CALLE = ['recorridas']
/**
 * 🔑 **El enganche pide `prm` y no `recorridas`, a propósito.** Atar un local a un proveedor del
 * sistema de Ingresos hace aparecer en la ficha las OCs y el cumplimiento de otro; es una decisión
 * de la ficha, no algo que se toca con el celular en la mano parado en una galería.
 */
const PARA_ENGANCHAR = ['prm']

/** Techo de la lista. El padrón de Flores no llega a cientos, pero una consulta sin techo no existe. */
const TOPE = 1000

const TABLAS_VISITA = 'proveedor_visita'

function sb() {
  const cfg = cfgDelMonitor()
  if (!cfg.url || !cfg.key) throw new Error('Falta la credencial de la base del monitor')
  return createClient(cfg.url, cfg.key)
}

const texto = (v) => {
  const s = String(v ?? '').trim()
  return s || null
}

/** `true` sólo con el booleano o el string 'true'. Un `undefined` es "no me dijeron", o sea `false`. */
const bool = (v) => v === true || v === 'true'

/**
 * **Geocodifica los locales que lo necesitan y les guarda el punto.**
 *
 * 🔑 **El punto SE GUARDA, al revés que en Envíos** (que consulta cada vez a propósito, porque la
 * dirección de una clienta se corrige seguido). Una galería de Avellaneda no se muda, y el viaje se
 * arma en la calle: pagar una vuelta al geocoder por cada vez que se abre la recorrida es lo que la
 * haría inusable con la señal de una galería.
 *
 * Devuelve `{ resueltos, motivos }` — `motivos` dice, por local, por qué no se pudo. ⛔ Un local sin
 * punto no es un error del que haya que enterarse tres pantallas después: sale nombrado acá.
 */
async function geocodificar(cliente, locales) {
  const pedidos = []
  const motivos = {}
  for (const l of locales) {
    if (typeof l.lat === 'number' && typeof l.lng === 'number') continue
    const c = consultaDeLocal(l)
    if (c.motivo) motivos[l.id] = c.motivo
    else pedidos.push(c)
  }
  if (!pedidos.length) return { resueltos: 0, motivos }

  let puntos
  try {
    puntos = await geocodificarEnEscalera(pedidos)
  } catch (e) {
    // ⚠️ Que el geocoder esté caído ⛔ no puede voltear el armado del viaje: sin punto, la parada va
    // al final de la lista con su motivo escrito, que es peor que tenerlo y muchísimo mejor que no
    // poder salir a la calle.
    for (const p of pedidos) motivos[p.clave] = `no se pudo consultar el geocoder: ${e.message}`
    return { resueltos: 0, motivos }
  }

  let resueltos = 0
  const ahora = new Date().toISOString()
  for (const p of pedidos) {
    const r = puntos.get(p.clave)
    const punto = r && r.resultado ? puntoDeGeoref(r.resultado) : null
    if (!punto) {
      motivos[p.clave] = 'el geocoder no la ubicó'
      continue
    }
    const { error } = await cliente
      .from('proveedor_local')
      .update({ lat: punto.lat, lng: punto.lng, geo_usada: r.usada, geo_en: ahora, actualizado_en: ahora })
      .eq('id', p.clave)
    if (error) {
      motivos[p.clave] = `no se pudo guardar el punto: ${error.message}`
      continue
    }
    resueltos += 1
  }
  return { resueltos, motivos }
}

/** El padrón con lo que la lista necesita de cada local, sin bajarse la historia entera. */
async function padron(cliente) {
  const [locales, visitas, intereses, compromisos] = await Promise.all([
    cliente.from('proveedor_local').select('*').order('nombre').limit(TOPE),
    cliente.from(TABLAS_VISITA).select('id, local_id, fecha, opinion, puntaje, compre').order('fecha', { ascending: false }),
    cliente.from('proveedor_interes').select('id, local_id, estado'),
    cliente.from('proveedor_compromiso').select('id, local_id, para_cuando, cumplido_en, creado_en, que, de_quien'),
  ])
  for (const r of [locales, visitas, intereses, compromisos]) {
    if (r.error) throw new Error(r.error.message)
  }

  const ultima = new Map()
  for (const v of visitas.data || []) if (!ultima.has(v.local_id)) ultima.set(v.local_id, v)
  const abiertos = new Map()
  for (const i of intereses.data || []) {
    if (i.estado !== 'mirando') continue
    abiertos.set(i.local_id, (abiertos.get(i.local_id) || 0) + 1)
  }
  const porLocal = new Map()
  for (const c of compromisos.data || []) {
    if (c.cumplido_en) continue
    if (!porLocal.has(c.local_id)) porLocal.set(c.local_id, [])
    porLocal.get(c.local_id).push(c)
  }

  return (locales.data || []).map((l) => ({
    ...l,
    ultimaVisita: ultima.get(l.id) || null,
    interesesAbiertos: abiertos.get(l.id) || 0,
    compromisosAbiertos: porLocal.get(l.id) || [],
  }))
}

/**
 * Los nombres de los dos desplegables de enganche.
 *
 * 🔴 **`proveedor_gn` existe SÓLO del lado de Zattia**: la columna `productos.proveedor` no está en
 * la base de BDI. Devolver `[]` sin decirlo haría que la pantalla mostrara un desplegable vacío, que
 * se lee como "este proveedor no vendió nada". Por eso viaja `gnDisponible`.
 */
async function opciones(cliente) {
  const { data: ocs, error } = await cliente
    .from('recepcion_oc')
    .select('proveedor_id, proveedor_nombre')
    .not('proveedor_id', 'is', null)
    .limit(5000)
  if (error) throw new Error(error.message)

  const deIngresos = [...new Map((ocs || []).map((o) => [o.proveedor_id, o.proveedor_nombre || `#${o.proveedor_id}`])).entries()]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)))

  let deGn = []
  let gnDisponible = false
  const cfg = cfgDeMarca('zattia')
  if (cfg.url && cfg.key) {
    try {
      const z = createClient(cfg.url, cfg.key)
      const { data, error: e2 } = await z.from('productos').select('proveedor').not('proveedor', 'is', null).limit(20000)
      if (!e2) {
        deGn = [...new Set((data || []).map((p) => p.proveedor).filter(Boolean))].sort()
        gnDisponible = true
      }
    } catch {
      // Queda `gnDisponible = false`: la pantalla dice que no se pudo preguntar, no que no hay.
    }
  }
  return { deIngresos, deGn, gnDisponible }
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res)
  if (!perfil) return

  const store = String(req.query.store || (req.body && req.body.store) || '').toLowerCase()
  const accion = String(req.query.action || (req.body && req.body.action) || '')

  // 🔴 El gate del servidor es `puedeVerAlguna` y ⛔ nunca `puedeVer` pelado: la `store` la elige el
  // request, y una cuenta clavada a una marca puede pedir la otra a mano.
  const puede = (keys) => puedeVerAlguna(perfil, store, keys)
  if (!puede(PARA_LEER)) return res.status(403).json({ error: 'No tenés acceso al PRM.' })

  let cliente
  try {
    cliente = sb()
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }

  try {
    if (req.method === 'GET') {
      if (accion === 'opciones') return res.status(200).json({ ok: true, ...(await opciones(cliente)) })

      if (accion === 'local') {
        const id = String(req.query.id || '')
        const { data: local, error } = await cliente.from('proveedor_local').select('*').eq('id', id).maybeSingle()
        if (error) throw new Error(error.message)
        if (!local) return res.status(404).json({ error: 'Ese local no está.' })

        const [visitas, intereses, compromisos] = await Promise.all([
          cliente.from(TABLAS_VISITA).select('*').eq('local_id', id).order('fecha', { ascending: false }),
          cliente.from('proveedor_interes').select('*').eq('local_id', id).order('visto_en', { ascending: false }),
          cliente.from('proveedor_compromiso').select('*').eq('local_id', id).order('creado_en', { ascending: false }),
        ])
        for (const r of [visitas, intereses, compromisos]) if (r.error) throw new Error(r.error.message)

        // Las OCs de este proveedor, CRUDAS: el cumplimiento lo agrega la pantalla con
        // `porProveedor` de `lib/recepciones/core.ts`. Sin enganche no se pregunta nada —y eso
        // ⛔ no es lo mismo que "no tiene OCs": la pantalla distingue los dos casos.
        let recepciones = null
        if (local.proveedor_id_ingresos != null) {
          const { data, error: e2 } = await cliente
            .from('recepcion_oc')
            .select('*')
            .eq('proveedor_id', local.proveedor_id_ingresos)
            .order('confirmada_at', { ascending: false, nullsFirst: false })
            .limit(TOPE)
          if (e2) throw new Error(e2.message)
          recepciones = data || []
        }

        return res.status(200).json({
          ok: true,
          local,
          visitas: visitas.data || [],
          intereses: intereses.data || [],
          compromisos: compromisos.data || [],
          recepciones,
        })
      }

      if (accion === 'recorridas') {
        const { data, error } = await cliente.from('recorrida').select('*').order('fecha', { ascending: false }).limit(200)
        if (error) throw new Error(error.message)
        return res.status(200).json({ ok: true, recorridas: data || [] })
      }

      if (accion === 'recorrida') {
        const id = String(req.query.id || '')
        const { data: rec, error } = await cliente.from('recorrida').select('*').eq('id', id).maybeSingle()
        if (error) throw new Error(error.message)
        if (!rec) return res.status(404).json({ error: 'Esa recorrida no está.' })

        const { data: paradas, error: e2 } = await cliente
          .from('recorrida_parada')
          .select('*')
          .eq('recorrida_id', id)
          .order('orden')
        if (e2) throw new Error(e2.message)

        const ids = (paradas || []).map((p) => p.local_id)
        // 🔴 **Todo el viaje viaja en UN GET.** En las galerías de Avellaneda no hay señal: moverse
        // entre paradas ⛔ no puede pedir red. Por eso baja acá lo que se lee parado en el local —los
        // intereses abiertos, la última visita y los compromisos abiertos— y no de a una parada.
        const [locales, intereses, compromisos, visitas] = await Promise.all([
          ids.length ? cliente.from('proveedor_local').select('*').in('id', ids) : { data: [] },
          ids.length ? cliente.from('proveedor_interes').select('*').in('local_id', ids).eq('estado', 'mirando') : { data: [] },
          ids.length ? cliente.from('proveedor_compromiso').select('*').in('local_id', ids).is('cumplido_en', null) : { data: [] },
          ids.length ? cliente.from(TABLAS_VISITA).select('*').in('local_id', ids).order('fecha', { ascending: false }) : { data: [] },
        ])
        for (const r of [locales, intereses, compromisos, visitas]) if (r && r.error) throw new Error(r.error.message)

        const porId = new Map((locales.data || []).map((l) => [l.id, l]))
        const ultima = new Map()
        for (const v of visitas.data || []) if (!ultima.has(v.local_id)) ultima.set(v.local_id, v)

        return res.status(200).json({
          ok: true,
          recorrida: rec,
          paradas: (paradas || []).map((p) => ({
            ...p,
            local: porId.get(p.local_id) || null,
            intereses: (intereses.data || []).filter((i) => i.local_id === p.local_id),
            compromisos: (compromisos.data || []).filter((c) => c.local_id === p.local_id),
            ultimaVisita: ultima.get(p.local_id) || null,
          })),
        })
      }

      return res.status(200).json({ ok: true, locales: await padron(cliente) })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' })

    const body = req.body || {}
    const ahora = new Date().toISOString()
    const quien = perfil.nombre || perfil.usuario || null

    // ── El padrón ────────────────────────────────────────────────────────────────────────────
    if (accion === 'local.crear' || accion === 'local.importar') {
      if (!puede(PARA_CALLE)) return res.status(403).json({ error: 'No podés cargar locales.' })
      const crudos = accion === 'local.importar' ? body.locales : [body.local]
      if (!Array.isArray(crudos) || !crudos.length) return res.status(400).json({ error: 'No vino ningún local.' })

      const filas = []
      for (const l of crudos) {
        const nombre = texto(l && l.nombre)
        const id = texto(l && l.id)
        // ⚠️ Un local sin nombre ⛔ no se guarda con uno inventado ni se saltea callado: se cuenta.
        if (!nombre || !id) continue
        filas.push({
          id,
          nombre,
          galeria: texto(l.galeria),
          direccion: texto(l.direccion),
          entre_calles: texto(l.entre_calles),
          zona: texto(l.zona),
          rubro: texto(l.rubro),
          instagram: texto(l.instagram),
          telefono: texto(l.telefono),
          contacto: texto(l.contacto),
          nota: texto(l.nota),
          estado: ['por_visitar', 'visitado', 'compro', 'descartado'].includes(l.estado) ? l.estado : 'por_visitar',
          creado_por: quien,
          // El CSV de Google Maps ya trae el punto: se guarda y no se vuelve a preguntar. `geo_usada`
          // dice de dónde salió, que es lo que después permite distinguir un punto del geocoder de
          // uno que puso una persona guardando el lugar.
          ...(Number.isFinite(Number(l.lat)) && Number.isFinite(Number(l.lng))
            ? { lat: Number(l.lat), lng: Number(l.lng), geo_usada: 'Google Maps', geo_en: ahora }
            : {}),
        })
      }
      if (!filas.length) return res.status(400).json({ error: 'Ninguno de los locales traía nombre.' })

      const { error } = await cliente.from('proveedor_local').insert(filas)
      if (error) throw new Error(error.message)
      // Se cuenta lo que entró Y lo que se cayó por no traer nombre: un importador que dice "listo"
      // sobre 51 de 60 es el que hace que falten locales el día del viaje.
      return res.status(200).json({ ok: true, guardados: filas.length, sinNombre: crudos.length - filas.length })
    }

    if (accion === 'local.editar') {
      if (!puede(PARA_CALLE)) return res.status(403).json({ error: 'No podés editar locales.' })
      const id = texto(body.id)
      if (!id) return res.status(400).json({ error: 'Falta el local.' })
      const patch = { actualizado_en: ahora }
      for (const c of ['nombre', 'galeria', 'direccion', 'entre_calles', 'zona', 'rubro', 'instagram', 'telefono', 'contacto', 'nota', 'estado']) {
        if (c in body) patch[c] = c === 'estado' ? body[c] : texto(body[c])
      }
      // 🔑 Si cambió la dirección, el punto guardado deja de valer: se borra para que el próximo
      // armado lo vuelva a preguntar. Un punto viejo al lado de una dirección nueva es el error que
      // `api/_georef.js` evita no cacheando nada.
      if ('direccion' in body) Object.assign(patch, { lat: null, lng: null, geo_usada: null, geo_en: null })
      const { error } = await cliente.from('proveedor_local').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
      return res.status(200).json({ ok: true })
    }

    if (accion === 'local.enganchar') {
      if (!puede(PARA_ENGANCHAR)) return res.status(403).json({ error: 'El enganche se tilda desde el PRM.' })
      const id = texto(body.id)
      if (!id) return res.status(400).json({ error: 'Falta el local.' })
      const patch = { actualizado_en: ahora }
      if ('proveedor_id_ingresos' in body) {
        const n = body.proveedor_id_ingresos
        patch.proveedor_id_ingresos = n === null || n === '' ? null : Number(n)
        if (patch.proveedor_id_ingresos !== null && !Number.isInteger(patch.proveedor_id_ingresos)) {
          return res.status(400).json({ error: 'El proveedor de Ingresos tiene que ser un número.' })
        }
      }
      if ('proveedor_gn' in body) patch.proveedor_gn = texto(body.proveedor_gn)
      const { error } = await cliente.from('proveedor_local').update(patch).eq('id', id)
      if (error) {
        // El índice único: dos locales colgados del mismo proveedor mostrarían las mismas OCs y el
        // cumplimiento se contaría dos veces.
        if (/duplicate|unique/i.test(error.message)) {
          return res.status(409).json({ error: 'Ese proveedor de Ingresos ya está enganchado a otro local.' })
        }
        throw new Error(error.message)
      }
      return res.status(200).json({ ok: true })
    }

    if (accion === 'geocodificar') {
      if (!puede(PARA_CALLE)) return res.status(403).json({ error: 'No podés tocar los locales.' })
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : null
      const q = cliente.from('proveedor_local').select('id, direccion, localidad, provincia, lat, lng').limit(TOPE)
      const { data, error } = await (ids && ids.length ? q.in('id', ids) : q.is('lat', null))
      if (error) throw new Error(error.message)
      return res.status(200).json({ ok: true, ...(await geocodificar(cliente, data || [])) })
    }

    // ── Lo que pasa en la calle ──────────────────────────────────────────────────────────────
    if (accion === 'visita.crear') {
      if (!puede(PARA_CALLE)) return res.status(403).json({ error: 'No podés anotar visitas.' })
      const id = texto(body.id)
      const local_id = texto(body.local_id)
      const fecha = texto(body.fecha)
      if (!id || !local_id || !fecha) return res.status(400).json({ error: 'Falta el local o la fecha.' })
      const puntaje = body.puntaje == null || body.puntaje === '' ? null : Number(body.puntaje)
      if (puntaje !== null && !(Number.isInteger(puntaje) && puntaje >= 1 && puntaje <= 5)) {
        return res.status(400).json({ error: 'El puntaje va de 1 a 5.' })
      }
      const { error } = await cliente.from(TABLAS_VISITA).insert({
        id,
        local_id,
        fecha,
        quien,
        opinion: texto(body.opinion),
        puntaje,
        // 🔴 Sin monto y sin unidades, a propósito: la compra se carga en el sistema de Ingresos y
        // vuelve CONTADA por la OC. Ver el docblock de la tabla en sql/migrate-prm.sql.
        compre: bool(body.compre),
        que_compre: texto(body.que_compre),
        fotos: Array.isArray(body.fotos) ? body.fotos.filter(Boolean).map(String) : [],
      })
      if (error) throw new Error(error.message)

      // Haber ido es un hecho: un local 'por_visitar' con una visita anotada deja de estarlo. ⛔ No
      // se toca el estado de los otros tres: 'compro' y 'descartado' son decisiones, no observaciones.
      await cliente
        .from('proveedor_local')
        .update({ estado: bool(body.compre) ? 'compro' : 'visitado', actualizado_en: ahora })
        .eq('id', local_id)
        .eq('estado', 'por_visitar')

      if (texto(body.parada_id)) {
        await cliente
          .from('recorrida_parada')
          .update({ visitado_en: ahora, visita_id: id })
          .eq('id', texto(body.parada_id))
      }
      return res.status(200).json({ ok: true })
    }

    if (accion === 'interes.crear') {
      if (!puede(PARA_CALLE)) return res.status(403).json({ error: 'No podés anotar intereses.' })
      const id = texto(body.id)
      const local_id = texto(body.local_id)
      const descripcion = texto(body.descripcion)
      if (!id || !local_id || !descripcion) return res.status(400).json({ error: 'Falta el local o qué te interesó.' })
      const precio = body.precio_visto == null || body.precio_visto === '' ? null : Number(body.precio_visto)
      if (precio !== null && !Number.isFinite(precio)) return res.status(400).json({ error: 'El precio no es un número.' })
      const marca = body.marca === 'bdi' || body.marca === 'zattia' ? body.marca : null
      const { error } = await cliente.from('proveedor_interes').insert({
        id,
        local_id,
        visita_id: texto(body.visita_id),
        descripcion,
        foto: texto(body.foto),
        precio_visto: precio,
        visto_en: texto(body.visto_en) || ahora.slice(0, 10),
        marca,
        nota: texto(body.nota),
      })
      if (error) throw new Error(error.message)
      return res.status(200).json({ ok: true })
    }

    if (accion === 'interes.estado') {
      if (!puede(PARA_CALLE)) return res.status(403).json({ error: 'No podés tocar los intereses.' })
      const id = texto(body.id)
      if (!id || !['mirando', 'pedido', 'descartado'].includes(body.estado)) {
        return res.status(400).json({ error: 'Estado inválido.' })
      }
      const { error } = await cliente.from('proveedor_interes').update({ estado: body.estado }).eq('id', id)
      if (error) throw new Error(error.message)
      return res.status(200).json({ ok: true })
    }

    if (accion === 'compromiso.crear') {
      if (!puede(PARA_CALLE)) return res.status(403).json({ error: 'No podés anotar compromisos.' })
      const id = texto(body.id)
      const local_id = texto(body.local_id)
      const que = texto(body.que)
      if (!id || !local_id || !que) return res.status(400).json({ error: 'Falta el local o qué se prometió.' })
      if (body.de_quien !== 'yo' && body.de_quien !== 'ellos') {
        return res.status(400).json({ error: 'Decí de quién es el compromiso: mío o de ellos.' })
      }
      const { error } = await cliente.from('proveedor_compromiso').insert({
        id,
        local_id,
        visita_id: texto(body.visita_id),
        que,
        de_quien: body.de_quien,
        para_cuando: texto(body.para_cuando),
      })
      if (error) throw new Error(error.message)
      return res.status(200).json({ ok: true })
    }

    if (accion === 'compromiso.cumplir') {
      if (!puede(PARA_CALLE)) return res.status(403).json({ error: 'No podés cerrar compromisos.' })
      const id = texto(body.id)
      if (!id) return res.status(400).json({ error: 'Falta el compromiso.' })
      // Destildar vuelve a `null`: un compromiso que se dio por cumplido y no lo estaba tiene que
      // poder volver a la lista, y su `creado_en` —el reloj— no se toca nunca.
      const cumplido = bool(body.cumplido)
      const { error } = await cliente
        .from('proveedor_compromiso')
        .update({ cumplido_en: cumplido ? ahora : null, cumplido_nota: cumplido ? texto(body.nota) : null })
        .eq('id', id)
      if (error) throw new Error(error.message)
      return res.status(200).json({ ok: true })
    }

    // ── El viaje ─────────────────────────────────────────────────────────────────────────────
    if (accion === 'recorrida.crear') {
      if (!puede(PARA_CALLE)) return res.status(403).json({ error: 'No podés armar recorridas.' })
      const id = texto(body.id)
      const fecha = texto(body.fecha)
      const ids = Array.isArray(body.locales) ? [...new Set(body.locales.map(String))] : []
      if (!id || !fecha) return res.status(400).json({ error: 'Falta la fecha de la recorrida.' })
      if (!ids.length) return res.status(400).json({ error: 'Elegí al menos un local.' })

      const { data: locales, error: e1 } = await cliente
        .from('proveedor_local')
        .select('id, direccion, localidad, provincia, lat, lng')
        .in('id', ids)
      if (e1) throw new Error(e1.message)
      if (!locales || !locales.length) return res.status(400).json({ error: 'Ninguno de esos locales está.' })

      const { motivos } = await geocodificar(cliente, locales)

      // Se relee DESPUÉS de geocodificar: `geocodificar` escribió los puntos y ordenar con los de
      // antes dejaría el viaje ordenado por una foto vieja.
      const { data: frescos, error: e2 } = await cliente.from('proveedor_local').select('id, lat, lng').in('id', ids)
      if (e2) throw new Error(e2.message)

      const desde =
        body.desde && Number.isFinite(Number(body.desde.lat)) && Number.isFinite(Number(body.desde.lng))
          ? { lat: Number(body.desde.lat), lng: Number(body.desde.lng) }
          : null
      const { orden, sinPunto } = ordenarPorCercania(frescos || [], desde)

      const { error: e3 } = await cliente.from('recorrida').insert({
        id,
        fecha,
        zona: texto(body.zona),
        estado: 'armando',
        nota: texto(body.nota),
        creado_por: quien,
      })
      if (e3) throw new Error(e3.message)

      const paradas = orden.map((local_id, i) => ({
        id: `rp${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        recorrida_id: id,
        local_id,
        orden: i,
      }))
      const { error: e4 } = await cliente.from('recorrida_parada').insert(paradas)
      if (e4) throw new Error(e4.message)

      // `sinPunto` y `motivos` viajan de vuelta: lo que no se pudo ubicar se dice en el momento en
      // que se arma el viaje, ⛔ no cuando la persona está parada en la calle mirando la lista.
      return res.status(200).json({ ok: true, paradas: paradas.length, sinPunto, motivos })
    }

    if (accion === 'recorrida.estado') {
      if (!puede(PARA_CALLE)) return res.status(403).json({ error: 'No podés tocar la recorrida.' })
      const id = texto(body.id)
      if (!id || !['armando', 'en_curso', 'cerrada'].includes(body.estado)) {
        return res.status(400).json({ error: 'Estado inválido.' })
      }
      const patch = { estado: body.estado, cerrada_en: body.estado === 'cerrada' ? ahora : null }
      const { error } = await cliente.from('recorrida').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
      return res.status(200).json({ ok: true })
    }

    if (accion === 'parada.marcar') {
      if (!puede(PARA_CALLE)) return res.status(403).json({ error: 'No podés tocar las paradas.' })
      const id = texto(body.id)
      if (!id) return res.status(400).json({ error: 'Falta la parada.' })
      const patch = {}
      if ('salteado' in body) patch.salteado = bool(body.salteado)
      if ('visitado' in body) patch.visitado_en = bool(body.visitado) ? ahora : null
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'No vino nada que cambiar.' })
      const { error } = await cliente.from('recorrida_parada').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: `acción desconocida: ${accion || '(ninguna)'}` })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'error' })
  }
}
