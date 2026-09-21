'use client'

/**
 * "Pagos" — la tercera pestaña del panel de WhatsApp, al lado de Cliente y Hoy.
 *
 * # Qué contesta, y por qué es una pestaña y no un recuadro
 *
 * El paralelo con "Hoy" es exacto: **"Hoy" dice a quién hablarle; "Pagos" dice quién debe y qué
 * se comprometió.** Es la agenda del día, pero de cobranza.
 *
 * Hasta el 3-sep-2026 esto vivía como un bloque chico adentro de la ficha del cliente, y ahí estaba
 * de más y de menos a la vez (Darío, mirándolo en uso):
 *
 * - **De menos**, porque lo trataba como un dato de contexto de ESE cliente cuando en realidad es
 *   una lista de trabajo que cruza a todos: quién debe, qué se comprometió, qué falta confirmar. Metido
 *   en la ficha, para saber qué había pendiente había que ir cliente por cliente.
 * - **De más**, porque competía con lo que la ficha contesta, que es "¿qué le vendo a esta
 *   persona?".
 *
 * # 🔑 Las dos listas están separadas a propósito
 *
 * Ver `colaDeCobranza` en `lib/compromisos/core.ts`: un "dice que transfirió" espera trabajo
 * NUESTRO (mirar el banco y confirmarlo) y un "prometido" espera al cliente. Son dos tareas de dos
 * personas distintas, y mezcladas la que uno puede resolver hoy queda escondida entre las que no.
 *
 * # Lo que sí es de este cliente sigue acá arriba
 *
 * Anotar un compromiso nuevo necesita saber quién va a transferir, y eso se decide hablando. Por eso
 * el formulario está arriba de todo y usa el cliente del chat abierto: no se vuelve a escribir a
 * quién, ya está identificado. Sin chat abierto la pestaña sigue sirviendo —la lista de trabajo es
 * lo que más se mira— y en lugar del formulario dice qué falta para poder anotar.
 *
 * # ⚠️ Las dos trampas ya pagadas del panel (ver `Aislado.tsx`)
 *
 * 1. Va envuelto en `Aislado` del lado del que la llama. La app no tiene ningún `ErrorBoundary`:
 *    un error acá adentro desmontaría también la ficha.
 * 2. **No se consulta nada al abrir un chat.** Los hooks viven adentro de este componente, que se
 *    monta recién cuando alguien toca la pestaña. Cambiar de chat con la pestaña cerrada no cuesta
 *    ni una consulta.
 */

import { useCallback, useMemo, useState } from 'react'
import { Button, EmptyState, Icono, Notice } from '@/components/ui'
import { color, font, radius, shadow, space } from '@/components/ui/tokens'
import { DatosDeCuenta } from './DatosDeCuenta'
import { useAcreedores } from '@/components/acreedores/useAcreedores'
import { useCompromisos } from '@/components/acreedores/useCompromisos'
import { NuevoCompromiso, type QuienPaga } from './NuevoCompromiso'
import type { Acreedor, CuentaBancaria } from '@/lib/acreedores/cliente'
import { cambiarEstado, confirmarCompromiso, vincularCompromiso } from '@/lib/compromisos/cliente'
import { destinoDeAcreedor, destinosDeCuentas, type DestinoCompromiso } from '@/lib/compromisos/destino'
import { useCuentas } from '@/components/acreedores/useCuentas'
import {
  colaDeCobranza, diasPara, comprometidoPorAcreedor, sePuedeComprometer, sinVincular,
  mostrar as plata, paraEditar, parsearMonto, restanteTrasConfirmar,
  type Compromiso,
} from '@/lib/compromisos/core'
import { hoyISO } from '@/lib/crm/seguimiento'

/** De a cuántas cerradas se muestran. No es una lista de trabajo: es para mirar atrás un rato. */
const CERRADAS = 10

/**
 * El único margen lateral de la pestaña.
 *
 * 🔑 **Existe porque había tres.** Las tarjetas arrancaban a 20 px del borde (8 de margen + 12 de
 * padding), los títulos de sección a 12 y el aviso a 18: cada pieza estaba bien sola y la columna
 * se leía despareja. En 350 px de ancho eso se nota más que cualquier otra cosa. ⛔ Todo lo que se
 * dibuje acá adentro arranca en esta línea y no en una propia.
 */
const MARGEN = space[3]

/** La fecha comprometida, en el idioma en que se piensa la cobranza. */
function cuando(fecha: string | null, hoy: string): { txt: string; tarde: boolean } {
  const d = diasPara(fecha, hoy)
  if (d === null) return { txt: 'sin fecha', tarde: false }
  if (d === 0) return { txt: 'lo se comprometió para hoy', tarde: false }
  if (d < 0) return { txt: `vencida hace ${-d} ${-d === 1 ? 'día' : 'días'}`, tarde: true }
  return { txt: `para dentro de ${d} ${d === 1 ? 'día' : 'días'}`, tarde: false }
}

/**
 * Un bloque de la pestaña, a todo el ancho.
 *
 * ⛔ **Ya no es una tarjeta flotante.** Una columna de 350 px pierde 42 px —el 12 %— en márgenes y
 * bordes laterales, y a cambio no gana nada: no hay nada al costado de lo que haya que separarse.
 * Lo que separa un bloque del de arriba es la línea y el fondo blanco contra el gris de la página,
 * igual que en la solapa "Hoy" — que es la otra lista de trabajo del mismo panel y hasta ahora se
 * dibujaba con la convención contraria.
 */
function Bloque({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: color.surface, borderTop: `1px solid ${color.line2}`, borderBottom: `1px solid ${color.line2}`,
        padding: `${space[2]}px ${MARGEN}px ${space[3]}px`, marginBottom: space[2],
      }}
    >
      {titulo && (
        <div style={{ fontSize: font.xs, fontWeight: 700, letterSpacing: 0.4, color: color.mut2, textTransform: 'uppercase', marginBottom: 6 }}>
          {titulo}
        </div>
      )}
      {children}
    </section>
  )
}

/**
 * Una chapita.
 *
 * 🔑 **Existe para sacar cosas de la columna de texto.** La fila tenía el estado en el título de la
 * sección, "todavía no está cargado" como un renglón en rojo y el resto como frases: todo apilado y
 * todo del mismo peso, que es lo que hacía que la pantalla se leyera como un párrafo. Una chapita
 * dice lo mismo sin ocupar una línea y sin gritar.
 */
function Chapa({ children, tono = 'neutro' }: {
  children: React.ReactNode
  tono?: 'neutro' | 'espera' | 'nuestro' | 'tarde' | 'entro'
}) {
  const c =
    tono === 'nuestro'
      ? { fg: color.brand, bg: color.brandBg, bd: color.brandBorder }
      : tono === 'tarde'
        ? { fg: color.dangerInk, bg: color.dangerBg, bd: color.dangerBorder }
        : tono === 'entro'
          ? { fg: color.successInk, bg: color.successBg, bd: color.successBorder }
          : tono === 'espera'
            ? { fg: color.warningInk, bg: color.warningBg, bd: color.warningBorder }
            : { fg: color.mut2, bg: color.bg2, bd: color.line2 }
  return (
    /*
      ⚠️ **Las medidas son las del `Chip` de la ficha del cliente** (11 px / 600 / 2-8), no unas
      propias. Eran 10 px / 700 / 1-7: la misma chapita a dos tamaños, en el mismo panel y a un
      toque de distancia. ▶️ Las dos copias siguen siendo dos (ésta y la de `PanelWhatsApp.tsx`);
      juntarlas de verdad es mudarlas a un archivo común, que es otra pasada.
    */
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
      border: `1px solid ${c.bd}`, background: c.bg, color: c.fg,
    }}>
      {children}
    </span>
  )
}

/**
 * La plata, en los tres tamaños que tiene la pestaña y con las cifras alineadas.
 *
 * 🔑 **`tabular-nums` no es un detalle**: sin eso, en una lista de seis montos las comas caen en
 * lugares distintos y hay que leer número por número en vez de barrerlos de arriba abajo. Es lo
 * mismo que hace `MoneyText` del kit, que acá no se puede usar directo porque el formato de los
 * compromisos es el de `plata.core.js` (muestra centavos sólo cuando los hay).
 *
 * 🔑 **Y los tamaños son tres y no uno.** Antes el total de la pestaña, el monto de cada fila y el
 * "se le puede pedir" de cada acreedor eran casi iguales y todos negros: como ninguno era
 * claramente el más importante, ninguno lo era. `total` aparece **una sola vez por pantalla**.
 */
function Monto({ v, tam = 'fila', tono }: {
  v: number
  tam?: 'total' | 'fila' | 'chico'
  tono?: string
}) {
  const fs = tam === 'total' ? font['2xl'] : tam === 'fila' ? font.xl : font.md
  return (
    <span style={{
      fontSize: fs, fontWeight: 700, color: tono ?? color.ink, lineHeight: 1.15,
      fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
    }}>
      {plata(v)}
    </span>
  )
}

/**
 * El título de una lista, con cuántas hay.
 *
 * ⚠️ El número va apagado y no pegado con un punto: `Falta confirmar · 2` se leía como una frase
 * de tres partes del mismo peso. Lo que se busca es la palabra; el número es el dato de al lado.
 */
function Titulo({ children, cuantas }: { children: React.ReactNode; cuantas?: number }) {
  return (
    <div style={{ padding: `${space[3]}px ${MARGEN}px ${space[2]}px` }}>
      <div style={{ fontSize: font.sm, fontWeight: 700, color: color.ink }}>
        {children}
        {cuantas !== undefined && (
          <span style={{ marginLeft: 6, fontWeight: 600, color: color.mut2, fontVariantNumeric: 'tabular-nums' }}>{cuantas}</span>
        )}
      </div>
    </div>
  )
}

/**
 * Los renglones de "estoy buscando" y de "no tenés permiso".
 *
 * ⚠️ Quedan grises y chicos a propósito —no son noticias—, pero con el mismo margen que todo lo
 * demás. Lo que ⛔ no puede quedar así es una FALLA: un renglón gris suelto se lee como una
 * pantalla a medio cargar, y para eso está `Notice`.
 */
function Estado({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: `${space[3]}px ${MARGEN}px`, fontSize: font.sm, color: color.mut2 }}>{children}</div>
}

/** Un aviso con forma de aviso, con el margen de la pestaña. */
function Cartel({ tono, children }: { tono: 'danger' | 'neutral'; children: React.ReactNode }) {
  return (
    <div style={{ padding: `0 ${MARGEN}px`, marginBottom: space[2] }}>
      <Notice tone={tono} style={{ fontSize: font.xs }}>{children}</Notice>
    </div>
  )
}

/**
 * Las dos acciones de una fila, como tilde y cruz (pedido por Darío el 3-sep-2026: *"botones de
 * tilde para confirmar, x cuando se cayó, más práctico"*).
 *
 * 🔑 **Achicar el botón achica el margen de error, así que las dos están cubiertas de distinta
 * manera.** El tilde **no confirma**: abre el formulario, donde todavía hay que poner cuánto entró
 * y apretar "Sí, entró" — un clic al pasar no mueve un peso. La cruz sí es inmediata, y por eso el
 * aviso que deja ofrece **deshacer** (cancelar no movió nada, así que volver atrás es gratis).
 *
 * ⚠️ El `title` y el `aria-label` llevan la frase entera. Un ícono solo es ambiguo: acá lo que se
 * gana es alto de fila, no información.
 *
 * # Verde y rojo, pero no los dos llenos
 *
 * El par verde/rojo lo pidió Darío y es el correcto: son acciones opuestas y así se distinguen sin
 * leer. ⚠️ Pero **la cruz va en outline y no rellena de rojo**: una lista de diez compromisos con diez
 * cuadrados rojos manda el ojo justo a lo único que no querés que se apriete. El relleno se lo
 * queda el tilde, que es la acción que se busca.
 */
function BotonIcono({ que, de, onClick, fuerte }: {
  que: string
  /**
   * De quién es la fila. 🔑 **El rótulo nombra la cosa** (VOCABULARIO §3.3): diez `aria-label="Ya
   * entró"` apilados son diez botones idénticos para quien no ve la pantalla.
   */
  de: string
  onClick: () => void
  fuerte?: boolean
}) {
  return (
    <Button
      size="sm"
      variant={fuerte ? 'solid' : 'outline'}
      tone={fuerte ? 'success' : 'danger'}
      title={que}
      aria-label={`${que} lo de «${de}»`}
      // El texto sobre el índigo lo pone el kit; acá sólo se lo hace cuadrado.
      style={{ width: 30, minWidth: 30, height: 30, padding: 0, display: 'grid', placeItems: 'center' }}
      onClick={onClick}
    >
      <Icono nombre={fuerte ? 'check' : 'cruz'} size={16} />
    </Button>
  )
}

/**
 * Confirmar, en la misma fila y no en un modal.
 *
 * 🔑 **Pregunta cuánto entró y qué día, y las dos preguntas son necesarias.** El monto porque el
 * cliente muchas veces manda menos de lo comprometido (y entonces el servidor cierra ésta por lo que
 * entró y abre una nueva por el resto); la fecha porque **el cierre de mes del dashboard imputa
 * por ella**, y "hoy" no es necesariamente el día en que transfirió.
 *
 * # 🔑 Y acá se pregunta a nombre de quién vino, con el default puesto
 *
 * Es el lugar donde ese dato existe: se está mirando el extracto. Al comprometer era una adivinanza —
 * el compromiso es del cliente, pero la plata la manda muy seguido otro (Darío, 3-sep-2026).
 *
 * **El caso normal es un botón y nada más.** Lo que se ve por defecto es "transfirió {el cliente}",
 * y con apretar "Sí, entró" su nombre viaja hasta el ledger. Sólo si fue otro hay que escribir, y
 * para eso está el enlace de al lado. Al revés —un campo vacío que hay que completar siempre—
 * el caso frecuente pagaría el precio del raro.
 */
function Confirmar({ c, onListo, onCancelar }: {
  c: Compromiso
  onListo: (monto: number, fecha: string, titular: string | null) => Promise<void>
  onCancelar: () => void
}) {
  /**
   * ⛔ **`paraEditar` y no `String(c.monto)`.** Acá vivía el bug que mandaba cien veces el monto al
   * ledger: `String()` escribe el punto como decimal y el lector de abajo lo toma como separador
   * de miles, así que un resto de 66666.67 salía del casillero como 6.666.667. Ver `plata.core.js`.
   */
  const [monto, setMonto] = useState(paraEditar(c.monto))
  const [fecha, setFecha] = useState(hoyISO())
  const [otro, setOtro] = useState(!!c.titular_real && c.titular_real !== c.cliente_nombre)
  const [titular, setTitular] = useState(c.titular_real || '')
  const [yendo, setYendo] = useState(false)
  const n = parsearMonto(monto)
  const falta = restanteTrasConfirmar(Number(c.monto), n)

  /*
    ⚠️ **Los casilleros son los del kit (`mo-input`), no unos pintados a mano.** Eran cuadraditos
    con borde propio: no se marcaban al pasar el mouse ni mostraban el anillo índigo al entrar,
    justo al lado del calendario de la ficha del cliente, que sí es el del monitor. La clase trae
    foco, hover, alto y estado inválido de un solo lugar.
  */
  return (
    <div style={{ marginTop: 6, padding: space[2], background: color.bg2, borderRadius: radius.md }}>
      <div style={{ fontSize: font.xs, color: color.mut, marginBottom: 6 }}>
        Esto <b>escribe el pago en el dashboard</b>: baja la deuda con {c.acreedor_nombre}.
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="mo-input" value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal"
          aria-label="¿Cuánto entró?" style={{ flex: '1 1 110px', fontSize: font.sm }} />
        <input className="mo-input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
          aria-label="¿Qué día transfirió?" style={{ flex: '1 1 130px', fontSize: font.sm }} />
      </div>

      {/* Quién transfirió: el cliente por defecto, y el otro nombre a un clic. */}
      <div style={{ marginTop: 6, fontSize: font.xs, color: color.mut }}>
        {otro ? (
          <>
            <input
              className="mo-input"
              value={titular}
              onChange={(e) => setTitular(e.target.value)}
              placeholder="¿a nombre de quién vino?"
              aria-label="¿A nombre de quién vino la transferencia?"
              style={{ fontSize: font.sm }}
            />
            <button type="button" onClick={() => { setOtro(false); setTitular('') }}
              style={{ height: 'auto', marginTop: 4, padding: 0, background: 'none', border: 0, cursor: 'pointer', font: 'inherit', color: color.brand, textDecoration: 'underline' }}>
              no, transfirió {c.cliente_nombre}
            </button>
          </>
        ) : (
          <>
            Transfirió <b style={{ color: color.ink }}>{c.cliente_nombre}</b>.{' '}
            <button type="button" onClick={() => setOtro(true)}
              style={{ height: 'auto', padding: 0, background: 'none', border: 0, cursor: 'pointer', font: 'inherit', color: color.brand, textDecoration: 'underline' }}>
              vino a nombre de otro
            </button>
          </>
        )}
      </div>
      {falta > 0 && (
        <div style={{ fontSize: font.xs, color: color.mut, marginTop: 6 }}>
          Entró {plata(falta)} menos de lo comprometido. Ésta se cierra por lo que entró y queda una
          nueva por {plata(falta)} para poder seguir reclamándolo.
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <Button size="sm" variant="solid" tone="brand" disabled={!Number.isFinite(n) || n <= 0 || (otro && !titular.trim()) || yendo}
          onClick={async () => { setYendo(true); try { await onListo(n, fecha, otro ? titular.trim() : null) } finally { setYendo(false) } }}>
          {yendo ? 'Registrando…' : 'Sí, entró'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelar}>Ahora no</Button>
      </div>
    </div>
  )
}

/**
 * "A quién le debemos", adentro del panel (pedido por Darío el 3-sep-2026).
 *
 * # Por qué acá y no sólo en la sección
 *
 * Es la otra mitad de la misma charla. Cuando el cliente dice "dale, ¿a dónde te transfiero?", lo
 * que hace falta es a quién le debemos, cuánto se le puede pedir todavía **y el alias**. Eso vivía
 * en Dirección → "A quién le debemos", que es salir del chat en el peor momento.
 *
 * 🔑 **El número que se muestra para decidir NO es el saldo**, es lo que se le puede pedir: el
 * `disponible` del dashboard menos lo ya comprometido acá. El dashboard no sabe que hay plata
 * comprometida, así que su saldo dice "se le debe X" cuando ya hay X−Y camino a él.
 *
 * ⛔ **Lo que esta vista NO muestra: el historial de lo que ya se le pagó.** La puerta de lectura
 * devuelve el saldo y los conceptos abiertos, no los pagos hechos — eso vive en el ledger del
 * dashboard y traerlo es ampliar `GET /api/puente/acreedores`. Lo que sí aparece es
 * `yaPagadoSinDebitar`, que es plata ya mandada que el banco no debitó (un cheque entregado), y
 * está justamente para que nadie la mande dos veces.
 */
/**
 * Una cuenta a la que el cliente puede transferir: un acreedor del dashboard o una de acá.
 *
 * 🔑 **Es una sola y antes eran dos.** Las cuentas manuales y los acreedores se dibujaban con
 * cuarenta líneas casi idénticas, una al lado de la otra: se veían iguales de casualidad y tocar
 * una sola las separaba. Lo único que de verdad cambia es de dónde sale el techo y qué dice el
 * renglón de abajo, así que eso entra por parámetro.
 *
 * ⚠️ **Los números de apoyo van como chapitas y no como una frase con puntitos.** Era
 * `se le debe $200.000 · ya hay $80.000 comprometidos`, que en una columna angosta se lee como un
 * renglón corrido del que hay que extraer dos cifras. Es el mismo criterio que las filas de
 * compromisos ya habían adoptado y que acá había quedado sin aplicar.
 */
function TarjetaDestino({ nombre, sePuede, apoyos, detalle, deAca, cuenta, dondeSeCarga }: {
  nombre: string
  /** Lo que se le puede pedir HOY: el techo menos lo ya comprometido. Es el número que decide. */
  sePuede: number
  apoyos: React.ReactNode[]
  detalle: string | null
  deAca: boolean
  cuenta: CuentaBancaria | null
  dondeSeCarga: string
}) {
  return (
    <article style={{
      background: color.surface, borderTop: `1px solid ${color.line2}`,
      padding: `${space[2]}px ${MARGEN}px ${space[3]}px`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <div style={{ fontSize: font.md, fontWeight: 700, color: color.ink }}>{nombre}</div>
        {deAca && <Chapa>cuenta de acá</Chapa>}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
        <Monto v={sePuede} />
        <span style={{ fontSize: font.xs, color: color.mut2 }}>se le puede pedir</span>
      </div>

      {apoyos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>{apoyos}</div>
      )}
      {detalle && <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 4 }}>{detalle}</div>}

      {cuenta ? (
        <DatosDeCuenta cuenta={cuenta} destino={nombre} />
      ) : (
        <div style={{ marginTop: 6, fontSize: font.xs, color: color.warningInk }}>
          No tiene alias ni CBU, así que no hay nada que pasarle. Se carga en {dondeSeCarga}.
        </div>
      )}
    </article>
  )
}

export function VistaAcreedores({ acreedores, manuales, compromisos, cargando, error, aviso }: {
  acreedores: Acreedor[]
  /**
   * Las cuentas manuales que están juntando plata (la cuota del crédito, las bolsas). Van en la
   * misma lista porque para el que está hablando con el cliente son lo mismo: un lugar a dónde
   * pedirle que transfiera. ⛔ Y NO dependen del dashboard: se muestran aunque él no conteste.
   */
  manuales: DestinoCompromiso[]
  compromisos: Compromiso[]
  cargando: boolean
  error: string | null
  /**
   * 🔴 El dashboard no contestó, con la lista llegando vacía y **sin error**. Es el tercer estado
   * que faltaba mirar: `leerAcreedores` devuelve el motivo por acá justamente para que la pantalla
   * no confunda "no pude leer" con "no hay nada".
   */
  aviso: string | null
}) {
  const comprometido = useMemo(() => comprometidoPorAcreedor(compromisos), [compromisos])

  const hayManuales = manuales.length > 0

  if (cargando && !hayManuales) return <Estado>Buscando a quién le debemos…</Estado>
  /*
    🔴 **"No hay deudas" y "no pude leer" no se pueden decir con el mismo cartel**, y hasta acá se
    decían: sin dashboard la lista llega vacía y `error` viene en null, así que la pantalla anunciaba
    "No hay ninguna deuda con acreedores ahora" —una buena noticia falsa, de las que nadie reporta.
    Es el mismo defecto que la lista del día ya pagó (ver el encabezado de
    `tests/panel-pagos-pantalla.test.tsx`).

    ⚠️ Y va con forma de aviso, no como un renglón gris: una falla que se dibuja igual que un
    "cargando" se lee como que la pantalla todavía no terminó.
  */
  if ((error || aviso) && !hayManuales) {
    return (
      <Cartel tono="danger">
        No se pudo leer a quién le debemos. Los montos viven en el dashboard; probá de nuevo en un rato.
      </Cartel>
    )
  }
  if (acreedores.length === 0 && !hayManuales) {
    return (
      <EmptyState
        title="No hay ninguna deuda con acreedores ahora"
        hint="Cuando el dashboard tenga un gasto con proveedor sin pagar, aparece acá con su alias."
      />
    )
  }

  return (
    <>
      {/* El dashboard no contestó, pero las cuentas de acá sí se pueden mostrar: se dice qué falta
          en vez de esconder la mitad que sí funciona. */}
      {(error || aviso) && (
        <Cartel tono="neutral">No se pudo leer a quién le debemos: abajo están sólo las cuentas de acá.</Cartel>
      )}

      {manuales.map((d) => {
        const yaComprometido = comprometido.get(d.id) ?? 0
        return (
          <TarjetaDestino
            key={d.id}
            nombre={d.nombre}
            deAca
            sePuede={sePuedeComprometer(d.disponible, yaComprometido)}
            /* ⚠️ **El techo sólo se dice cuando NO es el número de arriba.** Sin nada comprometido
               los dos son iguales, y "faltan juntar $380.000" debajo de "$380.000 se le puede
               pedir" es la misma cifra dos veces: ruido con forma de dato. */
            apoyos={yaComprometido > 0 ? [
              <Chapa key="falta">faltan juntar {plata(d.disponible)}</Chapa>,
              <Chapa key="comp">ya hay {plata(yaComprometido)} comprometidos</Chapa>,
            ] : []}
            detalle={d.detalle}
            cuenta={d.cuentas[0] ?? null}
            dondeSeCarga="Cobranza, en la ficha de la cuenta"
          />
        )
      })}

      {acreedores.map((a) => {
        const yaComprometido = comprometido.get(a.id) ?? 0
        return (
          <TarjetaDestino
            key={a.id}
            nombre={a.nombre}
            deAca={false}
            sePuede={sePuedeComprometer(a.disponible, yaComprometido)}
            /* De dónde sale ese número, para que no parezca sacado de la galera. Y 🔑 lo ya mandado
               sin debitar (un cheque entregado) va en ámbar: es lo que evita pagarle dos veces. */
            apoyos={[
              /* Lo mismo que en las cuentas de acá: la deuda explica el número grande sólo cuando
                 no coincide con él. ⚠️ Un acreedor puede tener cheques en la calle, y ahí `saldo`
                 y `disponible` ya son distintos aunque nadie haya comprometido nada. */
              ...(yaComprometido > 0 || a.saldo !== a.disponible
                ? [<Chapa key="debe">se le debe {plata(a.saldo)}</Chapa>] : []),
              ...(yaComprometido > 0 ? [<Chapa key="comp">ya hay {plata(yaComprometido)} comprometidos</Chapa>] : []),
              ...(a.yaPagadoSinDebitar > 0
                ? [<Chapa key="cheque" tono="espera">ya se le mandó {plata(a.yaPagadoSinDebitar)} sin debitar</Chapa>]
                : []),
            ]}
            detalle={null}
            cuenta={a.cuentas.find((x) => x.sugerida) ?? a.cuentas[0] ?? null}
            dondeSeCarga="el dashboard, en Finanzas → Acreedores"
          />
        )
      })}
    </>
  )
}

function Fila({ c, hoy, tono, puede, abierta, onConfirmarAbrir, onConfirmar, onEstado, onIrAlCliente }: {
  c: Compromiso
  hoy: string
  /**
   * De quién es el trabajo de esta fila: `nuestro` es "mirá el banco y confirmalo", `espera` es
   * "le toca al cliente". 🔑 **Es la franja de color de la izquierda, y es la única diferencia
   * visible entre las dos listas.** Antes las dos dibujaban tarjetas idénticas y lo único que las
   * separaba era un título de 12 px: bajando la pantalla eran ocho filas iguales, y separarlas es
   * justamente el sentido de la pestaña (ver `colaDeCobranza`).
   */
  tono: 'nuestro' | 'espera'
  puede: { prometer: boolean; confirmar: boolean }
  abierta: boolean
  onConfirmarAbrir: (id: string | null) => void
  onConfirmar: (c: Compromiso, monto: number, fecha: string, titular: string | null) => Promise<void>
  onEstado: (c: Compromiso, estado: 'prometido' | 'transferido' | 'cancelado') => void
  onIrAlCliente: ((c: Compromiso) => void) | null
}) {
  const fecha = cuando(c.fecha_prometida, hoy)
  const idCliente = Number(c.cliente_id)
  // Con teléfono se puede abrir el chat; con id, la ficha. Sin ninguno de los dos, es texto.
  const puedeIr = !!onIrAlCliente && (!!c.cliente_telefono || (Number.isFinite(idCliente) && idCliente > 0))

  const hayAcciones = puede.confirmar || puede.prometer

  return (
    <article style={{
      background: color.surface, borderTop: `1px solid ${color.line2}`,
      borderLeft: `3px solid ${tono === 'nuestro' ? color.brandSolid : color.line2}`,
    }}>
      {/*
        🔑 **Las acciones van al costado del monto, no en una barra abajo.**
        La barra sumaba ~40 px a cada fila para dos botones, y en una columna de 380 px eso es lo
        que hacía que entraran tres filas donde entran cinco. Acá el ojo cae en el monto y la mano
        ya está al lado (Darío, 3-sep-2026: *"para acortar la vista"*).

        ⚠️ El padding izquierdo descuenta los 3 px de la franja: el texto arranca en `MARGEN` como
        todo lo demás de la pestaña, no 3 px más adentro.
      */}
      <div style={{ display: 'flex', gap: space[2], padding: `${space[2]}px ${MARGEN}px ${space[2]}px ${MARGEN - 3}px`, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/*
            ⛔ **La chapa de estado NO está**, y la sacó Darío el 3-sep-2026. Decía "se lo pedimos"
            en cada fila de la lista que ya se titula "Esperando que transfieran": repetía el
            encabezado en amarillo, una vez por fila. La única chapa que sobrevive es la de vencida,
            porque ésa no la dice ningún título — es de ESTA fila y cambia todos los días.
          */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Monto v={Number(c.monto)} />
            {fecha.tarde && <Chapa tono="tarde">{fecha.txt}</Chapa>}
          </div>

          {/* Quién la manda y a dónde va: las dos mitades de la frase, una arriba de la otra. */}
          <div style={{ fontSize: font.md, fontWeight: 700, color: color.ink, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {puedeIr ? (
              <button type="button" onClick={() => onIrAlCliente(c)}
                title={c.cliente_telefono ? 'Abrir su chat' : 'Ver su ficha'}
                style={{ height: 'auto', padding: 0, background: 'none', border: 0, font: 'inherit', color: color.brand, cursor: 'pointer' }}>
                {c.cliente_nombre}
              </button>
            ) : c.cliente_nombre}
          </div>
          {/*
            ⚠️ **"→ Contador" era notación, no idioma.** En el resto del panel eso se dice con
            palabras, y son dos caracteres menos de traducción mental por fila.
          */}
          <div style={{ fontSize: font.sm, color: color.mut, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            le transfiere a {c.acreedor_nombre}
          </div>

          {/*
            🔑 **Sólo se dibuja cuando hay algo que decir.** Antes esta línea salía siempre, y en la
            mayoría de las filas decía "santi.gomez.mp · sin fecha": el alias es de cuando le pasás
            el CBU (vive en la vista de acreedores, no acá) y "sin fecha" es la ausencia de un dato.
            Dos renglones de nada por fila, que es lo que alargaba la lista.
          */}
          {!fecha.tarde && c.fecha_prometida && (
            <div style={{ fontSize: font.xs, color: color.mut2 }}>{fecha.txt}</div>
          )}

          {/*
            Los peros de la fila, como chapitas y no como renglones. Que no esté cargado en el ERP
            es una nota al pie —explica por qué ese compromiso no cruza con ninguna deuda— y antes
            salía en el color de alerta: era lo segundo que se veía, compitiendo con el monto.
          */}
          {(!c.cliente_id || (c.titular_real && c.titular_real !== c.cliente_nombre) || c.viene_de) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {!c.cliente_id && <Chapa>sin cargar en el sistema</Chapa>}
              {c.titular_real && c.titular_real !== c.cliente_nombre && <Chapa>transfiere {c.titular_real}</Chapa>}
              {c.viene_de && <Chapa>resto de una anterior</Chapa>}
            </div>
          )}
        </div>

        {/*
          ⛔ **"Dice que transfirió" no está, y lo sacó Darío**: era un clic que no cambiaba nada.
          Si te dice que transfirió, vas al banco y confirmás — el escalón del medio era trabajo
          extra sin nada a cambio. El estado sigue existiendo (la sección grande lo usa), así que
          la lista "Falta confirmar" aparece igual cuando alguien lo marca desde allá.
        */}
        {hayAcciones && !abierta && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {puede.confirmar && <BotonIcono fuerte que="Ya entró" de={c.cliente_nombre} onClick={() => onConfirmarAbrir(c.id)} />}
            {puede.prometer && <BotonIcono que="Se cayó" de={c.cliente_nombre} onClick={() => onEstado(c, 'cancelado')} />}
          </div>
        )}
      </div>

      {abierta && (
        <div style={{ borderTop: `1px solid ${color.line2}`, padding: `${space[2]}px ${MARGEN}px ${space[3]}px ${MARGEN - 3}px` }}>
          <Confirmar c={c} onCancelar={() => onConfirmarAbrir(null)}
            onListo={(monto, f, titular) => onConfirmar(c, monto, f, titular)} />
        </div>
      )}
    </article>
  )
}

export function Pagos({ cliente, buscandoCliente, onIrAlCliente }: {
  /**
   * Quién está del otro lado del chat: el cliente de Gestión Nube, o alguien que compró y todavía
   * no se cargó (ver `QuienPaga`). `null` sólo cuando no hay ningún chat abierto.
   */
  cliente: QuienPaga | null
  /**
   * Hay un chat abierto pero la ficha todavía está cargando. Sin esto la pestaña diría "abrí el
   * chat de un cliente" con el chat abierto — un cartel que manda a hacer lo que ya está hecho.
   */
  buscandoCliente?: boolean
  /** Saltar de una fila a esa persona: su chat si hay teléfono, su ficha si no. */
  onIrAlCliente: ((c: Compromiso) => void) | null
}) {
  const deudas = useAcreedores()
  const cobros = useCompromisos()
  // Las cuentas manuales viajan por su propia puerta: no dependen del dashboard y se tienen que
  // poder ofrecer igual cuando él no contesta.
  const manuales = useCuentas()
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [verCerradas, setVerCerradas] = useState(false)
  /**
   * Las dos preguntas de la pestaña, y son distintas: *"¿quién me tiene que pagar?"* (los compromisos)
   * y *"¿a quién le debemos y a qué alias?"* (los acreedores). Arranca en compromisos, que es la lista
   * de trabajo; la otra se mira cuando el cliente pregunta a dónde transferir.
   */
  const [vista, setVista] = useState<'compromisos' | 'acreedores'>('compromisos')
  const [hoy] = useState(() => hoyISO())
  /**
   * El aviso de "listo" / "no se pudo", **con vencimiento**.
   *
   * 🔴 Antes eran dos estados que se prendían y no se apagaban nunca: el cartel verde de una
   * compromiso creado quedaba pegado aunque ya hubieras cambiado de chat, contando algo que pasó hace
   * rato. Es el mismo `decir()` que usa el resto del panel — el error dura más porque hay que
   * leerlo.
   */
  const [aviso, setAviso] = useState<{ txt: string; mal?: boolean; deshacer?: () => void } | null>(null)
  const decir = useCallback((txt: string, mal?: boolean, deshacer?: () => void) => {
    setAviso({ txt, mal, deshacer })
    // El que ofrece deshacer dura más: sirve de poco si se va antes de que lo leas.
    window.setTimeout(() => setAviso(null), mal ? 8000 : deshacer ? 10000 : 4000)
  }, [])

  /**
   * A dónde puede transferir el cliente: los acreedores del dashboard y las cuentas de acá, en una
   * sola lista. 🔑 Para el que está hablando por WhatsApp son lo mismo —un alias y un techo—, así
   * que la diferencia se traduce una vez acá (`lib/compromisos/destino.ts`) y no en cada botón.
   */
  const destinosManuales = useMemo(() => destinosDeCuentas(manuales.cuentas), [manuales.cuentas])
  const destinos = useMemo(
    () => [...deudas.acreedores.map(destinoDeAcreedor), ...destinosManuales],
    [deudas.acreedores, destinosManuales],
  )

  const cola = useMemo(() => colaDeCobranza(cobros.compromisos), [cobros.compromisos])
  const abiertas = cola.porConfirmar.length + cola.esperando.length
  const puede = cobros.puede
  // Los compromisos de ESTE número que se anotaron antes de que el cliente existiera en Gestión Nube.
  const porVincular = useMemo(
    () => (puede.prometer && cliente?.tipo === 'erp' ? sinVincular(cobros.compromisos, cliente.telefono) : []),
    [cobros.compromisos, cliente, puede.prometer],
  )

  async function correr(fn: () => Promise<string>, deshacer?: () => void) {
    try {
      const txt = await fn()
      decir(txt, false, deshacer)
      cobros.recargar()
      // El saldo del acreedor lo calcula el dashboard: al confirmar bajó de verdad, y si no se
      // relee, la próxima compromiso se ofrecería contra un número viejo.
      deudas.recargar()
      // Lo mismo del otro lado: una cuenta manual pudo haberse completado con esta confirmación,
      // y si no se relee sigue ofreciéndose para pedir plata que ya no hace falta.
      manuales.recargar()
    } catch (e) {
      decir(e instanceof Error ? e.message : 'No se pudo.', true)
    }
  }

  /*
    ⚠️ **Sólo mientras no haya NADA que mostrar.** El hook ya no prende `cargando` en los
    refrescos, pero la pantalla lo comprueba igual: es la que se ve, y un refresco que borre la
    pestaña entera —con el cartel de "Listo" adentro— es un síntoma demasiado caro para dejarlo
    colgando de una sola línea en otro archivo.
  */
  if (cobros.cargando && cobros.compromisos.length === 0) {
    return <Estado>Buscando los compromisos de pago…</Estado>
  }

  if (!puede.ver) {
    return (
      <Estado>Tu usuario no tiene habilitados los compromisos de pago. Se activa en Usuarios.</Estado>
    )
  }

  const lista = (titulo: string, filas: Compromiso[], tono: 'nuestro' | 'espera') =>
    filas.length > 0 && (
      <>
        <Titulo cuantas={filas.length}>{titulo}</Titulo>
        {filas.map((c) => (
          <Fila
            key={c.id}
            c={c}
            hoy={hoy}
            tono={tono}
            puede={puede}
            abierta={confirmando === c.id}
            onConfirmarAbrir={setConfirmando}
            onEstado={(x, estado) => correr(
              async () => {
                await cambiarEstado(x.id, estado)
                return estado === 'cancelado'
                  ? `Listo: el compromiso de ${plata(Number(x.monto))} quedó como caído.`
                  : 'Vuelve a quedar en pie.'
              },
              /*
                🔑 **El precio de haber achicado la cruz.** Con un ícono chico y sin etiqueta, el
                clic al pasar existe. Cancelar no movió un peso —el estado se reabre— así que lo
                correcto no es preguntar antes, que frena las 99 veces que está bien, sino dejar
                volver atrás después.
              */
              estado === 'cancelado'
                ? () => correr(async () => {
                    await cambiarEstado(x.id, 'prometido')
                    return 'Listo, el compromiso vuelve a estar en pie.'
                  })
                : undefined,
            )}
            onConfirmar={async (x, monto, fecha, titular) => {
              await correr(async () => {
                const r = await confirmarCompromiso(x.id, monto, fecha, titular)
                setConfirmando(null)
                return r.nueva
                  ? `Listo: ${plata(monto)} registrados en el dashboard. Como entró menos, quedó un compromiso nuevo por ${plata(Number(r.nueva.monto))}.`
                  : `Listo: ${plata(monto)} registrados en el dashboard.`
              })
            }}
            onIrAlCliente={onIrAlCliente}
          />
        ))}
      </>
    )

  return (
    <div>
      {/*
        🔑 **El selector de vista, arriba de todo y fijo.** Estaba a media pantalla, abajo de hasta
        tres carteles y del bloque de vincular: es lo que cambia de pantalla y había que ir a
        buscarlo. Y al bajar por una lista larga se iba con el resto, así que dejabas de saber en
        cuál de las dos estabas parado.

        ⚠️ **Y es un control partido, no dos chips sueltos.** Se veía igual que los filtros de la
        solapa "Hoy" (🔥 🟡 ⚪ 🧊) y hace otra cosa: allá filtran una lista, acá cambian de
        pantalla. Dos gestos distintos con el mismo dibujo, en el mismo panel.

        ⛔ **El nombre "A quién le debemos" se queda**, aunque con el chat adelante la pregunta sea
        "¿a dónde le digo que transfiera?": es como se llama la sección en el menú de Dirección, y
        VOCABULARIO §3 no deja que una pantalla la llame de otra manera adentro.

        ⚠️ `top: 0` lo comparte con el cartel de aviso del panel (`Envoltorio`), que es sticky
        también y tiene más z-index: mientras dura ese cartel —segundos— le pasa por encima.
      */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 1, background: color.bg,
        borderBottom: `1px solid ${color.line2}`, padding: `${space[2]}px ${MARGEN}px`, marginBottom: space[2],
      }}>
        <div style={{ display: 'flex', gap: 2, padding: 2, background: color.bg2, borderRadius: radius.pill, border: `1px solid ${color.line2}` }}>
          {([['compromisos', `Compromisos${abiertas ? ` · ${abiertas}` : ''}`], ['acreedores', 'A quién le debemos']] as const).map(([k, txt]) => (
            <button
              key={k}
              type="button"
              onClick={() => setVista(k)}
              aria-pressed={vista === k}
              style={{
                flex: 1, height: 'auto', padding: '4px 8px', borderRadius: radius.pill, fontSize: font.xs,
                fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', border: 0,
                background: vista === k ? color.surface : 'transparent',
                color: vista === k ? color.brand : color.mut,
                boxShadow: vista === k ? shadow.sm : 'none',
              }}
            >
              {txt}
            </button>
          ))}
        </div>
      </div>

      {/*
        Los avisos, con la forma de aviso del kit y el margen de la pestaña. Eran tres banderitas
        pintadas a mano, cada una con su borde y su padding: la de "listo" se veía distinta de la
        de "no se pudo" y las dos distintas de la del dashboard, siendo las tres lo mismo.
      */}
      {aviso && (
        <div style={{ padding: `0 ${MARGEN}px`, marginBottom: space[2] }}>
          <Notice tone={aviso.mal ? 'danger' : 'success'} style={{ fontSize: font.xs, fontWeight: 600 }}>
            {aviso.txt}
            {aviso.deshacer && (
              <button type="button" onClick={() => { const d = aviso.deshacer; setAviso(null); d?.() }}
                style={{ height: 'auto', marginLeft: 6, padding: 0, background: 'none', border: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textDecoration: 'underline' }}>
                deshacer
              </button>
            )}
          </Notice>
        </div>
      )}

      {cobros.error && <Cartel tono="danger">{cobros.error}</Cartel>}
      {/*
        🔴 **`aviso` y no sólo `error`.** Cuando el dashboard no contesta, `leerAcreedores` NO tira:
        devuelve la lista vacía y el motivo en `aviso`. Mirando sólo `error`, la caída del dashboard
        —que es la forma normal en que esto falla— pasaba sin un solo cartel, y las pantallas de
        abajo la contaban como "no hay ninguna deuda".
      */}
      {(deudas.error || deudas.aviso) && (
        <Cartel tono="neutral">
          No se pudo leer a quién le debemos, así que no se puede anotar un compromiso nuevo. La lista
          de abajo anda igual.
        </Cartel>
      )}

      {/*
        🔑 **El reenganche, en el único momento en que el dato existe.**
        Se anotó la cobranza de alguien que todavía no estaba en Gestión Nube, y ahora el panel
        abrió su ficha de verdad: es acá donde se sabe que esas dos personas son la misma. Si no se
        ofrece en este momento, el compromiso queda para siempre con un nombre escrito a mano que no
        cruza con ninguna deuda — y nadie va a ir a buscarla.
      */}
      {porVincular.length > 0 && cliente?.tipo === 'erp' && (
        <Bloque titulo="Se anotó antes de que estuviera cargado">
          <div style={{ fontSize: font.sm, color: color.mut2, marginBottom: 8 }}>
            Con este número hay {porVincular.length === 1 ? 'un compromiso anotado' : `${porVincular.length} compromisos anotados`}{' '}
            a nombre de <b style={{ color: color.ink }}>{porVincular.map((c) => c.cliente_nombre).join(', ')}</b>,
            de cuando todavía no estaba en el sistema. ¿Es {cliente.nombre || `#${cliente.id}`}?
          </div>
          <Button
            size="sm"
            variant="solid"
            tone="brand"
            onClick={() => correr(async () => {
              for (const c of porVincular) {
                await vincularCompromiso(c.id, { id: String(cliente.id), nombre: cliente.nombre })
              }
              return porVincular.length === 1
                ? `Listo: el compromiso quedó a nombre de ${cliente.nombre}.`
                : `Listo: los ${porVincular.length} compromisos quedaron a nombre de ${cliente.nombre}.`
            })}
          >
            Sí, es {cliente.nombre || 'este cliente'}
          </Button>
        </Bloque>
      )}

      {vista === 'acreedores' ? (
        <div style={{ marginTop: space[2] }}>
          <VistaAcreedores
            acreedores={deudas.acreedores}
            manuales={destinosManuales}
            compromisos={cobros.compromisos}
            cargando={deudas.cargando}
            error={deudas.error}
            aviso={deudas.aviso}
          />
        </div>
      ) : (
       <>
      {/*
        🔑 **El total, como número y no como frase.** Es lo que resume la pantalla —cuánta plata hay
        en la calle— y estaba en gris chico, pesando menos que el título de la sección de abajo.

        ⚠️ **Y va ANTES del formulario, no después.** Estaba en el medio: el número que resume la
        pestaña aparecía recién pasado el bloque de anotar. Es lo primero que se mira al entrar y
        cuesta un renglón — el formulario sigue siendo lo primero que se puede tocar.
      */}
      {cola.totalAbierto > 0 && (
        <div style={{ padding: `0 ${MARGEN}px ${space[3]}px` }}>
          <Monto v={cola.totalAbierto} tam="total" />
          <div style={{ fontSize: font.xs, color: color.mut2 }}>comprometidos y sin entrar</div>
        </div>
      )}

      {/*
        Anotar. Va arriba de todo cuando HAY con quién: es lo que se hace con el cliente adelante.
        🔑 **Sin chat abierto se encoge a un renglón**, y esa es la corrección de fondo del 3-sep:
        una tarjeta grande en el lugar de honor para avisar que no se puede hacer nada es el peor
        uso posible de la primera pantalla. Sin cliente, lo útil es la lista de abajo.
      */}
      {cliente ? (
        <Bloque titulo="Que transfiera a una cuenta nuestra">
          <NuevoCompromiso
            cliente={cliente}
            destinos={destinos}
            compromisos={cobros.compromisos}
            puede={puede}
            cargando={deudas.cargando && manuales.cargando}
            noSePudoLeer={!!(deudas.error || deudas.aviso)}
            onCreado={(txt) => { decir(txt); cobros.recargar() }}
          />
        </Bloque>
      ) : (
        <div style={{ padding: `0 ${MARGEN}px ${space[2]}px`, fontSize: font.xs, color: color.mut2 }}>
          {buscandoCliente
            ? 'Buscando de quién es el chat…'
            : 'Abrí el chat de un cliente para anotarle un compromiso nuevo.'}
        </div>
      )}

      {/*
        ⛔ Sin subtítulos. "Dicen que ya transfirieron. Mirá el banco y confirmalo." explicaba la
        pantalla la primera vez y después eran dos renglones que se leen una sola vez en la vida.
        El título ya dice qué hay adentro.
      */}
      {lista('Falta confirmar', cola.porConfirmar, 'nuestro')}
      {lista('Esperando que transfieran', cola.esperando, 'espera')}

      {/*
        El estado vacío ocupa lugar a propósito: es la mitad de la pantalla y decirlo en un renglón
        gris deja la sensación de que algo no cargó.
      */}
      {abiertas === 0 && (
        <EmptyState
          title="No hay plata esperando"
          hint="Cuando un cliente se comprometa a transferirle a un acreedor, el compromiso aparece acá hasta que entre."
        />
      )}

      {cola.cerradas.length > 0 && (
        <>
          <div style={{ height: 8, background: color.bg2, borderTop: `1px solid ${color.line2}`, borderBottom: `1px solid ${color.line2}`, marginTop: space[3] }} />
          {verCerradas ? (
            <>
              <Titulo cuantas={cola.cerradas.length}>Cerradas</Titulo>
              {/*
                ⚠️ **Era el último renglón con puntitos**: `entró $12.000 · Fulana → Contador` metía
                cuatro datos de distinto peso en una sola línea. El desenlace es una chapita, el
                monto es un monto, y quién le transfirió a quién se dice con palabras.
              */}
              {cola.cerradas.slice(0, CERRADAS).map((c) => {
                const entro = c.estado === 'confirmado'
                return (
                  <div key={c.id} style={{ background: color.surface, borderTop: `1px solid ${color.line2}`, padding: `6px ${MARGEN}px` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Chapa tono={entro ? 'entro' : 'neutro'}>{entro ? 'entró' : 'se cayó'}</Chapa>
                      <Monto tam="chico" tono={entro ? undefined : color.mut2}
                        v={Number(entro ? (c.monto_confirmado ?? c.monto) : c.monto)} />
                    </div>
                    <div style={{ fontSize: font.xs, color: color.mut2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.cliente_nombre} le transfiere a {c.acreedor_nombre}
                    </div>
                  </div>
                )
              })}
              {cola.cerradas.length > CERRADAS && (
                <div style={{ padding: `6px ${MARGEN}px`, fontSize: font.xs, color: color.mut2 }}>
                  Se muestran las {CERRADAS} últimas. El resto está en Dirección → “A quién le debemos”.
                </div>
              )}
            </>
          ) : (
            <button type="button" onClick={() => setVerCerradas(true)}
              style={{ display: 'block', width: '100%', height: 'auto', padding: space[2], background: 'none', border: 0, cursor: 'pointer', fontSize: font.xs, fontWeight: 700, color: color.brand }}>
              Ver las {cola.cerradas.length} que ya se cerraron
            </button>
          )}
        </>
      )}
       </>
      )}
    </div>
  )
}
