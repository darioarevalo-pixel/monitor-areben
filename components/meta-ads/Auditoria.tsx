'use client'

/**
 * `/meta-ads/auditoria` — quién accionó sobre la pauta, qué tocó y cómo terminó.
 *
 * # Por qué existe
 *
 * La Tanda 1 dejó `meta_ads_accion` **escribiéndose sin que la leyera nadie**: no había endpoint ni
 * pantalla, y «¿quién bajó este presupuesto?» sólo se contestaba entrando a Supabase a mano. El
 * pedido era «confirmación **y** registro de quién lo hizo», y estaba hecho a la mitad.
 *
 * # Lo que esta pantalla tiene que hacer bien
 *
 * 1. **Separar «no se hizo» de «no sabemos cómo quedó».** Un rechazo no dejó nada a medias y se
 *    puede repetir sin mirar; un `error` o un `en-curso` sí, y esos mandan a Ads Manager. Por eso lo
 *    incierto sube a un cartel arriba de todo en vez de ser una fila más pintada de rojo.
 * 2. **Contarlo en castellano.** Un `jsonb` con `{"daily_budget":"190000"}` no es una auditoría. La
 *    traducción vive en `lib/meta-ads/auditoria.ts`, aparte y con tests, porque tiene más casos
 *    límite de los que parece.
 * 3. **No inventar lo que no se registró.** Las filas anteriores al 6-ago-2026 no guardaron lo que se
 *    pidió: de un rechazo viejo no se puede saber qué se quiso hacer, y se dice.
 *
 * El corte por marca lo hace el servidor (mismo criterio que al accionar). Acá no se filtra nada por
 * permiso: lo que llegó, se muestra.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { traerAuditoria } from '@/lib/meta-ads/cliente'
import { contar, cuandoLegible, inciertas, leerResultado, leerUso, ROTULO_TIER, rotuloEstado } from '@/lib/meta-ads/auditoria'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import { esAdmin } from '@/lib/permisos'
import type { Contada } from '@/lib/meta-ads/auditoria'
import type { FilaAuditoria, RespuestaAuditoria } from '@/lib/meta-ads/tipos'
import {
  BuscarInput, Button, Chips, ContadorFiltro, EmptyState, FilterBar, Notice, StatusPill,
  TBody, TableWrap, Td, Th, THead, Tr, color, font, radius, space, type ChipOpt,
} from '@/components/ui'

type Cargable<T> = { fase: 'cargando' } | { fase: 'error'; motivo: string } | { fase: 'ok'; data: T }

/** Los cortes que de verdad se piden. `incierto` es el que existe para actuar, no para mirar. */
type Corte = 'todo' | 'hechas' | 'no' | 'incierto'

const nf = new Intl.NumberFormat('es-AR')
const money = (v: number, moneda: string | null) => {
  if (moneda === null) return nf.format(Math.round(v))
  const cur = /^[A-Z]{3}$/.test(moneda) ? moneda : 'ARS'
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v)
  } catch {
    return `${cur} ${nf.format(Math.round(v))}`
  }
}
const pct = (v: number) => `${v > 0 ? '+' : ''}${nf.format(Math.round(v * 1000) / 10)}%`

export function Auditoria() {
  const { perfil } = useSesion()
  const admin = esAdmin(perfil)
  const [limite, setLimite] = useState(100)
  const [pedido, setPedido] = useState(0)
  const [r, setR] = useState<{ key: string; e: Cargable<RespuestaAuditoria> } | null>(null)

  // Misma forma que el censo de Etapas: recargar es cambiar una DEPENDENCIA del efecto, no vaciar el
  // resultado. Vaciarlo deja la pantalla en «cargando» sin que salga ningún fetch.
  const key = `${limite}|${pedido}`
  useEffect(() => {
    let vivo = true
    traerAuditoria({ limite }).then((res) => {
      if (!vivo) return
      setR({ key: `${limite}|${pedido}`, e: res.ok ? { fase: 'ok', data: res.dato } : { fase: 'error', motivo: res.motivo } })
    })
    return () => { vivo = false }
  }, [limite, pedido])

  const estado: Cargable<RespuestaAuditoria> = !r || r.key !== key ? { fase: 'cargando' } : r.e
  const recargar = useCallback(() => setPedido((p) => p + 1), [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <Encabezado onRecargar={recargar} cargando={estado.fase === 'cargando'} />
      {estado.fase === 'cargando' && <div style={{ color: color.mut2, fontSize: font.sm }}>Trayendo el registro…</div>}
      {estado.fase === 'error' && (
        <Notice tone="danger">No se pudo leer el registro de acciones: {estado.motivo}</Notice>
      )}
      {estado.fase === 'ok' && <Contenido d={estado.data} admin={admin} onMas={() => setLimite(500)} />}
    </div>
  )
}

function Encabezado({ onRecargar, cargando }: { onRecargar: () => void; cargando: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: font.lg, fontWeight: 700 }}>Qué se accionó sobre la pauta</h2>
        <p style={{ margin: `${space[1]}px 0 0`, color: color.mut, fontSize: font.sm, maxWidth: 620 }}>
          Todo lo que el monitor escribió en Meta —pausar, reactivar, cambiar el presupuesto—, con quién lo
          hizo y cómo quedó. Lo que figura como <b>Se hizo</b> se confirmó releyendo el objeto en Meta, no
          por la respuesta del pedido.
        </p>
      </div>
      <Button variant="ghost" onClick={onRecargar} disabled={cargando}>Actualizar</Button>
    </div>
  )
}

function Contenido({ d, admin, onMas }: { d: RespuestaAuditoria; admin: boolean; onMas: () => void }) {
  const [corte, setCorte] = useState<Corte>('todo')
  const [quien, setQuien] = useState('')
  const [busca, setBusca] = useState('')

  const sinConfirmar = useMemo(() => inciertas(d.filas), [d.filas])
  const quienes = useMemo(() => [...new Set(d.filas.map((f) => f.quien).filter(Boolean))].sort(), [d.filas])

  const filas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return d.filas.filter((f) => {
      if (quien && f.quien !== quien) return false
      if (corte === 'hechas' && f.resultado !== 'ok') return false
      if (corte === 'no' && f.resultado !== 'rechazado') return false
      if (corte === 'incierto' && !leerResultado(f.resultado).incierto) return false
      if (!q) return true
      return `${f.objetoNombre || ''} ${f.objetoId} ${f.quien}`.toLowerCase().includes(q)
    })
  }, [d.filas, corte, quien, busca])

  const opciones: ChipOpt<Corte>[] = [
    { key: 'todo', label: 'Todo', n: d.filas.length },
    { key: 'hechas', label: 'Se hicieron', n: d.filas.filter((f) => f.resultado === 'ok').length },
    { key: 'no', label: 'No se hicieron', n: d.filas.filter((f) => f.resultado === 'rechazado').length },
    {
      key: 'incierto',
      label: 'Sin confirmar',
      n: sinConfirmar.length,
      title: 'Meta pudo haberlas aplicado y no se confirmó cómo quedaron.',
    },
  ]

  if (d.filas.length === 0) {
    return (
      <EmptyState
        dashed
        icon="🗒️"
        title="Todavía no se accionó sobre la pauta"
        hint="Acá va a quedar registrado cada cambio que se haga desde Etapas: quién, sobre qué y cómo terminó."
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      {/* Lo incierto es lo único de esta pantalla que pide hacer algo, así que va arriba de todo y no
          escondido detrás de un filtro que nadie va a tocar. */}
      {sinConfirmar.length > 0 && (
        <Notice tone="warning">
          <span>
            {sinConfirmar.length === 1
              ? 'Hay una acción que quedó sin confirmar'
              : `Hay ${sinConfirmar.length} acciones que quedaron sin confirmar`}
            : Meta pudo haberlas aplicado. <b>Fijate en Ads Manager cómo quedaron antes de repetirlas.</b>
          </span>
        </Notice>
      )}
      {d.monedasMotivo && (
        <Notice tone="neutral">
          No se pudo leer la moneda de las cuentas ({d.monedasMotivo}), así que los presupuestos van
          <b> crudos</b>, en la unidad menor: en pesos, <code>190000</code> son $1.900.
        </Notice>
      )}

      <FilterBar>
        <Chips opciones={opciones} value={corte} onChange={setCorte} />
        <BuscarInput value={busca} onChange={setBusca} placeholder="Buscar por nombre o id…" />
        {quienes.length > 1 && (
          <select className="mo-input" value={quien} onChange={(e) => setQuien(e.target.value)} style={{ maxWidth: 180 }}>
            <option value="">Cualquiera</option>
            {quienes.map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
        )}
        <ContadorFiltro n={filas.length} singular="acción" plural="acciones" />
      </FilterBar>

      {filas.length === 0
        ? <EmptyState dashed icon="🔍" title="Ninguna acción cae en este filtro" />
        : (
          <TableWrap>
            <THead>
              <Tr>
                <Th>Cuándo</Th>
                <Th>Quién</Th>
                <Th>Qué hizo</Th>
                <Th>Sobre qué</Th>
                <Th>Cómo terminó</Th>
              </Tr>
            </THead>
            <TBody>
              {filas.map((f) => (
                <Fila key={f.id} f={f} moneda={monedaDe(f, d.monedas)} admin={admin} />
              ))}
            </TBody>
          </TableWrap>
        )}

      {/* Un total exacto costaría contar la tabla entera en cada carga. Se dice lo que se trajo. */}
      {d.hayMas && (
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.sm, color: color.mut }}>
          <span>Se muestran las últimas {d.limite}. Hay más.</span>
          {d.limite < 500 && <Button size="sm" variant="ghost" onClick={onMas}>Traer las últimas 500</Button>}
        </div>
      )}
    </div>
  )
}

/**
 * La moneda de la cuenta de esta fila, o `null` si no se sabe.
 *
 * `null` y `''` no son lo mismo: con `null` los montos se muestran crudos en vez de dividirse por
 * 100 a ojo. Ver `contar()`.
 */
function monedaDe(f: FilaAuditoria, monedas: Record<string, string>): string | null {
  if (!f.cuentaId) return null
  const m = monedas[f.cuentaId]
  return m ? m : null
}

function Fila({ f, moneda, admin }: { f: FilaAuditoria; moneda: string | null; admin: boolean }) {
  const res = leerResultado(f.resultado)
  const c = contar(f, moneda)
  return (
    <Tr>
      <Td>
        <span style={{ fontSize: font.xs, color: color.mut, whiteSpace: 'nowrap' }} title={f.cuando}>
          {cuandoLegible(f.cuando)}
        </span>
      </Td>
      <Td wrap strong>{f.quien || '—'}</Td>
      <Td wrap>
        <div>{c.titulo}</div>
        <Cambio c={c} moneda={moneda} />
        {/* El motivo del rechazo es el texto que se le contestó a quien la mandó: es la respuesta a
            «¿por qué no salió?», y sin él la fila obliga a adivinar. */}
        {f.detalle && (
          <div style={{ fontSize: font.xs, color: res.tono === 'danger' ? color.dangerInk : color.mut, marginTop: 2 }}>
            {f.detalle}
          </div>
        )}
      </Td>
      <Td wrap>
        <div style={{ fontSize: font.sm }}>{f.objetoNombre || <span style={{ color: color.mut2 }}>(no se llegó a leer el nombre)</span>}</div>
        <div style={{ fontSize: font.xs, color: color.mut2, display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          <span title={`id de Meta: ${f.objetoId}`}>{f.objetoId}</span>
          {f.linea
            ? <span>{ETIQUETA_LINEA[f.linea]}</span>
            : <span title="La acción murió antes de resolver de qué marca era la campaña.">sin marca</span>}
        </div>
      </Td>
      <Td>
        <span title={res.ayuda}><StatusPill tone={res.tono} label={res.rotulo} /></span>
        <Cupo uso={f.uso} admin={admin} />
      </Td>
    </Tr>
  )
}

/**
 * Cuánto quedaba del cupo de escritura de Meta al hacer la acción. Sólo para admin.
 *
 * 🔴 Esto empezó volcando el JSON crudo del header y llenaba la columna de llaves y comillas en cada
 * fila. Lo único que se lee es el porcentaje —`call_count` **es un porcentaje**, no una cantidad— y,
 * cuando la app está en acceso de desarrollo, que lo está: es un techo bajo que hay que mirar antes
 * de que algo corra solo (la Tanda 4). El crudo se conserva en el title, que es donde no molesta.
 */
function Cupo({ uso, admin }: { uso: string | null | undefined; admin: boolean }) {
  if (!admin || !uso) return null
  const u = leerUso(uso)
  if (!u || (u.pct === null && !u.tier)) return null
  const tier = u.tier && u.tier !== 'standard_access' ? ROTULO_TIER[u.tier] ?? u.tier : null
  return (
    <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 2, whiteSpace: 'nowrap' }} title={uso}>
      {u.pct !== null && `cupo ${u.pct}%`}
      {u.pct !== null && tier && ' · '}
      {tier}
    </div>
  )
}

/** El antes y el después, cuando se sabe. Es la mitad del valor de la fila. */
function Cambio({ c, moneda }: { c: Contada; moneda: string | null }) {
  const caja: React.CSSProperties = {
    fontSize: font.xs, background: color.bg2, borderRadius: radius.sm, padding: '1px 6px', whiteSpace: 'nowrap',
  }

  if (c.clase === 'estado') {
    if (c.sinDato) return <SinDato />
    return (
      <div style={{ display: 'flex', gap: space[1], alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
        {c.desde && <span style={caja}>{rotuloEstado(c.desde)}</span>}
        {c.desde && <span style={{ color: color.mut2, fontSize: font.xs }}>→</span>}
        <span style={caja}>{rotuloEstado(c.hasta)}</span>
      </div>
    )
  }

  if (c.clase === 'presupuesto') {
    if (c.sinDato) return <SinDato />
    return (
      <div style={{ display: 'flex', gap: space[1], alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
        {c.desde !== null && <span style={caja}>{money(c.desde, moneda)}</span>}
        {c.desde !== null && <span style={{ color: color.mut2, fontSize: font.xs }}>→</span>}
        <span style={{ ...caja, fontWeight: 600 }}>{money(c.hasta!, moneda)}</span>
        {c.variacion !== null && c.variacion !== 0 && (
          <span style={{ fontSize: font.xs, color: c.variacion > 0 ? color.warningInk : color.mut }}>
            {pct(c.variacion)}
          </span>
        )}
        {c.crudo && (
          <span style={{ fontSize: font.xs, color: color.mut2 }} title="No se supo la moneda de la cuenta, así que el monto va sin convertir.">
            (crudo)
          </span>
        )}
      </div>
    )
  }

  if (c.clase === 'nombre') {
    if (c.sinDato) return <SinDato />
    return (
      <div style={{ display: 'flex', gap: space[1], alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
        {/* El nombre viejo va entero y no recortado: es el único lugar donde sigue existiendo. */}
        {c.desde && <span style={caja}>{c.desde}</span>}
        {c.desde && <span style={{ color: color.mut2, fontSize: font.xs }}>→</span>}
        <span style={{ ...caja, fontWeight: 600 }}>{c.hasta}</span>
      </div>
    )
  }

  if (c.clase === 'duplicar') {
    // Lo que importa de una copia es CÓMO SE LLAMA: es lo único con lo que se la encuentra después,
    // tanto acá como en Ads Manager.
    if (c.copia) {
      return (
        <div style={{ display: 'flex', gap: space[1], alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
          <span style={{ fontSize: font.xs, color: color.mut2 }}>salió</span>
          <span style={{ ...caja, fontWeight: 600 }}>{c.copia}</span>
        </div>
      )
    }
    if (c.sinDato) return <SinDato />
    // 🔴 «No llegó a crearse» no se puede decir cuando NO SABEMOS si se creó. Un corte por tiempo
    // deja a Meta pudiendo haberla creado igual, y ahí lo único útil es el sufijo con el que
    // buscarla. Decirle a alguien que no se creó lo manda a apretar de nuevo y a quedarse con dos.
    if (c.incierto) {
      return (
        <div style={{ fontSize: font.xs, color: color.mut, marginTop: 2 }}>
          Puede haberse creado igual: buscá <span style={{ ...caja, fontWeight: 600 }}>{c.sufijo?.trim()}</span> en Ads Manager.
        </div>
      )
    }
    return (
      <div style={{ fontSize: font.xs, color: color.mut, marginTop: 2 }}>
        No llegó a crearse. Se copiaba de <code>{c.deQuien}</code>.
      </div>
    )
  }

  return c.sinDato ? <SinDato /> : null
}

/**
 * Lo que no se registró se dice, no se completa.
 *
 * Pasa con las acciones **rechazadas anteriores al 6-ago-2026**: la columna `pedido` se sumó después
 * de la Tanda 1, así que esas filas guardaron quién lo intentó pero no qué quiso hacer. De acá en
 * adelante no vuelve a pasar.
 */
function SinDato() {
  return (
    <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 2, fontStyle: 'italic' }}>
      No quedó registrado qué se quiso cambiar (es una acción anterior a que se guardara el pedido).
    </div>
  )
}
