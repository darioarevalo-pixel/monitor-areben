/**
 * El objetivo del sector y el contador diario de ventas — el núcleo puro.
 *
 * Contesta dos preguntas que el resto del monitor **no** contesta:
 *
 *  1. **¿Cuánto vendimos HOY?** Norte mide un promedio de 30 días (`ritmoDeSalida`), que es lo que
 *     corresponde para proyectar stock y pagos, pero **esconde una rampa**: online venía de ~4
 *     compras/día y hizo 10,9 los últimos 7, y el medido de la meta seguía diciendo 6,1. Para un
 *     objetivo de escalado hace falta el día, y el día anterior, y el anterior.
 *  2. **¿Contra qué escalón?** La rampa de BDI son tres metas (25 al 8-sep · 50 al 30-sep · 100 al
 *     31-oct). Llenar la barra contra el 100 da 16% el mejor día del mes; contra el escalón vigente
 *     da 64%, que es la pregunta que se puede contestar esta semana.
 *
 * ⛔ **No mide plata.** Las dos cifras que salen de acá son unidades y compras; la contribución y
 * el costo siguen siendo de Dirección.
 */

// `canalDe` se importa del re-export tipado y NO del `.core.js`: ese archivo dice, textual, «acá
// sólo se le pone el tipo, una vez». Escribir la firma de nuevo acá sería la segunda vez.
import { canalDe } from '@/lib/liquidacion/resultado'
import type { FilaDetalle, FilaVenta, Producto } from '@/lib/etl/tipos'
import { unidadDe } from '@/lib/norte/medidores'
import type { Medicion } from '@/lib/norte/tipos'
import type { MetaGuardada } from '@/lib/norte/persistencia'
import { cortesDeVentas } from '@/lib/etl/helpers'
import { diasEntre, hoyIso, sumarDias } from '@/lib/fechas/dia'

/**
 * Un día del contador.
 *
 * 🔑 **`compras` y `unidades` son dos denominadores y por eso van los dos.** Una compra online
 * trae 1,9 fundas (medido en BDI, 30 días al 18-ago-2026) y una compra mayorista trae 76,9: un
 * objetivo cargado en uno y leído en el otro da un avance plausible y falso. Además **una venta de
 * cero unidades igual es una compra**, así que `compras` cuenta filas de `ventas` y no se deriva
 * de los renglones.
 */
export type DiaDeVenta = { fecha: string; compras: number; unidades: number }

/** Los canales que puede pedir el contador. `null` = todos juntos. */
export type CanalPedido = 'local' | 'online' | 'mayorista' | null

/**
 * La serie día por día, de `hasta` hacia atrás, `dias` filas.
 *
 * 🔑 **El canal sale de `canalDe`** (`lib/liquidacion/canal.core.js`), que es LA implementación y
 * la que usa `ritmoDeSalida` en Norte. ⛔ No el regex de `lib/marketing/core.ts`, que es un tercer
 * criterio: si esta pantalla recortara distinto que Norte, las dos dirían dos números del mismo
 * hecho y no habría cómo saber cuál mirar.
 *
 * ⚠️ **Devuelve el día con 0 aunque no haya ninguna venta**, y eso es a propósito: un domingo sin
 * ventas es un dato, y saltearlo dejaría las flechitas moviéndose de a saltos irregulares.
 *
 * Las ventas técnicas (Sesión de fotos, Fallas, canjes) ya vienen filtradas desde la bajada
 * (`lib/datos.ts`), así que acá no se vuelven a mirar.
 */
export function serieDiaria(
  ventas: FilaVenta[],
  detalles: FilaDetalle[],
  canal: CanalPedido,
  hasta: string,
  dias: number,
): DiaDeVenta[] {
  const desde = sumarDias(hasta, -(dias - 1))

  // Primer paso: qué día es cada venta que entra en la ventana y en el canal pedido.
  const diaDeLaVenta = new Map<string, string>()
  const porDia = new Map<string, DiaDeVenta>()
  for (let i = 0; i < dias; i++) {
    const fecha = sumarDias(desde, i)
    porDia.set(fecha, { fecha, compras: 0, unidades: 0 })
  }

  for (const v of ventas) {
    const fecha = (v.date_sale || '').slice(0, 10)
    const dia = porDia.get(fecha)
    if (!dia) continue
    if (canal && canalDe(v.channel) !== canal) continue
    diaDeLaVenta.set(String(v.id), fecha)
    dia.compras += 1
  }

  // Segundo: las unidades, que viven en los renglones y se atan por `sale_id`.
  for (const d of detalles) {
    const fecha = diaDeLaVenta.get(String(d.sale_id))
    if (!fecha) continue
    porDia.get(fecha)!.unidades += d.quantity || 0
  }

  return [...porDia.values()].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
}

/**
 * El escalón vigente de una rampa de metas: la activa con la `fechaObjetivo` **futura más
 * cercana**.
 *
 * 🔑 **Si ya pasaron todas, devuelve la de fecha más lejana** —el techo de la rampa— y no `null`:
 * que se haya vencido el calendario no borra el objetivo, y una pantalla sin barra el 1-nov se
 * leería como «se rompió».
 *
 * ⚠️ Una meta **sin fecha** no puede ser escalón (no hay con qué ordenarla), pero sí es candidata
 * a techo si no hay ninguna otra: es el caso de una marca con un solo objetivo suelto.
 *
 * Devuelve `null` cuando no hay ninguna meta activa. ⛔ **La pantalla NO dibuja entonces una barra
 * en 0%**: es el mismo criterio que `avanceDeMeta`, que devuelve `null` y no cero, porque un cero
 * afirma «no avanzamos» y esto es «no hay objetivo cargado».
 */
export function escalonVigente(metas: MetaGuardada[], hoy: string): MetaGuardada | null {
  const activas = metas.filter((m) => m.activa)
  if (!activas.length) return null

  const conFecha = activas.filter((m) => m.fechaObjetivo)
  if (!conFecha.length) return activas[0]

  const futuras = conFecha.filter((m) => diasEntre(hoy, m.fechaObjetivo!) >= 0)
  const orden = (a: MetaGuardada, b: MetaGuardada) => (a.fechaObjetivo! < b.fechaObjetivo! ? -1 : 1)
  if (futuras.length) return [...futuras].sort(orden)[0]
  return [...conFecha].sort(orden)[conFecha.length - 1]
}

/**
 * El techo de la rampa: el objetivo más grande de las activas. Es el número que va en el título
 * («Objetivo 100 compras diarias») mientras la barra mide el escalón, así que **los dos números
 * están escritos** y ninguno se esconde detrás del otro.
 */
export function techoDeLaRampa(metas: MetaGuardada[]): MetaGuardada | null {
  const activas = metas.filter((m) => m.activa)
  if (!activas.length) return null
  return activas.reduce((a, b) => (b.objetivo > a.objetivo ? b : a))
}

/**
 * La unidad de un medidor **dicha en la palabra de la marca**.
 *
 * 🔴 **El catálogo de `MEDIDORES` está escrito en BDI.** `unidades-dia` se llama ahí «Fundas por día
 * que salen» y su unidad es `fundas/día`, y está bien: nació con Norte, que es Dirección y mira BDI.
 * Pero esta pantalla existe en las dos marcas, y **Zattia no vende fundas**. Traducirlo acá y no en
 * el catálogo es a propósito: la `unidad` de `MEDIDORES` también es la que Norte **escribe en la
 * base** como espejo de la fila, y ésa no puede depender de quién esté mirando.
 *
 * ⚠️ Sólo se traduce el medidor que cuenta unidades. `ventas-dia` dice `ventas/día` en las dos: una
 * compra es una compra, venda fundas o prendas.
 */
export function unidadDeLaMeta(medidor: string, plural: string): string {
  return medidor === 'unidades-dia' ? `${plural}/día` : unidadDe(medidor)
}

/**
 * Qué mide una meta en un día puntual: `compras` para el medidor `ventas-dia`, `unidades` para
 * `unidades-dia`.
 *
 * ⛔ **Los medidores de plata (`contrib-dia`, `contrib-unidad`) devuelven `null` con su motivo**,
 * no un cero: la contribución sale del dashboard y por acá no pasa. Es la misma regla de
 * `medirMeta` en Norte, y por eso `avanceDeMeta` puede recibir esto tal cual.
 */
export function medirElDia(meta: MetaGuardada, dia: DiaDeVenta | null): Medicion {
  if (!dia) return { valor: null, motivo: 'ese día no está en los datos que bajó el navegador' }
  if (meta.medidor === 'ventas-dia') return { valor: dia.compras, motivo: null }
  if (meta.medidor === 'unidades-dia') return { valor: dia.unidades, motivo: null }
  return { valor: null, motivo: `«${meta.medidor}» se mide con la plata del dashboard y esta pantalla no la trae` }
}


/**
 * Cómo viene la venta **en general**, partida por canal.
 *
 * Lo pidió Bruno el 18-ago-2026: la sección contestaba el objetivo online y el resultado del sale,
 * y *«la liquidación siempre es excepcional»* — faltaba el piso contra el que se lee todo eso.
 *
 * 🔑 **Se arma sumando la misma `serieDiaria`, no con una consulta nueva.** El corte de canal, el
 * de día y el «una venta de cero unidades igual es una compra» ya viven ahí: una segunda cuenta
 * sobre las mismas filas es la forma de que esta tarjeta y el contador de arriba se contradigan.
 *
 * 🔴 **La ventana la decide `cortesDeVentas`, y NO un `hoy - 30` propio.** La primera versión
 * recortaba por su cuenta y quedaba desfasada un día del `sales30` del ETL, que es de donde sale el
 * ranking de acá abajo: **dos ventanas de 30 días adentro de una tarjeta que dice «Últimos 30
 * días» una sola vez**. Se vio cotejando contra `psql` —CORSET FRANK daba 24 por un lado y 22 por
 * el otro— y es exactamente lo que ese helper existe para impedir: «una sola definición de los
 * últimos 30 días» (su docstring). El filtro por `new Date(fecha) >= corte` es la MISMA comparación
 * que hace `lib/etl/computar.ts`.
 */
export type VentaDeCanal = { canal: 'online' | 'local' | 'mayorista'; compras: number; unidades: number }

/**
 * Cuántos días de serie se arman antes de recortar con el corte del ETL. Es el mismo techo que usa
 * el contador (lo que baja un no-admin, menos un día de gracia): con 30 días de ventana alcanza y
 * sobra, y pedir más devolvería días en cero que no son cero, son «no bajó».
 */
const DIAS_DE_LA_SERIE = 34

export const CANALES_DEL_RESUMEN: VentaDeCanal['canal'][] = ['online', 'local', 'mayorista']

export function resumenPorCanal(
  ventas: FilaVenta[],
  detalles: FilaDetalle[],
  today: Date,
  dias: 7 | 30,
): VentaDeCanal[] {
  const cortes = cortesDeVentas(today)
  const corte = dias === 7 ? cortes.c7 : cortes.c30
  return CANALES_DEL_RESUMEN.map((canal) => {
    const serie = serieDiaria(ventas, detalles, canal, hoyIso(today), DIAS_DE_LA_SERIE)
      .filter((d) => new Date(d.fecha) >= corte)
    return {
      canal,
      compras: serie.reduce((a, d) => a + d.compras, 0),
      unidades: serie.reduce((a, d) => a + d.unidades, 0),
    }
  })
}

/**
 * Los que más salieron en la ventana, por unidades.
 *
 * ⚠️ **Son de TODOS los canales**, y por eso van al lado del corte de arriba y no adentro: el ETL
 * guarda `sales7/30/90` por producto sin partir por canal, y partirlo acá pediría cruzar
 * `venta_detalles` con el canal de cada venta — otra cuenta, sobre las mismas filas, que podría
 * contradecir a la de al lado. Se dice en la pantalla en vez de insinuar lo que no es.
 *
 * ⛔ **No hay ventana de 90 días acá.** Quien no ve el análisis fino baja 35 días de venta
 * (`desdeVentas`), así que un «90 d» le mostraría 35 bajo un rótulo que dice 90.
 */
export function losQueMasSalieron(productos: Producto[], dias: 7 | 30, cuantos = 8): Producto[] {
  const de = (p: Producto) => (dias === 7 ? p.sales7 : p.sales30)
  // ⚠️ Sin copia explícita **a propósito**: `.filter()` ya devuelve un array nuevo, así que el
  // `.sort()` de abajo ordena la copia y no el `allProductos` del store. El `[...productos]` que
  // había era ruido —sugería que sin él se mutaba el array del llamador, y no— y lo delató un
  // mutante que sobrevivió: sacarlo no cambiaba nada.
  return productos.filter((p) => de(p) > 0).sort((a, b) => de(b) - de(a)).slice(0, cuantos)
}
