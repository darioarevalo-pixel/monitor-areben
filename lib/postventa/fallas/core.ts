/**
 * **De dónde sale la unidad que se carga como falla.** Lógica pura, sin I/O.
 *
 * # El caso que lo trajo (21-sep-2026, reportado por Bruno)
 *
 * TOP ALAIA CELESTE quedó con **Depósito −1 y Local 2**. La falla la cargó Depósito
 * (`fallas_deposito` #21, venta GN **28688**), y hasta hoy **la sección era la respuesta**: quien
 * entraba por «Fallas de depósito» descontaba de depósito, sin que nadie mirara si había algo ahí.
 *
 * 📊 Medido sobre el espejo de Zattia: **los tres negativos de depósito son las tres fallas
 * descontadas del depósito** —SHORT MAITE S (venta 28587), TOP ALAIA CELESTE (28688) y TOP MONTANA
 * Negro (21220)— y **ninguna** de las que cargó el Local dejó uno. 3 de 3.
 *
 * 🔴 Y la pantalla ⛔ no tenía cómo avisar: `BuscarArticuloGN` mostraba **el stock SUMADO** de las
 * dos ubicaciones, así que decía «stock 2» —las 2 del Local— con el depósito en 0.
 *
 * # La regla
 *
 * Es la MISMA que Sesión de fotos (`origenDe`, `lib/sesionfotos/core.ts`), y por eso se delega en
 * vez de escribirse de nuevo: *gana el stock cuando ubica la prenda de un solo lado; la persona
 * decide sólo cuando alcanza en los dos o en ninguno*. Esa regla ya se había escrito dos veces con
 * el mismo agujero en las dos (`3597dff3`) — ésta sería la tercera.
 */

import { origenDe, ubicaSola, type StockPartido } from '@/lib/sesionfotos/core'
import type { Origen } from '@/lib/sesionfotos/tipos'

/** Las tres puertas de Post-venta, que es de donde sale la PREFERENCIA (⛔ no la respuesta). */
export type ModoPostventa = 'local' | 'admin' | 'deposito'

/** Por qué la unidad sale de donde sale. Es lo que la pantalla tiene que poder decir. */
export type PorQue = 'stock' | 'eleccion' | 'seccion'

/**
 * De dónde se descuenta la falla, y por qué.
 *
 * `eleccion` es lo que puso el selector de Administración; las otras dos puertas ⛔ no tienen
 * selector y su preferencia es la sección por la que se entró.
 *
 * ⚠️ **Sin stock partido ⛔ no se adivina**: `null` en los dos lados (una falla libre, o un espejo
 * que todavía ⛔ no tiene la variante) cae en la preferencia, que es lo que hacía siempre.
 */
export function ubicacionDeFalla(
  stock: StockPartido | null | undefined,
  cantidad: number,
  modo: ModoPostventa,
  eleccion?: Origen,
): { origen: Origen; porQue: PorQue } {
  const preferencia: Origen = modo === 'deposito' ? 'deposito' : modo === 'admin' ? eleccion || 'local' : 'local'
  const porQue: PorQue = modo === 'admin' ? 'eleccion' : 'seccion'
  if (!stock) return { origen: preferencia, porQue }

  const solo = ubicaSola(stock, cantidad)
  if (solo) return { origen: solo, porQue: 'stock' }

  /**
   * ⚠️ **Divergencia deliberada de `origenDe`, y sólo acá: cuando ⛔ NO ALCANZA EN NINGUNO.**
   *
   * Allá el desempate prueba el otro lado, así que con la preferencia en Depósito y cero en los
   * dos contesta `'local'`. Para una falla eso es al revés de lo que se sabe: **la unidad está en
   * la mano de quien la está cargando**, y su sección es el único dato de dónde apareció. Que el
   * negativo quede de ese lado es lo que después deja arreglarlo.
   */
  const q = Math.max(1, Number(cantidad) || 1)
  if ((Number(stock.local) || 0) < q && (Number(stock.deposito) || 0) < q) return { origen: preferencia, porQue }

  // Alcanza en los dos: manda la persona. Se delega para heredar el día que cambie el desempate.
  return { origen: origenDe(stock, q, preferencia, modo === 'admin' ? eleccion : undefined), porQue }
}

/** Cómo se llama cada lado en pantalla. */
export const LADO_LABEL: Record<Origen, string> = { deposito: 'Depósito', local: 'Local' }

/**
 * La frase que canta **dónde cae la unidad**, ⛔ no qué sección estaba abierta.
 *
 * 🔑 Es la lección de `3597dff3`: *«el feedback canta dónde cae, no qué chip estaba puesto»* —
 * decir la preferencia es que la pantalla afirme una cosa y GN guarde otra.
 */
export function frasePorQue(d: { origen: Origen; porQue: PorQue }, stock?: StockPartido | null): string {
  const donde = LADO_LABEL[d.origen]
  const cuenta = stock ? ` (Local ${stock.local} · Depósito ${stock.deposito})` : ''
  if (d.porQue === 'stock') return `Sale de ${donde}: el stock la ubica ahí${cuenta}.`
  if (d.porQue === 'eleccion') return `Sale de ${donde}, como elegiste${cuenta}.`
  return `Sale de ${donde}${cuenta}.`
}
