'use client'

/**
 * Devoluciones (post-venta). Dos modos, como Cambios:
 *  - **local**: abre el reclamo desde la orden de TN, copia el link para el cliente y mira el
 *    estado. No decide qué se hace ni toca plata.
 *  - **admin**: el motor — revisa la evidencia, decide (§ DecidirReclamo) y cierra los tres
 *    pendientes: la venta anulada en GN, la plata devuelta y el stock corregido en TN.
 *
 * Lo que hay que tener presente al leer esto: **el sistema no anula la venta en Gestión Nube**
 * (GN no lo expone por API) ni reintegra la plata solo. Lo que hace es no dejar que nadie se
 * olvide: lleva los pendientes y no deja cerrar el reclamo hasta que estén.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { guardarAdminPass, leerAdminPass } from '@/lib/sesion'
import {
  Button, Card, Chips, EmptyState, Field, Input, Notice, Select, SectionCard, StatusPill,
  TableWrap, THead, TBody, Tr, Th, Td, MoneyText, formatMoney, Toolbar, Tabs, KpiCard,
  color, font, space, weight, useConfirmar, useToast, type Tone,
  Instructivo,
} from '@/components/ui'
import {
  buscarOrden, crearReclamo, enriquecerConGN, leerReclamos, linkDelCliente,
  marcarAnulacion, marcarReintegro, marcarBajaGN, cambiarEstado, marcarRecibido, eliminarReclamo,
  marcarDespachado, marcarCuponEmitido, anotarOtraVenta, contestarLaOferta,
  ordenTraeDatosDePlata, pasarAFallas, descontarReemplazo, descontarRegaladas, editarReclamo,
  leerToken, reemitirToken, liberarDecision,
} from '@/lib/reclamos/cliente'
import {
  botonDecidir, calcularMonto, esCambio, estaDecidido, estadoEnCriollo, faltantesParaCerrar, loEjecutado, montoADevolver, puedeRehacerseLaDecision, laFallaDescuentaStock, loQueFaltaDescontar, MOTIVO_LABEL, MOTIVOS_EN_ROJO,
  faltaAnularAntesDeDescontar, faltaRecibirAntesDeDevolver, leerVencimiento, vencimientoEnCriollo,
  MOTIVOS_VIGENTES, numeroReclamo, pagadoPorItem, pideSeguimiento, preseleccionDelAlta, sinLaOtraVenta, VIA_LABEL, ESTADO_LABEL,
  resumenDeLoDecidido,
  alertasDe, conAlerta, tokenVencido, ESTADOS_ABIERTOS,
  ayudaDeMotivo, casoDe, expectativaLabel, expectativasDe, pideFotos, sobreLaVentaCompleta, tituloExpectativa,
  COMPENSACION_LABEL, type RespuestaRetencion,
  type Expectativa,
  type ReclamoRow, type EstadoReclamo, type ItemReclamo, type MotivoReclamo, type OrdenTN,
} from '@/lib/reclamos/tipos'
import { mensajeAcuse, mensajeApertura, mensajeCuponListo, mensajeEtiquetaEnCamino, mensajePropuesta, mensajeResolucion, mensajeRetornoRecibido, mensajeRevisando, mensajeSeguimiento } from '@/lib/reclamos/mensajes'
import { NOTA_SE_LE_ESCRIBIO } from '@/lib/reclamos/mensajes.core.js'
import { leerSeguimiento } from '@/lib/reclamos/seguimiento.core.js'
import { mensajesDeLaFila } from '@/lib/reclamos/botones'
import { BotonMensaje } from './BotonMensaje'
import { QueSeLeDijo } from './QueSeLeDijo'
import { copiarAlPortapapeles } from '@/lib/portapapeles'
import { DecidirReclamo } from './DecidirReclamo'
import { Medidor } from './Medidor'
import { DondeVa } from '@/components/postventa/GuiaPostventa'

/** Contraseña del Monitor para escribir en GN (cacheada; se pide una vez). Igual que Post-venta. */
function obtenerPass(): string {
  let p = leerAdminPass()
  if (!p) {
    p = (typeof window !== 'undefined' ? window.prompt('Ingresá tu contraseña del Monitor (para descontar el stock en GN):') || '' : '').trim()
    if (p) guardarAdminPass(p)
  }
  return p
}

const ESTADO_TONE: Record<EstadoReclamo, Tone> = {
  borrador: 'neutral',
  esperando_cliente: 'warning',
  en_revision: 'action',
  resuelto: 'brand',
  en_transito: 'action',
  recibido: 'brand',
  cerrado: 'success',
  anulado: 'neutral',
}

// Los siete motivos vigentes salen de `MOTIVOS_VIGENTES`: una sola fuente, así no se
// desincroniza con lo que acepta el servidor.

// Los estados que siguen pidiendo algo de alguien viven en el núcleo (`ESTADOS_ABIERTOS`): los
// lee también el aviso del sidebar, y dos listas es el modo de falla propio de este módulo.

function ReclamosInner({ modo }: { modo: 'local' | 'admin' }) {
  const { marca, perfil } = useSesion()
  const esAdmin = modo === 'admin'
  const toast = useToast()
  const { confirmar, pedirTexto } = useConfirmar()

  const [filas, setFilas] = useState<ReclamoRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'abiertos' | 'dormidos' | 'todos'>('abiertos')
  const [decidiendo, setDecidiendo] = useState<ReclamoRow | null>(null)
  /** Qué fila tiene abierto el resumen de lo decidido y la traza. */
  const [expandido, setExpandido] = useState<number | null>(null)
  /**
   * 🔴 **El servidor tuvo que cortar la lista** (D12 de la auditoría del 28-ago-2026). Las tres
   * pestañas filtran **en el cliente**, sobre lo que bajó: con 200 reclamos por mes, al segundo mes
   * «Abiertos» mostraba menos de los que hay **sin decir una palabra**. El tope se queda —una
   * pantalla ⛔ no puede bajar la tabla entera— pero se DICE, que es la diferencia entre un límite y
   * una mentira.
   */
  const [cortado, setCortado] = useState(false)
  /**
   * La orden DEL RECLAMO que se está decidiendo.
   *
   * ⚠️ Antes acá se pasaba `orden`, que es el estado del **formulario de alta** — y ese se resetea
   * a `null` apenas se crea el reclamo, y arranca en `null` al recargar la página. O sea que el
   * modal casi siempre decidía sin la orden, y con ella se iba `techo_orden`: **la red de seguridad
   * del servidor contra un monto disparatado viajaba vacía**. Se busca al abrir.
   */
  const [ordenDecidir, setOrdenDecidir] = useState<OrdenTN | null>(null)

  // ── Alta ──
  const [numero, setNumero] = useState('')
  const [orden, setOrden] = useState<OrdenTN | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [elegidos, setElegidos] = useState<Set<number>>(new Set())
  // El primero de la lista, no 'falla': el default tiene que ser el que más entra, y sobre todo
  // tiene que coincidir con lo que muestra el select (antes decía "No le quedó el talle" y guardaba
  // 'falla' si nadie lo tocaba).
  const [motivo, setMotivo] = useState<MotivoReclamo>(MOTIVOS_VIGENTES[0])
  const [detalle, setDetalle] = useState('')
  // Vacío = "todavía no sé". En la mayoría de los casos se sabe recién después de escribirle al
  // cliente, así que forzarlo en el alta era pedir que alguien invente el dato.
  const [expectativa, setExpectativa] = useState<Expectativa | ''>('')
  const [guardando, setGuardando] = useState(false)

  /**
   * Las dos cosas que dependen del motivo se **derivan**, no se sincronizan con un effect: un
   * effect que llama a setState dispara un render en cascada y deja un instante en que la pantalla
   * muestra un estado que ya no vale.
   *
   *  - `expectativaVal`: si la elegida no está entre las del motivo actual, no cuenta. Cambiar de
   *    "falla" a "no llegó nunca" no puede dejar guardado "el mismo producto en buen estado".
   *  - `seleccion`: en los motivos que van sobre la venta completa son todos, sí o sí. Los
   *    checkboxes además se bloquean, pero lo que manda es esto.
   */
  const expectativaVal: Expectativa | '' =
    expectativa && expectativasDe(motivo).includes(expectativa) ? expectativa : ''

  const seleccion = useMemo(
    () => (sobreLaVentaCompleta(motivo) && orden
      ? new Set((orden.products || []).map((_, i) => i))
      : elegidos),
    [motivo, orden, elegidos],
  )

  /**
   * En "no tenemos stock" el tilde **vuelve, pero significa otra cosa**: el reclamo cubre la venta
   * entera igual (por eso `seleccion` son todos), y lo que se marca es **cuál producto no salió**.
   *
   * Sin ese dato la devolución parcial no se puede resolver: haría falta saber cuál de los dos es
   * el que falta para devolver sólo ése y despachar el resto.
   */
  const marcaFaltante = motivo === 'sin_stock'

  const recargar = useCallback(async () => {
    setCargando(true); setError(null)
    try { const d = await leerReclamos(marca); setFilas(d.filas); setCortado(d.hayMas) } catch (e) { setError((e as Error).message) } finally { setCargando(false) }
  }, [marca])

  // El setState va DENTRO del await, no en el cuerpo del effect: el linter del repo rechaza el
  // setState síncrono en un effect (dispara renders en cascada). Mismo patrón que Cambios.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const d = await leerReclamos(marca)
        if (vivo) { setFilas(d.filas); setCortado(d.hayMas) }
      } catch (e) {
        if (vivo) setError((e as Error).message)
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [marca])

  const buscar = async () => {
    const n = numero.trim()
    if (!n) return
    setBuscando(true); setOrden(null); setElegidos(new Set())
    try {
      const o = await buscarOrden(marca, n)
      if (!o) {
        toast.aviso('No se encontró esa orden. Ojo: solo se encuentran las recientes.')
      } else {
        setOrden(o)
        // Con UNO viene tildado; con dos o más hay que elegir. La regla vive en el núcleo
        // (`preseleccionDelAlta`) porque decide qué se reclama, y eso después se paga.
        setElegidos(new Set(preseleccionDelAlta((o.products || []).length)))
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBuscando(false)
    }
  }

  /** Los ítems tildados, ya con lo que se pagó por cada uno (descuentos prorrateados). */
  const items: ItemReclamo[] = useMemo(() => {
    if (!orden) return []
    return (orden.products || [])
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => seleccion.has(i))
      .map(({ p, i }) => ({
        sku: p.sku ?? null,
        // Los ids de TN: son los que sirven para corregir el stock de la tienda. Los de GN los
        // completa `enriquecerConGN` cruzando por SKU, y son otros.
        tn_product_id: p.product_id == null ? null : String(p.product_id),
        variant_id: p.variant_id == null ? null : String(p.variant_id),
        producto: p.name || 'Sin nombre',
        cantidad: p.quantity ?? 1,
        precio: p.price ?? null,
        pagado: pagadoPorItem({ precio: p.price, cantidad: p.quantity ?? 1 }, orden),
        // Sólo donde el tilde significa "éste es el que no salió".
        ...(marcaFaltante ? { falto: elegidos.has(i) } : {}),
      }))
  }, [orden, seleccion, marcaFaltante, elegidos])

  const monto = useMemo(() => calcularMonto(items, orden), [items, orden])
  const conPlata = ordenTraeDatosDePlata(orden)

  const crear = async () => {
    if (!orden || !items.length) return
    setGuardando(true)
    try {
      // Antes de guardar se buscan los ids de GN por SKU: sin ellos no se puede crear la falla
      // ni corregir stock más adelante.
      const conGN = await enriquecerConGN(marca, items)
      const { token } = await crearReclamo({
        store: marca,
        orden_tn: String(orden.number),
        cliente: orden.cliente ?? null,
        motivo,
        motivo_detalle: detalle.trim() || null,
        items: conGN,
        monto_producto: monto.producto,
        pago_metodo: orden.pago_metodo ?? null,
        pago_gateway: orden.pago_gateway ?? null,
        expectativa: expectativaVal || null,
      })
      /**
       * El link del cliente sirve para UNA cosa: que suba fotos. Así que sólo se copia si en este
       * caso hacen falta — y eso depende del motivo Y de qué quiere el cliente:
       *
       *  - Si lo quiere cambiar, lo trae al mostrador y se ve en persona.
       *  - En "no le llegó nunca" y "no tenemos stock" no hay nada que fotografiar.
       *
       * De todos modos se puede volver a sacar desde la lista mientras el reclamo siga sin decidir.
       */
      /**
       * 🔴 **Querer un cambio ⛔ ya no apaga el pedido de fotos** (27-ago-2026, corrección de
       * Bruno: *«la de que quiere cambiar la prenda, si es con envío, sí necesitamos fotos para ver
       * el estado de la prenda»*). Acá el cartel mandaba a Cambios **en vez** de copiar el link, y
       * ése era el único camino por el que la prenda volvía sin que nadie la hubiera visto. Ahora
       * el link se copia igual y lo de Cambios se dice además, ⛔ no en lugar de.
       */
      const irACambios = expectativaVal === 'otro_producto' ? ' El cambio se arma desde la pestaña Cambios.' : ''
      if (!pideFotos(motivo, expectativaVal || null)) {
        toast.ok(`Reclamo creado. Acá no hacen falta fotos: escribile con el mensaje de la lista.${irACambios}`)
      } else {
        /**
         * 🔴 **El cartel dice lo que PASÓ, no lo que se intentó.** Hasta el 27-ago-2026 acá había
         * un `navigator.clipboard?.writeText(...).catch(() => {})` con el «quedó copiado» abajo
         * pase lo que pase: si el navegador no aceptaba, la persona pegaba en WhatsApp **lo que
         * tuviera antes en el portapapeles** —el link de otro cliente— y no se enteraba nadie.
         * `copiarAlPortapapeles` ya le muestra el link para copiarlo a mano cuando falla; lo único
         * que falta acá es no cantar victoria.
         */
        const copiado = await copiarAlPortapapeles(linkDelCliente(token))
        toast.ok(copiado
          ? `Reclamo creado. El link para el cliente quedó copiado.${irACambios}`
          : `Reclamo creado, pero el link NO se copió solo: copialo del cuadro, o sacalo de la lista con «Msj: pedir fotos».${irACambios}`)
      }
      setOrden(null); setNumero(''); setElegidos(new Set()); setDetalle('')
      void recargar()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  /**
   * **El mensaje salió, pero ⛔ no quedó registrado.**
   *
   * 🔑 Se dice, ⛔ no se traga: una lista de «qué se le dijo» incompleta que nadie sabe que está
   * incompleta se lee después como *«no se le dijo nada»* — el mismo «el cero afirma» que este
   * módulo viene tapando. Y dice **las dos cosas**, porque copiarse ya se copió: quien lo apretó
   * tiene el texto en el portapapeles y lo va a pegar igual.
   */
  const sinRegistrar = (e: Error) =>
    toast.error(`El mensaje se copió, pero ⛔ no quedó registrado en el reclamo: ${e.message}`)

  /**
   * El mensaje de apertura, con el link del cliente resuelto.
   *
   * El token **no viene en la fila**: `COLS` del servidor lo excluye a propósito, así que hay que
   * pedirlo aparte. Antes acá había un `d.token || String(d.id)` que, como `d.token` siempre era
   * `undefined`, armaba `/reclamo/42` — y el portal exige 32+ hex, o sea 404 garantizado. El link
   * solo funcionaba en el momento de crear el reclamo.
   *
   * Si venció, se regenera en el acto en vez de copiar un link muerto.
   */
  const textoApertura = async (d: ReclamoRow): Promise<string> => {
    const { token: emitido, vence } = await leerToken(marca, d.id)
    let token = emitido
    if (!token || tokenVencido(vence)) {
      token = await reemitirToken(marca, d.id)
      toast.ok('El link estaba vencido: se generó uno nuevo.')
      void recargar()
    }
    /**
     * Copiar el mensaje ES escribirle: de acá va derecho a WhatsApp. Así que el reclamo pasa a
     * "esperando al cliente", que era un estado huérfano —se enumeraba y se coloreaba y **ninguna
     * acción lo seteaba**—. Sin esto la lista no distingue "ya le escribí" de "ni lo miré", que es
     * justo lo que hay que saber para perseguir los que están durmiendo.
     */
    if (d.estado === 'borrador') {
      try {
        await cambiarEstado(marca, d.id, 'esperando_cliente', `${NOTA_SE_LE_ESCRIBIO}: el link para las fotos`)
        void recargar()
      } catch { /* el mensaje se copia igual: no se pierde el trabajo por un fallo de red */ }
    }
    return mensajeApertura(d, numeroReclamo(d.id), linkDelCliente(token))
  }

  /**
   * El acuse de los casos que ⛔ no piden fotos, y **el rastro de que se le escribió**.
   *
   * 🔴 Acá está la mitad que ⛔ no se ve: `demora`, `no_llego` y `sin_stock` ⛔ **no tenían ningún
   * mensaje**, y como el único gesto que saca una fila de `borrador` es copiar la apertura —que en
   * estos tres ⛔ no existe—, quedaban clavadas ahí con el aviso en rojo *«todavía no se le
   * escribió»*, que sólo apagaba que Administración decidiera.
   *
   * 🔑 **Y el estado se mueve sólo donde la pelota pasa a ser del cliente.** En `sin_stock` el
   * acuse le pregunta qué prefiere ⇒ va a `esperando_cliente`, igual que la apertura. En `demora` y
   * `no_llego` estamos esperando **al correo**, ⛔ no a él: mandarla a `esperando_cliente` afirmaría
   * una espera que no es suya, así que la fila se queda donde está y lo único que queda es el
   * evento. Es la misma lección que `laEtiquetaEstaDebida` — ⛔ no se arranca un reloj contra
   * alguien por una espera que es de otro.
   */
  const textoAcuse = async (d: ReclamoRow): Promise<string> => {
    const laPelotaEsDelCliente = d.motivo === 'sin_stock'
    try {
      await cambiarEstado(
        marca, d.id,
        laPelotaEsDelCliente && d.estado === 'borrador' ? 'esperando_cliente' : d.estado,
        `${NOTA_SE_LE_ESCRIBIO}: el acuse de recibo`,
      )
      void recargar()
    } catch { /* el mensaje se copia igual: ⛔ no se pierde el trabajo por un fallo de red */ }
    return mensajeAcuse(d, numeroReclamo(d.id))
  }

  // ── Acciones de la lista ──
  const accion = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); toast.ok(ok); void recargar() } catch (e) { toast.error((e as Error).message) }
  }

  /**
   * **Lo que contestó el cliente a la oferta de que se lo quede.**
   *
   * 🔑 **Se pregunta antes, y las dos preguntas ⛔ no son la misma.** «No aceptó» ⛔ no cambia nada
   * de lo decidido —la resolución guardada ya era la salida «si dice que no»—, así que la
   * confirmación sólo dice qué sigue. «Aceptó» **cierra la rama**: cambia la resolución, el monto,
   * apaga el pedido de retorno y recalcula los pendientes. Un gesto que mueve todo eso ⛔ no puede
   * salir de un click al lado de un mensaje.
   *
   * ⚠️ El texto nombra lo que va a pasar con **el número y la forma de esta fila**, ⛔ no en
   * genérico: es lo único que deja darse cuenta de que se apretó en la fila equivocada.
   */
  const contesto = async (d: ReclamoRow, respuesta: RespuestaRetencion) => {
    const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
    const monto = Number(d.retencion_monto) || 0
    const esCupon = d.retencion_forma === 'cupon'
    const si = await confirmar({
      titulo: respuesta === 'acepto' ? 'El cliente aceptó quedárselo' : 'El cliente no aceptó',
      ok: respuesta === 'acepto' ? 'Sí, aceptó' : 'Sí, no aceptó',
      mensaje: respuesta === 'acepto'
        ? `${numeroReclamo(d.id)}: se cierra con ${esCupon ? `un cupón de ${pesos(monto)}` : `${pesos(monto)} de devolución`} y el producto se lo queda. El pedido de retorno se apaga.`
        : `${numeroReclamo(d.id)}: sigue lo que ya estaba decidido${d.compensacion ? ` (${COMPENSACION_LABEL[d.compensacion] || d.compensacion})` : ''}. Queda registrado que la oferta no funcionó.`,
    })
    if (si) await accion(() => contestarLaOferta(marca, d.id, respuesta), respuesta === 'acepto' ? 'Anotado: se lo queda.' : 'Anotado: no aceptó.')
  }

  /**
   * ⚠️ **Anular la VENTA en Gestión Nube, ⛔ no el reclamo.** Se llamaba `anular` a secas y desde
   * que existe `anularElReclamo` (D13) eso eran dos cosas distintas con el mismo nombre, en el
   * mismo archivo y con el botón en la misma fila.
   */
  const anularLaVentaEnGN = async (d: ReclamoRow) => {
    const si = await confirmar({
      titulo: 'Venta anulada en Gestión Nube',
      ok: 'Sí, ya la anulé',
      mensaje: `¿Ya anulaste a mano la venta ${d.gn_venta_number || d.gn_venta_id || 'original'} en GN? El sistema no puede hacerlo por API: esto solo deja registrado que se hizo.`,
    })
    if (si) await accion(() => marcarAnulacion(marca, d.id), 'Anotado: la venta quedó anulada.')
  }

  /**
   * **Soltar la decisión y volver a decidirla.**
   *
   * 🔴 Hasta el 27-ago-2026 esto **sólo abría el modal**: la resolución vieja seguía en la fila, el
   * reclamo seguía en Cambios, y el botón seguía diciendo «Volver a decidir» ⇒ apretarlo se veía
   * exactamente igual que no apretarlo. Bruno lo dio tres veces seguidas con R-0022 y concluyó,
   * con razón, que no funcionaba: *«si volvés a decidir, que quede libre la decisión»*.
   *
   * 🔑 Ahora **libera primero y abre después**. La fila queda sin decidir: sale de Cambios, el
   * botón pasa a «Continuar — N de 3», y el reloj de «esperando una decisión» vuelve a correr, que
   * es lo que corresponde para una decisión soltada y no terminada.
   *
   * ⚠️ Lo que se suelta es la **resolución**, ⛔ no el análisis: el escenario, el costo de traerlo,
   * los destinos y la oferta de retención quedan. Por eso se puede soltar hoy y seguir mañana.
   */
  const volverADecidir = async (d: ReclamoRow) => {
    const si = await confirmar({
      titulo: 'Soltar la decisión',
      ok: 'Sí, soltarla',
      mensaje: esCambio(d)
        ? 'El reclamo vuelve a quedar SIN DECIDIR y sale de Cambios: se elimina lo que se haya empezado a armar del cambio. Lo que cargaste al analizarlo queda. Si salís a la mitad, queda pendiente de decisión. Todo queda registrado en el historial.'
        : 'El reclamo vuelve a quedar SIN DECIDIR y se destildan las tareas de esta resolución. Lo que cargaste al analizarlo queda. Si salís a la mitad, queda pendiente de decisión. Todo queda registrado en el historial.',
    })
    if (!si) return
    try {
      await liberarDecision(marca, d.id)
    } catch (e) {
      toast.error((e as Error).message)
      return
    }
    // ⚠️ Se abre con la fila YA liberada —`compensacion` en null—, no con la de antes: si no, la
    // pantalla mostraría «este reclamo ya está decidido» sobre algo que se acaba de soltar.
    await abrirDecidir({ ...d, compensacion: null, estado: 'en_revision' })
    void recargar()
  }

  /**
   * 🔴 **La plata ⛔ no sale hasta que el producto vuelva** (30-ago-2026). El texto de la traba sale
   * de `efectos.core.js`, el mismo string que contesta el 409 del handler.
   *
   * ⚠️ **El botón ⛔ NO se esconde, y es la regla escrita de este módulo**: una pantalla que esconde
   * un botón es una sugerencia, ⛔ no una regla — el freno de verdad es el 409. Acá se pregunta,
   * que es otra cosa: si hay que pagar antes igual, se escribe **por qué**, y eso queda en el
   * historial con el nombre de quien lo hizo. Sin la salida, el día que haga falta la plata sale
   * por transferencia y en el sistema ⛔ no queda nada.
   */
  const reintegrar = async (d: ReclamoRow) => {
    const traba = faltaRecibirAntesDeDevolver(d)
    if (traba) {
      const razon = await pedirTexto(`${traba} ¿Por qué sale igual?`, '', {
        titulo: 'Todavía no volvió el producto',
        ok: 'Devolver la plata igual',
        placeholder: 'Queda en el historial, con tu nombre',
      })
      if (razon === null) return
      if (!razon.trim()) { toast.aviso('Sin el motivo la plata ⛔ no sale antes que el producto.'); return }
      await accion(() => marcarReintegro(marca, d.id, null, razon.trim()), 'Anotado: la plata salió antes que el producto.')
      return
    }
    const si = await confirmar({
      titulo: 'Plata devuelta',
      ok: 'Sí, ya se la devolví',
      // Mismo número que la columna, y por el mismo camino: preguntar por un monto que sale de
      // otra cuenta es pedir que alguien confirme algo distinto de lo que se decidió.
      mensaje: `¿Ya le devolviste ${formatMoney(montoADevolver(d))} a ${d.cliente || 'el cliente'}${d.pago_metodo ? ` por ${d.pago_metodo}` : ''}?`,
    })
    if (si) await accion(() => marcarReintegro(marca, d.id), 'Anotado: la plata quedó devuelta.')
  }

  /**
   * Manda el producto al ledger de Fallas. El aviso dice si va a descontar stock o no, porque es
   * la diferencia que después no se ve: **si la venta original queda en pie** —el cambio, la
   * reposición, el reenvío, el cupón— ese producto ya salió del stock con la venta, y descontarlo
   * de nuevo restaría dos veces. Lo decide `laFallaDescuentaStock`, que lo saca de `anulaVenta`.
   */
  const aFallas = async (d: ReclamoRow) => {
    const descuenta = laFallaDescuentaStock(d.compensacion)

    /**
     * ⚠️ **El orden importa y descuidarlo descuenta dos veces.** La regla —y el texto— viven en
     * `efectos.core.js`: acá estaba escrita a mano y **el botón de al lado ⛔ no la tenía**. El
     * freno de verdad está antes de escribir en GN (`pasarAFallas`); esto es para avisar temprano.
     */
    const traba = faltaAnularAntesDeDescontar(d)
    if (traba) { toast.aviso(traba); return }

    const si = await confirmar({
      titulo: 'Pasar al depósito de fallas',
      ok: 'Pasar a Fallas',
      mensaje: descuenta
        ? 'Se crea la falla Y se descuenta la unidad de Gestión Nube con una venta de $0: volvió al anular la venta original, pero está fallada y no se puede revender.'
        : 'Se crea la falla SIN tocar Gestión Nube: esa unidad ya salió del stock con la venta original, que no se anuló. Descontarla de nuevo la contaría dos veces.',
    })
    if (!si) return
    try {
      // La contraseña sólo hace falta si hay que escribir en GN. Se pide una vez y queda cacheada.
      const pass = descuenta ? obtenerPass() : undefined
      if (descuenta && !pass) {
        toast.aviso('Sin la contraseña no se puede descontar el stock en GN. La falla no se creó.')
        return
      }
      const ids = await pasarAFallas(marca, d, { usuario: perfil?.name, pass })
      toast.ok(descuenta
        ? `${ids.length} falla${ids.length === 1 ? '' : 's'} en el depósito, descontada${ids.length === 1 ? '' : 's'} de GN.`
        : `${ids.length} falla${ids.length === 1 ? '' : 's'} en el depósito.`)
      void recargar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /**
   * La unidad que no existe, dada de baja en Gestión Nube.
   *
   * Antes esto escribía stock 0 en Tienda Nube, y no servía para nada: TN está conectada a GN y el
   * stock de GN pisa el de TN en la próxima sincronización, así que la corrección se deshacía sola.
   * Lo que hay que arreglar está en GN — cree que hay 0 porque descontó la venta, pero esa unidad
   * no existe, y al sacar el producto de la venta va a devolver +1— y de TN se encarga el sync.
   *
   * GN no expone ajustes de stock por API, así que esto es un TILDE: se hace a mano y se registra.
   */
  const darDeBajaEnGN = async (d: ReclamoRow) => {
    const si = await confirmar({
      titulo: 'Dar de baja el producto en Gestión Nube',
      tono: 'warning',
      ok: 'Sí, ya lo di de baja',
      mensaje: `¿Confirmás que ya diste de baja en Gestión Nube ${(d.items || []).map((i) => i.producto).join(', ')}? El sistema no lo hace solo: GN no lo permite por API. Al bajarlo en GN, Tienda Nube se corrige sola en la próxima sincronización.`,
    })
    if (!si) return
    try {
      await marcarBajaGN(marca, d.id)
      toast.ok('Anotado: la unidad quedó dada de baja en Gestión Nube.')
      void recargar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /** El código de seguimiento, cuando ya se emitió la etiqueta. */
  /**
   * 🔴 **Este campo ⛔ no guarda un dato: mueve el caso.** Vacío, el estado se lee «Falta mandarle
   * la etiqueta», el mensaje dice *«te la mandamos apenas la tengamos»* y el reloj que corre es el
   * **nuestro**, en rojo a los 2 días. Con cualquier cosa adentro pasa a «En camino de vuelta», se
   * le manda un seguimiento al cliente y el reloj que corre es el del **transporte**, a los 15.
   * ⇒ un código mal tipeado **cambia a quién estamos yendo a buscar**.
   *
   * Por eso hay un piso —⛔ no un formato, que este repo ⛔ no midió— y **lo aplica también el
   * servidor** (`seguimiento.core.js`): una pantalla que valida es una sugerencia, ⛔ no una regla.
   */
  const cargarSeguimiento = async (d: ReclamoRow) => {
    const codigo = await pedirTexto('Código de seguimiento de la vuelta', d.seguimiento_vuelta || '', {
      titulo: `Seguimiento — ${VIA_LABEL[d.via_retorno || 'andreani']}`,
      ok: 'Guardar',
    })
    if (codigo === null) return
    const leido = leerSeguimiento(codigo)
    if (!leido.ok) { toast.error(leido.error); return }
    await accion(() => editarReclamo(marca, d.id, { seguimiento_vuelta: leido.codigo }), 'Seguimiento guardado.')
  }

  /**
   * Descuenta del stock la unidad que se le manda al cliente. Es lo que evita que ese producto salga
   * del depósito sin quedar registrada en ningún lado.
   */
  const descontarLaQueVa = async (d: ReclamoRow) => {
    const si = await confirmar({
      titulo: 'Descontar el reemplazo del stock',
      tono: 'warning',
      ok: 'Descontar en GN',
      mensaje: `Se crea la venta técnica en Gestión Nube que saca del depósito ${(d.items || []).map((i) => `${i.cantidad} × ${i.producto}`).join(', ')}. Neto $0: el cliente ya lo pagó en la compra original.`,
    })
    if (!si) return
    const pass = obtenerPass()
    if (!pass) { toast.aviso('Sin la contraseña no se puede escribir la venta en GN.'); return }
    try {
      const v = await descontarReemplazo(marca, d, { user: perfil?.name || '', pass })
      toast.ok(v.number ? `Stock descontado (venta ${v.number} en GN).` : 'Stock descontado en GN.')
      void recargar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /**
   * La unidad SANA que se queda el cliente sale del stock.
   *
   * 🔑 **Es el gesto que antes había que hacer pasando por Fallas.** Sacar del depósito un producto
   * impecable obligaba a darlo de alta como falla —valuado a PVP de feria y en la lista de lo que
   * se revende como falla—, así que el ledger de Post-venta terminaba lleno de mercadería sana.
   * Ahora la falla va al cliente FALLA de Gestión Nube y esto al cliente RECLAMO.
   */
  const descontarLasQueSeQueda = async (d: ReclamoRow) => {
    // 🔴 El mismo orden que cuida el camino de Fallas, en el botón que ⛔ no lo tenía: anular
    // devuelve las unidades al stock, y esta venta es la que las vuelve a sacar.
    const traba = faltaAnularAntesDeDescontar(d)
    if (traba) { toast.aviso(traba); return }
    const faltan = loQueFaltaDescontar(d)
    const si = await confirmar({
      titulo: 'Descontar del stock lo que se queda el cliente',
      tono: 'warning',
      ok: 'Descontar en GN',
      mensaje: `Se crea la venta técnica en Gestión Nube que saca del depósito ${faltan.map((u) => `${u.item.cantidad} × ${u.item.producto}`).join(', ')}. `
        + 'Va al cliente «Reclamo», neto $0 y valuada a precio de lista. ⛔ No entra a Fallas: el producto está sano.',
    })
    if (!si) return
    const pass = obtenerPass()
    if (!pass) { toast.aviso('Sin la contraseña no se puede escribir la venta en GN.'); return }
    try {
      const v = await descontarRegaladas(marca, d, { user: perfil?.name || '', pass })
      toast.ok(v.number ? `Stock descontado (venta ${v.number} en GN).` : 'Stock descontado en GN.')
      void recargar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /**
   * El código del cupón, cuando ya se creó en la tienda.
   *
   * 🔑 **Sin código no se tilda.** El cupón se emite a mano y lo único que prueba que existe es el
   * código: tildar "ya está" sin él es cerrar el reclamo sobre una promesa, y el cliente se entera
   * recién en la próxima compra.
   */
  /**
   * 🔑 **Dos preguntas, y las dos obligatorias**: el código prueba que el cupón existe en la tienda,
   * y la fecha es lo que el cliente necesita saber antes de guardarlo para «alguna vez». Las dos las
   * vuelve a exigir el servidor (`cupon.core.js`): acá se pregunta, ⛔ no se valida sola la pantalla.
   */
  const cargarCupon = async (d: ReclamoRow) => {
    const codigo = await pedirTexto('Código del cupón', d.cupon_codigo || '', {
      titulo: 'El cupón ya existe en la tienda',
      ok: 'Siguiente',
      placeholder: 'El código que se le pasa al cliente',
    })
    if (codigo === null) return
    if (!codigo.trim()) { toast.aviso('Sin el código no hay cómo saber que el cupón existe.'); return }
    const hasta = await pedirTexto('¿Hasta cuándo lo puede usar?', vencimientoEnCriollo(d.cupon_vence || ''), {
      titulo: 'El vencimiento del cupón',
      ok: 'Guardar',
      placeholder: 'dd/mm/aaaa',
    })
    if (hasta === null) return
    const leido = leerVencimiento(hasta)
    if (!leido.ok) { toast.error(leido.error); return }
    await accion(() => marcarCuponEmitido(marca, d.id, codigo.trim(), leido.fecha), 'Cupón anotado.')
  }

  /** El número de reclamo al transportista: es lo que después permite reclamar esa plata. */
  const cargarReclamoCorreo = async (d: ReclamoRow) => {
    const nro = await pedirTexto('Número de reclamo al transportista', d.reclamo_correo || '', {
      titulo: 'Reclamo al correo',
      ok: 'Guardar',
      placeholder: 'El número que te dio Andreani / Correo',
    })
    if (nro === null) return
    const limpio = nro.trim()
    await accion(
      () => editarReclamo(marca, d.id, { reclamo_correo: limpio || null, reclamo_correo_estado: limpio ? 'hecho' : 'pendiente' }),
      limpio ? 'Reclamo al correo anotado.' : 'Queda pendiente.',
    )
  }

  /**
   * De qué OTRA venta salió el producto de más.
   *
   * 🔑 Es el único caso que toca dos ventas: del otro lado hay un cliente al que le falta este
   * producto y **todavía no reclamó**. Anotar cuál es lo que permite abrirle el faltante antes de
   * que llame — hasta ahora la pantalla prometía «se guarda cuál y se avisa» y no guardaba nada.
   */
  const anotarLaOtra = async (d: ReclamoRow) => {
    const faltan = sinLaOtraVenta(d)
    const nro = await pedirTexto('¿De qué venta salió el producto de más?', '', {
      titulo: `Producto de más — ${faltan.length > 1 ? `${faltan.length} pendientes` : 'la otra venta'}`,
      ok: 'Anotar',
      placeholder: 'Número de orden de Tienda Nube',
    })
    if (nro === null) return
    const limpio = nro.trim()
    if (!limpio) return
    await accion(
      () => anotarOtraVenta(marca, d.id, limpio),
      'Anotado. Ahora abrile el faltante a esa venta.',
    )
  }

  /** Abre la decisión con la orden del reclamo, no con la del formulario de alta. */
  const abrirDecidir = async (d: ReclamoRow) => {
    setDecidiendo(d)
    setOrdenDecidir(null)
    if (!d.orden_tn) return
    try {
      setOrdenDecidir(await buscarOrden(marca, d.orden_tn))
    } catch {
      // Sin la orden se decide igual: lo que se pierde es el tope automático y el detalle de plata.
      toast.aviso('No se pudo traer la orden: vas a tener que cargar el monto a mano.')
    }
  }

  const cerrar = async (d: ReclamoRow) => {
    const faltan = faltantesParaCerrar(d)
    if (faltan.length) { toast.aviso(`Falta ${faltan.join(', ')}.`); return }
    await accion(() => cambiarEstado(marca, d.id, 'cerrado'), 'Reclamo cerrado.')
  }

  /**
   * **Anular: el reclamo ⛔ no debió existir.**
   *
   * 🔴 El estado estaba en la lista, en los colores y en `faltantesParaCerrar` desde el día uno, y
   * ⛔ **ninguna pantalla lo podía poner** (D13 de la auditoría del 28-ago-2026) — sólo lecturas.
   * ⇒ la única forma de sacar de la lista un reclamo abierto por error, o duplicado, era
   * **eliminarlo**, y con él se iban el número, el historial y las fotos.
   *
   * 🔑 **La auditoría preguntaba si sobraba el estado; lo que sobraba era el hueco.** Anular es la
   * alternativa **no destructiva** de eliminar: la fila queda, deja de contar como abierta
   * (`ESTADOS_ABIERTOS` ⛔ no lo incluye) y el `⋯` sigue contando qué pasó.
   *
   * ⚠️ **⛔ No pide que no falte nada, y es a propósito** —a diferencia de cerrar—: decir que el
   * caso no debió existir es justamente decir que sus pendientes tampoco. El freno de administración
   * lo pone el servidor, ⛔ no este `esAdmin`.
   */
  const anularElReclamo = async (d: ReclamoRow) => {
    const si = await confirmar({
      titulo: `Anular ${numeroReclamo(d.id)}`,
      tono: 'danger',
      ok: 'Anular',
      mensaje: 'El reclamo queda registrado pero deja de contar: se usa cuando no debió existir (se abrió por error, o está duplicado). ⛔ No anula nada de lo que ya se haya hecho en Gestión Nube. Para eso está «Volver a decidir».',
    })
    if (si) await accion(() => cambiarEstado(marca, d.id, 'anulado', 'el reclamo no debió existir'), 'Reclamo anulado.')
  }

  const visibles = useMemo(() => {
    if (filtro === 'todos') return filas
    const abiertos = filas.filter((f) => ESTADOS_ABIERTOS.includes(f.estado))
    return filtro === 'dormidos' ? abiertos.filter((f) => alertasDe(f).length > 0) : abiertos
  }, [filas, filtro])

  const totales = useMemo(() => {
    const abiertos = filas.filter((f) => ESTADOS_ABIERTOS.includes(f.estado))
    return {
      abiertos: abiertos.length,
      dormidos: conAlerta(abiertos),
      plata: abiertos.filter((f) => f.reintegro_estado === 'pendiente').reduce((s, f) => s + (f.monto_total || 0), 0),
      sinAnular: abiertos.filter((f) => f.stock_estado === 'pendiente').length,
    }
  }, [filas])

  return (
    <div style={{ maxWidth: 1100 }}>
      {decidiendo && (
        <DecidirReclamo
          marca={marca} reclamo={decidiendo} orden={ordenDecidir}
          onClose={() => { setDecidiendo(null); setOrdenDecidir(null) }}
          onListo={() => { setDecidiendo(null); setOrdenDecidir(null); void recargar() }}
        />
      )}

      {esAdmin && (
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
          <KpiCard label="Reclamos abiertos" value={String(totales.abiertos)} />
          <KpiCard label="Plata sin devolver" value={<MoneyText value={totales.plata} />} tone="warning" />
          <KpiCard label="Ventas sin anular en GN" value={String(totales.sinAnular)} tone={totales.sinAnular ? 'warning' : 'neutral'} />
          <KpiCard label="Durmiendo" value={String(totales.dormidos)} sub="sin moverse hace días" tone={totales.dormidos ? 'danger' : 'neutral'} />
        </div>
      )}

      {/*
        El medidor va **debajo de los cuatro KPI y ⛔ no adentro de ellos**: los cuatro de arriba son
        trabajo pendiente —cuántos hay, cuánta plata falta— y éste es un diagnóstico que ⛔ no se
        acciona hoy. Y sobre todo, ⛔ no entra en un `KpiCard`: un número solo, sin los meses de
        atrás al lado, se lee como una tasa. Ver el 🔴 del encabezado de `Medidor`.
      */}
      {esAdmin && <Medidor marca={marca} />}

      <DondeVa activa="reclamos" />
      <Instructivo
        titulo={esAdmin ? '¿Cómo se resuelve una devolución de punta a punta?' : '¿Cómo abro una devolución?'}
        pasos={esAdmin ? [
          <>Buscá la <b>orden de Tienda Nube</b> por número, tildá los productos que reclama y elegí el <b>motivo</b>.</>,
          <>Al crear el reclamo se copia solo el <b>link para el cliente</b>: pegáselo por WhatsApp para que suba las fotos.</>,
          <>Cuando cargue, el reclamo pasa a <b>Para revisar</b>. Tocá <b>Decidir</b> y respondé las dos preguntas: si nos conviene que el producto vuelva, y qué recibe el cliente.</>,
          <>Si vuelve, elegí <b>cómo vuelve</b> y cargá el <b>seguimiento</b> cuando tengas la etiqueta. Cuando llegue, <b>Marcar recibido</b>.</>,
          <>Cerrá los pendientes que queden: <b>anular la venta en GN</b> (a mano), <b>devolver la plata</b>, y si hace falta <b>dar de baja el producto en GN</b> o <b>pasarlo a Fallas</b>.</>,
          <>Con todo resuelto, <b>Cerrar</b>.</>,
        ] : [
          <>Buscá la <b>orden de Tienda Nube</b> por número y tildá los productos que reclama.</>,
          <>Elegí el <b>motivo</b> y escribí en el detalle lo que te dijo el cliente.</>,
          <>Al crear, el <b>link queda copiado</b>: pegáselo por WhatsApp para que suba las fotos del problema.</>,
          <>Listo. Desde acá seguís el estado; <b>Administración</b> decide qué se hace y devuelve la plata.</>,
        ]}
        ojo={esAdmin
          ? <>El sistema <b>no anula la venta en Gestión Nube</b> ni devuelve la plata solo: eso lo hacés vos y acá queda la traza. El reclamo no cierra hasta que estén los tres pendientes.</>
          : <>No cierres el reclamo ni prometas un monto: la plata la calcula y la devuelve Administración.</>}
      />

      {!esAdmin && (
        <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[3] }}>
          Abrí el reclamo desde la orden y pasale el link al cliente para que suba las fotos.
          <b> Administración</b> decide qué se hace y devuelve la plata.
        </div>
      )}

      {/* ── Alta ── */}
      <SectionCard title="Nuevo reclamo" style={{ marginBottom: space[4] }}>
        <Toolbar>
          <Field label="Número de orden de Tienda Nube">
            <Input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void buscar() }}
              placeholder="20700"
              style={{ width: 160 }}
            />
          </Field>
          <Button variant="outline" onClick={() => void buscar()} disabled={buscando || !numero.trim()}>
            {buscando ? 'Buscando…' : 'Buscar'}
          </Button>
        </Toolbar>

        {orden && (
          <div style={{ marginTop: space[3] }}>
            <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[2] }}>
              Orden <b>#{String(orden.number)}</b> · {orden.cliente || 'sin nombre'}
              {orden.fecha ? ` · ${new Date(orden.fecha).toLocaleDateString('es-AR')}` : ''}
              {orden.pago_metodo ? ` · pagó por ${orden.pago_metodo}` : ''}
            </div>

            {!conPlata && (
              <Notice tone="warning" style={{ marginBottom: space[2] }}>
                Esta orden no trajo los datos de pago, así que el monto a devolver hay que cargarlo
                a mano al decidir.
              </Notice>
            )}

            {/* Cuando el reclamo es de la venta entera no se destilda nada: si después se decide
                devolver todo, tiene que devolverse TODO. Antes se podía tildar un solo producto y
                "devolver todo" devolvía sólo ése, aunque el pedido tuviera dos. */}
            {sobreLaVentaCompleta(motivo) && (
              <Notice tone="action" icon="ⓘ" style={{ marginBottom: space[3] }}>
                Este reclamo va sobre <b>la venta completa</b>: el problema es del pedido, no de un
                producto suelto.{' '}
                {marcaFaltante
                  ? <>Tildá <b>cuál es el producto que no tenemos</b>. Si después el cliente pide que
                      le devuelvan todo, se devuelve el pedido entero igual.</>
                  : <>Por eso no se pueden destildar.</>}
              </Notice>
            )}

            <TableWrap>
              <THead>
                <Tr>
                  <Th style={{ width: 34 }}></Th>
                  <Th>{marcaFaltante ? '¿Cuál no tenemos?' : 'Producto'}</Th>
                  <Th align="right">Cant.</Th>
                  <Th align="right">Precio</Th>
                  <Th align="right">Pagó</Th>
                </Tr>
              </THead>
              <TBody>
                {(orden.products || []).map((p, i) => {
                  const pagado = pagadoPorItem({ precio: p.price, cantidad: p.quantity ?? 1 }, orden)
                  const lista = Number(p.price || 0) * Number(p.quantity || 1)
                  return (
                    <Tr key={i}>
                      <Td>
                        <input
                          type="checkbox"
                          checked={marcaFaltante ? elegidos.has(i) : seleccion.has(i)}
                          disabled={sobreLaVentaCompleta(motivo) && !marcaFaltante}
                          onChange={(e) => setElegidos((prev) => {
                            const n = new Set(prev)
                            if (e.target.checked) n.add(i); else n.delete(i)
                            return n
                          })}
                        />
                      </Td>
                      <Td>
                        <div style={{ fontWeight: weight.semibold }}>{p.name}</div>
                        <div style={{ fontSize: font.xs, color: color.mut2 }}>{p.sku}</div>
                      </Td>
                      <Td align="right">{p.quantity}</Td>
                      <Td align="right"><MoneyText value={lista} /></Td>
                      <Td align="right">
                        <MoneyText value={pagado} />
                        {/* Lo que se le devolvería de más si se usara el precio de lista. */}
                        {pagado < lista && (
                          <div style={{ fontSize: font.xs, color: color.mut2 }}>−{Math.round(lista - pagado)} de desc.</div>
                        )}
                      </Td>
                    </Tr>
                  )
                })}
              </TBody>
            </TableWrap>

            <Toolbar style={{ marginTop: space[3] }}>
              <Field label="Motivo">
                <Select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoReclamo)}>
                  {MOTIVOS_VIGENTES.map((m) => <option key={m} value={m}>{MOTIVO_LABEL[m]}</option>)}
                </Select>
              </Field>
              <Field label="Detalle (opcional)" style={{ flex: 1, minWidth: 220 }}>
                <Input value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Qué dijo el cliente" />
              </Field>
              {/* Las opciones dependen del motivo: ofrecer "el mismo producto en buen estado" en un
                  arrepentimiento, o "que le manden lo que falta" en una falla, no significa nada.
                  Y es opcional: en la mayoría de los casos se sabe recién después de escribirle. */}
              {/* ⚠️ Los casos sin expectativas no muestran el campo: en "le llegó de más" el
                  reclamo lo abrimos nosotros y el cliente no pidió nada, y una demora no se
                  compensa. Un desplegable con una sola opción vacía pide que alguien invente. */}
              {/* 🔑 **Botones y ⛔ no un desplegable** (pedido de la revisión del 27-ago): se carga
                  con el cliente en el teléfono, y abrir una lista para elegir entre dos o tres es
                  un toque de más en el momento en que menos tiempo hay. `Chips` ya estaba en el
                  kit — cero componentes nuevos.
                  ⚠️ Las opciones siguen saliendo de `expectativasDe(motivo)` y ⛔ NO son una lista
                  fija: ofrecer «el mismo producto en buen estado» en un arrepentimiento, o «que le
                  manden lo que falta» en una falla, no significa nada. Eso ya se arregló una vez. */}
              {!!expectativasDe(motivo).length && (
                <Field label={tituloExpectativa(motivo)} hint="opcional — se puede completar al decidir">
                  <Chips
                    value={expectativaVal}
                    onChange={(v) => setExpectativa(v as Expectativa | '')}
                    opciones={[
                      { key: '' as Expectativa | '', label: 'No informado' },
                      ...expectativasDe(motivo).map((x) => ({ key: x as Expectativa | '', label: expectativaLabel(x, motivo) })),
                    ]}
                  />
                </Field>
              )}
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: font.xs, color: color.mut }}>Pagó por lo tildado</div>
                <div style={{ fontSize: font.lg, fontWeight: weight.bold }}><MoneyText value={monto.producto} /></div>
              </div>
            </Toolbar>

            {/* El ⓘ: cuándo se usa este motivo. Es lo que evita que "faltante", "mal armado" y "sin
                stock" —que se parecen y tienen consecuencias de stock opuestas— se elijan a dedo. */}
            <Notice tone="neutral" icon="ⓘ" style={{ marginTop: space[2] }}>
              <b>{MOTIVO_LABEL[motivo]}:</b> {ayudaDeMotivo(motivo)}
              {/* La pregunta que decide se muestra acá pero **no se contesta acá**: se contesta al
                  decidir, con las fotos y las fechas del envío delante. Mostrarla en el alta es lo
                  que hace ver que el caso elegido lleva una segunda respuesta, y cuál. */}
              {casoDe(motivo) && (
                <div style={{ marginTop: 4, color: color.mut }}>
                  Al decidir se pregunta: <b>{casoDe(motivo)!.pregunta}</b>
                </div>
              )}
            </Notice>

            <Button variant="solid" tone="brand" onClick={() => void crear()} disabled={guardando || !items.length} style={{ marginTop: space[2] }}>
              {guardando ? 'Creando…' : `Crear reclamo (${items.length} ítem${items.length === 1 ? '' : 's'})`}
            </Button>
          </div>
        )}
      </SectionCard>

      {/* ── Lista ── */}
      <Toolbar justify="between" style={{ marginBottom: space[3] }}>
        <Tabs
          variant="underline" value={filtro} onChange={(k) => setFiltro(k as 'abiertos' | 'dormidos' | 'todos')}
          items={[
            { key: 'abiertos', label: 'Abiertos' },
            { key: 'dormidos', label: totales.dormidos ? `Durmiendo (${totales.dormidos})` : 'Durmiendo' },
            { key: 'todos', label: 'Todos' },
          ]}
        />
        <Button variant="outline" onClick={() => void recargar()} disabled={cargando}>Recargar</Button>
      </Toolbar>

      {error && <Notice tone="danger">{error}</Notice>}

      {cortado && (
        <Notice tone="warning" style={{ marginBottom: space[3] }}>
          Hay <b>más reclamos de los que entran en esta lista</b>: se están mostrando los más nuevos.
          Los tres filtros de arriba trabajan sobre lo que bajó, así que puede faltar alguno de los
          viejos. Cerrá los que ya estén resueltos, o pedí subir el tope.
        </Notice>
      )}

      {!cargando && !visibles.length ? (
        <Card padding={4}>
          <EmptyState title="No hay reclamos" hint="Buscá una orden arriba para abrir el primero." />
        </Card>
      ) : (
        <TableWrap>
          <THead>
            <Tr>
              <Th>Reclamo</Th>
              <Th>Motivo</Th>
              <Th>Estado</Th>
              {/* ⛔ La plata ⛔ no va al local: quien atiende no decide cuánto vuelve, y el número
                  delante invita a prometerlo en el mostrador. La devuelve Administración — el pie
                  de la pantalla ya lo dice. */}
              {esAdmin && <Th align="right">A devolver</Th>}
              <Th>Pendientes</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {visibles.map((d) => {
              const faltan = faltantesParaCerrar(d)
              const mensajes = mensajesDeLaFila(d)
              return (
                <React.Fragment key={d.id}>
                <Tr>
                  <Td>
                    <div style={{ fontWeight: weight.semibold }}>{numeroReclamo(d.id)}</div>
                    <div style={{ fontSize: font.xs, color: color.mut2 }}>
                      {d.orden_tn ? `#${d.orden_tn}` : '—'} · {d.cliente || 'sin nombre'}
                    </div>
                    {/* Lo que está durmiendo. Solo la primera: la lista ya es larga y la más
                        urgente viene primero. */}
                    {alertasDe(d).slice(0, 1).map((a, i) => (
                      <div key={i} style={{ fontSize: font.xs, fontWeight: weight.semibold, color: a.tono === 'danger' ? color.dangerInk : color.warningInk, marginTop: 2 }}>
                        ⏱ {a.texto}
                      </div>
                    ))}
                  </Td>
                  <Td>
                    <span style={MOTIVOS_EN_ROJO.includes(d.motivo) ? { color: color.dangerInk, fontWeight: weight.semibold } : undefined}>
                      {MOTIVO_LABEL[d.motivo] || d.motivo}
                    </span>
                    {/* La lista es una sola —Administración les hace el seguimiento a todos—, así
                        que el cambio tiene que distinguirse sin abrirlo: se resuelve en otra
                        pantalla y sus pendientes son otros. */}
                    {esCambio(d) && (
                      <div style={{ marginTop: 2 }}><StatusPill tone="action" label="Cambio" dot={false} /></div>
                    )}
                  </Td>
                  <Td><StatusPill tone={ESTADO_TONE[d.estado]} label={estadoEnCriollo(d)} /></Td>
                  {/* 🔑 `montoADevolver` devuelve `null` mientras ⛔ no haya decisión, y acá eso se
                      ve como «sin decidir»: hasta el 28-ago-2026 esta celda mostraba lo que el
                      cliente pagó —un dato que está desde el minuto cero— en la columna que dice
                      cuánta plata sale, o sea afirmando una decisión que nadie tomó. */}
                  {esAdmin && <Td align="right"><MoneyText value={montoADevolver(d)} placeholder="sin decidir" /></Td>}
                  {/* 🔑 `wrap` + `maxWidth`: sin eso el `<Td>` hereda `white-space: nowrap`
                      (`components/ui/Table.tsx`) y esta celda puede tener ~140 caracteres en una
                      sola línea indivisible ⇒ la tabla gana barra horizontal y las demás columnas
                      quedan fuera de vista. Mismo patrón que `ArmarCambio.tsx` en la columna de al
                      lado. */}
                  <Td wrap style={{ maxWidth: 260 }}>
                    <div style={{ fontSize: font.xs, color: faltan.length ? color.warning : color.mut2 }}>
                      {faltan.length ? faltan.join(' · ') : 'nada'}
                    </div>
                  </Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {/* 🔑 **Qué mensajes van acá lo decide `mensajesDeLaFila`, ⛔ no cuatro
                          condiciones sueltas en el JSX.** El criterio es por MOMENTO y la mitad que
                          importa es la negativa: en `en_revision` —donde el cliente ya mandó las
                          fotos— el único botón que había era «Msj: pedir fotos». La regla, sus tres
                          preguntas y el caso de R-0022 están en `lib/reclamos/botones.ts`.
                          «Pedir más fotos» no se perdió: vive en el detalle de la fila, que es
                          adonde va quien mira las que hay y concluye que no alcanzan. */}
                      {/* El mensaje entero, no el link pelado: si solo se copia el link, alguien
                          tiene que escribir el texto alrededor y ahí cada uno promete algo distinto. */}
                      {/* 🔴 **El complemento exacto del de abajo, y el agujero más grande que
                          tenía la columna**: en «demora», «no recibido» y «sin stock» ⛔ no hay
                          fotos que pedir, así que acá ⛔ no había NADA — sobre un cliente que ya
                          había escrito enojado. Copiarlo deja además el rastro de que se le
                          escribió, que es lo que apaga el aviso. */}
                      {mensajes.includes('acuse') && (
                        <BotonMensaje
                          marca={marca} id={d.id} tipo="acuse"
                          getText={() => textoAcuse(d)}
                          onError={(e) => toast.error(e.message)}
                          onSinRegistrar={sinRegistrar}
                          label="Copiar el acuse"
                        />
                      )}
                      {mensajes.includes('pedir_fotos') && (
                        <BotonMensaje
                          marca={marca} id={d.id} tipo="pedir_fotos"
                          getText={() => textoApertura(d)}
                          onError={(e) => toast.error(e.message)}
                          onSinRegistrar={sinRegistrar}
                          label="Copiar el pedido de fotos"
                        />
                      )}
                      {/* 🔑 **El estado de la decisión, dicho en criollo.** `en_revision` puede
                          durar días —el aviso salta a los 3— y era el único momento abierto sin
                          nada que decirle: la escapatoria era «pedir más fotos», que vive adentro
                          del `⋯` porque es una decisión y ⛔ no una respuesta. */}
                      {mensajes.includes('revisando') && (
                        <BotonMensaje
                          marca={marca} id={d.id} tipo="revisando"
                          getText={() => mensajeRevisando(d, numeroReclamo(d.id))}
                          onSinRegistrar={sinRegistrar}
                          label="Copiar el aviso de revisión"
                        />
                      )}
                      {/* 🔴 **El mensaje que más se va a usar, y era el único de los cuatro que no
                          existía**: entre que Administración arma la propuesta y que el cliente
                          contesta pasan uno o tres días, y ése es el rato en el que el reclamo pasa
                          la mayor parte de su vida. El de la clienta de R-0022 hubo que escribirlo
                          a mano — o sea, cada uno prometiendo lo suyo, que es exactamente lo que
                          `lib/reclamos/mensajes.ts` existe para evitar.
                          🔑 **Reemplaza al de resolución mientras la oferta espera**, ⛔ no se le
                          suma: los dos juntos son dos promesas distintas sobre el mismo reclamo. */}
                      {mensajes.includes('propuesta') && (
                        <BotonMensaje
                          marca={marca} id={d.id} tipo="propuesta"
                          getText={() => mensajePropuesta(d, numeroReclamo(d.id))}
                          onSinRegistrar={sinRegistrar}
                          label="Copiar la propuesta"
                          tone="warning"
                        />
                      )}
                      {/* 🔴 **El eslabón que faltaba del circuito** *(Administración decide · el
                          local habla y ejecuta)*: hasta hoy la respuesta del cliente sólo se podía
                          anotar reabriendo Decidir, que es de Administración.
                          ⛔ **Sin `esAdmin` a propósito** —igual que «Despaché» y «Anulé en GN»—:
                          cuando la oferta salió, Administración ya decidió las dos ramas (el monto,
                          la forma, y la salida «por si dice que no», que es la resolución
                          guardada). El local sólo dice **cuál de las dos pasó**.
                          🔑 Y aceptar ⛔ no es un tilde más: cierra la rama —resolución, monto,
                          destino, el retorno apagado y los pendientes—, así que se pregunta antes.
                          Lo que se escribe lo deriva el servidor con `camposAlContestarLaOferta`. */}
                      {mensajes.includes('propuesta') && (
                        <>
                          <Button size="sm" variant="outline" tone="brand" onClick={() => void contesto(d, 'acepto')}>Registrar que aceptó</Button>
                          <Button size="sm" variant="outline" tone="neutral" onClick={() => void contesto(d, 'rechazo')}>Registrar que no aceptó</Button>
                        </>
                      )}
                      {mensajes.includes('resolucion') && (
                        <BotonMensaje
                          marca={marca} id={d.id} tipo="resolucion"
                          getText={() => mensajeResolucion(d, numeroReclamo(d.id))}
                          onSinRegistrar={sinRegistrar}
                          label="Copiar la resolución"
                          tone="brand"
                        />
                      )}
                      {/* 🔴 **El rato en que el cliente cree que la pelota es suya y no lo es.**
                          Decidido con retorno, la fila dice `en_transito` — pero por correo o
                          Andreani todavía ⛔ no puede despachar nada: le falta la etiqueta. Sin
                          este mensaje el reclamo queda mudo justo ahí, y el reloj de «hace N días
                          que no llega» arranca sobre una espera que nunca fue de él. */}
                      {mensajes.includes('etiqueta_en_camino') && (
                        <BotonMensaje marca={marca} id={d.id} tipo="etiqueta_en_camino" onSinRegistrar={sinRegistrar} getText={() => mensajeEtiquetaEnCamino(d, numeroReclamo(d.id))} label="Copiar el aviso de la etiqueta" tone="neutral" />
                      )}
                      {mensajes.includes('etiqueta') && (
                        <BotonMensaje marca={marca} id={d.id} tipo="etiqueta" onSinRegistrar={sinRegistrar} getText={() => mensajeSeguimiento(d, numeroReclamo(d.id), 'etiqueta')} label="Copiar la etiqueta" tone="neutral" />
                      )}
                      {/* 🔴 **El único hecho del circuito que no se le contaba al cliente.** El
                          texto existía y estaba probado desde el 27-ago; su único llamador era el
                          test ⇒ le mandábamos el cambio, la otra unidad o lo que faltaba, y del
                          otro lado no llegaba nada. Sale del pendiente que tilda Depósito, igual
                          que «plata enviada» sale del que tilda Administración. */}
                      {mensajes.includes('despacho_hecho') && (
                        <BotonMensaje marca={marca} id={d.id} tipo="despacho_hecho" onSinRegistrar={sinRegistrar} getText={() => mensajeSeguimiento(d, numeroReclamo(d.id), 'reenvio')} label="Copiar el aviso del despacho" tone="neutral" />
                      )}
                      {/* 🔴 **El único movimiento FÍSICO del ciclo que ⛔ no se le contaba.** El
                          cliente despachó, pagó la espera, y ya no tiene ni el producto ni la
                          plata: es el rato de más ansiedad de todo el recorrido, y era donde el
                          sistema se callaba. Sale del estado que sella Depósito al abrir la caja. */}
                      {mensajes.includes('retorno_recibido') && (
                        <BotonMensaje marca={marca} id={d.id} tipo="retorno_recibido" onSinRegistrar={sinRegistrar} getText={() => mensajeRetornoRecibido(d, numeroReclamo(d.id))} label="Copiar el aviso de la llegada" tone="neutral" />
                      )}
                      {/* 🔴 **La promesa que quedaba abierta**: sin código, la resolución dice «te
                          pasamos el código apenas lo tengamos», y «Cargar el cupón» lo sellaba en
                          silencio. Misma forma que el despacho que no se avisaba. */}
                      {mensajes.includes('cupon_listo') && (
                        <BotonMensaje marca={marca} id={d.id} tipo="cupon_listo" onSinRegistrar={sinRegistrar} getText={() => mensajeCuponListo(d, numeroReclamo(d.id))} label="Copiar el cupón" tone="brand" />
                      )}
                      {mensajes.includes('plata_enviada') && (
                        <BotonMensaje marca={marca} id={d.id} tipo="plata_enviada" onSinRegistrar={sinRegistrar} getText={() => mensajeSeguimiento(d, numeroReclamo(d.id), 'plata')} label="Copiar el aviso de la devolución" tone="neutral" />
                      )}
                      {/* Un cambio ya está decidido por definición: lo que falta es armarlo, y eso
                          vive en la pestaña Cambios. Ofrecer "Decidir" acá invita a resolverlo dos
                          veces. */}
                      {/* 🔑 **Dice DÓNDE ESTÁ EL TRABAJO, ⛔ no qué pantalla abre.** Decía
                          «Decidir» desde el minuto cero hasta el final, y una decisión que se hace
                          en tres pasos se deja por la mitad todo el tiempo: *«puede ser que termine
                          el primer paso, pero después sigo más tarde»* (Bruno, 27-ago-2026). Sin
                          esto, el único dato que decide si hay que abrirlo —si ya empezó— no estaba
                          en la fila. La cuenta sale de `botonDecidir`, que mira pasos GUARDADOS. */}
                      {esAdmin && !esCambio(d) && (d.estado === 'en_revision' || d.estado === 'borrador' || d.estado === 'esperando_cliente') && (
                        <Button size="sm" variant="solid" tone="brand" onClick={() => void abrirDecidir(d)}>{botonDecidir(d).label}</Button>
                      )}
                      {/* 🔴 **Una decisión apurada tiene que poder rehacerse desde acá.** El
                          27-ago-2026 se decidió un reclamo real habiendo pasado por un solo paso, y
                          la puerta quedaba cerrada: con la fila en `resuelto` o `en_transito` no
                          había ningún botón, y arreglarlo pedía que alguien corriera un script
                          contra producción.
                          `decidir` (`api/_reclamos.js`) ⛔ no tiene guard de estado: pisa la fila
                          entera y el `historial` guarda las dos decisiones. Lo que sí se recalcula
                          son los pendientes, y por eso se avisa antes. */}
                      {esAdmin && puedeRehacerseLaDecision(d) && (
                        <Button size="sm" variant="outline" tone="neutral" onClick={() => void volverADecidir(d)}>Volver a decidir</Button>
                      )}
                      {/* 🔑 **El botón se va, pero DICE por qué.** Desde que se ejecutó el primer
                          pendiente la decisión se congela —rehacerla destildaría lo ya hecho— y un
                          botón que desaparece sin explicación es el defecto que este módulo ya tuvo
                          dos veces. La lista sale de `loEjecutado`, la misma que frena el POST. */}
                      {esAdmin && estaDecidido(d) && !puedeRehacerseLaDecision(d) && loEjecutado(d).length > 0 && (
                        <span style={{ fontSize: font.xs, color: color.mut2, alignSelf: 'center' }}>
                          ya no se puede rehacer: {loEjecutado(d).join(' · ')}
                        </span>
                      )}
                      {esAdmin && esCambio(d) && d.estado !== 'cerrado' && (
                        <span style={{ fontSize: font.xs, color: color.mut2, alignSelf: 'center' }}>se sigue en Cambios</span>
                      )}
                      {/* El seguimiento se carga acá, cuando ya tenés la etiqueta en la mano — no
                          al decidir, que es cuando todavía no existe. Solo para correo/andreani:
                          el cadete y el "la trae al local" no tienen nada que rastrear. */}
                      {esAdmin && pideSeguimiento(d.via_retorno) && d.estado === 'en_transito' && (
                        <Button size="sm" variant="outline" onClick={() => void cargarSeguimiento(d)}>
                          {d.seguimiento_vuelta ? 'Cambiar código' : 'Cargar seguimiento'}
                        </Button>
                      )}
                      {esAdmin && d.estado === 'en_transito' && (
                        <Button size="sm" variant="outline" onClick={() => void accion(async () => { await marcarRecibido(marca, d.id) }, 'Marcado como recibido.')}>Marcar recibido</Button>
                      )}
                      {esAdmin && d.stock_estado === 'pendiente' && (
                        <Button size="sm" variant="outline" onClick={() => void anularLaVentaEnGN(d)}>Anular en GN</Button>
                      )}
                      {esAdmin && d.reintegro_estado === 'pendiente' && (
                        <Button size="sm" variant="outline" onClick={() => void reintegrar(d)}>Devolver la plata</Button>
                      )}
                      {/* Sin `esAdmin`: despacha Depósito. El pendiente lo dejan el cambio, la
                          reposición y el reenvío, y hasta hoy no tenía con qué tildarse — o sea
                          que ninguna de las tres se podía cerrar. */}
                      {d.envio_nuevo_estado === 'pendiente' && (
                        <Button size="sm" variant="outline" onClick={() => void accion(() => marcarDespachado(marca, d.id), 'Anotado: ya salió.')}>Despachar</Button>
                      )}
                      {/* El cupón es una promesa hasta que existe en la tienda. */}
                      {esAdmin && d.cupon_estado === 'pendiente' && (
                        <Button size="sm" variant="outline" tone="warning" onClick={() => void cargarCupon(d)}>Cargar el cupón</Button>
                      )}
                      {/* El otro cliente: un excedente toca dos ventas y la segunda no la ve
                          nadie hasta que llama. Sin `esAdmin` porque es una traza, igual que el
                          descuento: el faltante lo abre una persona y acá se anota cuál es. */}
                      {sinLaOtraVenta(d).length > 0 && (
                        <Button size="sm" variant="outline" tone="warning" onClick={() => void anotarLaOtra(d)}>
                          Cargar la otra venta
                        </Button>
                      )}
                      {/* Plata recuperable: sin este pendiente, un pedido perdido se cierra y el
                          reclamo al correo no lo hace nadie. */}
                      {esAdmin && d.reclamo_correo_estado === 'pendiente' && (
                        <Button size="sm" variant="outline" onClick={() => void cargarReclamoCorreo(d)}>
                          {d.reclamo_correo ? 'Cambiar el reclamo al correo' : 'Cargar el reclamo al correo'}
                        </Button>
                      )}
                      {/* Sin `esAdmin`: quien ve que el producto no está es Local, y tiene que
                          poder resolverlo sin pedirle permiso a nadie. */}
                      {d.tn_stock_estado === 'pendiente' && (
                        <Button size="sm" variant="outline" tone="warning" onClick={() => void darDeBajaEnGN(d)}>Dar de baja en GN</Button>
                      )}
                      {/* Sale una unidad de stock y hasta que no se haga, GN dice que sigue estando. */}
                      {esAdmin && d.compensacion === 'otra_unidad' && !d.gn_venta_reemplazo_id && (
                        <Button size="sm" variant="solid" tone="warning" onClick={() => void descontarLaQueVa(d)}>Descontar reemplazo</Button>
                      )}
                      {esAdmin && d.destino_prenda === 'falla' && !(d.falla_ids || []).length && (d.estado === 'recibido' || d.estado === 'resuelto') && (
                        <Button size="sm" variant="outline" onClick={() => void aFallas(d)}>Pasar a Fallas</Button>
                      )}
                      {/* ⚠️ Sin gate de estado, y a propósito: la unidad regalada **no vuelve**, así
                          que esperar a `recibido` —que es lo que pide "Pasar a Fallas"— la dejaría
                          sin poder descontarse nunca.

                          🔴 **Pero SÍ con gate de resolución**, desde el 27-ago-2026. El comentario
                          viejo decía «desde que se decidió, ya salió del depósito», y esa premisa se
                          cayó ese mismo día: «Confirmar paso» empezó a guardar `destino_prenda` por
                          `editar` para poder analizar un reclamo en varias sentadas, así que el
                          campo existe **antes** que la decisión. Sin esto, el botón que crea la
                          venta técnica en GN aparece sobre un reclamo sin resolver — y si después se
                          decide que el producto vuelve, la unidad quedó descontada de más.
                          📊 Medido con la fila de R-0022: `loQueFaltaDescontar` devolvía los dos
                          productos con `compensacion: null`. El freno de verdad está en el servidor
                          (409); esto es para que el botón no esté a mano. */}
                      {esAdmin && estaDecidido(d) && !!loQueFaltaDescontar(d).length && (
                        <Button size="sm" variant="solid" tone="warning" onClick={() => void descontarLasQueSeQueda(d)}>Descontar lo que se queda</Button>
                      )}
                      {!!(d.falla_ids || []).length && (
                        <span style={{ fontSize: font.xs, color: color.mut2, alignSelf: 'center' }}>en Fallas</span>
                      )}
                      {esAdmin && ESTADOS_ABIERTOS.includes(d.estado) && !faltan.length && (
                        <Button size="sm" variant="solid" tone="success" onClick={() => void cerrar(d)}>Cerrar</Button>
                      )}
                      {/* Lo decidido y la traza. Sin esto la fila es puro botón de acción: para
                          saber qué se resolvió había que deducirlo de qué botones quedaban. */}
                      <Button
                        size="sm" variant="ghost"
                        title="Qué se decidió y qué pasó"
                        onClick={() => setExpandido(expandido === d.id ? null : d.id)}
                      >⋯</Button>
                      {/* 🔴 **El estado que ninguna pantalla podía poner** (D13). Va ANTES de
                          «Eliminar» porque es lo que casi siempre corresponde: los dos dicen «este
                          caso no debió existir», y éste ⛔ no se lleva puesto el número, el
                          historial ni las fotos. */}
                      {esAdmin && ESTADOS_ABIERTOS.includes(d.estado) && (
                        <Button size="sm" variant="ghost" tone="warning" onClick={() => void anularElReclamo(d)}>Anular el reclamo</Button>
                      )}
                      {esAdmin && (
                        <Button
                          size="sm" variant="ghost"
                          onClick={async () => {
                            const si = await confirmar({ titulo: 'Eliminar el reclamo', tono: 'danger', ok: 'Eliminar', mensaje: 'Se elimina el registro y ⛔ no queda rastro. Si el reclamo no debió existir, lo que corresponde es «Anular»: la fila queda con su número y su historial. ⛔ No anula nada de lo que ya se haya hecho en Gestión Nube.' })
                            if (si) await accion(() => eliminarReclamo(marca, d.id), 'Reclamo eliminado.')
                          }}
                        >Eliminar</Button>
                      )}
                    </div>
                  </Td>
                </Tr>
                {expandido === d.id && (
                  <tr>
                    <td colSpan={6} style={{ padding: `${space[3]}px ${space[4]}px`, background: color.bg, borderBottom: `1px solid ${color.line}` }}>
                      <div style={{ display: 'flex', gap: space[5], flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 280, flex: '1 1 280px' }}>
                          <div style={{ fontSize: font.xs, fontWeight: weight.semibold, color: color.mut, marginBottom: 4 }}>Lo decidido</div>
                          {resumenDeLoDecidido(d, modo === 'admin' ? 'admin' : 'local').map((r, i) => (
                            <div key={i} style={{ fontSize: font.xs, display: 'flex', gap: 8, padding: '1px 0' }}>
                              <span style={{ color: color.mut2, minWidth: 130 }}>{r.que}</span>
                              <span style={{ color: color.ink2 }}>{r.valor}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ minWidth: 280, flex: '1 1 280px' }}>
                          <div style={{ fontSize: font.xs, fontWeight: weight.semibold, color: color.mut, marginBottom: 4 }}>Qué pasó</div>
                          {(d.historial || []).length
                            ? (d.historial || []).map((h, i) => (
                              <div key={i} style={{ fontSize: font.xs, color: color.ink2, display: 'flex', gap: 8, flexWrap: 'wrap', padding: '1px 0' }}>
                                <span style={{ color: color.mut2, fontVariantNumeric: 'tabular-nums' }}>{new Date(h.at).toLocaleString('es-AR')}</span>
                                <span style={{ fontWeight: weight.semibold }}>{h.estado ? ESTADO_LABEL[h.estado] : '—'}</span>
                                {h.usuario && <span style={{ color: color.mut }}>· {h.usuario}</span>}
                                {h.nota && <span style={{ color: color.mut }}>· {h.nota}</span>}
                              </div>
                            ))
                            : <div style={{ fontSize: font.xs, color: color.mut2 }}>Sin movimientos.</div>}
                        </div>
                        {/* 🔴 **Lo que se le prometió al cliente, que hasta el 29-ago-2026 ⛔ no
                            quedaba en ninguna parte** (D9). «Qué pasó» de al lado cuenta los
                            estados; esto cuenta las palabras — y cuando el cliente vuelve diciendo
                            *«me dijeron otra cosa»*, lo único que había para contestarle era la
                            memoria de quien atendió. Se pide aparte porque pesa: ver `QueSeLeDijo`. */}
                        <QueSeLeDijo marca={marca} id={d.id} />
                      </div>
                      {/* 🔑 **La escapatoria de «pedir fotos», y por qué está ACÁ.** El botón de la
                          columna se va apenas llega la primera foto —pedirle de nuevo lo que ya
                          mandó es lo que hacía pensar al local—, pero a veces las fotos no alcanzan.
                          Quien se da cuenta de eso es el que está mirando el caso, y para eso abre
                          el detalle: el pedido de más fotos vive donde se toma esa decisión, ⛔ no
                          en la columna de «qué toca ahora». Es el mismo link y el mismo mensaje;
                          si venció, `textoApertura` lo reemite. */}
                      {mensajes.includes('mas_fotos') && (
                        <div style={{ marginTop: space[3], display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <BotonMensaje
                            marca={marca} id={d.id} tipo="mas_fotos"
                            getText={() => textoApertura(d)}
                            onError={(e) => toast.error(e.message)}
                            onSinRegistrar={sinRegistrar}
                            label="Copiar el pedido de más fotos"
                            tone="neutral"
                          />
                          <span style={{ fontSize: font.xs, color: color.mut2 }}>
                            Ya cargó {(d.fotos || []).length} foto{(d.fotos || []).length === 1 ? '' : 's'}: esto le vuelve a mandar el mismo link.
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </React.Fragment>
              )
            })}
          </TBody>
        </TableWrap>
      )}

      {esAdmin && !!totales.sinAnular && (
        <Notice tone="warning" style={{ marginTop: space[3] }}>
          Hay {totales.sinAnular} venta{totales.sinAnular === 1 ? '' : 's'} sin anular en Gestión Nube.
          Mientras no se anulen, esas ventas siguen contando y el stock no vuelve.
        </Notice>
      )}
      {perfil && !esAdmin && (
        <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[3] }}>
          La plata la devuelve Administración.
        </div>
      )}
    </div>
  )
}

export function Devoluciones() { return <ReclamosInner modo="admin" /> }
export function ReclamosLocal() { return <ReclamosInner modo="local" /> }
