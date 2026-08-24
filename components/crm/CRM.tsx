'use client'

import { useMemo, useState } from 'react'
import { useCRM } from './useCRM'
import { TEMP_UI } from './temperatura'
import { Leads } from './Leads'
import { LeadsDelDia } from './LeadsDelDia'
import { Metricas } from './Metricas'
import { ClienteModal } from './ClienteModal'
import { GuiaTrabajo, type AccionGuia } from './GuiaTrabajo'
import { BancoMensajes } from './BancoMensajes'
import { FILTROS_POR_DIA, TANDA_FRIOS, contarKpis, contarPorDia, filtrarOrdenar, normalizeArgPhone, siguienteTemperatura } from '@/lib/crm/core'
import { feriadosDe, proximoHabil } from '@/lib/crm/agenda.core.js'
import { sumarDias } from '@/lib/calendario/fechas.core.js'
import {
  setDescartado,
  setDifusion,
  setPagina,
  setTemperatura,
} from '@/lib/crm/seguimiento'
import type { ClienteCRM, MapaSeguimiento, Seguimiento, Temperatura } from '@/lib/crm/tipos'
import type { ModoCanal } from '@/lib/crm/datos'
import { HeaderAcciones } from '@/components/layout/acciones'
import { BuscarInput, Button, Chips, KpiCard, Notice, Select, StatusPill, TBody, THead, TableWrap, Tabs, Td, Th, Tr, color, font, space } from '@/components/ui'

/**
 * El CRM en Next. Port de la vista Clientes (index.html:1703-1801 + renderCRM/
 * renderCRMTabla) y de la ficha del cliente (abrirClienteModal).
 *
 * **Escribe `crm:seg` — el dato sin backup** (305 clientes, 274 ★, 39 notas). Cada
 * edición corre una transformación PURA de `lib/crm/seguimiento.ts` y persiste el
 * mapa entero con el flag `cargado`: si el KV no se pudo leer, ningún guardado
 * sale (evita el borrado en masa). Verificación en prod: el diff contra el dump
 * es exactamente el cliente tocado.
 */

const SEGMENTOS = [
  { v: 'todos', t: 'Todos' },
  { v: 'atrasados', t: '⚠️ Atrasados' },
  { v: 'hoy', t: 'Hoy' },
  { v: 'manana', t: 'Mañana' },
  { v: 'semana', t: 'Esta semana' },
  { v: 'frios', t: '🧊 Fríos / En recuperación' },
  { v: 'top', t: '⭐ Top clientes' },
  { v: 'activos', t: 'Activos recurrentes' },
  { v: 'riesgo', t: 'En riesgo' },
  { v: 'dormidos', t: 'Dormidos (90+ días)' },
  { v: 'nuevos', t: 'Nuevos' },
  { v: 'sin-difusion', t: 'Sin difusión' },
  { v: 'sin-tel', t: 'Sin teléfono (cargar)' },
]


const fmtMonto = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
function fmtFecha(d: string | null): string {
  if (!d) return '—'
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
}

function CeldaProximo({ c }: { c: ClienteCRM }) {
  if (c.seg_estado === 'none') return <span style={{ color: color.mut2 }}>—</span>
  const cfg = {
    pendiente: { txt: 'A contactar', tone: 'danger' as const },
    vencido: { txt: 'Vencido', tone: 'danger' as const },
    semana: { txt: 'Esta semana', tone: 'warning' as const },
    aldia: { txt: 'Al día', tone: 'success' as const },
  }[c.seg_estado]
  let sub: string
  if (c.seg_estado === 'pendiente') sub = 'Sin primer contacto'
  else {
    const d = c.dias_proximo as number
    sub = `${fmtFecha(c.proximo_contacto)} · ${d === 0 ? 'hoy' : d < 0 ? `hace ${-d}d` : `en ${d}d`}`
  }
  return (
    <>
      <StatusPill tone={cfg.tone} label={cfg.txt} />
      <div style={{ fontSize: 11, color: color.mut2, marginTop: 2 }}>{sub}</div>
    </>
  )
}

type FilaProps = {
  c: ClienteCRM
  seg: Seguimiento
  verDescartados: boolean
  onAbrir: (id: number) => void
  onDifusion: (id: number, val: boolean) => void
  onDescartado: (id: number, val: boolean) => void
  onPagina: (id: number, val: string) => void
  onTemperatura: (id: number, val: Temperatura) => void
}

function Fila({ c, seg, verDescartados, onAbrir, onDifusion, onDescartado, onPagina, onTemperatura }: FilaProps) {
  const esMayorista = !!seg.es_mayorista
  const enDifusion = !!seg.en_difusion
  // Sigue haciendo falta aunque ya no haya botón de WhatsApp: es lo que marca "Sin teléfono".
  const waPhone = normalizeArgPhone(c.phone)
  const ult = c.dias_ultimo === null ? '—' : c.dias_ultimo === 0 ? 'hoy' : `hace ${c.dias_ultimo}d`
  const notas = Array.isArray(c.notas) ? c.notas : []
  const ultNota = notas.length ? notas.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0] : null

  return (
    <Tr onClick={() => onAbrir(c.id)}>
      <Td tall>
        <div style={{ fontWeight: 600, color: color.ink }}>
          {c.name}
          {esMayorista && (
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--mo-mayorista-fg)', background: 'var(--mo-mayorista-bg)', padding: '1px 6px', borderRadius: 10, verticalAlign: 'middle', marginLeft: 4 }}>MAYORISTA</span>
          )}
        </div>
        <div style={{ fontSize: font.xs, color: color.mut2 }}>#{c.id}</div>
      </Td>
      <Td tall>
        <span onClick={(e) => e.stopPropagation()}>
        {c.email && <div style={{ fontSize: 12 }}>{c.email}</div>}
        {c.phone && <div style={{ fontSize: 11, color: color.mut }}>{c.phone}</div>}
        {!waPhone && <div style={{ fontSize: font.xs, color: color.danger, fontWeight: 600, marginTop: 2 }}>Sin teléfono</div>}
          <input
            className="mo-input"
            type="text"
            defaultValue={seg.pagina || ''}
            placeholder="@instagram"
            onBlur={(e) => { if (e.target.value.trim() !== (seg.pagina || '')) onPagina(c.id, e.target.value) }}
            style={{ fontSize: font.xs, width: 130, height: 26, marginTop: 3 }}
          />
        </span>
      </Td>
      <Td align="right">{c.total_sales}</Td>
      <Td align="right" strong>{fmtMonto(c.total_amount)}</Td>
      <Td align="right" tall>
        <div>{ult}</div>
        <div style={{ fontSize: font.xs, color: color.mut2 }}>{fmtFecha(c.last_sale)}</div>
      </Td>
      <Td><CeldaProximo c={c} /></Td>
      <Td tall style={{ maxWidth: 240 }}>
        {ultNota ? (
          <>
            <div style={{ fontSize: font.xs, color: color.mut2 }}>{fmtFecha(ultNota.fecha)}</div>
            <div style={{ fontSize: font.sm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ultNota.texto}</div>
          </>
        ) : (
          <span style={{ color: color.mut2 }}>—</span>
        )}
      </Td>
      <Td align="center">
        <button
          // El stopPropagation va acá adentro, no en un `onClickCapture`: en captura corta el
          // recorrido del evento ANTES de que llegue al propio `onClick` del botón, así que lo
          // deja muerto. Lo único que hay que evitar es que el click abra además la ficha del
          // cliente, y para eso alcanza con cortar el burbujeo hacia la fila.
          onClick={(e) => {
            e.stopPropagation()
            onDifusion(c.id, !enDifusion)
          }}
          title={enDifusion ? 'Está en el canal de difusión — tocá para sacarlo' : 'Todavía no está en el canal — tocá cuando ya lo hayas agregado'}
          style={{ cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap', border: enDifusion ? `1px solid ${color.success}` : `1px dashed ${color.line2}`, background: enDifusion ? color.successBg : 'transparent', color: enDifusion ? color.success : color.mut2 }}
        >
          {enDifusion ? 'Sí' : '+ Sumar'}
        </button>
      </Td>
      <Td align="center">
        {(() => {
          const t = TEMP_UI[c.temperatura]
          return (
            <button
              // Mismo trato que el botón de Difusión: el stopPropagation va adentro del
              // onClick (en captura mataría el propio click del botón). Lo único a evitar
              // es que el clic abra además la ficha del cliente.
              onClick={(e) => {
                e.stopPropagation()
                onTemperatura(c.id, siguienteTemperatura(c.temperatura))
              }}
              title={`${t.txt} — ${t.ayuda}`}
              style={{ cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap', border: `1px solid ${t.bd}`, background: t.bg, color: t.fg }}
            >
              {t.txt}
            </button>
          )
        })()}
      </Td>
      {/* La columna de acciones existe SOLO mirando descartados: sacado el botón de
          WhatsApp, lo único que queda acá es Reactivar. Si se dejara fija, en el uso
          normal sería una columna vacía. */}
      {verDescartados && (
        <Td>
          <span onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="ghost" onClick={() => onDescartado(c.id, false)} title="Reactivar — vuelve al CRM">
              ↩ Reactivar
            </Button>
          </span>
        </Td>
      )}
    </Tr>
  )
}

export function CRM() {
  const [modo, setModo] = useState<ModoCanal>('10')
  const [q, setQ] = useState('')
  const [seg, setSeg] = useState('todos')
  const [verDescartados, setVerDescartados] = useState(false)
  const [sort, setSort] = useState({ col: 'total_amount', dir: -1 })
  const [guia, setGuia] = useState(false)
  // El banco de mensajes se carga al abrirse, no con la sección: es una consulta más al KV que
  // la mayoría de los días no se usa.
  const [mensajes, setMensajes] = useState(false)
  const [vista, setVista] = useState<'clientes' | 'leads' | 'metricas'>('clientes')
  const [modalId, setModalId] = useState<number | null>(null)
  // La ficha de lead que hay que abrir al saltar desde la lista del día.
  const [leadId, setLeadId] = useState<string | null>(null)
  const { cargando, error, agregado, ventas, crmSeg, cargado, hoy, recargar, guardarSeg } = useCRM(modo)

  const kpis = useMemo(() => contarKpis(agregado.activos), [agregado])
  // Los que compraron pero todavía no están en el canal de difusión. Se cuenta
  // acá (no en contarKpis) para no tocar la paridad de KPIs contra el legacy.
  const sinDifusion = useMemo(() => agregado.activos.filter((c) => !c.en_difusion).length, [agregado])
  // Ídem: los fríos se cuentan acá y no en contarKpis, por la misma razón.
  const frios = useMemo(() => agregado.activos.filter((c) => c.temperatura === 'frio').length, [agregado])

  /**
   * "Mañana" es el próximo día HÁBIL, no el día siguiente del almanaque: un viernes es el
   * lunes, y si el lunes es feriado, el martes. Misma función que usa el reparto de la
   * agenda, así que la pantalla y el script no pueden discrepar sobre qué día es mañana.
   */
  const manana = useMemo(() => {
    const anio = Number(hoy.slice(0, 4))
    return proximoHabil(sumarDias(hoy, 1), feriadosDe([anio, anio + 1])) as string
  }, [hoy])

  // Los cuatro contadores salen de `contarPorDia`, la MISMA función que decide qué filas
  // muestra la tabla. Contarlos acá a mano es lo que hacía que el chip dijera 302 y abajo
  // aparecieran 252: los fríos ya no entran en la lista del día.
  const porDia = useMemo(() => contarPorDia(agregado.activos, hoy, manana), [agregado, hoy, manana])

  const lista = useMemo(
    () => filtrarOrdenar(verDescartados ? agregado.descartados : agregado.activos, { q: q.trim().toLowerCase(), seg: verDescartados ? 'todos' : seg, sort, hoy, manana }),
    [agregado, q, seg, sort, verDescartados, hoy, manana],
  )

  const ordenarPor = (col: string) => setSort((s) => (s.col === col ? { col, dir: -s.dir } : { col, dir: -1 }))
  // 9 columnas fijas + la de Reactivar, que solo existe mirando descartados.
  const nCols = verDescartados ? 10 : 9

  /**
   * Cada bloque de la guía LLEVA a su lista en vez de describirla: es la diferencia entre
   * una guía y un documento. Se resuelve acá porque el estado de los filtros vive acá.
   */
  const irDesdeGuia = (k: AccionGuia) => {
    setGuia(false)
    setVista('clientes')
    setVerDescartados(false)
    if (k === 'contactar') setSeg('hoy')
    else if (k === 'frios') setSeg('frios')
    else if (k === 'reposicion') {
      // No hay filtro de "compró hace 10 a 15 días". Lo más cerca que se llega hoy: los
      // activos recurrentes ordenados por último pedido, y él baja hasta esa franja.
      setSeg('activos')
      setSort({ col: 'last_sale', dir: -1 })
    }
  }

  // Cada edición: transformación pura → persiste el mapa entero (gateado por cargado).
  const mutar = (fn: (s: MapaSeguimiento) => MapaSeguimiento) => guardarSeg(fn(crmSeg))
  const onDifusion = (id: number, val: boolean) => mutar((s) => setDifusion(s, id, val))
  const onDescartado = (id: number, val: boolean) => mutar((s) => setDescartado(s, id, val))
  const onPagina = (id: number, val: string) => mutar((s) => setPagina(s, id, val))
  const onTemperatura = (id: number, val: Temperatura) => mutar((s) => setTemperatura(s, id, val))


  /**
   * 🔴 **La subida del Excel de teléfonos salió el 24-ago-2026.** Existía porque la API de ventas
   * de Gestión Nube no expone el celular, así que el número había que traerlo del export a mano.
   * **Eso lo resolvió el sync del padrón de clientes** (`scripts/sync-clientes.js`, 23-ago-2026,
   * corre solo todas las madrugadas): hoy el teléfono viene de la ficha de GN.
   *
   * Medido antes de sacarlo: de las **653 entradas** que dejó el Excel en `crm:tel`, **las 653
   * dicen exactamente lo mismo que el padrón**. Ninguna aportaba nada, y volver a subir el archivo
   * sólo servía para **pisar** los números enganchados a mano desde el panel de WhatsApp — que es
   * lo que ahora escribe ese mapa cuando un cliente cambia de línea.
   *
   * ⚠️ **El mapa `crm:tel` NO se borró** y se sigue leyendo: cambió quién lo escribe, no para qué
   * sirve. Lo escribe `vincularTelefono` (`lib/crm/panel.ts`), de a un cliente por vez.
   */

  const tarjetas = [
    { key: 'frios', label: '🧊 Fríos', n: frios },
    { key: 'top', label: '⭐ Top clientes', n: kpis.top },
    { key: 'activos', label: 'Activos', n: kpis.activos },
    { key: 'riesgo', label: 'En riesgo', n: kpis.riesgo },
    { key: 'dormidos', label: 'Dormidos', n: kpis.dormidos },
    { key: 'nuevos', label: 'Nuevos', n: kpis.nuevos },
    { key: 'sin-difusion', label: 'Sin difusión', n: sinDifusion },
    { key: 'sin-tel', label: 'Sin teléfono', n: kpis.sinTel },
  ]

  const clienteModal = modalId != null ? [...agregado.activos, ...agregado.descartados].find((c) => c.id === modalId) : null

  return (
    <>
      {/* En Métricas estas acciones no aplican: el canal no cambia el tablero (siempre es
          el 10) y las tres de la derecha editan el seguimiento, que ahí no se ve. */}
      <HeaderAcciones>
        {vista !== 'metricas' && (
          <Select value={modo} onChange={(e) => setModo(e.target.value as ModoCanal)} style={{ width: 170 }} aria-label="Canal">
            <option value="10">Mayorista</option>
            <option value="all">Todos los canales</option>
          </Select>
        )}
        {/* Va siempre visible y primero: es lo que se abre al empezar el día, en cualquier
            pestaña de la sección. */}
        <Button variant="outline" onClick={() => setGuia(true)}>Guía de trabajo</Button>
        {/* Al lado de la guía y no adentro: los mensajes se editan acá, pero se usan en el panel
            de WhatsApp. Es la única pantalla donde se pueden cambiar. */}
        <Button variant="outline" onClick={() => setMensajes(true)}>Mensajes</Button>
        <Button variant="ghost" onClick={recargar}>Recalcular</Button>
      </HeaderAcciones>

      <div>
        <Tabs
          items={[
            { key: 'clientes', label: 'Clientes' },
            { key: 'leads', label: 'Leads' },
            { key: 'metricas', label: 'Métricas' },
          ]}
          value={vista}
          onChange={(k) => setVista(k as 'clientes' | 'leads' | 'metricas')}
          style={{ marginBottom: space[4] }}
        />

        {vista === 'leads' ? (
          <Leads abrirId={leadId} />
        ) : vista === 'metricas' ? (
          <Metricas ventas={ventas} cargando={cargando} />
        ) : (
          <>
            {error && (
              <Notice tone="danger" icon="⚠" style={{ marginBottom: space[4] }}>
                {error}
              </Notice>
            )}

            {/* Los chips responden CUÁNDO hay que llamarlo; las tarjetas de abajo, QUÉ CLASE
                de cliente es. Mezclarlas es lo que había convertido a "Para contactar" en un
                cajón de 295 personas cuando la lista del día eran 73.

                Y de paso arregla el cruce con la temperatura: adentro de "Hoy" todos comparten
                fecha, así que un 🧊 Frío queda al final de LOS DE HOY y no al final de la
                semana entera, que era donde se perdía. */}
            <div style={{ marginBottom: space[3] }}>
              <Chips
                value={seg}
                onChange={(k) => {
                  setVerDescartados(false)
                  setSeg(k)
                }}
                opciones={[
                  { key: 'todos', label: 'Todos' },
                  { key: 'atrasados', label: '⚠️ Atrasados', n: porDia.atrasados, title: 'Vencían antes de hoy y no se los llamó. Es la deuda: si crece, el plan se está desarmando.' },
                  { key: 'hoy', label: 'Hoy', n: porDia.hoy, title: `Los agendados para hoy (${fmtFecha(hoy)})` },
                  { key: 'manana', label: `Mañana · ${fmtFecha(manana).slice(0, 5)}`, n: porDia.manana, title: `El próximo día hábil (${fmtFecha(manana)}). Un viernes salta al lunes, y al martes si el lunes es feriado.` },
                  { key: 'semana', label: 'Esta semana', n: porDia.semana, title: 'Todo lo que vence dentro de los próximos 7 días, más lo atrasado.' },
                  // La segunda etapa del día, no un filtro más: se abre cuando terminaste la
                  // lista de arriba. Por eso está acá y no escondido en el select de segmentos.
                  { key: 'recuperar', label: '🧊 Recuperar', n: porDia.recuperar, title: `La tanda de fríos de hoy: los ${TANDA_FRIOS} que más compraron, entre los que están vencidos. Mañana suben los siguientes.` },
                ]}
              />
              {/* Los fríos salen de la lista del día, pero NO en silencio: el número está a la
                  vista y lleva a su propia lista. Sin este renglón, un día se pregunta dónde
                  fueron a parar 50 personas y no hay forma de saberlo desde la pantalla. */}
              {/* Los fríos no entran acá arriba, pero NO se ocultan: el número está a la vista y
                  lleva a su etapa. Sin este renglón, un día se pregunta dónde fueron a parar 50
                  personas y no hay forma de saberlo desde la pantalla. */}
              {seg !== 'recuperar' && porDia.friosFuera > 0 && (
                <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[2] }}>
                  Además hay {porDia.friosFuera} 🧊 fríos vencidos, que van aparte.{' '}
                  <button
                    type="button"
                    onClick={() => { setVerDescartados(false); setSeg('recuperar') }}
                    style={{ background: 'none', border: 0, padding: 0, color: color.brand, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
                  >
                    Ver la tanda de hoy
                  </button>
                </div>
              )}
              {seg === 'recuperar' && (
                <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[2] }}>
                  La tanda de hoy: los {TANDA_FRIOS} que más te compraron, de {porDia.friosFuera} fríos
                  vencidos. A medida que los vas registrando, suben los que siguen.{' '}
                  <button
                    type="button"
                    onClick={() => { setVerDescartados(false); setSeg('frios') }}
                    style={{ background: 'none', border: 0, padding: 0, color: color.brand, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
                  >
                    Ver los {frios} fríos
                  </button>
                </div>
              )}
            </div>

            {/* Los leads del mismo filtro, arriba de la tabla: son parte de la lista del día,
                no de otra pantalla. Ver `LeadsDelDia`. */}
            {FILTROS_POR_DIA.has(seg) && !verDescartados && (
              <LeadsDelDia
                seg={seg}
                hoy={hoy}
                manana={manana}
                onAbrirLead={(id) => {
                  setLeadId(id)
                  setVista('leads')
                }}
              />
            )}

            {/* Las tarjetas son FILTROS, no adornos: tocar una filtra la tabla de abajo.
                Antes eran `.stat` idénticas a las de un tablero, así que no se notaba. */}
            <div className="mo-kpis">
              {tarjetas.map((t) => (
                <KpiCard
                  key={t.key}
                  label={t.label}
                  value={t.n}
                  tone={seg === t.key && !verDescartados ? 'brand' : 'neutral'}
                  activo={seg === t.key && !verDescartados}
                  accion="Ver estos →"
                  accionActiva="Viendo estos ✓"
                  onClick={() => {
                    setVerDescartados(false)
                    setSeg(t.key)
                  }}
                />
              ))}
            </div>

            <div className="mo-filterbar">
              <BuscarInput value={q} onChange={setQ} placeholder="Buscar nombre, email o teléfono…" />
              <Select value={seg} onChange={(e) => setSeg(e.target.value)} disabled={verDescartados} style={{ width: 210 }} aria-label="Segmento">
                {SEGMENTOS.map((s) => (
                  <option value={s.v} key={s.v}>{s.t}</option>
                ))}
              </Select>
              <label style={{ fontSize: font.sm, color: color.mut, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={verDescartados} onChange={(e) => setVerDescartados(e.target.checked)} style={{ accentColor: 'var(--mo-brand-solid)' }} />
                Ver descartados
              </label>
              <span style={{ fontSize: 12, color: color.mut2, marginLeft: 'auto' }}>{lista.length} cliente{lista.length === 1 ? '' : 's'}</span>
            </div>

            {/* La tabla va sobre una superficie blanca con cabecera pegajosa. Antes las
                filas se apoyaban directo sobre el lienzo y la sección entera se leía
                gris — "está todo en fondo gris", y es de las más importantes. */}
            <TableWrap maxHeight={620}>
              <THead>
                <Tr>
                  <Th onClick={() => ordenarPor('name')}>Cliente</Th>
                  <Th onClick={() => ordenarPor('contact')}>Contacto</Th>
                  <Th align="right" onClick={() => ordenarPor('total_sales')}>Pedidos</Th>
                  <Th align="right" onClick={() => ordenarPor('total_amount')}>Total comprado</Th>
                  <Th align="right" onClick={() => ordenarPor('last_sale')}>Último pedido</Th>
                  <Th onClick={() => ordenarPor('proximo')}>Próximo contacto</Th>
                  <Th>Última nota</Th>
                  <Th align="center">Difusión</Th>
                  <Th align="center">Cómo viene</Th>
                  {verDescartados && <Th />}
                </Tr>
              </THead>
              <TBody>
                {cargando ? (
                  <Tr>
                    <Td colSpan={nCols} align="center" style={{ padding: 24, color: color.mut2 }}>
                      Cargando…
                    </Td>
                  </Tr>
                ) : !lista.length ? (
                  <Tr>
                    <Td colSpan={nCols} align="center" style={{ padding: 24, color: color.mut2 }}>
                      Sin clientes para este filtro
                    </Td>
                  </Tr>
                ) : (
                  lista.map((c) => (
                    <Fila key={c.id} c={c} seg={crmSeg[String(c.id)] || {}} verDescartados={verDescartados} onAbrir={setModalId} onDifusion={onDifusion} onDescartado={onDescartado} onPagina={onPagina} onTemperatura={onTemperatura} />
                  ))
                )}
              </TBody>
            </TableWrap>

            {!cargado && !cargando && (
              <div style={{ fontSize: 11, color: color.mut2, marginTop: 8 }}>El KV no se pudo leer: los guardados están bloqueados.</div>
            )}
          </>
        )}
      </div>

      {clienteModal && <ClienteModal key={clienteModal.id} cliente={clienteModal} crmSeg={crmSeg} mutar={mutar} onCerrar={() => setModalId(null)} />}
      {guia && <GuiaTrabajo onCerrar={() => setGuia(false)} onIr={irDesdeGuia} />}
      {mensajes && <BancoMensajes onCerrar={() => setMensajes(false)} />}
    </>
  )
}
