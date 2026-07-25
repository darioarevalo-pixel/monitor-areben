'use client'

/**
 * Lo compartido por los tres conteos (estándar del Local, depósito, local BDI).
 *
 * Las tres secciones son la misma forma —lista de productos → foco de carga → revisión
 * del ajuste → historial— y venían con el chip de estado, las etiquetas de fecha, el
 * instructivo de cierre y toda la vista de historial **copiados casi textual** en cada
 * archivo. Con el rediseño se unifican acá: un patrón, tres aplicaciones.
 *
 * Lo que NO se unifica es la lógica: cada conteo sigue con su propio `core.ts` en `lib`
 * (los tests de paridad son por sección).
 */
import { Badge, Card, EmptyState, Esqueleto, Notice, TBody, THead, TableWrap, Td, Th, Tr, color, font, space } from '@/components/ui'
import type { ConteoHistorial } from '@/lib/conteo-deposito/tipos'

/** Estado de un producto dentro del conteo. */
export function ChipEstado({ e }: { e: 'sin_iniciar' | 'en_progreso' | 'terminado' }) {
  if (e === 'terminado')
    return (
      <Badge tone="success" subtle>
        Terminado
      </Badge>
    )
  if (e === 'en_progreso')
    return (
      <Badge tone="warning" subtle>
        En progreso
      </Badge>
    )
  return (
    <Badge tone="neutral" subtle>
      Sin iniciar
    </Badge>
  )
}

export function stockLabel(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const dia = d.toDateString() === now.toDateString() ? 'hoy' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
  return `${dia} ${hora} hs`
}

export function fechaLabel(ms: number): string {
  const d = new Date(ms)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'hoy ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const mismoAnio = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('es-AR', mismoAnio ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/**
 * El instructivo de cierre. No es decoración: **si alguien sale sin terminar, el conteo
 * no se guarda ni recibe fecha**, y eso ya pasó. Por eso queda a la vista (plegado) en
 * las tres secciones, con el paso del medio distinto según cómo se carga cada una.
 */
export function InstructivoConteo({ pasoCarga, queAplica }: { pasoCarga: React.ReactNode; queAplica: string }) {
  return (
    <details style={{ marginBottom: space[3], border: `1px solid ${color.brandBorder}`, background: color.brandBg, borderRadius: 'var(--mo-r-lg)', padding: '10px 14px' }}>
      <summary style={{ cursor: 'pointer', fontSize: font.base, fontWeight: 600, color: color.brand }}>¿Cómo cierro un conteo para que quede guardado y con fecha?</summary>
      <ol style={{ margin: '10px 0 2px', paddingLeft: 20, fontSize: font.base, color: color.ink2, lineHeight: 1.8 }}>
        <li>
          Hacé todo el conteo en <b>la misma compu y la misma pestaña</b>, de principio a fin.
        </li>
        <li>{pasoCarga}</li>
        <li>
          Apretá <b>Terminar producto</b> en cada uno. <b>Si no lo terminás, ese producto no se guarda ni recibe fecha.</b>
        </li>
        <li>
          Cuando terminaste todos, apretá <b>Aplicar ajuste</b> ({queAplica}).
        </li>
        <li>
          En la revisión, <b>Generar Excel y guardar</b> (o <b>Guardar el conteo igual</b> si no hubo diferencias). <b>Si salís con Volver, no se guarda nada.</b>
        </li>
      </ol>
    </details>
  )
}

/** Los tres números de arriba de la lista: cuántos hay, cuántos terminados, cuántos a medias. */
export function ResumenConteo({ total, terminados, enProgreso, label = 'Productos' }: { total: number; terminados: number; enProgreso: number; label?: string }) {
  return (
    <div style={{ display: 'flex', gap: space[5], flexWrap: 'wrap', marginBottom: space[3] }}>
      <Dato label={label} valor={total} />
      <Dato label="Terminados" valor={terminados} tono={color.successInk} />
      <Dato label="En progreso" valor={enProgreso} tono={color.warningInk} />
    </div>
  )
}

export function Dato({ label, valor, tono }: { label: string; valor: number; tono?: string }) {
  return (
    <div>
      <div style={{ fontSize: font.xs, color: color.mut, textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: font.xl, fontWeight: 700, color: tono ?? color.ink, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
    </div>
  )
}

/** Tabla del detalle de un conteo guardado. `conVivo` agrega las columnas del ajuste real. */
export function TablaDetalleConteo({ filas, conVivo, unidad = 'Variante' }: { filas: Record<string, number | string | null>[]; conVivo?: boolean; unidad?: string }) {
  return (
    <TableWrap maxHeight={360}>
      <THead>
        <Tr>
          <Th>Producto · {unidad}</Th>
          <Th align="center">Sist.</Th>
          <Th align="center">Cont.</Th>
          <Th align="center">Dif</Th>
          {conVivo && <Th align="center">Vivo</Th>}
          {conVivo && <Th align="center">Nuevo</Th>}
        </Tr>
      </THead>
      <TBody>
        {filas.map((d, j) => {
          const dif = Number(d.diferencia || 0)
          return (
            <Tr key={j}>
              <Td wrap>
                {String(d.producto || '')} · {String(d.variante || '')}
              </Td>
              <Td align="center" style={{ color: color.mut2 }}>
                {d.sistema != null ? d.sistema : '—'}
              </Td>
              <Td align="center">{d.contado != null ? d.contado : '—'}</Td>
              <Td align="center" style={{ fontWeight: 700, color: dif < 0 ? color.dangerInk : dif > 0 ? color.warningInk : color.mut2 }}>
                {dif > 0 ? '+' : ''}
                {dif}
              </Td>
              {conVivo && (
                <Td align="center" style={{ color: color.mut }}>
                  {d.vivo_aplicado != null ? d.vivo_aplicado : '—'}
                </Td>
              )}
              {conVivo && (
                <Td align="center" style={{ fontWeight: 700, color: color.brand }}>
                  {d.nuevo_stock != null ? d.nuevo_stock : '—'}
                </Td>
              )}
            </Tr>
          )
        })}
      </TBody>
    </TableWrap>
  )
}

/** Historial de conteos guardados: uno por tarjeta, expandible. */
export function HistorialConteos({
  hist,
  titulo,
  conVivo,
  unidad,
}: {
  hist: { cargando: boolean; conteos: ConteoHistorial[]; error: string | null }
  titulo: string
  conVivo?: boolean
  unidad?: string
}) {
  return (
    <div>
      <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, marginBottom: space[3] }}>{titulo}</h2>
      {hist.cargando ? (
        <Esqueleto forma="tabla" filas={4} />
      ) : hist.error ? (
        <Notice tone="danger" icon="⚠">
          No pude cargar el historial: {hist.error}
        </Notice>
      ) : !hist.conteos.length ? (
        <EmptyState icon="🕘" title="Todavía no hay conteos guardados" dashed />
      ) : (
        hist.conteos.map((c, i) => <ConteoGuardado key={i} c={c} conVivo={conVivo} unidad={unidad} />)
      )}
    </div>
  )
}

function ConteoGuardado({ c, conVivo, unidad }: { c: ConteoHistorial; conVivo?: boolean; unidad?: string }) {
  const rr = (c.resumen || {}) as { mas?: number; menos?: number; lineas?: number; productos?: { pid?: string; nombre?: string }[] }
  const f = c.fecha_aplicado
    ? new Date(c.fecha_aplicado).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'
  const det = (Array.isArray(c.detalle) ? c.detalle : []) as Record<string, number | string | null>[]
  const difs = det.filter((d) => Number(d.diferencia || 0) !== 0)
  // Nombres de lo contado: del resumen (todos los terminados) o, si el conteo es viejo y
  // no lo trae, de las líneas del detalle.
  const nombres =
    Array.isArray(rr.productos) && rr.productos.length
      ? rr.productos.map((p) => String(p?.nombre || '').trim()).filter(Boolean)
      : Array.from(new Set(det.map((d) => String(d.producto || '').trim()).filter(Boolean)))
  const hayBalance = det.length > difs.length // guardó líneas sin diferencia = conteo nuevo

  return (
    <Card padding={4} style={{ marginBottom: space[2] }}>
      <details>
        <summary style={{ cursor: 'pointer', fontSize: font.base, color: color.ink2 }}>
          <b style={{ color: color.ink }}>{f}</b> · {c.usuario || '—'} · <span style={{ color: color.warningInk }}>+{rr.mas || 0}</span> /{' '}
          <span style={{ color: color.dangerInk }}>−{rr.menos || 0}</span> · {difs.length} con diferencia · {nombres.length}{' '}
          {nombres.length === 1 ? 'producto' : 'productos'}
        </summary>

        <div style={{ marginTop: space[3], fontSize: font.base, color: color.ink2, background: color.bg, border: `1px solid ${color.line}`, borderRadius: 'var(--mo-r-md)', padding: '8px 10px' }}>
          🧾 <b>
            Se contaron {nombres.length} {nombres.length === 1 ? 'producto' : 'productos'}
          </b>
          {nombres.length ? <>: {nombres.join(', ')}</> : null}
        </div>

        <div style={{ marginTop: space[3] }}>
          <div style={{ fontSize: font.xs, fontWeight: 700, color: color.mut, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: space[1] }}>Líneas con diferencia</div>
          {difs.length === 0 ? (
            <Notice tone="success" icon="✓">
              Todo coincidió con el sistema, sin diferencias.
            </Notice>
          ) : (
            <TablaDetalleConteo filas={difs} conVivo={conVivo} unidad={unidad} />
          )}
        </div>

        {hayBalance ? (
          <details style={{ marginTop: space[3] }}>
            <summary style={{ cursor: 'pointer', fontSize: font.sm, color: color.brand, fontWeight: 600 }}>
              Ver todo lo contado ({det.length} {det.length === 1 ? 'línea' : 'líneas'})
            </summary>
            <div style={{ marginTop: space[2] }}>
              <TablaDetalleConteo filas={det} conVivo={conVivo} unidad={unidad} />
            </div>
          </details>
        ) : difs.length > 0 ? (
          <p style={{ fontSize: font.xs, color: color.mut2, marginTop: space[2] }}>Este conteo es anterior a la mejora: solo guardó las diferencias, no el balance completo.</p>
        ) : null}
      </details>
    </Card>
  )
}
