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
import { Button, Icono } from '@/components/ui'
import { color, font, radius, space } from '@/components/ui/tokens'
import { useAcreedores } from '@/components/acreedores/useAcreedores'
import { useCompromisos } from '@/components/acreedores/useCompromisos'
import { NuevoCompromiso, type QuienPaga } from './NuevoCompromiso'
import type { Acreedor } from '@/lib/acreedores/cliente'
import { cambiarEstado, confirmarCompromiso, vincularCompromiso } from '@/lib/compromisos/cliente'
import { colaDeCobranza, diasPara, comprometidoPorAcreedor, sePuedeComprometer, sinVincular, type Compromiso } from '@/lib/compromisos/core'
import { hoyISO } from '@/lib/crm/seguimiento'

const plata = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

/** De a cuántas cerradas se muestran. No es una lista de trabajo: es para mirar atrás un rato. */
const CERRADAS = 10

/** La fecha comprometida, en el idioma en que se piensa la cobranza. */
function cuando(fecha: string | null, hoy: string): { txt: string; tarde: boolean } {
  const d = diasPara(fecha, hoy)
  if (d === null) return { txt: 'sin fecha', tarde: false }
  if (d === 0) return { txt: 'lo se comprometió para hoy', tarde: false }
  if (d < 0) return { txt: `vencida hace ${-d} ${-d === 1 ? 'día' : 'días'}`, tarde: true }
  return { txt: `para dentro de ${d} ${d === 1 ? 'día' : 'días'}`, tarde: false }
}

function Bloque({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: color.surface, border: `1px solid ${color.line}`, borderRadius: radius.lg,
        padding: `${space[2]}px ${space[3]}px ${space[3]}px`, margin: `0 ${space[2]}px ${space[2]}px`,
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
  tono?: 'neutro' | 'espera' | 'nuestro' | 'tarde'
}) {
  const c =
    tono === 'nuestro'
      ? { fg: color.brand, bg: color.brandBg, bd: color.brandBorder }
      : tono === 'tarde'
        ? { fg: color.dangerInk, bg: color.dangerBg, bd: color.dangerBorder }
        : tono === 'espera'
          ? { fg: color.warningInk, bg: color.warningBg, bd: color.warningBorder }
          : { fg: color.mut2, bg: color.bg2, bd: color.line2 }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, whiteSpace: 'nowrap',
      border: `1px solid ${c.bd}`, background: c.bg, color: c.fg,
    }}>
      {children}
    </span>
  )
}

function Titulo({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ padding: `${space[2]}px ${space[3]}px 4px` }}>
      <div style={{ fontSize: font.sm, fontWeight: 700, color: color.ink }}>{children}</div>
      {sub && <div style={{ fontSize: font.xs, color: color.mut2 }}>{sub}</div>}
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
function BotonIcono({ que, onClick, fuerte }: {
  que: string
  onClick: () => void
  fuerte?: boolean
}) {
  return (
    <Button
      size="sm"
      variant={fuerte ? 'solid' : 'outline'}
      tone={fuerte ? 'success' : 'danger'}
      title={que}
      aria-label={que}
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
  const [monto, setMonto] = useState(String(c.monto))
  const [fecha, setFecha] = useState(hoyISO())
  const [otro, setOtro] = useState(!!c.titular_real && c.titular_real !== c.cliente_nombre)
  const [titular, setTitular] = useState(c.titular_real || '')
  const [yendo, setYendo] = useState(false)
  const n = Number(String(monto).replace(/\./g, '').replace(',', '.'))
  const falta = Math.max(0, Math.round((Number(c.monto) - n) * 100) / 100)

  const input: React.CSSProperties = {
    minWidth: 0, padding: '6px 8px', fontSize: font.sm, border: `1px solid ${color.line2}`,
    borderRadius: radius.md, background: color.bg, color: color.ink,
  }

  return (
    <div style={{ marginTop: 6, padding: space[2], background: color.bg2, borderRadius: radius.md }}>
      <div style={{ fontSize: font.xs, color: color.mut, marginBottom: 6 }}>
        Esto <b>escribe el pago en el dashboard</b>: baja la deuda con {c.acreedor_nombre}.
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal"
          aria-label="¿Cuánto entró?" style={{ ...input, flex: '1 1 110px' }} />
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
          aria-label="¿Qué día transfirió?" style={{ ...input, flex: '1 1 130px' }} />
      </div>

      {/* Quién transfirió: el cliente por defecto, y el otro nombre a un clic. */}
      <div style={{ marginTop: 6, fontSize: font.xs, color: color.mut }}>
        {otro ? (
          <>
            <input
              value={titular}
              onChange={(e) => setTitular(e.target.value)}
              placeholder="¿a nombre de quién vino?"
              aria-label="¿A nombre de quién vino la transferencia?"
              style={{ ...input, width: '100%', boxSizing: 'border-box' }}
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
export function VistaAcreedores({ acreedores, compromisos, cargando, error }: {
  acreedores: Acreedor[]
  compromisos: Compromiso[]
  cargando: boolean
  error: string | null
}) {
  const comprometido = useMemo(() => comprometidoPorAcreedor(compromisos), [compromisos])

  if (cargando) {
    return <div style={{ padding: space[3], fontSize: font.sm, color: color.mut2 }}>Buscando a quién le debemos…</div>
  }
  if (error || acreedores.length === 0) {
    return (
      <div style={{ padding: space[3], fontSize: font.sm, color: color.mut2 }}>
        {error
          ? 'No se pudo leer a quién le debemos. Probá de nuevo en un rato.'
          : 'No hay ninguna deuda con acreedores ahora.'}
      </div>
    )
  }

  return (
    <>
      {acreedores.map((a) => {
        const yaComprometido = comprometido.get(a.id) ?? 0
        const sePuede = sePuedeComprometer(a.disponible, yaComprometido)
        const cuenta = a.cuentas.find((x) => x.sugerida) ?? a.cuentas[0] ?? null
        return (
          <article key={a.id} style={{
            background: color.surface, border: `1px solid ${color.line}`, borderRadius: radius.lg,
            margin: `0 ${space[2]}px ${space[2]}px`, padding: `${space[2]}px ${space[3]}px`,
          }}>
            <div style={{ fontSize: font.md, fontWeight: 700, color: color.ink }}>{a.nombre}</div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: font.xl, fontWeight: 700, color: color.ink, lineHeight: 1.15 }}>
                {plata(sePuede)}
              </span>
              <span style={{ fontSize: font.xs, color: color.mut2 }}>se le puede pedir</span>
            </div>

            {/* De dónde sale ese número, para que no parezca sacado de la galera. */}
            <div style={{ fontSize: font.xs, color: color.mut2 }}>
              se le debe {plata(a.saldo)}
              {yaComprometido > 0 && ` · ya hay ${plata(yaComprometido)} comprometidos`}
            </div>

            {/* 🔑 Plata ya mandada que el banco no debitó. Es lo que evita pagarle dos veces. */}
            {a.yaPagadoSinDebitar > 0 && (
              <div style={{ marginTop: 4 }}>
                <Chapa tono="espera">ya se le mandó {plata(a.yaPagadoSinDebitar)} sin debitar</Chapa>
              </div>
            )}

            {/* El alias, que es lo que se copia y se pega en el chat. */}
            {cuenta ? (
              <div style={{ marginTop: 6, fontSize: font.sm, color: color.mut, lineHeight: 1.5 }}>
                <b style={{ color: color.ink }}>{cuenta.alias || cuenta.cbu}</b>
                {cuenta.banco ? ` · ${cuenta.banco}` : ''}
                {cuenta.titular ? ` · a nombre de ${cuenta.titular}` : ''}
                {cuenta.alias && cuenta.cbu && (
                  <div style={{ fontFamily: 'monospace', fontSize: font.xs, color: color.mut2 }}>CBU {cuenta.cbu}</div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 6, fontSize: font.xs, color: color.warningInk }}>
                No tiene ninguna cuenta cargada. Se carga en el dashboard, en Finanzas → Acreedores.
              </div>
            )}
          </article>
        )
      })}
    </>
  )
}

function Fila({ c, hoy, puede, abierta, onConfirmarAbrir, onConfirmar, onEstado, onIrAlCliente }: {
  c: Compromiso
  hoy: string
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
      background: color.surface, border: `1px solid ${color.line}`, borderRadius: radius.lg,
      margin: `0 ${space[2]}px ${space[2]}px`, overflow: 'hidden',
    }}>
      {/*
        🔑 **Las acciones van al costado del monto, no en una barra abajo.**
        La barra sumaba ~40 px a cada tarjeta para dos botones, y en una columna de 380 px eso es lo
        que hacía que entraran tres filas donde entran cinco. Acá el ojo cae en el monto y la mano
        ya está al lado (Darío, 3-sep-2026: *"para acortar la vista"*).
      */}
      <div style={{ display: 'flex', gap: space[2], padding: `${space[2]}px ${space[3]}px`, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/*
            ⛔ **La chapa de estado NO está**, y la sacó Darío el 3-sep-2026. Decía "se lo pedimos"
            en cada fila de la lista que ya se titula "Esperando que transfieran": repetía el
            encabezado en amarillo, una vez por fila. La única chapa que sobrevive es la de vencida,
            porque ésa no la dice ningún título — es de ESTA fila y cambia todos los días.
          */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: font.xl, fontWeight: 700, color: color.ink, lineHeight: 1.15, whiteSpace: 'nowrap' }}>
              {plata(Number(c.monto))}
            </span>
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
          <div style={{ fontSize: font.sm, color: color.mut, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            → {c.acreedor_nombre}
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
            {puede.confirmar && <BotonIcono fuerte que="Ya entró" onClick={() => onConfirmarAbrir(c.id)} />}
            {puede.prometer && <BotonIcono que="Se cayó" onClick={() => onEstado(c, 'cancelado')} />}
          </div>
        )}
      </div>

      {abierta && (
        <div style={{ borderTop: `1px solid ${color.line2}`, padding: `${space[2]}px ${space[3]}px ${space[3]}px` }}>
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
    } catch (e) {
      decir(e instanceof Error ? e.message : 'No se pudo.', true)
    }
  }

  if (cobros.cargando) {
    return <div style={{ padding: space[3], fontSize: font.sm, color: color.mut2 }}>Buscando los compromisos de pago…</div>
  }

  if (!puede.ver) {
    return (
      <div style={{ padding: space[3], fontSize: font.sm, color: color.mut2 }}>
        Tu usuario no tiene habilitadas los compromisos de pago. Se activa en Usuarios.
      </div>
    )
  }

  const lista = (titulo: string, filas: Compromiso[]) =>
    filas.length > 0 && (
      <>
        <Titulo>{titulo} · {filas.length}</Titulo>
        {filas.map((c) => (
          <Fila
            key={c.id}
            c={c}
            hoy={hoy}
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
      {/* El aviso, con fondo y arriba de todo. Suelto entre bloques competía con el contenido. */}
      {aviso && (
        <div style={{
          margin: `0 ${space[2]}px ${space[2]}px`, padding: '6px 10px', borderRadius: radius.md,
          fontSize: font.xs, fontWeight: 600,
          background: aviso.mal ? color.dangerBg : color.successBg,
          color: aviso.mal ? color.dangerInk : color.successInk,
          border: `1px solid ${aviso.mal ? color.dangerBorder : color.successBorder}`,
        }}>
          {aviso.txt}
          {aviso.deshacer && (
            <button type="button" onClick={() => { const d = aviso.deshacer; setAviso(null); d?.() }}
              style={{ height: 'auto', marginLeft: 6, padding: 0, background: 'none', border: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textDecoration: 'underline' }}>
              deshacer
            </button>
          )}
        </div>
      )}

      {cobros.error && (
        <div style={{ margin: space[2], fontSize: font.xs, color: color.dangerInk, background: color.dangerBg, border: `1px solid ${color.dangerBorder}`, borderRadius: radius.sm, padding: '6px 8px' }}>
          {cobros.error}
        </div>
      )}
      {deudas.error && (
        <div style={{ margin: space[2], fontSize: font.xs, color: color.mut, background: color.bg2, border: `1px solid ${color.line2}`, borderRadius: radius.sm, padding: '6px 8px' }}>
          No se pudo leer a quién le debemos, así que no se puede anotar un compromiso nuevo. La lista
          de abajo anda igual.
        </div>
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
                : `Listo: las ${porVincular.length} compromisos quedaron a nombre de ${cliente.nombre}.`
            })}
          >
            Sí, es {cliente.nombre || 'este cliente'}
          </Button>
        </Bloque>
      )}

      {/* Las dos vistas. Chips, como los de la solapa "Hoy": es el mismo gesto en el mismo panel. */}
      <div style={{ display: 'flex', gap: 4, padding: `${space[2]}px ${space[3]}px 0` }}>
        {([['compromisos', `Compromisos${abiertas ? ` · ${abiertas}` : ''}`], ['acreedores', 'A quién le debemos']] as const).map(([k, txt]) => (
          <button
            key={k}
            type="button"
            onClick={() => setVista(k)}
            style={{
              height: 'auto', padding: '3px 10px', borderRadius: 999, fontSize: font.xs, fontWeight: 700,
              cursor: 'pointer', whiteSpace: 'nowrap',
              border: `1px solid ${vista === k ? color.brandSolid : color.line2}`,
              background: vista === k ? color.brandBg : 'transparent',
              color: vista === k ? color.brand : color.mut,
            }}
          >
            {txt}
          </button>
        ))}
      </div>

      {vista === 'acreedores' ? (
        <div style={{ marginTop: space[2] }}>
          <VistaAcreedores
            acreedores={deudas.acreedores}
            compromisos={cobros.compromisos}
            cargando={deudas.cargando}
            error={deudas.error}
          />
        </div>
      ) : (
       <>
      {/*
        Anotar. Va arriba de todo cuando HAY con quién: es lo que se hace con el cliente adelante.
        🔑 **Sin chat abierto se encoge a un renglón**, y esa es la corrección de fondo del 3-sep:
        una tarjeta grande en el lugar de honor para avisar que no se puede hacer nada es el peor
        uso posible de la primera pantalla. Sin cliente, lo útil es la lista de abajo.
      */}
      {cliente ? (
        <Bloque titulo="Que le pague a un acreedor">
          <NuevoCompromiso
            cliente={cliente}
            acreedores={deudas.acreedores}
            compromisos={cobros.compromisos}
            puede={puede}
            cargando={deudas.cargando}
            onCreado={(txt) => { decir(txt); cobros.recargar() }}
          />
        </Bloque>
      ) : (
        <div style={{ padding: `${space[2]}px ${space[3]}px 0`, fontSize: font.xs, color: color.mut2 }}>
          {buscandoCliente
            ? 'Buscando de quién es el chat…'
            : 'Abrí el chat de un cliente para anotarle un compromiso nuevo.'}
        </div>
      )}

      {/*
        🔑 **El total, como número y no como frase.** Es lo que resume la pantalla —cuánta plata hay
        en la calle— y estaba en gris chico, pesando menos que el título de la sección de abajo.
      */}
      {cola.totalAbierto > 0 && (
        <div style={{ padding: `${space[2]}px ${space[3]}px ${space[3]}px` }}>
          <div style={{ fontSize: font['2xl'], fontWeight: 700, color: color.ink, lineHeight: 1.1 }}>
            {plata(cola.totalAbierto)}
          </div>
          <div style={{ fontSize: font.xs, color: color.mut2 }}>comprometidos y sin entrar</div>
        </div>
      )}

      {/*
        ⛔ Sin subtítulos. "Dicen que ya transfirieron. Mirá el banco y confirmalo." explicaba la
        pantalla la primera vez y después eran dos renglones que se leen una sola vez en la vida.
        El título ya dice qué hay adentro.
      */}
      {lista('Falta confirmar', cola.porConfirmar)}
      {lista('Esperando que transfieran', cola.esperando)}

      {/*
        El estado vacío ocupa lugar a propósito: es la mitad de la pantalla y decirlo en un renglón
        gris deja la sensación de que algo no cargó.
      */}
      {abiertas === 0 && (
        <div style={{ padding: `${space[6]}px ${space[4]}px`, textAlign: 'center' }}>
          <div style={{ fontSize: font.md, fontWeight: 700, color: color.ink }}>
            No hay plata esperando
          </div>
          <div style={{ fontSize: font.sm, color: color.mut2, marginTop: 4, lineHeight: 1.5 }}>
            Cuando un cliente se comprometa a transferirle a un acreedor, el compromiso aparece acá
            hasta que entre.
          </div>
        </div>
      )}

      {cola.cerradas.length > 0 && (
        <>
          <div style={{ height: 8, background: color.bg2, borderTop: `1px solid ${color.line2}`, borderBottom: `1px solid ${color.line2}`, marginTop: space[3] }} />
          {verCerradas ? (
            <>
              <Titulo>Cerradas · {cola.cerradas.length}</Titulo>
              {cola.cerradas.slice(0, CERRADAS).map((c) => (
                <div key={c.id} style={{ borderTop: `1px solid ${color.line2}`, padding: `6px ${space[3]}px`, fontSize: font.sm, color: color.mut }}>
                  <b style={{ color: c.estado === 'confirmado' ? color.successInk : color.mut2 }}>
                    {c.estado === 'confirmado' ? 'entró' : 'se cayó'}
                  </b>{' '}
                  {plata(Number(c.estado === 'confirmado' ? (c.monto_confirmado ?? c.monto) : c.monto))} ·{' '}
                  {c.cliente_nombre} → {c.acreedor_nombre}
                </div>
              ))}
              {cola.cerradas.length > CERRADAS && (
                <div style={{ padding: `6px ${space[3]}px`, fontSize: font.xs, color: color.mut2 }}>
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
