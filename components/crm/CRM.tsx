'use client'

import { useMemo, useState } from 'react'
import { useCRM } from './useCRM'
import { BancoMensajes } from './BancoMensajes'
import { contarKpis, filtrarOrdenar, normalizeArgPhone, segmentoCliente } from '@/lib/crm/core'
import type { ClienteCRM } from '@/lib/crm/tipos'
import type { ModoCanal } from '@/lib/crm/datos'

/**
 * El CRM en Next. Port de la vista Clientes (index.html:1703-1801 + renderCRM/
 * renderCRMTabla).
 *
 * ⚠️ LA LISTA DE LO QUE ESCRIBE Y LO QUE NO ES EXPLÍCITA. "Blast radius cero" no
 * es un adjetivo.
 *
 * **Inertes** — los 5 controles que en el legacy escriben en el KV:
 *   1. `<input type=file>` de teléfonos (1718) → POSTea el mapa `crmtel` ENTERO.
 *   2. "Sugerir cadencias" (1719) → escritura masiva a cientos de clientes, sin undo.
 *   3. El input de Instagram de cada fila (13568) → crmSetPagina.
 *   4. El checkbox de mayorista de cada fila (13712) → crmSetMayorista.
 *   5. 🚫/↩️ de cada fila (13715) → crmSetDescartado.
 *
 * **Escribe**: solo el banco de mensajes, y a propósito es la escritura más barata
 * del CRM — `mensajes:bdi` no existe en el KV, así que no hay un dato real que
 * perder. Si esta capa está mal, se descubre acá y no con las 39 notas.
 *
 * Los leads y el modal del cliente todavía no están: son los pasos que siguen.
 *
 * Vive en la ruta sombra `/clientes/next`. `/clientes` sigue sirviendo el legacy
 * embebido, así se pueden abrir las dos y compararlas. Ese A/B es lo único que
 * hace reversible arrancar por la sección más grande — y es la razón por la que
 * el estilo se copió en vez de rediseñarse.
 */

const SEGMENTOS = [
  { v: 'todos', t: 'Todos' },
  { v: 'contactar', t: '📞 Para contactar' },
  { v: 'top', t: '⭐ Top clientes' },
  { v: 'activos', t: '🔥 Activos recurrentes' },
  { v: 'riesgo', t: '⚠️ En riesgo' },
  { v: 'dormidos', t: '🥶 Dormidos (90+ días)' },
  { v: 'nuevos', t: '🆕 Nuevos' },
  { v: 'sin-tel', t: '📵 Sin teléfono (cargar)' },
]

const SEG_LABEL: Record<string, string> = { activos: '🔥 Activo', riesgo: '⚠️ Riesgo', dormidos: '🥶 Dormido', nuevos: '🆕 Nuevo', otros: '·' }
const SEG_COLOR: Record<string, string> = { activos: '#16A34A', riesgo: '#D97706', dormidos: '#DC2626', nuevos: '#0EA5E9', otros: '#9CA3AF' }

/** fmtMonto (index.html:13115). */
const fmtMonto = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

/**
 * fmtFecha (13137), ya con el fix del bug de zona horaria: `new Date('2026-07-16')`
 * se parsea como medianoche UTC y en Argentina mostraba el día anterior.
 */
function fmtFecha(d: string | null): string {
  if (!d) return '—'
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
}

/** segCeldaHTML (13324), como componente. */
function CeldaProximo({ c }: { c: ClienteCRM }) {
  if (c.seg_estado === 'none') return <span style={{ color: '#9CA3AF' }}>—</span>
  const cfg = {
    pendiente: { txt: 'A contactar', col: '#DC2626', bg: '#FEE2E2', dot: '🔴' },
    vencido: { txt: 'Vencido', col: '#DC2626', bg: '#FEE2E2', dot: '🔴' },
    semana: { txt: 'Esta semana', col: '#B45309', bg: '#FEF3C7', dot: '🟡' },
    aldia: { txt: 'Al día', col: '#15803D', bg: '#DCFCE7', dot: '🟢' },
  }[c.seg_estado]
  let sub: string
  if (c.seg_estado === 'pendiente') sub = 'Sin primer contacto'
  else {
    const d = c.dias_proximo as number
    sub = `${fmtFecha(c.proximo_contacto)} · ${d === 0 ? 'hoy' : d < 0 ? `hace ${-d}d` : `en ${d}d`}`
  }
  return (
    <>
      <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, color: cfg.col, background: cfg.bg, padding: '1px 7px', borderRadius: 999 }}>
        {cfg.dot} {cfg.txt}
      </span>
      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{sub}</div>
    </>
  )
}

function Fila({ c, esMayorista, pagina }: { c: ClienteCRM; esMayorista: boolean; pagina: string }) {
  const seg = segmentoCliente(c)
  const waPhone = normalizeArgPhone(c.phone)
  const ciudad = [c.city, c.province].filter(Boolean).join(', ')
  const ult = c.dias_ultimo === null ? '—' : c.dias_ultimo === 0 ? 'hoy' : `hace ${c.dias_ultimo}d`
  const notas = Array.isArray(c.notas) ? c.notas : []
  const ultNota = notas.length ? notas.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0] : null

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>
          {c.name}
          {esMayorista && (
            <span style={{ fontSize: 9, fontWeight: 700, color: '#7C3AED', background: '#F3E8FF', padding: '1px 6px', borderRadius: 10, verticalAlign: 'middle', marginLeft: 4 }}>
              MAYORISTA
            </span>
          )}
        </div>
      </td>
      <td>
        {c.email && <div style={{ fontSize: 12 }}>{c.email}</div>}
        {c.phone && <div style={{ fontSize: 11, color: '#6B7280' }}>{c.phone}</div>}
        {!waPhone && <div style={{ fontSize: 10, color: '#DC2626', fontWeight: 600, marginTop: 2 }}>📵 Sin teléfono</div>}
        {/* Inerte (3): en el legacy este input llama a crmSetPagina onChange. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
          <span style={{ fontSize: 12, lineHeight: 1 }}>📷</span>
          <input type="text" value={pagina} placeholder="@instagram" readOnly disabled title="Solo lectura en esta versión" style={{ fontSize: 11, width: 110, padding: '2px 6px' }} />
        </div>
      </td>
      <td>{ciudad || <span style={{ color: '#9CA3AF' }}>—</span>}</td>
      <td style={{ textAlign: 'right' }}>{c.total_sales}</td>
      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMonto(c.total_amount)}</td>
      <td style={{ textAlign: 'right' }}>{fmtMonto(c.avg_ticket)}</td>
      <td style={{ textAlign: 'right' }}>
        <div>{ult}</div>
        <div style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtFecha(c.last_sale)}</div>
      </td>
      <td>
        <CeldaProximo c={c} />
      </td>
      <td style={{ maxWidth: 240 }}>
        {ultNota ? (
          <>
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtFecha(ultNota.fecha)}</div>
            <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ultNota.texto}</div>
          </>
        ) : (
          <span style={{ color: '#9CA3AF' }}>—</span>
        )}
      </td>
      <td>
        <span style={{ fontSize: 11, fontWeight: 600, color: SEG_COLOR[seg] }}>{SEG_LABEL[seg]}</span>
      </td>
      {/* Inertes (4) y (5): en el legacy son un checkbox (crmSetMayorista, 13712)
          y 🚫/↩️ (crmSetDescartado, 13715). Se renderizan deshabilitados en vez de
          omitirse, para que la comparación contra el iframe no tenga huecos. */}
      <td onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={esMayorista} disabled readOnly title="Solo lectura en esta versión" style={{ width: 16, height: 16, accentColor: '#7C3AED' }} />
      </td>
    </tr>
  )
}

export function CRM() {
  const [modo, setModo] = useState<ModoCanal>('10')
  const [q, setQ] = useState('')
  const [seg, setSeg] = useState('todos')
  const [verDescartados, setVerDescartados] = useState(false)
  const [sort, setSort] = useState({ col: 'total_amount', dir: -1 })
  const [banco, setBanco] = useState(false)
  const { cargando, error, agregado, crmSeg, cargado, recargar } = useCRM(modo)

  const kpis = useMemo(() => contarKpis(agregado.activos), [agregado])
  const lista = useMemo(
    () => filtrarOrdenar(verDescartados ? agregado.descartados : agregado.activos, { q: q.trim().toLowerCase(), seg: verDescartados ? 'todos' : seg, sort }),
    [agregado, q, seg, sort, verDescartados],
  )

  // crmSort (13695): mismo click, misma columna → invierte; otra columna → desc.
  const ordenarPor = (col: string) => setSort((s) => (s.col === col ? { col, dir: -s.dir } : { col, dir: -1 }))

  const tarjetas = [
    { key: 'contactar', label: '📞 Para contactar', n: kpis.contactar },
    { key: 'top', label: '⭐ Top clientes', n: kpis.top },
    { key: 'activos', label: '🔥 Activos', n: kpis.activos },
    { key: 'riesgo', label: '⚠️ En riesgo', n: kpis.riesgo },
    { key: 'dormidos', label: '🥶 Dormidos', n: kpis.dormidos },
    { key: 'nuevos', label: '🆕 Nuevos', n: kpis.nuevos },
    { key: 'sin-tel', label: '📵 Sin teléfono', n: kpis.sinTel },
  ]

  return (
    <div className="section visible">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Clientes mayoristas</h3>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>Canal Mayorista + clientes marcados ⭐ (aunque compren por otro canal)</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: '#6B7280' }}>Canal:</label>
            <select value={modo} onChange={(e) => setModo(e.target.value as ModoCanal)}>
              <option value="10">Mayorista</option>
              <option value="all">Todos los canales</option>
            </select>
            <button className="btn-sm" onClick={recargar}>Recalcular</button>
            {/* Inertes (1) y (2): en el legacy escriben el mapa entero del KV. */}
            <button className="btn-sm" disabled title="Solo lectura en esta versión">📱 Cargar teléfonos</button>
            <button className="btn-sm" disabled title="Solo lectura en esta versión">🗓️ Sugerir cadencias</button>
            {/* El banco SÍ escribe: es la primera escritura habilitada, y la más
                barata (mensajes:bdi no existe en el KV → cero datos en riesgo). */}
            <button className="btn-sm" onClick={() => setBanco(true)}>💬 Banco de mensajes</button>
          </div>
        </div>

        <div style={{ background: '#EFF6FF', border: '1px solid #BAE6FD', borderRadius: 8, padding: '7px 11px', marginBottom: 14, fontSize: 12, color: '#075985' }}>
          👀 Versión nueva, <b>solo lectura</b>. Los números tienen que dar igual que en la versión de siempre; para editar, usá esa.
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '7px 11px', marginBottom: 14, fontSize: 12, color: '#991B1B' }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
          {tarjetas.map((t) => (
            <div className="stat" key={t.key}>
              <div className="stat-label">{t.label}</div>
              <div className="stat-value">{t.n}</div>
            </div>
          ))}
        </div>

        <div className="toolbar">
          <input type="text" placeholder="Buscar nombre, email o teléfono..." value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={seg} onChange={(e) => setSeg(e.target.value)} disabled={verDescartados}>
            {SEGMENTOS.map((s) => (
              <option value={s.v} key={s.v}>{s.t}</option>
            ))}
          </select>
          <label style={{ fontSize: 12, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={verDescartados} onChange={(e) => setVerDescartados(e.target.checked)} />
            Ver descartados
          </label>
          <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>
            {lista.length} cliente{lista.length === 1 ? '' : 's'}
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th onClick={() => ordenarPor('name')}>Cliente ↕</th>
                <th onClick={() => ordenarPor('contact')}>Contacto</th>
                <th onClick={() => ordenarPor('city')}>Ciudad</th>
                <th onClick={() => ordenarPor('total_sales')} style={{ textAlign: 'right' }}>Pedidos ↕</th>
                <th onClick={() => ordenarPor('total_amount')} style={{ textAlign: 'right' }}>Total comprado ↕</th>
                <th onClick={() => ordenarPor('avg_ticket')} style={{ textAlign: 'right' }}>Ticket prom. ↕</th>
                <th onClick={() => ordenarPor('last_sale')} style={{ textAlign: 'right' }}>Último pedido ↕</th>
                <th onClick={() => ordenarPor('proximo')}>Próximo contacto ↕</th>
                <th>Última nota</th>
                <th>Segmento</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: 24, color: '#9CA3AF' }}>Cargando…</td>
                </tr>
              ) : !lista.length ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: 24, color: '#9CA3AF' }}>Sin clientes para este filtro</td>
                </tr>
              ) : (
                lista.map((c) => (
                  <Fila key={c.id} c={c} esMayorista={!!crmSeg[String(c.id)]?.es_mayorista} pagina={(crmSeg[String(c.id)] as { pagina?: string })?.pagina || ''} />
                ))
              )}
            </tbody>
          </table>
        </div>

        {!cargado && !cargando && (
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>El KV no se pudo leer: los guardados están bloqueados.</div>
        )}
      </div>

      {banco && <BancoMensajes onCerrar={() => setBanco(false)} />}
    </div>
  )
}
