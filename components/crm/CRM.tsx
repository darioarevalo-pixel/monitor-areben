'use client'

import { useMemo, useState } from 'react'
import { useCRM } from './useCRM'
import { BancoMensajes } from './BancoMensajes'
import { Leads } from './Leads'
import { Metricas } from './Metricas'
import { ClienteModal } from './ClienteModal'
import { contarKpis, filtrarOrdenar, normalizeArgPhone, segmentoCliente } from '@/lib/crm/core'
import {
  aplicarSugerencias,
  parsearTelefonos,
  planSugerirCadencias,
  setDescartado,
  setDifusion,
  setPagina,
} from '@/lib/crm/seguimiento'
import type { ClienteCRM, MapaSeguimiento, Seguimiento } from '@/lib/crm/tipos'
import type { ModoCanal } from '@/lib/crm/datos'
import { HeaderAcciones } from '@/components/layout/acciones'
import { BuscarInput, Button, KpiCard, Notice, Select, StatusPill, TBody, THead, TableWrap, Tabs, Td, Th, Tr, color, font, space, useConfirmar, useToast } from '@/components/ui'

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
  { v: 'contactar', t: 'Para contactar' },
  { v: 'top', t: '⭐ Top clientes' },
  { v: 'activos', t: 'Activos recurrentes' },
  { v: 'riesgo', t: 'En riesgo' },
  { v: 'dormidos', t: 'Dormidos (90+ días)' },
  { v: 'nuevos', t: 'Nuevos' },
  { v: 'sin-difusion', t: 'Sin difusión' },
  { v: 'sin-tel', t: 'Sin teléfono (cargar)' },
]

const SEG_LABEL: Record<string, string> = { activos: 'Activo', riesgo: 'Riesgo', dormidos: 'Dormido', nuevos: 'Nuevo', otros: '·' }
const SEG_COLOR: Record<string, string> = { activos: color.success, riesgo: color.warning, dormidos: color.danger, nuevos: color.brandSolid, otros: color.mut2 }

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
}

function Fila({ c, seg, verDescartados, onAbrir, onDifusion, onDescartado, onPagina }: FilaProps) {
  const segm = segmentoCliente(c)
  const esMayorista = !!seg.es_mayorista
  const enDifusion = !!seg.en_difusion
  const waPhone = normalizeArgPhone(c.phone)
  const ciudad = [c.city, c.province].filter(Boolean).join(', ')
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
      <Td wrap>{ciudad || <span style={{ color: color.mut2 }}>—</span>}</Td>
      <Td align="right">{c.total_sales}</Td>
      <Td align="right" strong>{fmtMonto(c.total_amount)}</Td>
      <Td align="right">{fmtMonto(c.avg_ticket)}</Td>
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
      <Td>
        <span style={{ fontSize: font.xs, fontWeight: 600, color: SEG_COLOR[segm] }}>{SEG_LABEL[segm]}</span>
      </Td>
      <Td>
        <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          {waPhone && (
            <a
              href={`https://web.whatsapp.com/send?phone=${waPhone}`}
              target="_blank"
              rel="noopener"
              title="Abrir WhatsApp"
              style={{ fontSize: font.sm, fontWeight: 600, color: color.success }}
            >
              WhatsApp
            </a>
          )}
          {verDescartados && (
            <Button size="sm" variant="ghost" onClick={() => onDescartado(c.id, false)} title="Reactivar — vuelve al CRM">
              ↩ Reactivar
            </Button>
          )}
        </span>
      </Td>
    </Tr>
  )
}

export function CRM() {
  const { confirmar, avisar } = useConfirmar()
  const toast = useToast()
  const [modo, setModo] = useState<ModoCanal>('10')
  const [q, setQ] = useState('')
  const [seg, setSeg] = useState('todos')
  const [verDescartados, setVerDescartados] = useState(false)
  const [sort, setSort] = useState({ col: 'total_amount', dir: -1 })
  const [banco, setBanco] = useState(false)
  const [vista, setVista] = useState<'clientes' | 'leads' | 'metricas'>('clientes')
  const [modalId, setModalId] = useState<number | null>(null)
  const { cargando, error, agregado, ventas, crmSeg, crmTelOverride, cargado, recargar, guardarSeg, guardarTel } = useCRM(modo)

  const kpis = useMemo(() => contarKpis(agregado.activos), [agregado])
  // Los que compraron pero todavía no están en el canal de difusión. Se cuenta
  // acá (no en contarKpis) para no tocar la paridad de KPIs contra el legacy.
  const sinDifusion = useMemo(() => agregado.activos.filter((c) => !c.en_difusion).length, [agregado])
  const lista = useMemo(
    () => filtrarOrdenar(verDescartados ? agregado.descartados : agregado.activos, { q: q.trim().toLowerCase(), seg: verDescartados ? 'todos' : seg, sort }),
    [agregado, q, seg, sort, verDescartados],
  )

  const ordenarPor = (col: string) => setSort((s) => (s.col === col ? { col, dir: -s.dir } : { col, dir: -1 }))

  // Cada edición: transformación pura → persiste el mapa entero (gateado por cargado).
  const mutar = (fn: (s: MapaSeguimiento) => MapaSeguimiento) => guardarSeg(fn(crmSeg))
  const onDifusion = (id: number, val: boolean) => mutar((s) => setDifusion(s, id, val))
  const onDescartado = (id: number, val: boolean) => mutar((s) => setDescartado(s, id, val))
  const onPagina = (id: number, val: string) => mutar((s) => setPagina(s, id, val))

  const sugerirCadencias = async () => {
    const { plan, omitidos, nSem, nMen } = planSugerirCadencias(agregado.activos, crmSeg)
    if (!plan.length) {
      await avisar('No había clientes nuevos para sugerir: los que corresponden ya tienen un recontacto programado.')
      return
    }
    const ok = await confirmar({
      titulo: 'Programar recontactos',
      ok: `Programar ${plan.length}`,
      mensaje: (
        <>
          <p>Se asigna una cadencia automática por segmento:</p>
          <ul style={{ margin: '8px 0 0 18px' }}>
            <li>
              <b>{nSem}</b> mejores por monto → cada semana
            </li>
            <li>
              <b>{nMen}</b> activos recurrentes → cada mes
            </li>
          </ul>
          <p style={{ marginTop: 8 }}>No se tocan los {omitidos} que ya tenían uno.</p>
        </>
      ),
    })
    if (!ok) return
    if (await guardarSeg(aplicarSugerencias(crmSeg, plan))) {
      toast.ok(`Recontacto programado para ${plan.length} clientes. Ajustá los que quieras desde la ficha de cada uno.`)
    }
  }

  const cargarTelefonos = async (file: File | undefined) => {
    if (!file) return
    if (!agregado.activos.length) {
      await avisar('Primero esperá a que cargue la lista de clientes.')
      return
    }
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][]
      const idsCRM = new Set(agregado.activos.map((c) => String(c.id)))
      const res = parsearTelefonos(aoa, idsCRM, normalizeArgPhone)
      if (!res.ok) {
        toast.error(res.motivo)
        return
      }
      // El merge acumula sobre lo ya cargado (crmTelOverride es el único mapa sin
      // otra copia); guardarTel exige `cargado`, así un GET fallido no lo vacía.
      if (await guardarTel({ ...crmTelOverride, ...res.map })) {
        toast.ok(`Se vincularon ${res.vinculados} teléfonos a clientes del CRM (match por ID). Los botones de WhatsApp ya funcionan.`)
      }
    } catch (err) {
      toast.error('No pude leer el Excel: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const tarjetas = [
    { key: 'contactar', label: 'Para contactar', n: kpis.contactar },
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
        <Button variant="ghost" onClick={recargar}>Recalcular</Button>
        {vista !== 'metricas' && (
          <>
        <Button variant="outline" onClick={() => setBanco(true)}>
          Banco de mensajes
        </Button>
        <Button
          variant="outline"
          onClick={sugerirCadencias}
          disabled={!cargado}
          title={cargado ? 'Asigna cadencia automática por segmento' : 'El KV no se pudo leer: guardado bloqueado'}
        >Sugerir cadencias</Button>
        {/* Es un <label> porque abre un file picker; se le da la forma del botón primario. */}
        <label
          className="mo-btn mo-btn--md"
          style={{
            '--_bg': color.brandSolid,
            '--_fg': '#fff',
            '--_bd': color.brandSolid,
            '--_bg-hover': 'var(--mo-brand-solid-hover)',
            cursor: cargado ? 'pointer' : 'not-allowed',
            opacity: cargado ? 1 : 0.55,
          } as React.CSSProperties}
          title={cargado ? 'Importar teléfonos del export de clientes de GN' : 'El KV no se pudo leer: guardado bloqueado'}
        >
          Cargar teléfonos
          <input type="file" accept=".xlsx,.xls,.csv" disabled={!cargado} onChange={(e) => { cargarTelefonos(e.target.files?.[0]); e.target.value = '' }} style={{ display: 'none' }} />
        </label>
          </>
        )}
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
          <Leads />
        ) : vista === 'metricas' ? (
          <Metricas ventas={ventas} cargando={cargando} />
        ) : (
          <>
            {error && (
              <Notice tone="danger" icon="⚠" style={{ marginBottom: space[4] }}>
                {error}
              </Notice>
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
                  <Th onClick={() => ordenarPor('city')}>Ciudad</Th>
                  <Th align="right" onClick={() => ordenarPor('total_sales')}>Pedidos</Th>
                  <Th align="right" onClick={() => ordenarPor('total_amount')}>Total comprado</Th>
                  <Th align="right" onClick={() => ordenarPor('avg_ticket')}>Ticket prom.</Th>
                  <Th align="right" onClick={() => ordenarPor('last_sale')}>Último pedido</Th>
                  <Th onClick={() => ordenarPor('proximo')}>Próximo contacto</Th>
                  <Th>Última nota</Th>
                  <Th align="center">Difusión</Th>
                  <Th>Segmento</Th>
                  <Th />
                </Tr>
              </THead>
              <TBody>
                {cargando ? (
                  <Tr>
                    <Td colSpan={12} align="center" style={{ padding: 24, color: color.mut2 }}>
                      Cargando…
                    </Td>
                  </Tr>
                ) : !lista.length ? (
                  <Tr>
                    <Td colSpan={12} align="center" style={{ padding: 24, color: color.mut2 }}>
                      Sin clientes para este filtro
                    </Td>
                  </Tr>
                ) : (
                  lista.map((c) => (
                    <Fila key={c.id} c={c} seg={crmSeg[String(c.id)] || {}} verDescartados={verDescartados} onAbrir={setModalId} onDifusion={onDifusion} onDescartado={onDescartado} onPagina={onPagina} />
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
      {banco && <BancoMensajes onCerrar={() => setBanco(false)} />}
    </>
  )
}
