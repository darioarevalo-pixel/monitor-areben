/**
 * Facturación: lo que toca la base. Las tablas (`facturas`, `arca_ta`, `arca_candado`) viven SÓLO en
 * la base del monitor (`sql/migrate-facturacion.sql`): un CUIT y un permiso de ARCA para las dos marcas.
 *
 * El orquestador del lote es `motor/arca/lote.core.js`; acá está su `repo` y el cliente armado con las
 * variables de entorno. ⚠️ No es una función de Vercel (prefijo `_`).
 *
 * Variables: `ARCA_CERT` y `ARCA_KEY` (PEM). El ambiente lo decide `ambienteDeEntorno`: homologación
 * por defecto; producción (facturas REALES) sólo con `ARCA_PRODUCCION_HABILITADA=si`, que pone Bruno.
 */
import { createClient } from '@supabase/supabase-js'
import { cfgDelMonitor } from './_recepciones-base.js'
import { crearClienteArca } from '../motor/arca/cliente.js'
import { CUIT_AREBEN, ambienteDeEntorno } from '../motor/arca/arca.core.js'

/** Un candado más viejo que esto es de una corrida que murió: el lote entero entra en 30 s. */
const CANDADO_VENCIDO_MS = 2 * 60_000

export function baseFacturacion() {
  // La base de BDI (la «del monitor»): un CUIT y un permiso de ARCA para las dos marcas.
  const { url, key } = cfgDelMonitor()
  return createClient(url, key)
}

/** El permiso de ARCA guardado en `arca_ta`, uno por ambiente. */
export function almacenTA(sb, ambiente) {
  return {
    async leer() {
      const { data, error } = await sb.from('arca_ta').select('token, sign, vence').eq('ambiente', ambiente).maybeSingle()
      if (error) throw new Error(`arca_ta: ${error.message}`)
      return data
    },
    async guardar(ta) {
      const { error } = await sb.from('arca_ta').upsert({ ambiente, ...ta, pedido_en: new Date().toISOString() })
      if (error) throw new Error(`arca_ta: ${error.message}`)
    },
  }
}

/** Sin certificado en el servidor, ARCA ⛔ se puede llamar: las puertas que piden CAE lo dicen ANTES (409), ⛔ con un 500. */
export const SIN_ARCA = 'Este servidor todavía no tiene el certificado de ARCA cargado: no se puede facturar desde acá.'
export const arcaConectado = (env = process.env) => !!(env.ARCA_CERT && env.ARCA_KEY)

export function clienteArcaDelEntorno(sb) {
  const ambiente = ambienteDeEntorno(process.env)
  return {
    ambiente,
    arca: crearClienteArca({
      ambiente, cuit: CUIT_AREBEN,
      cert: (process.env.ARCA_CERT || '').replace(/\\n/g, '\n'),
      key: (process.env.ARCA_KEY || '').replace(/\\n/g, '\n'),
      almacenTA: almacenTA(sb, ambiente),
    }),
  }
}

/** Las filas de `facturas`, con la forma que espera `motor/arca/lote.core.js`. */
export function repoFacturas(sb) {
  const fallo = (donde, error) => { if (error) throw new Error(`${donde}: ${error.message}`) }
  return {
    async tomarCandado({ ambiente, ptoVta, tipo, lote, usuario }) {
      const fila = { ambiente, pto_vta: ptoVta, tipo, lote, tomado_por: usuario }
      for (let intento = 0; intento < 2; intento++) {
        const { error } = await sb.from('arca_candado').insert(fila)
        if (!error) return true
        if (error.code !== '23505') fallo('arca_candado', error)
        // Ocupado: si es de una corrida muerta, se libera y se prueba una vez más.
        const vencido = new Date(Date.now() - CANDADO_VENCIDO_MS).toISOString()
        const { error: e2 } = await sb.from('arca_candado').delete()
          .eq('ambiente', ambiente).eq('pto_vta', ptoVta).eq('tipo', tipo).lt('tomado_en', vencido)
        fallo('arca_candado', e2)
      }
      return false
    },

    async soltarCandado({ ambiente, ptoVta, tipo, lote }) {
      const { error } = await sb.from('arca_candado').delete()
        .eq('ambiente', ambiente).eq('pto_vta', ptoVta).eq('tipo', tipo).eq('lote', lote)
      fallo('arca_candado', error)
    },

    async reservadas({ ambiente, ptoVta, tipo }) {
      const { data, error } = await sb.from('facturas').select('*')
        .eq('ambiente', ambiente).eq('pto_vta', ptoVta).eq('tipo', tipo).eq('estado', 'reservada').order('numero')
      fallo('facturas', error)
      return data
    },

    async ventasFacturadas({ ambiente, marca, nc, ventaIds }) {
      const ya = new Set()
      for (let i = 0; i < ventaIds.length; i += 200) {
        const { data, error } = await sb.from('facturas').select('venta_id')
          .eq('ambiente', ambiente).eq('marca', marca).neq('estado', 'rechazada')
          .in('tipo', nc ? [3, 8] : [1, 6]).in('venta_id', ventaIds.slice(i, i + 200).map(String))
        fallo('facturas', error)
        for (const f of data) ya.add(f.venta_id)
      }
      return ya
    },

    async reservar(filas) {
      const { error } = await sb.from('facturas').insert(filas)
      fallo('facturas (reservar)', error)
    },

    async resolver(id, cambios) {
      const { error } = await sb.from('facturas')
        .update({ ...cambios, resuelto_en: new Date().toISOString() }).eq('id', id).eq('estado', 'reservada')
      fallo('facturas (resolver)', error)
    },
  }
}
