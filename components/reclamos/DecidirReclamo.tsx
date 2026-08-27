'use client'

/**
 * La pantalla donde Administración decide qué se hace con un reclamo, con la evidencia y la
 * cuenta delante. Son **dos decisiones separadas**:
 *
 *  1. **¿Conviene que el producto vuelva?** Es económica y la decidimos nosotros. La cuenta está a
 *     la vista: lo recuperable contra lo que sale el envío de vuelta. El matiz que la hace útil
 *     es que un producto fallado NO vuelve a stock —lo único que se saca de él es venderlo en
 *     feria—, así que se mide contra el PVP de feria y no contra el precio de lista.
 *  2. **Qué recibe el cliente**: la plata entera, una parte, otra unidad igual, o un cupón.
 *
 * La sugerencia no decide sola: se puede pedir el retorno igual, y queda registrado que se fue
 * en contra de la cuenta.
 *
 * ── Por qué está en TRES PESTAÑAS (27-ago-2026) ────────────────────────────────
 *
 * Era una tira de 19 bloques, y el orden estaba dado vuelta: **el envío de vuelta y el PVP de
 * feria se cargaban 150 líneas más abajo de la caja cuyo techo calculan**. Con los campos vacíos,
 * "¿Intentamos que se lo quede?" mostraba $0, los dos botones apagados, y un aviso en rojo
 * pidiendo registrar algo que la pantalla no dejaba hacer.
 *
 * 🔑 **El corte no es estético: las pestañas están ordenadas por el flujo del dato**, así que
 * ningún bloque depende de un campo que esté más abajo. Antes de mover algo de pestaña, mirar de
 * dónde salen sus insumos.
 *
 *   ① Qué pasó    — la evidencia y la pregunta que decide (de acá cuelga todo lo demás)
 *   ② El producto — los números → el veredicto → la oferta → que vuelva o no → el destino de c/u
 *   ③ El cliente  — la salida, la plata y el resumen
 */

import { useMemo, useState } from 'react'
import {
  Button, Field, Input, Lightbox, Modal, NumberField, Notice, Select, MoneyText, StatusPill, Tabs,
  color, font, space, weight, useToast,
} from '@/components/ui'
import type { TabItem } from '@/components/ui/Tabs'
import type { Marca } from '@/lib/nav'
import { BuscarArticuloGN } from '@/components/ui/BuscarArticuloGN'
// ⚠️ No está en el barril de `@/components/ui`: se importa directo.
import { InfoPopover } from '@/components/ui/InfoPopover'
import { decidir, reclasificar } from '@/lib/reclamos/cliente'
import {
  calcularMonto, compensacionesDe, convieneRetorno, costoDelCaso, cuentaDescuento,
  destinoDe, hayEnvio,
  MOTIVO_LABEL, numeroReclamo, puedeVolverLaPrenda, VIA_LABEL,
  admiteDevolucionParcial, devuelveElEnvioDeIda, expectativaLabel, expectativasDe,
  GRAVEDAD_DEF, ofreceRetencion, pvpFeriaSugerido, correccionesMalArmado, type GravedadFalla,
  type RespuestaRetencion,
  casoDe, escenarioDe, productoEnJuego, reclasificaA,
  faltantesDeLaDecision, loQueTraba, estadoDelPaso, PASO_LABEL, PISO_RETORNO,
  type PasoDecision, type FaltaDecision,
  DESTINO_LABEL, laUnidadVuelve,
  itemsQueFaltaron, tituloExpectativa, type Expectativa,
  type Compensacion, type DestinoPrenda, type MotivoReclamo, type ReclamoRow, type ItemReclamo, type OrdenTN,
  type ViaRetorno,
} from '@/lib/reclamos/tipos'

/** Todas las salidas. Cuáles se ofrecen lo decide `compensacionesDe` según lo que pasó. */
const SALIDAS: { key: Compensacion; label: string; ayuda: string }[] = [
  { key: 'plata_total', label: 'Le devolvemos todo', ayuda: 'La devolución clásica.' },
  { key: 'plata_parcial', label: 'Le devolvemos una parte', ayuda: 'Se queda con el producto y un descuento acordado. La salida más barata: ni envío ni reintegro completo.' },
  { key: 'otra_unidad', label: 'Le mandamos otra igual', ayuda: 'No se toca la plata. Sale una unidad de stock.' },
  { key: 'otro_producto', label: 'Lo cambia por otro producto', ayuda: 'El cambio de siempre: elegís lo que se lleva y sale la diferencia de precio.' },
  { key: 'reenvio', label: 'Le mandamos lo que corresponde', ayuda: 'Se despacha lo que faltó o lo correcto. No se toca la plata.' },
  { key: 'cupon', label: 'Le damos un cupón', ayuda: 'Cuesta menos que efectivo y lo retiene. El cupón se genera aparte y se anota acá.' },
  { key: 'ninguna', label: 'Nada', ayuda: 'Se resuelve sin compensación.' },
]

export function DecidirReclamo({
  marca, reclamo, orden, onClose, onListo,
}: {
  marca: Marca
  reclamo: ReclamoRow
  orden?: OrdenTN | null
  onClose: () => void
  onListo: () => void
}) {
  const toast = useToast()
  // Estable entre renders: de estos ítems cuelgan tres useMemo.
  const items = useMemo(() => reclamo.items || [], [reclamo.items])
  const esFalla = reclamo.motivo === 'falla'

  /**
   * **El escenario**: cuál de las respuestas cerradas del caso se encontró.
   *
   * Se contesta ACÁ y no en el alta porque la pregunta que decide se contesta **con la evidencia
   * delante** —las fotos, las fechas del envío—, y en el alta todavía no hay ninguna. Lo que se
   * carga al abrir es qué dijo el cliente; lo que se decide acá es qué pasó.
   *
   * 🔑 Y no es un dato de color: en la publicación, en la demora y en la cancelación **el escenario
   * cambia el perfil**, o sea quién paga el envío y si hay producto en juego.
   */
  const [escenario, setEscenario] = useState<string | null>(reclamo.escenario ?? null)
  const caso = casoDe(reclamo.motivo)
  /** En una falla el escenario ES la gravedad: mismas dos claves, un solo dato. */
  const gravedad = (esFalla ? escenario : null) as GravedadFalla | null

  const hayPrendaQueVuelva = puedeVolverLaPrenda(reclamo.motivo, escenario)
  const nuncaSalio = !hayPrendaQueVuelva
  /** Demora y cancelación: no hay producto que mover, y el final puede quedar vacío. */
  const hayProducto = productoEnJuego(reclamo.motivo, escenario)
  /** El escenario dice que en realidad es otro caso: se ofrece mudarlo, con su historia. */
  const mudarA = reclasificaA(reclamo.motivo, escenario)

  /** Solo las salidas que tienen sentido para lo que pasó. */
  const opciones = useMemo(() => {
    const permitidas = compensacionesDe(reclamo.motivo, escenario)
    return SALIDAS.filter((s) => permitidas.includes(s.key))
  }, [reclamo.motivo, escenario])
  const [compensacionElegida, setCompensacion] = useState<Compensacion>(() => compensacionesDe(reclamo.motivo, reclamo.escenario)[0] || 'plata_total')
  /**
   * La salida se **deriva**, no se sincroniza con un effect: cambiar el escenario puede sacar del
   * repertorio la que estaba elegida (una demora del transporte ya no admite cupón), y un effect
   * que la corrija deja un render mostrando una salida que ya no vale.
   */
  const compensacion: Compensacion = opciones.some((s) => s.key === compensacionElegida)
    ? compensacionElegida
    : (opciones[0]?.key || 'ninguna')
  // Arranca con lo que ya se haya cargado en el alta, si es que se cargó.
  const [expectativa, setExpectativa] = useState<Expectativa | ''>(reclamo.expectativa ?? '')
  const [montoAcordado, setMontoAcordado] = useState<number | ''>('')
  /**
   * ¿Se le devuelve el envío de ida? Lo decide el MOTIVO, no quien resuelve: cuando el error fue
   * NUESTRO, o cuando el cliente no recibió nada. Dejarlo a criterio hacía que el mismo caso se
   * resolviera distinto según quién lo tocara.
   */
  const envioDelMotivo = devuelveElEnvioDeIda(reclamo.motivo, escenario)

  /**
   * Devolución parcial o total, y quién lo elige.
   *
   * En "no tenemos stock" **decide el cliente**: se le avisa que un producto no salió y contesta si
   * quiere que le devolvamos sólo ése —el resto se despacha— o el pedido entero. Es el único caso
   * del módulo donde la decisión no es nuestra: todavía no recibió nada y no hay nada que evaluar.
   *
   * Sólo se ofrece si hay algo que partir: un pedido de un solo producto, o donde falta todo, no
   * tiene parcial que valga.
   */
  const hayParcial = admiteDevolucionParcial(items)
  const [alcance, setAlcance] = useState<'faltante' | 'todo'>('faltante')
  const itemsADevolver = useMemo(
    () => (hayParcial && alcance === 'faltante' ? itemsQueFaltaron(items) : items),
    [hayParcial, alcance, items],
  )

  /**
   * El envío de ida se devuelve sólo si **no se recibió nada de nada**. En una parcial el resto del
   * pedido sí se despacha, así que el envío se prestó: devolverlo sería regalar plata.
   */
  const devuelveElEnvio = envioDelMotivo && !(hayParcial && alcance === 'faltante')
  const [envioVuelta, setEnvioVuelta] = useState<number | ''>('')
  /**
   * El corte por monto. Arranca en el piso de la marca (`PISO_RETORNO`) y ⛔ ya no vacío: es una
   * política del negocio, no un dato de este caso, y como campo en blanco el corte no existía
   * salvo que alguien se acordara de tipearlo. Se puede pisar acá para un caso puntual.
   */
  const [piso, setPiso] = useState<number | ''>(PISO_RETORNO[marca] ?? '')
  // Solo hace falta para la cuenta cuando el producto está fallada: es lo único que se recupera.
  const [pvpFeria, setPvpFeria] = useState<number | ''>('')
  const [cupon, setCupon] = useState('')
  /**
   * **La oferta de retención**: cuánto se le ofreció para que se lo quede y qué contestó.
   *
   * Arranca de la fila porque decidir se puede volver a abrir, y ⛔ lo ya registrado no se pisa.
   * Nulo = **sin registrar**, que ⛔ no es lo mismo que "no se le ofreció": si el vacío contara
   * como negativa, todos los reclamos anteriores a esta columna serían rechazos inventados.
   */
  const [retencion, setRetencion] = useState<RespuestaRetencion | null>(reclamo.retencion_respuesta ?? null)
  const [retencionMonto, setRetencionMonto] = useState<number | ''>(reclamo.retencion_monto ?? '')
  /**
   * La escapatoria de la oferta: el sistema dijo que no convenía ofrecer nada y la persona la hizo
   * igual. ⛔ No se puede tapar el registro sólo porque el veredicto haya sido otro — la cuenta de
   * cuántas veces funciona la retención se rompe con los casos que no se anotan.
   */
  const [ofreciIgual, setOfreciIgual] = useState(false)
  /**
   * **El destino de cada producto**, cuando hay más de uno. Vacío en un índice = el del reclamo.
   *
   * Un reclamo de dos productos puede terminar con uno volviendo sano a stock y el otro en poder
   * del cliente, y hasta hoy se decidía uno solo para los dos — en BDI son 3 de cada 10.
   */
  const [destinos, setDestinos] = useState<Record<number, DestinoPrenda | ''>>(() => {
    const inicial: Record<number, DestinoPrenda | ''> = {}
    ;(reclamo.items || []).forEach((it, i) => { inicial[i] = it.destino || '' })
    return inicial
  })
  /** Sólo en "pedido mal armado": lo que le llegó por error, cargado con las fotos delante. */
  const [recibidos, setRecibidos] = useState<ItemReclamo[]>(reclamo.items_correctos ?? [])

  const [via, setVia] = useState<ViaRetorno>('andreani')
  // El envío del REEMPLAZO: solo existe cuando se le manda otra unidad, y también lo pagamos nosotros.
  const [envioIda, setEnvioIda] = useState<number | ''>('')
  const [guardando, setGuardando] = useState(false)
  /**
   * La foto que se está mirando a pantalla completa, o `null`.
   *
   * 🔑 **No es un adorno: es la evidencia con la que se contesta la pregunta que decide.** El
   * escenario se elige mirando estas fotos —si la diferencia es objetiva, si la falla la deja
   * inútil, qué le mandaron por error— y hasta el 27-ago-2026 lo único que había era un recorte
   * cuadrado de 96 px. Una raspadura no se ve ahí.
   */
  const [ampliada, setAmpliada] = useState<string | null>(null)

  /** Cuántas unidades entran en el reclamo: lo que multiplica a los valores por unidad. */
  const unidades = useMemo(() => items.reduce((s, it) => s + (Number(it.cantidad) || 0), 0), [items])

  /** Los ítems con el PVP de feria que se cargue acá, para que la cuenta lo tome. */
  const itemsConFeria: ItemReclamo[] = useMemo(() => {
    const f = Number(pvpFeria)
    if (!isFinite(f) || f <= 0) return items
    return items.map((it) => ({ ...it, pvp_feria: it.pvp_feria ?? f }))
  }, [items, pvpFeria])

  const cuenta = useMemo(
    () => convieneRetorno(itemsConFeria, {
      fallada: esFalla,
      envioVuelta: Number(envioVuelta) || 0,
      piso: Number(piso) || 0,
    }),
    [itemsConFeria, esFalla, envioVuelta, piso],
  )

  // Arranca en lo que sugiere la cuenta; se puede cambiar a mano.
  const [pedirRetorno, setPedirRetorno] = useState<boolean | null>(null)
  const retorno = nuncaSalio ? false : (pedirRetorno ?? cuenta.conviene)

  const monto = useMemo(
    () => calcularMonto(itemsADevolver, orden, {
      devolverEnvio: devuelveElEnvio,
      montoAcordado: compensacion === 'plata_parcial' ? Number(montoAcordado) || 0
        : compensacion === 'otra_unidad' || compensacion === 'ninguna' || compensacion === 'cupon' ? 0
          : null,
    }),
    [itemsADevolver, orden, devuelveElEnvio, compensacion, montoAcordado],
  )

  /**
   * Las dos correcciones de stock del pedido mal armado, que van en direcciones OPUESTAS:
   *
   *  - **El que se mandó por error** salió del depósito y GN nunca lo descontó, porque no estaba en
   *    la venta. Si el cliente se lo queda, hay que descontarlo.
   *  - **El que pidió** no salió: sigue en el depósito, pero GN lo descontó con la venta. Si no se
   *    le reenvía, hay que anular esa línea para que vuelva a estar disponible.
   *
   * La cuenta existía (`correccionesMalArmado`) con tests y **no la llamaba nadie**.
   */
  const correcciones = useMemo(
    () => correccionesMalArmado({
      equivocadoVuelve: retorno,
      seEnviaElCorrecto: compensacion === 'reenvio',
    }),
    [retorno, compensacion],
  )

  /**
   * Dónde termina el producto: es lo que después decide si la falla descuenta stock o no.
   * **Null cuando no hay producto en juego** (demora, cancelación): ahí no hay nada que decidir.
   */
  const destino: DestinoPrenda | null = destinoDe(reclamo.motivo, retorno, escenario)

  const costo = useMemo(
    () => costoDelCaso({
      montoDevuelto: monto.total,
      envioVuelta: retorno ? Number(envioVuelta) || 0 : 0,
      envioReemplazo: compensacion === 'otra_unidad' ? Number(envioIda) || 0 : 0,
      items,
      // 🔑 `destino` YA salió de `destinoDe(motivo, retorno, escenario)`, así que el retorno está
      // adentro. Acá decía `retorno ? (destino ?? 'falla') : 'falla'`, y ese `'falla'` fijo hacía
      // que **una demora contara el costo entero de la mercadería como perdida**, cuando el
      // cliente la recibió y es suya. `null` (sin producto en juego) ahora vale cero.
      destino,
    }),
    [monto.total, retorno, envioVuelta, envioIda, compensacion, items, destino],
  )

  const guardar = async () => {
    /**
     * 🔑 **Se avisa ANTES de mandar, y se dice EN QUÉ PESTAÑA está lo que falta.** Hasta hoy
     * `guardar` no tenía un solo `if`: mandaba, el servidor rechazaba, y volvía un toast con el
     * mensaje crudo del handler y sin ninguna pista de dónde arreglarlo — con la pantalla partida
     * en tres eso pasaba de incómodo a imposible.
     *
     * ⛔ El botón **no** se deshabilita: un botón apagado sin decir por qué es el defecto que este
     * módulo ya tuvo dos veces. Se aprieta, y te lleva.
     */
    const traba = loQueTraba(faltas)
    if (traba) {
      setTrabo(traba)
      setPaso(traba.paso)
      toast.error(`Falta algo en «${PASO_LABEL[traba.paso]}»: ${traba.que}.`)
      return
    }
    setTrabo(null)
    setGuardando(true)
    try {
      await decidir({
        store: marca,
        id: reclamo.id,
        destino_prenda: destino,
        escenario,
        compensacion,
        monto_producto: monto.producto,
        monto_acordado: compensacion === 'plata_parcial' ? Number(montoAcordado) || 0 : null,
        monto_envio_devuelto: monto.envio,
        monto_total: monto.total,
        devolver_envio: devuelveElEnvio,
        retorno_sugerido: cuenta.conviene,
        retorno_decidido: retorno,
        via_retorno: retorno ? via : null,
        envio_costo: retorno && hayEnvio(via) ? Number(envioVuelta) || null : null,
        envio_ida_costo: compensacion === 'otra_unidad' ? Number(envioIda) || null : null,
        costo_caso: costo,
        cupon_codigo: compensacion === 'cupon' ? cupon.trim() || null : null,
        // Las dos mitades de la oferta viajan juntas: el servidor rechaza media.
        retencion_respuesta: retencion,
        retencion_monto: retencion ? montoOferta : null,
        expectativa: expectativa || null,
        items_correctos: reclamo.motivo === 'mal_armado' ? recibidos : undefined,
        // Sólo cuando hay más de un producto: en el de uno solo, el destino del reclamo ES el del
        // producto y escribirlo dos veces son dos lugares donde puede quedar distinto.
        destinos: hayVariosProductos
          ? Object.fromEntries(items.map((_, i) => [i, destinos[i] || null]))
          : undefined,
        // Techo de seguridad del servidor: nunca se devuelve más de lo que se pagó por la orden.
        techo_orden: orden?.total != null ? Number(orden.total) : null,
      })
      toast.ok(compensacion === 'otro_producto'
        ? 'Decidido. Seguí el cambio desde la pestaña Cambios.'
        : retorno ? 'Decidido. Queda esperando que vuelva el producto.' : 'Decidido.')
      onListo()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  /**
   * Mudarlo al caso que corresponde. **Conserva número, fotos, relato e historial**: lo único que
   * cambia es el caso y el escenario, que ya no vale porque es de otra lista.
   */
  async function mudar(a: MotivoReclamo) {
    setGuardando(true)
    try {
      await reclasificar(marca, reclamo.id, a, `desde ${MOTIVO_LABEL[reclamo.motivo]} — ${escenarioDe(reclamo.motivo, escenario)?.label || ''}`)
      toast.ok(`Movido a ${MOTIVO_LABEL[a]}. El reclamo conserva su número y sus fotos.`)
      onListo()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  /** Hasta cuánto se puede descontar para que se lo quede, y cuánto conviene ofrecer primero. */
  const descuento = useMemo(
    () => cuentaDescuento({ items: itemsConFeria, fallada: esFalla, envioVuelta: Number(envioVuelta) || 0 }),
    [itemsConFeria, esFalla, envioVuelta],
  )

  /**
   * La oferta de retención sólo tiene sentido con las fotos delante: hasta ver en qué estado está
   * el producto no se sabe qué se está ofreciendo. Y sólo en los casos donde el cliente LO TIENE:
   * si nunca salió, no hay nada que quedarse.
   */
  const hayFotos = !!(reclamo.fotos || []).length
  const mostrarRetencion = ofreceRetencion(reclamo.motivo, escenario) && hayFotos

  /**
   * El destino por producto sólo aparece con **dos o más**: con uno, el destino del reclamo ya ES
   * el del producto, y preguntarlo dos veces son dos lugares donde puede quedar distinto.
   */
  const hayVariosProductos = items.length > 1 && !!destino

  /**
   * Lo que se le ofrece. Arranca en lo que sugiere la cuenta y se puede cambiar: lo que se negocia
   * de verdad rara vez es el número redondo que sale de una fórmula.
   */
  const montoOferta = retencionMonto === '' ? descuento.sugerido : Number(retencionMonto) || 0

  /**
   * Registrar la respuesta. Volver a apretar la misma la borra: marcar por error ⛔ no puede ser
   * irreversible (mismo criterio que el "¿qué se fotografió?" de Sesión de fotos).
   *
   * 🔑 **Aceptar apaga el pedido de retorno.** Si se lo queda, no vuelve nada — y dejar las dos
   * cosas prendidas contaba el producto dos veces: esperándolo en la bandeja de retornos y en poder
   * del cliente. El servidor rechaza esa combinación, así que acá se resuelve en el mismo gesto.
   */
  const contestoLaOferta = (r: RespuestaRetencion) => {
    if (retencion === r) { setRetencion(null); return }
    setRetencion(r)
    setRetencionMonto(montoOferta)
    if (r === 'acepto') {
      setCompensacion('plata_parcial')
      setMontoAcordado(montoOferta)
      setPedirRetorno(false)
    }
  }

  // ── Las tres pestañas ─────────────────────────────────────────────────────────

  const [paso, setPaso] = useState<PasoDecision>('que-paso')
  /**
   * Lo que trabó el último intento de confirmar, para que quede escrito en la pestaña donde está.
   * ⚠️ El toast dura 9 s y resolver un reclamo tarda más: si el aviso vive sólo ahí, se pierde.
   */
  const [trabo, setTrabo] = useState<FaltaDecision | null>(null)

  // Sin `useMemo` a propósito: es una función pura y barata, y el compilador de React la memoiza
  // solo. Envuelta a mano, el lint corta el build con "existing memoization could not be preserved".
  const faltas = faltantesDeLaDecision({
    motivo: reclamo.motivo, escenario, compensacion, retorno,
    envioVuelta, pvpFeria, montoAcordado, envioIda,
    // El monto sólo cuenta como "oferta registrada" si hay una respuesta: el campo arranca con el
    // sugerido, y un sugerido que nadie dijo ⛔ no es una oferta a medias.
    retencionMonto: retencion ? montoOferta : '',
    retencionRespuesta: retencion,
  })

  /**
   * ⚠️ **Una pestaña sin nada que contestar ⛔ no lleva chip de "falta".** En una demora o una
   * cancelación no hay producto en juego: la pestaña 2 no está incompleta, está vacía a propósito,
   * y marcarla en rojo empuja a inventar un destino con tal de poder cerrar — que es exactamente
   * el defecto que tuvo este módulo hasta el 25-ago-2026.
   *
   * 🔑 Y **queda clickeable igual**, con el porqué adentro. Deshabilitarla escondería la única
   * explicación de por qué faltan campos, y un `title=` no se ve en un teléfono.
   */
  const pasoVacio: Record<PasoDecision, string | null> = {
    'que-paso': null,
    producto: hayProducto ? null : 'Acá no hay producto en juego',
    cliente: null,
  }

  const chip = (p: PasoDecision) => {
    if (pasoVacio[p]) return <StatusPill tone="neutral" label="—" />
    const e = estadoDelPaso(faltas, p)
    if (!e) return null
    return <StatusPill tone={e === 'traba' ? 'danger' : 'warning'} label={e === 'traba' ? 'traba' : 'falta'} />
  }

  const tabs: TabItem[] = (['que-paso', 'producto', 'cliente'] as PasoDecision[]).map((p) => ({
    key: p,
    label: PASO_LABEL[p],
    badge: chip(p),
    // El `title` dice QUÉ falta, no sólo que falta: el chip solo obliga a abrir la pestaña a ver.
    hint: pasoVacio[p] || faltas.filter((f) => f.paso === p).map((f) => f.que).join(' · ') || undefined,
    guia: `decidir-${p}`,
  }))

  return (
    <Modal
      abierto onCerrar={onClose} ancho="ancho"
      titulo={`Decidir ${numeroReclamo(reclamo.id)}`}
      /**
       * 🔑 **La botonera va al pie del Modal, que ⛔ NO scrollea.** Estaba al fondo del cuerpo:
       * había que bajar 800 px para confirmar, y con la pantalla partida en tres eso pasaba de
       * incómodo a "el botón está en otra pestaña". Al lado va la plata, que es lo único del
       * resumen que hay que tener a la vista todo el tiempo.
       */
      pie={(
        <>
          <div style={{ flex: '1 1 auto', display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', fontSize: font.sm }}>
            <span>Se le devuelve <b><MoneyText value={monto.total} /></b></span>
            <span style={{ fontSize: font.xs, color: color.mut }}>El caso cuesta <MoneyText value={costo} /></span>
          </div>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="solid" tone="brand" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Confirmar la decisión'}
          </Button>
        </>
      )}
    >
      <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[3] }}>
        {MOTIVO_LABEL[reclamo.motivo]} · orden #{reclamo.orden_tn || '—'} · {reclamo.cliente || 'sin nombre'}
        {reclamo.pago_metodo ? ` · pagó por ${reclamo.pago_metodo}` : ''}
      </div>

      {/* Las tres pestañas son los tres momentos de la decisión, y el orden importa: cada una usa
          números que se cargaron en la anterior. Se puede saltar libremente —quien conoce el caso
          no tiene por qué recorrerlo entero—, y el chip dice qué quedó sin contestar. */}
      <Tabs items={tabs} value={paso} onChange={(k) => setPaso(k as PasoDecision)} style={{ marginBottom: space[3] }} />

      {/* Lo que trabó el último intento de confirmar. Vive en la pestaña donde está el problema y
          no se va solo: el toast dura 9 s y resolver un reclamo tarda más. */}
      {trabo?.paso === paso && (
        <Notice tone="danger" style={{ marginBottom: space[3] }}>
          Para poder confirmar falta <b>{trabo.que}</b>.
        </Notice>
      )}

      {/* ════════════════ ① QUÉ PASÓ — la evidencia y la pregunta que decide ════════════════ */}
      {paso === 'que-paso' && (<>

      {/* La evidencia que cargó el cliente por el link. Se toca para verla entera: el recorte de
          96 px alcanza para saber que hay una foto, no para decidir con ella. */}
      {!!(reclamo.fotos || []).length && (
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginBottom: space[3] }}>
          {(reclamo.fotos || []).map((f, i) => (
            /* Un `<button>` y no un `<img onClick>`: se llega con el teclado y el lector de
               pantalla lo anuncia como algo que se puede tocar. `height: 'auto'` es obligatorio en
               un botón crudo (ver AGENTS.md: `.shell-content button` fija altura y lo desborda). */
            <button
              key={i}
              type="button"
              onClick={() => setAmpliada(f.url)}
              title="Ver la foto entera"
              aria-label={`Ampliar la foto ${i + 1} de ${(reclamo.fotos || []).length}`}
              style={{
                padding: 0, height: 'auto', lineHeight: 0, cursor: 'zoom-in',
                border: `1px solid ${color.line}`, borderRadius: 6, background: 'none', overflow: 'hidden',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt="" style={{ width: 96, height: 96, objectFit: 'cover', display: 'block' }} />
            </button>
          ))}
        </div>
      )}
      <Lightbox src={ampliada} alt="Foto que cargó el cliente" onCerrar={() => setAmpliada(null)} />
      {reclamo.relato_cliente && (
        <Notice tone="neutral" style={{ marginBottom: space[3] }}>“{reclamo.relato_cliente}”</Notice>
      )}
      {!(reclamo.fotos || []).length && esFalla && (
        <Notice tone="warning" style={{ marginBottom: space[3] }}>
          Todavía no hay fotos. Si el producto se lo queda el cliente, no vas a poder cerrar el
          reclamo sin al menos una.
        </Notice>
      )}

      {/* ── La pregunta que decide ──
          El centro del caso. Es UNA pregunta con una lista cerrada, y va primero porque de la
          respuesta cuelga todo lo de abajo: qué salidas se ofrecen, quién paga el envío, y si hay
          producto que mover. En la falla la pregunta la hacen los botones de gravedad, más abajo. */}
      {caso && !esFalla && (
        <Field label={caso.pregunta} hint={caso.detalle} style={{ marginBottom: space[3] }}>
          <Select
            value={escenario ?? ''}
            onChange={(e) => setEscenario(e.target.value || null)}
          >
            <option value="">Todavía no lo miré</option>
            {caso.escenarios.map((e) => (
              <option key={e.clave} value={e.clave}>{e.label}</option>
            ))}
          </Select>
        </Field>
      )}

      {/* En la falla, la misma pregunta la hacen estos botones: la gravedad ES el escenario, las
          dos claves son las mismas (`util`/`inutil`). Da además el punto de partida del PVP de
          feria —lo único que se recupera de un producto fallado—, que hasta hoy se tipeaba sin
          ninguna referencia. Ese campo vive en «El producto», así que se dice de dónde salió. */}
      {esFalla && (
        <Field label={casoDe('falla')?.pregunta || '¿Qué tan rota está?'} hint="da el PVP de feria de arranque; se ajusta en «El producto»" style={{ marginBottom: space[3] }}>
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            {(Object.keys(GRAVEDAD_DEF) as GravedadFalla[]).map((g) => (
              <Button
                key={g} size="sm"
                variant={gravedad === g ? 'solid' : 'outline'}
                tone={g === 'inutil' ? 'danger' : 'brand'}
                title={GRAVEDAD_DEF[g].ayuda}
                onClick={() => { setEscenario(g); setPvpFeria(pvpFeriaSugerido(items, g)) }}
              >{GRAVEDAD_DEF[g].label}</Button>
            ))}
            {gravedad && <span style={{ fontSize: font.xs, color: color.mut, alignSelf: 'center' }}>{GRAVEDAD_DEF[gravedad].ayuda}</span>}
          </div>
        </Field>
      )}

      {/* El escenario dice que en realidad es otro caso. ⛔ No es un consejo al costado: es un
          botón, y el reclamo se muda conservando número, fotos, relato e historial. */}
      {mudarA && (
        <Notice tone="warning" style={{ marginBottom: space[3] }}>
          Esto ya no es <b>{MOTIVO_LABEL[reclamo.motivo]}</b>: por lo que se encontró, corresponde{' '}
          <b>{MOTIVO_LABEL[mudarA]}</b>.{' '}
          <Button
            size="sm" variant="outline" tone="brand" disabled={guardando}
            onClick={() => void mudar(mudarA)}
          >Mudarlo a {MOTIVO_LABEL[mudarA]}</Button>
        </Notice>
      )}

      {/* Qué quiere el cliente. Se puede completar ACÁ y no sólo al abrir el reclamo: en la
          mayoría de los casos se sabe recién después de escribirle, así que exigirlo en el alta
          era pedir que alguien invente el dato. Es lo que justifica la decisión de abajo. */}
      {!!expectativasDe(reclamo.motivo).length && (
      <Field
        label={tituloExpectativa(reclamo.motivo)}
        hint="lo que pidió el cliente — sirve para ver cuántas veces resolvemos distinto"
        style={{ marginBottom: space[3] }}
      >
        <Select value={expectativa} onChange={(e) => setExpectativa(e.target.value as Expectativa | '')} style={{ maxWidth: 320 }}>
          <option value="">Sin registrar</option>
          {expectativasDe(reclamo.motivo).map((x) => (
            <option key={x} value={x}>{expectativaLabel(x, reclamo.motivo)}</option>
          ))}
        </Select>
      </Field>
      )}

      {/* ¿Hasta dónde llega la devolución? Sólo aparece si hay algo que partir: con un solo
          producto, o si falta todo, no hay parcial que valga.

          Los dos montos van a la vista porque es lo que se le va a decir al cliente, y porque el
          total incluye el envío y el parcial no — el resto del pedido sí se despacha, así que ese
          envío se prestó. */}
      {hayParcial && (
        <Field
          label="¿Hasta dónde llega la devolución?"
          hint="lo elige el cliente: todavía no recibió nada"
          style={{ marginBottom: space[3] }}
        >
          <Select value={alcance} onChange={(e) => setAlcance(e.target.value as 'faltante' | 'todo')} style={{ maxWidth: 420 }}>
            <option value="faltante">Sólo lo que no tenemos — el resto se despacha</option>
            <option value="todo">Todo el pedido, más el envío</option>
          </Select>
          <div style={{ fontSize: font.xs, color: color.mut, marginTop: 4 }}>
            {alcance === 'faltante'
              ? <>Se devuelve <b>{itemsQueFaltaron(items).map((i) => i.producto).join(', ')}</b>. El envío no se devuelve: el resto del pedido sale igual.</>
              : <>Se devuelven <b>los {items.length} productos</b> y también el envío que pagó.</>}
          </div>
        </Field>
      )}

      {/* ── Pedido mal armado: qué recibió REALMENTE ──
          Va acá y no en el alta porque hasta ver las fotos no se sabe qué le mandaron. Sin este
          dato no se puede saber qué stock corregir, y eran DOS correcciones en direcciones
          opuestas que hasta ahora no hacía nadie. */}
      {reclamo.motivo === 'mal_armado' && (
        <div style={{ border: `1px solid ${color.line}`, borderRadius: 8, padding: space[3], marginBottom: space[3] }}>
          <div style={{ fontWeight: weight.semibold, fontSize: font.sm, marginBottom: 4 }}>¿Qué recibió realmente?</div>
          <div style={{ fontSize: font.xs, color: color.mut, marginBottom: space[2] }}>
            Lo que se le mandó por error, según las fotos. Es lo que dice qué stock hay que corregir.
          </div>
          <BuscarArticuloGN marca={marca} mostrarCosto={false} onSelect={(a) => setRecibidos((prev) => [...prev, {
            producto: a.product_name || 'Sin nombre', sku: a.sku, variante: a.size_name,
            cantidad: 1, product_id: a.product_id, size_id: a.size_id,
            // `costo` viene en null desde la pieza B del escalón 3 de la Fase S: el buscador ya no
            // lee `unit_cost` con la anon key. No se resuelve del lado del servidor porque **nadie
            // lo lee**: de `items_correctos` se usan product_id, size_id y cantidad —que es lo que
            // dice qué stock corregir— y en pantalla sólo se muestran producto, SKU y variante.
            // Si algún día se necesita, sale de `api/_costos.js` como en canjes y fallas.
            precio: a.retailer_price ?? null, costo: null,
          }])} />
          {!!recibidos.length && (
            <div style={{ marginTop: space[2] }}>
              {recibidos.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: font.sm, padding: '2px 0' }}>
                  <span style={{ fontWeight: weight.semibold }}>{r.producto}</span>
                  <span style={{ color: color.mut2, fontFamily: 'monospace' }}>{r.sku}</span>
                  <Button size="sm" variant="ghost" tone="danger" onClick={() => setRecibidos((p) => p.filter((_, j) => j !== i))}>Quitar</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      </>)}

      {/* ════════════ ② EL PRODUCTO — la plata del retorno, en el orden en que se calcula ════════════ */}
      {paso === 'producto' && (<>

      {/* La demora y la cancelación no tienen producto que mover, y eso NO es un caso a medio
          resolver: es un final vacío, que es legítimo. Por eso la pestaña se puede abrir aunque no
          tenga nada: decirlo es lo que evita que alguien invente un destino con tal de cerrar. */}
      {!hayProducto && (
        <Notice tone="neutral" style={{ marginBottom: space[3] }}>
          Acá <b>no hay producto en juego</b>: no vuelve nada, no se anula ninguna venta y no hay
          stock que corregir. Lo único que se decide es qué recibe el cliente.
        </Notice>
      )}

      {hayProducto && !hayPrendaQueVuelva && (
        <Notice tone="neutral" style={{ marginBottom: space[3] }}>
          {reclamo.motivo === 'no_llego'
            ? 'El pedido se perdió en el camino: no hay producto que vuelva. Queda pendiente el reclamo al transportista.'
            : 'El producto nunca salió del depósito, así que no hay nada que esperar ni etiqueta que emitir.'}
        </Notice>
      )}
      {hayPrendaQueVuelva && (
        <section style={{ marginBottom: space[4] }}>
          {/* Los tres números explicados en UN ⓘ y no en tres renglones de ayuda: son tres campos
              de una línea cada uno y la prosa junta ocupaba más que los campos. */}
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center', marginBottom: space[2] }}>
            <h4 style={{ fontSize: font.md, fontWeight: weight.bold, margin: 0 }}>¿Pedimos que vuelva el producto?</h4>
            <InfoPopover titulo="De dónde salen estos tres números">
              <p><b>Envío de vuelta</b>: el total de traerlo, que lo pagamos nosotros. Es el que decide
              si conviene pedirlo, y también el techo de lo que se le puede ofrecer para que se lo quede.</p>
              <p><b>PVP de feria</b>: lo único que se saca de un producto fallado, <b>por unidad</b> —
              no vuelve a stock, así que no se mide contra el precio de lista.</p>
              <p><b>Piso</b>: por debajo de ese monto no se pide el retorno aunque la cuenta dé, porque
              recibirlo, revisarlo y reingresarlo tampoco es gratis.</p>
            </InfoPopover>
          </div>

          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: space[2] }}>
            <Field label="Envío de vuelta ($)">
              <NumberField value={envioVuelta} onChange={(v) => setEnvioVuelta(v)} style={{ width: 120 }} />
            </Field>
            {esFalla && (
              <Field label="PVP de feria por unidad ($)" hint={unidades > 1 ? `× ${unidades} unidades` : undefined}>
                <NumberField value={pvpFeria} onChange={(v) => setPvpFeria(v)} style={{ width: 120 }} />
              </Field>
            )}
            <Field label="Piso ($)">
              <NumberField value={piso} onChange={(v) => setPiso(v)} style={{ width: 110 }} />
            </Field>
          </div>

          {/* Queda el veredicto; el desglose de la cuenta pasa al ⓘ.

              🔴 **Con el envío sin cargar NO hay veredicto que dar.** La cuenta compara lo
              recuperable contra el envío: con el campo vacío el envío vale 0, así que siempre
              contesta "Conviene pedirlo" — un veredicto que sale de un número que existe y no
              significa nada. Es el mismo defecto que el techo en $0 de la caja de acá abajo.
              ⚠️ Un 0 TIPEADO sí vale: es el caso real de "la trae al local". Por eso se mira `''`
              y ⛔ no `<= 0` — el `NumberField` guarda esa diferencia a propósito. */}
          {envioVuelta === '' ? (
            <Notice tone="warning">
              <b>Todavía no se puede saber si conviene pedirlo.</b> Cargá cuánto sale el envío de
              vuelta — si la trae al local, poné 0.
            </Notice>
          ) : (
            <Notice tone={cuenta.conviene ? 'success' : 'warning'}>
              <b>{cuenta.conviene ? 'Conviene pedirlo' : 'No conviene pedirlo'}.</b>{' '}
              <InfoPopover titulo="Por qué">
                <p>{cuenta.motivo}</p>
                {esFalla && <p>Se mide contra el PVP de feria porque un producto fallado no vuelve a stock.</p>}
              </InfoPopover>
            </Notice>
          )}

          {/* ── La oferta de retención ──
              Es plata que no sale de la caja y producto que no vuelve a costar logística.

              🔑 **Acá adentro hay DOS preguntas y sólo una es de la persona.** «¿Conviene ofrecer,
              y cuánto?» la contesta el sistema: tiene el precio, el PVP de feria y el envío. «¿Qué
              contestó el cliente?» no la puede contestar ningún número. Hasta el 27-ago-2026 la
              caja preguntaba las dos, con el campo en $0 y los botones apagados — o sea que era
              una calculadora que además retaba por no registrar lo que no dejaba registrar.

              Va DEBAJO de los números a propósito: su techo sale de `envioVuelta` y de `pvpFeria`,
              que se cargan justo arriba. Cuando estaba encima, el techo era siempre 0. */}
          {mostrarRetencion && (
            <div style={{ border: `1px solid ${color.line}`, borderRadius: 8, padding: space[3], marginTop: space[3], background: color.bg2 }}>
              <div style={{ fontWeight: weight.semibold, fontSize: font.sm, marginBottom: 4 }}>
                {descuento.conviene ? 'Ofrecele que se lo quede' : 'No conviene ofrecerle que se lo quede'}
              </div>

              {/* El veredicto, con el mismo formato que la cuenta del retorno de acá arriba. */}
              {descuento.conviene ? (
                <Notice tone="success" style={{ marginBottom: space[2] }}>
                  {descuento.convieneRegalar ? (
                    <><b>Regaláselo</b>: pedirlo de vuelta sale más caro que el producto.</>
                  ) : (
                    <>Ofrecele <b><MoneyText value={descuento.sugerido} /></b> — hasta{' '}
                    <b><MoneyText value={descuento.techo} /></b> no perdés plata.</>
                  )}
                  {' '}<InfoPopover titulo="Por qué ese techo">
                    <p>{descuento.motivo}</p>
                    <p>El techo es <b>lo que perdés porque vuelva</b>: si vuelve sano, la logística; si
                    vuelve fallado, además la diferencia entre lo que vale nuevo y lo que se saca en
                    feria. Ofrecer por debajo de eso siempre sale más barato que pedirlo de vuelta.</p>
                    <p>El sugerido es la mitad, para dejar margen a negociar.</p>
                  </InfoPopover>
                </Notice>
              ) : (
                <Notice tone={descuento.falta ? 'warning' : 'neutral'} style={{ marginBottom: space[2] }}>
                  {descuento.motivo}
                  {descuento.falta === 'pvp_feria' && (
                    <div style={{ fontSize: font.xs, marginTop: 4 }}>Cargalo acá arriba y la cuenta se contesta sola.</div>
                  )}
                </Notice>
              )}

              {/* Lo único que el sistema no puede saber: qué contestó el cliente.
                  Con veredicto de NO ofrecer, el campo y los botones no están —no hay nada que
                  registrar—, salvo que alguien haya ofrecido igual y lo diga. */}
              {(descuento.conviene || ofreciIgual || retencion) ? (
                <>
                  <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    {/* Editable: lo que se negocia de verdad rara vez es el número que sale de la
                        fórmula, y el que importa es el que se DIJO. */}
                    <Field label="Cuánto se le ofrece" hint="arranca en lo sugerido" style={{ marginBottom: 0 }}>
                      <NumberField value={montoOferta} onChange={(v) => setRetencionMonto(v)} prefix="$" style={{ width: 140 }} />
                    </Field>
                    <Button
                      size="sm" variant={retencion === 'acepto' ? 'solid' : 'outline'} tone="brand"
                      disabled={montoOferta <= 0}
                      title={montoOferta <= 0 ? 'Poné cuánto le ofreciste' : undefined}
                      onClick={() => contestoLaOferta('acepto')}
                    >Aceptó: se lo queda</Button>
                    <Button
                      size="sm" variant={retencion === 'rechazo' ? 'solid' : 'outline'} tone="neutral"
                      disabled={montoOferta <= 0}
                      title={montoOferta <= 0 ? 'Poné cuánto le ofreciste' : undefined}
                      onClick={() => contestoLaOferta('rechazo')}
                    >No aceptó</Button>
                    {retencion && !descuento.conviene && <StatusPill tone="warning" label="Va contra la sugerencia" />}
                  </div>
                  {/* 🔑 La rechazada es la que hay que registrar: la aceptada se adivina por la
                      resolución (termina en "le devolvemos una parte"), la rechazada no dejaba
                      rastro en ningún lado y por eso no se sabía cuántas veces funciona.
                      ⚠️ El aviso sólo aparece cuando hay una oferta que registrar: retar cuando la
                      pantalla no deja ofrecer nada era pedir lo imposible. */}
                  <div style={{ fontSize: font.xs, color: retencion ? color.mut : color.warningInk, marginTop: space[2] }}>
                    {retencion === 'acepto' ? 'Queda registrado que aceptó. El producto no vuelve.'
                      : retencion === 'rechazo' ? 'Queda registrado que no aceptó: seguí con el cambio o la devolución.'
                        : montoOferta > 0 ? 'Sin registrar. Si se lo ofreciste, anotá qué contestó — es lo único que después dice cuántas veces funciona.'
                          : 'Poné cuánto le ofreciste para poder anotar qué contestó.'}
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setOfreciIgual(true)}
                  style={{
                    padding: 0, height: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: font.xs, color: color.action, textDecoration: 'underline',
                  }}
                >Se lo ofrecí igual</button>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: space[2], marginTop: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Si aceptó quedárselo, el producto no vuelve: el servidor rechaza las dos cosas
                juntas (`casos.core.js`). Con la oferta a diez líneas de acá, se puede impedir en la
                pantalla en vez de que reviente al confirmar — y ⛔ sin borrarle la respuesta en
                silencio: para pedirlo de vuelta primero se saca la oferta, arriba. */}
            <Button
              variant={retorno ? 'solid' : 'outline'} tone="brand" size="sm"
              disabled={retencion === 'acepto'}
              title={retencion === 'acepto' ? 'Aceptó quedárselo: el producto no vuelve. Si igual va a volver, sacá esa respuesta acá arriba.' : undefined}
              onClick={() => setPedirRetorno(true)}
            >Que vuelva</Button>
            <Button variant={!retorno ? 'solid' : 'outline'} tone="brand" size="sm" onClick={() => setPedirRetorno(false)}>Que se lo quede</Button>
            {/* ⚠️ Sin el envío cargado no hay sugerencia contra la cual ir: el pill acusaría de
                contradecir una cuenta que todavía no contestó nada. */}
            {envioVuelta !== '' && pedirRetorno !== null && pedirRetorno !== cuenta.conviene && (
              <StatusPill tone="warning" label="Va contra la sugerencia" />
            )}
          </div>

          {/* Cómo vuelve. Si la trae al local no hay envío que pagar ni código que seguir, así que
              el costo de arriba deja de tener sentido y se avisa. */}
          {retorno && (
            <div style={{ marginTop: space[3] }}>
              <div style={{ display: 'flex', gap: space[2], alignItems: 'flex-end' }}>
                <Field label="¿Cómo vuelve?" style={{ marginBottom: 0 }}>
                  <Select value={via} onChange={(e) => setVia(e.target.value as ViaRetorno)}>
                    {(Object.keys(VIA_LABEL) as ViaRetorno[]).map((v) => (
                      <option key={v} value={v}>{VIA_LABEL[v]}</option>
                    ))}
                  </Select>
                </Field>
                {/* ⚠️ El ⓘ va AFUERA del `Field`: `Field` es un `<label>`, y un click adentro se lo
                    lleva el control aunque el popover corte la propagación. */}
                <InfoPopover titulo="Qué cambia según la vía">
                  <p><b>La trae al local</b>: sin envío, no hay etiqueta que pagar ni código que seguir,
                  y el reclamo va a decir &quot;Esperando que lo traiga&quot;.</p>
                  <p><b>Andreani o Correo</b>: el código de seguimiento se carga desde la lista, cuando
                  tengas la etiqueta.</p>
                </InfoPopover>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── El destino de cada producto ──
          Aparece sólo con dos o más. Vacío = el del reclamo, que es el default explícito: sin eso
          habría que responderle a cada renglón para no cambiar nada. */}
      {hayVariosProductos && (
        <div style={{ border: `1px solid ${color.line}`, borderRadius: 8, padding: space[3], marginBottom: space[3] }}>
          <div style={{ fontWeight: weight.semibold, fontSize: font.sm, marginBottom: 4 }}>¿Y cada producto?</div>
          <div style={{ fontSize: font.xs, color: color.mut, marginBottom: space[2] }}>
            Son {items.length}. Por defecto van todos a <b>{DESTINO_LABEL[destino]}</b>; acá se cambia el que termine distinto.
          </div>
          {items.map((it, i) => {
            const elegido = (destinos[i] || destino) as DestinoPrenda
            return (
              <div key={i} style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', padding: '3px 0', fontSize: font.sm }}>
                <span style={{ fontWeight: weight.semibold, minWidth: 160 }}>{it.producto}</span>
                {it.variante && <span style={{ color: color.mut2 }}>{it.variante}</span>}
                <Select
                  value={destinos[i] || ''}
                  onChange={(e) => setDestinos((p) => ({ ...p, [i]: e.target.value as DestinoPrenda | '' }))}
                  style={{ width: 260 }}
                >
                  <option value="">Lo del reclamo — {DESTINO_LABEL[destino]}</option>
                  {/* `regalada` entró el 26-ago-2026 y es la opción que faltaba: hasta entonces,
                      para decir "esta sana se la queda el cliente" había que elegir `falla`. */}
                  {(['stock', 'falla', 'regalada', 'perdida'] as DestinoPrenda[]).map((k) => (
                    <option key={k} value={k}>{DESTINO_LABEL[k]}</option>
                  ))}
                </Select>
                {/* Lo único que le importa a Depósito: si esta unidad hay que esperarla o no. */}
                <span style={{ fontSize: font.xs, color: laUnidadVuelve(elegido, retorno) ? color.action : color.mut2 }}>
                  {laUnidadVuelve(elegido, retorno) ? 'se espera de vuelta' : 'no vuelve'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      </>)}

      {/* ════════════ ③ EL CLIENTE — qué recibe, cuánto sale y el resumen ════════════ */}
      {paso === 'cliente' && (<>

      <section style={{ marginBottom: space[4] }}>
        {/* Las siete definiciones van al ⓘ y ⛔ no una debajo del select: la que estaba abajo
            explicaba sólo la elegida, o sea justo la que ya se entendió al elegirla. */}
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', marginBottom: space[2] }}>
          <h4 style={{ fontSize: font.md, fontWeight: weight.bold, margin: 0 }}>¿Qué recibe el cliente?</h4>
          <InfoPopover titulo="Qué significa cada salida">
            {opciones.map((s) => (
              <p key={s.key}><b>{s.label}</b>: {s.ayuda}</p>
            ))}
          </InfoPopover>
        </div>
        <Field label="Salida">
          <Select value={compensacion} onChange={(e) => setCompensacion(e.target.value as Compensacion)}>
            {opciones.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </Field>

        {/* Qué stock hay que corregir en un pedido mal armado. Vive acá y ⛔ no al lado del
            buscador de «¿Qué recibió realmente?»: su último insumo es la salida que se elige en
            este mismo bloque —si se reenvía el correcto, no hay venta que anular—, así que allá
            arriba mostraba una nota que todavía no podía ser cierta. */}
        {reclamo.motivo === 'mal_armado' && !!recibidos.length && (
          <Notice tone="warning" icon="⚠" style={{ marginTop: space[2] }}>
            <b>Stock a corregir:</b> {correcciones.nota}
          </Notice>
        )}

        {compensacion === 'plata_parcial' && (
          <>
            <Field label="Monto acordado ($)" hint="Lo que se le devuelve para que se lo quede" style={{ marginTop: space[2] }}>
              <NumberField value={montoAcordado} onChange={(v) => setMontoAcordado(v)} style={{ width: 140 }} />
            </Field>
            {/* La cuenta que hace que esto valga la pena: en una falla barata el techo puede superar
                el precio, o sea que regalarlo sale más barato que pedirlo de vuelta. */}
            {!!descuento.techo && (
              <Notice tone={descuento.convieneRegalar ? 'success' : 'neutral'} style={{ marginTop: space[2] }}>
                {descuento.motivo}
                <div style={{ marginTop: 4 }}>
                  Podés ofrecer hasta <b><MoneyText value={descuento.techo} /></b> sin perder.
                  {' '}Sugerido: <b><MoneyText value={descuento.sugerido} /></b>{' '}
                  <Button size="sm" variant="outline" onClick={() => setMontoAcordado(descuento.sugerido)}>Usar</Button>
                </div>
                {Number(montoAcordado) > descuento.techo && (
                  <div style={{ marginTop: 4, color: color.warningInk }}>
                    ⚠️ Te estás pasando del techo: por encima de eso conviene pedirlo de vuelta.
                  </div>
                )}
              </Notice>
            )}
          </>
        )}
        {/* El segundo envío: el que va con el reemplazo. También a nuestro cargo, y suma al costo
            del caso — antes se contaba uno solo y el caso salía más barato de lo que era. */}
        {compensacion === 'otra_unidad' && (
          <Field label="Envío del reemplazo ($)" hint="El que va con la unidad nueva" style={{ marginTop: space[2] }}>
            <NumberField value={envioIda} onChange={(v) => setEnvioIda(v)} style={{ width: 140 }} />
          </Field>
        )}
        {/* El cambio NO se arma acá.
            Un cambio se construye en dos tiempos —se elige qué devuelve y qué se lleva, sale la
            diferencia, se le pasa al cliente, y queda a medio hacer hasta que paga—, y eso no entra
            en un modal que se confirma de una. Lo que hace este paso es dejar registrado que la
            resolución es un cambio; el armado sigue en la pantalla de Cambios, que tiene la grilla,
            el ticket, el envío y la venta en Gestión Nube. */}
        {/* Y en "no tenemos stock" el cambio no es siquiera el del mostrador: no vuelve nada,
            porque nunca salió. Se edita la venta que ya existe en vez de crear una nueva, y el
            envío no se vuelve a cobrar porque ya lo pagó en la compra. */}
        {compensacion === 'otro_producto' && (
          reclamo.motivo === 'sin_stock' ? (
            <Notice tone="action" style={{ marginTop: space[2] }}>
              Acá <b>no vuelve nada</b>: el producto nunca salió. En vez de crear una venta nueva,{' '}
              <b>se edita la venta original en Gestión Nube</b> — se saca lo que no había, se pone
              lo que eligió, y la diferencia queda marcada en esa misma venta.{' '}
              <InfoPopover titulo="Cómo se cobra la diferencia">
                <p><b>El envío no se vuelve a cobrar</b>: ya lo pagó en la compra. Si lo que eligió es
                más caro, paga sólo la diferencia entre productos.</p>
                <p>GN no permite editar ventas por API, así que se hace a mano y queda el tilde para
                no perderle el rastro.</p>
              </InfoPopover>
            </Notice>
          ) : (
            <Notice tone="action" style={{ marginTop: space[2] }}>
              Al confirmar, el reclamo queda listo como <b>cambio</b> y se sigue en la pestaña{' '}
              <b>Cambios</b>: ahí elegís qué se lleva, sale la diferencia, se cobra y se genera la
              venta en Gestión Nube.{' '}
              <InfoPopover titulo="Cómo se cuenta la diferencia">
                <p>Se cuenta <b>lista contra lista</b>: conserva el descuento que consiguió.</p>
                <p>Si la cuenta queda a favor de él, se revalúa a lo que pagó para no devolver de más.</p>
              </InfoPopover>
            </Notice>
          )
        )}
        {compensacion === 'cupon' && (
          <Field label="Código del cupón" hint="Generalo en Tienda Nube y anotalo acá" style={{ marginTop: space[2] }}>
            <Input value={cupon} onChange={(e) => setCupon(e.target.value)} style={{ width: 200 }} />
          </Field>
        )}
        {/* El envío de ida NO es una decisión: sale del motivo. Se devuelve sólo cuando el cliente
            no recibió nada —no llegó nunca, no teníamos stock—; en el resto el envío se prestó, el
            paquete llegó, y devolverlo es regalar plata. Antes era un checkbox libre que se podía
            tildar en cualquier caso. */}
        {(compensacion === 'plata_total' || compensacion === 'plata_parcial') && !!orden?.envio_costo_cliente && (
          devuelveElEnvio ? (
            <Notice tone="action" icon="ⓘ" style={{ marginTop: space[2] }}>
              Se le devuelve también <b>el envío que pagó</b> (<MoneyText value={Number(orden.envio_costo_cliente)} />):
              nunca llegó a recibir nada.
            </Notice>
          ) : (
            <div style={{ marginTop: space[2], fontSize: font.xs, color: color.mut2 }}>
              El envío de ida no se devuelve: la devolución es del producto únicamente.
            </div>
          )
        )}
      </section>

      {/* ── Resumen ── */}
      <div style={{ background: color.bg2, borderRadius: 8, padding: space[3], marginBottom: space[3] }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.sm }}>
          <span>Pagó por los productos</span><MoneyText value={monto.producto} />
        </div>
        {!!monto.envio && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.sm }}>
            <span>Envío que se le devuelve</span><MoneyText value={monto.envio} />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: weight.bold, marginTop: 4 }}>
          <span>Se le devuelve</span><MoneyText value={monto.total} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.xs, color: color.mut, marginTop: 6 }}>
          <span>Lo que nos cuesta el caso (plata + envíos + unidad)</span><MoneyText value={costo} />
        </div>
      </div>

      </>)}
    </Modal>
  )
}
