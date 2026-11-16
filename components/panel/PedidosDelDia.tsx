'use client'

/**
 * La solapa «Pedidos» del panel de WhatsApp (Darío 15-nov, página https://claude.ai/artifact/F9adDHTnQkLiZH6Z3DuMJD y
 * `~/Downloads/plan-ficha-cliente-erp.md` § Solapa «Hoy»). «Hoy» se partió en dos: Pedidos (lo operativo) y Agenda (a quién
 * escribirle, `AgendaDelDia.tsx`).
 *
 * Tres bloques, un color por paso, lo viejo en rojo:
 *   - **Nuevos**: Sin cliente (ERP) → Sin pago (los pedidos del catálogo de hoy y ayer). En «Sin pago» ⛔ hay grupo
 *     «Contactados»: la marca «Sin contactar» va primero y se va sola cuando le escribís desde la compu; el ✓ queda sólo para
 *     lo escrito desde el celular (u otro número).
 *   - **Retenidos**: listos sin pagar y sin cuenta corriente (ERP, `PreparadosSinPagar`).
 *   - **Entregas** (Logística): Armando · Despachar · Retiro · Seguimiento.
 *
 * ⏭️ Falta del lado del ERP (Bruno): una lista de TODOS los pedidos abiertos + los cerrados de 60 días, con su pago. Con eso
 * entran el buscador, «Pagados» (para enviar a preparación), «Sin pago» leído del ERP y «Cerrados hoy». Hasta entonces «Sin
 * pago» son los pedidos del catálogo, que ⛔ sabe si pagó.
 *
 * El número de la solapa cuenta sólo lo que te necesita: ⛔ «Armando» ni los ya contactados.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { color, radius, space } from '@/components/ui/tokens'
import { Button, Icono } from '@/components/ui'
import { telefonoDeCliente } from '@/lib/crm/panel'
import { telDelChat } from '@/lib/crm/telefono.core.js'
import { type EscritosHoy } from '@/lib/crm/escritos'
import { armarFilasPedidos, claveContacto, leerContactados, linksDePedidos, marcarContactado, mensajeLink, traerPedidosCatalogo, type FilaPedido, type LinkPedido, type ResultadoCatalogo, type UltimosMios } from '@/lib/crm/pedidos-catalogo'
import { tomar } from '@/lib/crm/precarga'
import { copiarAlPortapapeles } from '@/lib/portapapeles'
import { enGrupoDeposito, estadoDeposito, faltanUnidades, formaCorta, pasoPanel, pendientesLogistica, TRANSPORTE, type PendienteLogistica, type Resultado } from '@/lib/crm/logistica'
import { PedidosSinCliente, PreparadosSinPagar } from './PedidosMayoristas'
import { Bloque, Cuando, Paso, Renglon, plataPedido as plata } from './pasos-pedido'

/**
 * Los pedidos del catálogo de hoy y ayer (Darío, 20-oct-2026). Ver `lib/crm/pedidos-catalogo.ts`.
 *
 * 🔑 Se pide al montar y cada 2 minutos mientras el panel está abierto. Lo último que llegó queda
 * en `memoriaPedidos`, afuera del componente: volver de la ficha no lo deja en blanco.
 */
const CADA_PEDIDOS_MS = 2 * 60_000
const memoriaPedidos: { r: ResultadoCatalogo | null } = { r: null }

function usePedidosCatalogo(): ResultadoCatalogo | null {
  const [r, setR] = useState<ResultadoCatalogo | null>(memoriaPedidos.r)
  useEffect(() => {
    let vivo = true
    let primera = true
    const pedir = async () => {
      // La primera, la que `precargarPanel` ya largó al abrir el panel (`lib/crm/precarga.ts`).
      const x = primera ? await tomar('catalogo', traerPedidosCatalogo, (y) => y.t === 'ok') : await traerPedidosCatalogo()
      primera = false
      // Un error pasajero no borra lo que ya se estaba viendo.
      if (x.t === 'error' && memoriaPedidos.r?.t === 'ok') return
      memoriaPedidos.r = x
      if (vivo) setR(x)
    }
    pedir()
    const id = setInterval(pedir, CADA_PEDIDOS_MS)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [])
  return r
}

/**
 * Los pedidos tildados «Contactado» a mano. Se leen con los pedidos (al montar y cada 2 minutos),
 * así lo que se tildó en otra compu aparece solo. Si una lectura falla, queda lo último que se vio.
 */
const memoriaContactados: { s: Set<string> | null } = { s: null }

function useContactados(): [Set<string> | null, (clave: string, marcado: boolean) => Promise<boolean>] {
  const [s, setS] = useState<Set<string> | null>(memoriaContactados.s)
  useEffect(() => {
    let vivo = true
    let primera = true
    const pedir = async () => {
      const x = primera ? await tomar('contactados', leerContactados, (y) => !!y) : await leerContactados()
      primera = false
      if (!x) return
      memoriaContactados.s = x
      if (vivo) setS(x)
    }
    pedir()
    const id = setInterval(pedir, CADA_PEDIDOS_MS)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [])
  const tildar = useCallback(async (clave: string, marcado: boolean) => {
    // Se ve al instante; si el servidor no lo guarda, vuelve a como estaba.
    const antes = memoriaContactados.s
    const ya = new Set(antes || [])
    if (marcado) ya.add(clave)
    else ya.delete(clave)
    memoriaContactados.s = ya
    setS(ya)
    const r = await marcarContactado(clave, marcado)
    memoriaContactados.s = r || antes
    setS(memoriaContactados.s)
    return !!r
  }, [])
  return [s, tildar]
}

/**
 * Copiar el link del pedido con su total (Darío, 26-oct-2026: «gente que a veces no guarda los
 * links»). Cuadrado como el ✓ y el de WhatsApp; el ✓ verde dura un momento y sólo sale si copió de
 * verdad.
 */
function BotonLink({ l }: { l: LinkPedido }) {
  const [copiado, setCopiado] = useState<boolean | null>(null)
  const copiar = async () => {
    const ok = await copiarAlPortapapeles(mensajeLink(l, plata))
    setCopiado(ok)
    setTimeout(() => setCopiado(null), 1400)
  }
  return (
    <button
      type="button"
      onClick={copiar}
      title={copiado === false ? 'No se pudo copiar' : copiado ? 'Copiado: pegalo en el chat' : `Copiar el link del pedido (total ${plata(l.total)})`}
      aria-label="Copiar el link del pedido"
      style={{ width: 32, minWidth: 32, height: 32, padding: 0, display: 'grid', placeItems: 'center', borderRadius: radius.md, border: `1px solid ${copiado ? color.success : color.line}`, background: copiado ? color.successBg : color.bg2, color: copiado ? color.successInk : color.ink, fontSize: 14, cursor: 'pointer' }}
    >
      {copiado ? '✓' : copiado === false ? '!' : '🔗'}
    </button>
  )
}

/**
 * Los pedidos de Logística con algún paso pendiente (Darío, 22-oct-2026): forma de entrega, datos,
 * etiqueta o seguimiento. Como los del catálogo, se piden al montar y cada 2 minutos.
 */
type ResultadoLogistica = Resultado<{ count: number; by_step: Record<string, number>; orders: PendienteLogistica[] }>
const memoriaLogistica: { r: ResultadoLogistica | null } = { r: null }

function usePendientesLogistica(): { r: ResultadoLogistica | null; actualizar: () => void; actualizando: boolean } {
  const [r, setR] = useState<ResultadoLogistica | null>(memoriaLogistica.r)
  const [actualizando, setActualizando] = useState(false)
  /**
   * «↻ Actualizar» (Darío, 25-oct-2026): consultar en el momento, sin esperar los 2 minutos — lo que
   * puede apurar es un pedido que acaba de entrar a Logística. Igual que el refresco solo, un error
   * no borra lo que ya se veía.
   */
  const actualizar = useCallback(async () => {
    setActualizando(true)
    const x = await pendientesLogistica()
    setActualizando(false)
    if (x.t === 'error' && memoriaLogistica.r?.t === 'ok') return
    memoriaLogistica.r = x
    setR(x)
  }, [])
  useEffect(() => {
    let vivo = true
    let primera = true
    const pedir = async () => {
      const x = primera ? await tomar('logistica', pendientesLogistica, (y) => y.t === 'ok') : await pendientesLogistica()
      primera = false
      if (x.t === 'error' && memoriaLogistica.r?.t === 'ok') return
      memoriaLogistica.r = x
      if (vivo) setR(x)
    }
    pedir()
    const id = setInterval(pedir, CADA_PEDIDOS_MS)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [])
  return { r, actualizar, actualizando }
}

/** Los links del catálogo de los pedidos en Logística. Se piden de nuevo sólo si cambian los números. */
function useLinksLogistica(orders: PendienteLogistica[]): Record<string, LinkPedido> {
  const numeros = orders.map((p) => p.gn_number || '').filter(Boolean).sort().join(',')
  const [links, setLinks] = useState<Record<string, LinkPedido>>({})
  useEffect(() => {
    if (!numeros) return
    let vivo = true
    linksDePedidos(numeros.split(',')).then((l) => vivo && setLinks(l))
    return () => {
      vivo = false
    }
  }, [numeros])
  return links
}


const CUADRADO = { width: 32, minWidth: 32, height: 32, padding: 0, display: 'grid', placeItems: 'center', borderRadius: radius.md } as const

function BotonChat({ tel, nombre, onAbrir, buscando }: { tel: string; nombre: string; onAbrir: () => void; buscando?: boolean }) {
  return (
    <button
      type="button"
      disabled={!tel}
      onClick={onAbrir}
      title={tel ? 'Abrir el chat' : buscando ? 'Buscando el teléfono…' : 'No tiene teléfono cargado, así que no puedo abrir el chat'}
      aria-label={`Abrir el chat de ${nombre}`}
      style={{ ...CUADRADO, border: tel ? 0 : `1px solid ${color.line2}`, background: tel ? color.whatsapp : 'none', color: tel ? color.sideActiveInk : color.mut2, cursor: tel ? 'pointer' : 'default', opacity: tel ? 1 : 0.5 }}
    >
      <Icono nombre="whatsapp" size={16} />
    </button>
  )
}

/** La marca «Sin contactar», ámbar: lo primero que se ve en «Sin pago». */
function SinContactar() {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 999, whiteSpace: 'nowrap', border: `1px solid ${color.warningBorder}`, background: color.warningBg, color: color.warningInk }}>Sin contactar</span>
}

/**
 * Un pedido de «Sin pago». El ✓ sólo aparece si WhatsApp Web ⛔ vio que le escribiste (desde el celular u otro número): lo
 * que vio WhatsApp ya saca la marca solo.
 */
function FilaSinPago({ p, onAbrir, onFicha, onTildar }: { p: FilaPedido; onAbrir: (id: number, tel: string) => void; onFicha: (id: number, tel: string) => void; onTildar: (p: FilaPedido) => void }) {
  const nombre = p.cliente || 'Sin nombre'
  return (
    <Renglon
      nombre={nombre}
      onTocar={p.telefono ? () => onFicha(0, p.telefono) : undefined}
      tituloTocar="Ver la ficha"
      detalle={<>{!p.hablado && <SinContactar />}{plata(p.total)} · <Cuando iso={p.fecha} /></>}
      botones={<>
        {p.link && <BotonLink l={{ link: p.link, total: p.total }} />}
        {!p.auto && (
          <button
            type="button"
            aria-pressed={p.marcado}
            onClick={() => onTildar(p)}
            title={p.marcado ? 'Desmarcar' : 'Marcar como contactado (le escribiste desde el celular)'}
            aria-label={p.marcado ? `Desmarcar a ${nombre}` : `Marcar a ${nombre} como contactado`}
            style={{ ...CUADRADO, border: `1px solid ${p.marcado ? color.success : color.line}`, background: p.marcado ? color.successBg : color.bg2, color: p.marcado ? color.successInk : color.mut2, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            ✓
          </button>
        )}
        <BotonChat tel={p.telefono} nombre={nombre} onAbrir={() => onAbrir(0, p.telefono)} />
      </>}
    />
  )
}

/** El paso de Entregas de un pedido de Logística: todo lo pendiente cae en alguno. */
export type PasoEntrega = 'armando' | 'despachar' | 'retiro' | 'seguimiento'
export function pasoEntrega(p: PendienteLogistica): PasoEntrega {
  if (p.next_step?.code === 'seguimiento' && p.dispatch_option?.code !== TRANSPORTE && p.status.code >= 3) return 'seguimiento'
  if (enGrupoDeposito(p)) return 'armando'
  if (pasoPanel(p) === 'despachar' && p.dispatch_option?.code === 2) return 'retiro'
  return 'despachar'
}

/** Lo que dice el renglón: una palabra, lo que falta o la forma de entrega. */
function detalleEntrega(p: PendienteLogistica, paso: PasoEntrega): React.ReactNode {
  if (paso === 'armando') {
    const u = p.units?.total ? `${p.units.scanned}/${p.units.total}` : estadoDeposito(p)
    return <>{u} · <Cuando iso={p.status.since ?? p.sold_at} /></>
  }
  if (paso === 'seguimiento') return <>{formaCorta(p) ?? 'Despachado'}</>
  const falta = pasoPanel(p)
  const aviso = p.next_step?.code === 'datos' ? 'Faltan datos' : falta === 'forma' ? 'Falta la forma de entrega' : falta === 'em' ? 'Falta el EM' : falta === 'etiqueta' ? 'Falta la etiqueta' : null
  const faltan = faltanUnidades(p)
  return <>
    {aviso ? <span style={{ color: color.warningInk, fontWeight: 600 }}>{aviso}</span> : formaCorta(p)}
    {faltan > 0 && <span style={{ color: color.warningInk, fontWeight: 600 }}>· faltan {faltan}</span>}
  </>
}

/**
 * Un pedido de Entregas. 🔴 Logística puede traerlo sin teléfono (Darío, 3-nov-2026: el botón verde no hacía nada): se lo
 * busca en la ficha del cliente.
 */
export function FilaLogistica({ p, onAbrir, onFicha, link, paso = pasoEntrega(p) }: { p: PendienteLogistica; onAbrir: (id: number, tel: string) => void; onFicha: (id: number, tel: string) => void; link?: LinkPedido; paso?: PasoEntrega }) {
  const id = Number(p.gn_client_id) || 0
  const telPedido = telDelChat(p.client_phone)
  const [telFicha, setTelFicha] = useState<string | null>(null)
  useEffect(() => {
    if (telPedido || !id) return
    let vivo = true
    telefonoDeCliente(id).then((t) => vivo && setTelFicha(t))
    return () => {
      vivo = false
    }
  }, [telPedido, id])
  const tel = telPedido || telFicha || ''
  const nombre = p.client_name || 'Sin nombre'
  return (
    <Renglon
      nombre={nombre}
      onTocar={id || tel ? () => onFicha(id, tel) : undefined}
      tituloTocar="Ver la ficha"
      detalle={detalleEntrega(p, paso)}
      botones={<>
        {link && <BotonLink l={link} />}
        <BotonChat tel={tel} nombre={nombre} buscando={!telPedido && !!id && telFicha === null} onAbrir={() => onAbrir(id, tel)} />
      </>}
    />
  )
}

const VISIBLES_ARMANDO = 3

export function PedidosDelDia({
  today,
  escritos,
  ultimos,
  onAbrirChat,
  onVerFicha,
  puedeAbrirChat,
  onPendientes,
}: {
  today: Date
  escritos?: EscritosHoy
  ultimos?: UltimosMios | null
  onAbrirChat: (id: number, tel: string) => void
  onVerFicha: (id: number, tel: string) => void
  puedeAbrirChat: boolean
  /** Lo que te necesita (sin «Armando» ni lo ya contactado): el número de la solapa. */
  onPendientes?: (n: number) => void
}) {
  const catalogo = usePedidosCatalogo()
  const [contactados, tildarContactado] = useContactados()
  const filas = useMemo(
    () => (catalogo?.t === 'ok' ? armarFilasPedidos(catalogo.datos.pedidos, false, today, ultimos ?? null, escritos ?? new Set(), contactados) : []),
    [catalogo, today, ultimos, escritos, contactados],
  )
  const [avisoTilde, setAvisoTilde] = useState('')
  const onTildar = (p: FilaPedido) => {
    setAvisoTilde('')
    tildarContactado(claveContacto(p), !p.marcado).then((ok) => {
      if (!ok) setAvisoTilde('No se pudo guardar el ✓. Probá de nuevo.')
    })
  }

  const [sinCliente, setSinCliente] = useState({ n: 0, plata: 0 })
  const [retenidos, setRetenidos] = useState(0)
  const alSinCliente = useCallback((n: number, p: number) => setSinCliente({ n, plata: p }), [])
  const alRetenidos = useCallback((n: number) => setRetenidos(n), [])

  const { r: logistica, actualizar, actualizando } = usePendientesLogistica()
  const ordenes = useMemo(() => (logistica?.t === 'ok' ? logistica.datos.orders : []), [logistica])
  const links = useLinksLogistica(ordenes)
  const porPaso = useMemo(() => {
    const g: Record<PasoEntrega, PendienteLogistica[]> = { armando: [], despachar: [], retiro: [], seguimiento: [] }
    for (const o of ordenes) g[pasoEntrega(o)].push(o)
    return g
  }, [ordenes])
  const [verArmando, setVerArmando] = useState(false)

  const sinContactar = filas.filter((p) => !p.hablado).length
  const pendientes = sinCliente.n + sinContactar + retenidos + porPaso.despachar.length + porPaso.retiro.length + porPaso.seguimiento.length
  useEffect(() => {
    onPendientes?.(pendientes)
  }, [pendientes, onPendientes])

  const nuevos = sinCliente.n + filas.length
  const plataNuevos = sinCliente.plata + filas.reduce((a, p) => a + p.total, 0)
  const enEntregas = ordenes.length
  const linkDe = (p: PendienteLogistica) => (p.gn_number ? links[p.gn_number.replace(/\D/g, '')] : undefined)
  const fila = (p: PendienteLogistica, paso: PasoEntrega) => <FilaLogistica key={p.id} p={p} paso={paso} onAbrir={onAbrirChat} onFicha={onVerFicha} link={linkDe(p)} />
  const armandoVisibles = verArmando ? porPaso.armando : porPaso.armando.slice(0, VISIBLES_ARMANDO)

  return (
    <div style={{ paddingBottom: space[3] }}>
      {!puedeAbrirChat && (
        <div style={{ margin: space[3], marginBottom: 0, fontSize: 12, color: color.mut, background: color.bg2, border: `1px solid ${color.line2}`, borderRadius: radius.sm, padding: '6px 8px' }}>
          Estás viendo esta lista fuera de WhatsApp, así que el botón verde no abre el chat. Adentro del panel de la extensión sí.
        </div>
      )}

      {catalogo?.t !== 'sin-permiso' && (
        <Bloque titulo="Nuevos" detalle={nuevos ? `${nuevos} · ${plata(plataNuevos)}` : '0'}>
          <PedidosSinCliente onCuantos={alSinCliente} />
          <Paso titulo="Sin pago" tono="ambar" cuantos={filas.length}>
            {filas.map((p) => <FilaSinPago key={p.key} p={p} onAbrir={onAbrirChat} onFicha={onVerFicha} onTildar={onTildar} />)}
          </Paso>
          {avisoTilde && <Aclaracion>{avisoTilde}</Aclaracion>}
          {catalogo?.t === 'error' && <Aclaracion>No pude traer los pedidos del catálogo. {catalogo.motivo}</Aclaracion>}
          {catalogo?.t === 'ok' && !nuevos && <Aclaracion>Todavía no entró ningún pedido.</Aclaracion>}
        </Bloque>
      )}

      <PreparadosSinPagar onCuantos={alRetenidos} />

      {logistica && logistica.t !== 'sin-permiso' && (
        <Bloque
          titulo="Entregas"
          detalle={String(enEntregas)}
          accion={
            <Button size="sm" variant="ghost" disabled={actualizando} title="Consultar Logística ahora, sin esperar el refresco de cada 2 minutos" onClick={actualizar}>
              {actualizando ? 'Actualizando…' : '↻ Actualizar'}
            </Button>
          }
        >
          {logistica.t === 'error' && <Aclaracion>No pude traer los pedidos de Logística. {logistica.motivo}</Aclaracion>}
          <Paso titulo="Armando" tono="gris" cuantos={porPaso.armando.length}>
            {armandoVisibles.map((p) => fila(p, 'armando'))}
            {porPaso.armando.length > VISIBLES_ARMANDO && (
              <button
                type="button"
                aria-expanded={verArmando}
                onClick={() => setVerArmando((v) => !v)}
                style={{ display: 'block', width: '100%', height: 'auto', textAlign: 'left', background: color.surface, border: 0, borderTop: `1px solid ${color.line2}`, padding: `${space[2]}px ${space[3]}px`, fontSize: 12, fontWeight: 600, color: color.mut, cursor: 'pointer' }}
              >
                {verArmando ? '▾ Ver menos' : `▸ ${porPaso.armando.length - VISIBLES_ARMANDO} más`}
              </button>
            )}
          </Paso>
          <Paso titulo="Despachar" tono="azul" cuantos={porPaso.despachar.length}>{porPaso.despachar.map((p) => fila(p, 'despachar'))}</Paso>
          <Paso titulo="Retiro" tono="verde" cuantos={porPaso.retiro.length}>{porPaso.retiro.map((p) => fila(p, 'retiro'))}</Paso>
          <Paso titulo="Seguimiento" tono="celeste" cuantos={porPaso.seguimiento.length}>{porPaso.seguimiento.map((p) => fila(p, 'seguimiento'))}</Paso>
          {logistica.t === 'ok' && !enEntregas && <Aclaracion>No hay pedidos en Logística.</Aclaracion>}
        </Bloque>
      )}
    </div>
  )
}

/** Un renglón gris adentro de un bloque: vacío, o un aviso. */
function Aclaracion({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: `${space[2]}px ${space[3]}px`, fontSize: 12, color: color.mut2, borderTop: `1px solid ${color.line2}` }}>{children}</div>
}
