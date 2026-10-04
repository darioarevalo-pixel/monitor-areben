// Ubicaciones depósito — en qué estante de atrás del local de Zattia está cada producto
// (ver sql/migrate-ubicaciones-local.sql y lib/ubicaciones-local/core.core.js).
//
//   GET  ?recurso=ubicaciones-local&store=zattia&action=foto              → { estantes: [{estante, escaneadoEn, escaneadoPor, productos:[{clave, nombre, bolsas}]}] }
//   GET  ?recurso=ubicaciones-local&store=zattia&action=controles         → { bolsaSinStock, stockSinBolsa, stockDe }
//   GET  ?recurso=ubicaciones-local&store=zattia&action=resolver&codigo=  → { tipo:'estante', estante } | { tipo:'bolsa', clave, nombre, enLocal } | 404
//   POST { recurso:'ubicaciones-local', store, action:'guardar-estante', estante, lecturas:[codigo] } → { ok, estante, productos, sinResolver }
//   POST { recurso:'ubicaciones-local', store, action:'eliminar-estante', estante }                    → { ok }
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js`. El plan Hobby de Vercel admite 12 funciones.
//
// 🔑 Guardar un estante lo REEMPLAZA entero (la función `reemplazar_estante`, en una transacción): lo
// que se fue del estante desaparece solo, sin escanear «salidas».
// 🔑 El stock que se cruza es el del ESPEJO (`inventario`, foto de las 3 AM): los controles lo dicen.
import { createClient } from '@supabase/supabase-js'
import { exigirUsuario } from './_auth.js'
import { marcaDePermisos, puedeSub, puedeVerAlguna } from '../lib/permisos.core.js'
import { cfgDeMarca } from './_recepciones-base.js'
import { agruparLecturas, claveDe, cmpSku, controles, estanteValido, leerCodigo } from '../lib/ubicaciones-local/core.core.js'

const SECCION = 'ubicaciones-local'
const LOCAL = 'Local'
const MAX_LECTURAS = 500

/** PostgREST contesta 42P01 / PGRST205 cuando la tabla ⛔ existe. */
const faltaLaTabla = (e) => e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || /does not exist|Could not find the (table|function)/i.test(e.message || ''))
const SIN_TABLA = 'Falta crear las tablas de ubicaciones en la base (sql/migrate-ubicaciones-local.sql).'

/** Todas las filas, de a 1000 (PostgREST corta ahí). */
async function todas(q) {
  const out = []
  for (let off = 0; off < 50000; off += 1000) {
    const { data, error } = await q().range(off, off + 999)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

/** Las filas del Local en el espejo: sku, nombre y stock por variante. */
const filasDelLocal = (sb) =>
  todas(() => sb.from('inventario').select('sku, product_name, size_name, available_quantity').eq('store_name', LOCAL).order('sku'))

/**
 * Un código de bolsa ⇒ el producto. Primero por la clave (la etiqueta de la bolsa dice `RBT-0137`); si
 * no engancha, por código de barras de una prenda (quien escanea la etiqueta de la prenda también llega).
 * @returns {Promise<{clave:string, nombre:string|null} | null>}
 */
async function resolverBolsa(sb, lectura) {
  const { clave, codigo } = lectura
  if (/^[A-Z0-9-]+$/.test(clave)) {
    const { data, error } = await sb.from('inventario').select('sku, product_name')
      .or(`sku.eq.${clave},sku.ilike.${clave}-*`).limit(1)
    if (error) throw error
    if (data && data.length && claveDe(data[0].sku) === clave) return { clave, nombre: data[0].product_name || null }
  }
  const { data, error } = await sb.from('inventario').select('sku, product_name').eq('barcode', codigo).limit(1)
  if (error) throw error
  if (data && data.length && claveDe(data[0].sku)) return { clave: claveDe(data[0].sku), nombre: data[0].product_name || null }
  return null
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res)
  if (!perfil) return

  const store = String(req.query.store || (req.body && req.body.store) || '').toLowerCase()
  if (store !== 'zattia') return res.status(400).json({ error: 'Las ubicaciones del depósito son sólo de Zattia (store=zattia).' })

  // 🔴 `puedeVerAlguna` y ⛔ nunca `puedeVer` pelado: la `store` la elige el request.
  // 🔑 La Caja también LEE (dice «atrás: A1 · A2» al escanear): ⛔ lleva plata ni datos de nadie.
  if (!puedeVerAlguna(perfil, store, [SECCION, 'caja'])) return res.status(403).json({ error: 'No tenés acceso a las ubicaciones del depósito.' })
  const marca = marcaDePermisos(store)
  const escanear = !!marca && puedeVerAlguna(perfil, store, [SECCION]) && puedeSub(perfil, marca, SECCION, 'escanear')

  const cfg = cfgDeMarca(store)
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase para zattia.' })
  const sb = createClient(cfg.url, cfg.key)
  const accion = String(req.query.action || (req.body && req.body.action) || '')

  try {
    if (req.method === 'GET') {
      if (accion === 'foto') {
        const [foto, lecturas, local] = await Promise.all([
          todas(() => sb.from('ubicacion_local').select('estante, clave, bolsas, escaneado_en, escaneado_por').eq('store', store).order('estante')),
          todas(() => sb.from('ubicacion_local_lectura').select('estante, escaneado_en, escaneado_por').eq('store', store).order('escaneado_en', { ascending: false })),
          filasDelLocal(sb),
        ])
        const nombre = new Map()
        for (const r of local) { const k = claveDe(r.sku); if (k && !nombre.has(k)) nombre.set(k, r.product_name) }
        // El último escaneo de cada estante sale del historial: un estante escaneado VACÍO también existe.
        const estantes = new Map()
        for (const l of lecturas) if (!estantes.has(l.estante)) estantes.set(l.estante, { estante: l.estante, escaneadoEn: l.escaneado_en, escaneadoPor: l.escaneado_por, productos: [] })
        for (const f of foto) {
          if (!estantes.has(f.estante)) estantes.set(f.estante, { estante: f.estante, escaneadoEn: f.escaneado_en, escaneadoPor: f.escaneado_por, productos: [] })
          estantes.get(f.estante).productos.push({ clave: f.clave, nombre: nombre.get(f.clave) || null, bolsas: f.bolsas })
        }
        const lista = [...estantes.values()].sort((a, b) => cmpSku(a.estante, b.estante))
        lista.forEach((e) => e.productos.sort((a, b) => cmpSku(a.clave, b.clave)))
        return res.status(200).json({ ok: true, estantes: lista, puede: { escanear } })
      }

      if (accion === 'controles') {
        const [foto, local] = await Promise.all([
          todas(() => sb.from('ubicacion_local').select('estante, clave').eq('store', store)),
          filasDelLocal(sb),
        ])
        return res.status(200).json({ ok: true, fuente: 'espejo', ...controles(foto, local) })
      }

      if (accion === 'resolver') {
        const l = leerCodigo(req.query.codigo)
        if (l.tipo === 'vacio') return res.status(400).json({ error: 'Falta el código.' })
        if (l.tipo === 'estante') return res.status(200).json({ tipo: 'estante', estante: l.estante })
        const r = await resolverBolsa(sb, l)
        if (!r) return res.status(404).json({ error: `«${l.codigo}» no es ningún producto.` })
        const { data, error } = await sb.from('inventario').select('sku, available_quantity').eq('store_name', LOCAL).ilike('sku', `${r.clave}%`)
        if (error) throw error
        const enLocal = (data || []).filter((x) => claveDe(x.sku) === r.clave).reduce((t, x) => t + Math.max(0, Number(x.available_quantity) || 0), 0)
        return res.status(200).json({ tipo: 'bolsa', ...r, enLocal })
      }
      return res.status(400).json({ error: 'action inválida (foto, controles, resolver)' })
    }

    if (req.method === 'POST') {
      if (!escanear) return res.status(403).json({ error: 'No tenés permiso para escanear el depósito.' })
      const b = req.body || {}
      const estante = String(b.estante || '').trim().toUpperCase().replace(/^EST-/, '')
      if (!estanteValido(estante)) return res.status(400).json({ error: 'Estante inválido: letras y números, hasta 8 (la etiqueta dice EST-A1).' })

      if (accion === 'guardar-estante') {
        if (!Array.isArray(b.lecturas) || b.lecturas.length > MAX_LECTURAS) return res.status(400).json({ error: `lecturas tiene que ser una lista de hasta ${MAX_LECTURAS} códigos.` })
        const lecturas = b.lecturas.map(leerCodigo).filter((l) => l.tipo === 'bolsa')
        // Se resuelve una vez por código distinto: dos bolsas del mismo producto llevan la misma etiqueta.
        const distintos = [...new Set(lecturas.map((l) => l.codigo))]
        const resuelto = new Map()
        for (let i = 0; i < distintos.length; i += 8) {
          const tanda = distintos.slice(i, i + 8)
          const rs = await Promise.all(tanda.map((c) => resolverBolsa(sb, lecturas.find((l) => l.codigo === c))))
          tanda.forEach((c, j) => resuelto.set(c, rs[j]))
        }
        const claves = lecturas.map((l) => resuelto.get(l.codigo)).filter(Boolean).map((r) => r.clave)
        const sinResolver = distintos.filter((c) => !resuelto.get(c))
        const filas = agruparLecturas(claves)
        const { error } = await sb.rpc('reemplazar_estante', { p_store: store, p_estante: estante, p_filas: filas, p_sin_resolver: sinResolver, p_por: perfil.name || null })
        if (error && faltaLaTabla(error)) return res.status(503).json({ error: SIN_TABLA })
        if (error) throw error
        const nombre = new Map([...resuelto.values()].filter(Boolean).map((r) => [r.clave, r.nombre]))
        return res.status(200).json({ ok: true, estante, productos: filas.map((f) => ({ ...f, nombre: nombre.get(f.clave) || null })), sinResolver })
      }

      if (accion === 'eliminar-estante') {
        const e1 = await sb.from('ubicacion_local').delete().eq('store', store).eq('estante', estante)
        if (e1.error && faltaLaTabla(e1.error)) return res.status(503).json({ error: SIN_TABLA })
        if (e1.error) throw e1.error
        const e2 = await sb.from('ubicacion_local_lectura').delete().eq('store', store).eq('estante', estante)
        if (e2.error) throw e2.error
        return res.status(200).json({ ok: true, estante })
      }
      return res.status(400).json({ error: 'action inválida (guardar-estante, eliminar-estante)' })
    }

    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    if (faltaLaTabla(e)) return res.status(503).json({ error: SIN_TABLA })
    return res.status(500).json({ error: (e && e.message) || String(e) })
  }
}
