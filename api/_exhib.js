// Chequeo de exhibición LIBRE — el recorrido del local por LUGAR (ver sql/migrate-exhib-libre.sql).
//
//   GET  ?recurso=exhib&store=…&action=recorridos       → los recorridos, con cuántos escaneos tiene cada uno
//   GET  ?recurso=exhib&store=…&action=recorrido&id=…   → UNO entero: cabecera + TODOS sus escaneos
//   GET  ?recurso=exhib&store=…&action=lugares          → los lugares ya usados, para sugerir
//   POST ?recurso=exhib&store=…  { action: 'abrir'|'escanear'|'cerrar'|'sacar-escaneo'|'eliminar', … }
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=exhib`. El plan Hobby de
// Vercel admite 12 funciones y hay 7 usadas; una ruta nueva sería la octava por un solo recurso.
//
// 🔑 **Por qué existe.** Hasta el 19-sep-2026 el chequeo de exhibición ⛔ no escribía una sola fila:
// todo vivía en el `localStorage` del teléfono que escaneaba, así que lo que se marcaba en el local
// moría ahí y desde otra máquina ⛔ no había forma de ver qué dio un recorrido. Esto es esa mitad.
//
// ⛔ **Acá NO se calcula nada.** Ni faltantes, ni qué debería estar colgado en cada perchero: lo que
// se pidió es el DATO de qué se escaneó en cada lugar, para compararlo por afuera. El armado de la
// fila y el export viven en `lib/exhib/libre.ts`, que es TypeScript y un handler ⛔ no puede importar.
import { createClient } from '@supabase/supabase-js'
import { exigirUsuario } from './_auth.js'
import { puedeVerAlguna } from '../lib/permisos.core.js'
import { cfgDeMarca } from './_recepciones-base.js'
import { leerTodo } from '../lib/supabase/paginar.core.js'

const texto = (v) => (v == null || v === '' ? null : String(v))
const numero = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

/**
 * Una fila de escaneo, saneada. ⛔ No se guarda lo que venga: `recorrido_id` lo pone el servidor
 * (ya verificó que ese recorrido es de esta marca) y las columnas salen de la lista blanca.
 */
function filaDeEscaneo(recorridoId, e) {
  const lugar = String((e && e.lugar) || '').trim()
  const varianteId = String((e && e.variante_id) || '').trim()
  if (!lugar || !varianteId) return null
  return {
    recorrido_id: recorridoId,
    lugar,
    variante_id: varianteId,
    encontrado: e.encontrado !== false,
    codigo_crudo: texto(e.codigo_crudo),
    barcode: texto(e.barcode),
    sku: texto(e.sku),
    product_id: texto(e.product_id),
    product_name: texto(e.product_name),
    size: texto(e.size),
    cats: Array.isArray(e.cats) ? e.cats.map(String) : [],
    qty: numero(e.qty),
    precio: numero(e.precio),
    promo: numero(e.promo),
    // 🔑 La hora la manda el teléfono y ⛔ no es `now()`: el local puede quedarse sin señal y la cola
    // subirse mucho después. `now()` diría cuándo se pudo subir, ⛔ no cuándo se escaneó. Si viene
    // vacía o ilegible se cae al default de la tabla, que es lo único que queda.
    escaneado_en: texto(e.escaneado_en),
  }
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res)
  if (!perfil) return

  const store = String(req.query.store || (req.body && req.body.store) || '').toLowerCase()
  const accion = String(req.query.action || (req.body && req.body.action) || '')

  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' })

  // 🔴 El gate del servidor es `puedeVerAlguna` y ⛔ nunca `puedeVer` pelado: la `store` la elige el
  // request, y una cuenta clavada a una marca puede pedir la otra a mano.
  if (!puedeVerAlguna(perfil, store, ['exhib'])) {
    return res.status(403).json({ error: 'No tenés acceso al chequeo de exhibición de esta marca.' })
  }

  const cfg = cfgDeMarca(store)
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` })
  const sb = createClient(cfg.url, cfg.key)

  /**
   * El recorrido, **verificando que sea de esta marca**.
   *
   * 🔴 Sin este control el gate de arriba ⛔ no alcanza: el id del recorrido lo genera el teléfono y
   * viaja en el body, así que quien tiene permiso en UNA marca podría escribirle escaneos a un
   * recorrido de la otra pasando su id. El `store` vive en la cabecera y ⛔ no en cada escaneo
   * justamente para que haya un solo lugar donde preguntarlo.
   */
  async function recorridoDeLaMarca(id) {
    if (!id) return null
    const { data, error } = await sb.from('exhib_recorrido').select('*').eq('id', id).eq('store', store).maybeSingle()
    if (error) throw new Error(error.message)
    return data || null
  }

  try {
    if (req.method === 'GET') {
      if (accion === 'recorridos') {
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200)
        const { data, error } = await sb
          .from('exhib_recorrido')
          .select('*, exhib_escaneo(count)')
          .eq('store', store)
          .order('creado_en', { ascending: false })
          .limit(limit)
        if (error) throw new Error(error.message)
        // PostgREST devuelve el conteo embebido como `[{count: n}]`. Se aplana acá para que la
        // pantalla reciba un número y ⛔ no tenga que conocer esa forma.
        const recorridos = (data || []).map((r) => {
          const { exhib_escaneo: emb, ...resto } = r
          return { ...resto, escaneos: (Array.isArray(emb) && emb[0] && emb[0].count) || 0 }
        })
        return res.status(200).json({ ok: true, recorridos })
      }

      if (accion === 'recorrido') {
        const recorrido = await recorridoDeLaMarca(String(req.query.id || ''))
        if (!recorrido) return res.status(404).json({ error: 'Ese recorrido no está.' })
        // 🔴 `leerTodo` y ⛔ no un `.limit()`: PostgREST corta en 1.000 filas sin avisar, y un
        // recorrido del local entero pasa las mil. Un export corto se lee como «se escaneó poco».
        const escaneos = await leerTodo(sb, 'exhib_escaneo', (q) =>
          q.select('*').eq('recorrido_id', recorrido.id).order('escaneado_en', { ascending: true }),
        )
        return res.status(200).json({ ok: true, recorrido, escaneos })
      }

      if (accion === 'lugares') {
        // Los lugares ya usados por esta marca, del más reciente al más viejo. El `!inner` es lo que
        // ata el escaneo a la marca: `exhib_escaneo` ⛔ no tiene `store` (vive en la cabecera).
        const { data, error } = await sb
          .from('exhib_escaneo')
          .select('lugar, exhib_recorrido!inner(store)')
          .eq('exhib_recorrido.store', store)
          .order('id', { ascending: false })
          .limit(1500)
        if (error) throw new Error(error.message)
        const vistos = new Set()
        const lugares = []
        for (const f of data || []) {
          const l = String(f.lugar || '').trim()
          if (!l || vistos.has(l.toLowerCase())) continue
          vistos.add(l.toLowerCase())
          lugares.push(l)
        }
        return res.status(200).json({ ok: true, lugares })
      }

      return res.status(400).json({ error: `action inválida (usá recorridos, recorrido o lugares)` })
    }

    if (req.method === 'POST') {
      const b = req.body || {}

      if (accion === 'abrir') {
        const id = String(b.id || '').trim()
        if (!id) return res.status(400).json({ error: 'falta el id del recorrido' })
        const row = {
          id,
          store,
          modo: 'libre',
          // 🔑 La firma sale de `perfil.name` y NUNCA del body: si saliera del POST, un recorrido se
          // podría firmar con el nombre de otro cambiando un campo (`api/_conteos-deposito.js:46`).
          persona: perfil.name || null,
          estado: 'en_curso',
          nota: texto(b.nota),
        }
        // `upsert` y no `insert`: el id lo genera el teléfono antes de tener señal, así que un
        // reintento de la misma apertura ⛔ no puede contestar "ya existe" y dejar el recorrido
        // muerto con los escaneos encima.
        const { error } = await sb.from('exhib_recorrido').upsert(row, { onConflict: 'id', ignoreDuplicates: true })
        if (error) throw new Error(error.message)
        return res.status(200).json({ ok: true, id })
      }

      if (accion === 'escanear') {
        const recorrido = await recorridoDeLaMarca(String(b.recorrido_id || ''))
        if (!recorrido) return res.status(404).json({ error: 'Ese recorrido no está.' })
        const filas = (Array.isArray(b.escaneos) ? b.escaneos : []).map((e) => filaDeEscaneo(recorrido.id, e)).filter(Boolean)
        if (!filas.length) return res.status(400).json({ error: 'no vino ningún escaneo con lugar y variante' })
        // 🔑 Entra un ARRAY y ⛔ no un escaneo por pedido: así la cola que se juntó sin señal se
        // vacía en un viaje. `ignoreDuplicates` porque el único es (recorrido, lugar, variante) y
        // reintentar la cola tiene que ser inofensivo — el primer escaneo es el que vale.
        const { error } = await sb
          .from('exhib_escaneo')
          .upsert(filas, { onConflict: 'recorrido_id,lugar,variante_id', ignoreDuplicates: true })
        if (error) throw new Error(error.message)
        return res.status(200).json({ ok: true, recibidos: filas.length })
      }

      if (accion === 'cerrar') {
        const recorrido = await recorridoDeLaMarca(String(b.id || ''))
        if (!recorrido) return res.status(404).json({ error: 'Ese recorrido no está.' })
        const { error } = await sb
          .from('exhib_recorrido')
          .update({ estado: 'cerrado', cerrado_en: new Date().toISOString(), nota: texto(b.nota) ?? recorrido.nota })
          .eq('id', recorrido.id)
        if (error) throw new Error(error.message)
        return res.status(200).json({ ok: true })
      }

      if (accion === 'sacar-escaneo') {
        const recorrido = await recorridoDeLaMarca(String(b.recorrido_id || ''))
        if (!recorrido) return res.status(404).json({ error: 'Ese recorrido no está.' })
        const lugar = String(b.lugar || '').trim()
        const varianteId = String(b.variante_id || '').trim()
        if (!lugar || !varianteId) return res.status(400).json({ error: 'falta el lugar o la variante' })
        const { error } = await sb
          .from('exhib_escaneo')
          .delete()
          .eq('recorrido_id', recorrido.id)
          .eq('lugar', lugar)
          .eq('variante_id', varianteId)
        if (error) throw new Error(error.message)
        return res.status(200).json({ ok: true })
      }

      if (accion === 'eliminar') {
        const recorrido = await recorridoDeLaMarca(String(b.id || ''))
        if (!recorrido) return res.status(404).json({ error: 'Ese recorrido no está.' })
        // 🔴 Sólo se descarta uno SIN CERRAR. Un recorrido cerrado es el dato con el que alguien va
        // a comparar el salón, y ⛔ no hay verbo de vuelta: que se pueda eliminar de un toque desde el
        // teléfono es exactamente el accidente que ⛔ no se puede deshacer.
        if (recorrido.estado === 'cerrado') {
          return res.status(409).json({ error: 'Ese recorrido ya está cerrado: no se puede eliminar.' })
        }
        // Los escaneos caen solos por el `on delete cascade` de la tabla.
        const { error } = await sb.from('exhib_recorrido').delete().eq('id', recorrido.id)
        if (error) throw new Error(error.message)
        return res.status(200).json({ ok: true })
      }

      return res.status(400).json({ error: `action inválida (usá abrir, escanear, cerrar, sacar-escaneo o eliminar)` })
    }

    return res.status(405).json({ error: 'método no permitido' })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message })
  }
}
