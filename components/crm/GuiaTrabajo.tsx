'use client'

import { Button, Modal, color, font, space } from '@/components/ui'

/**
 * La guía de trabajo del CRM: la rutina del día de Bruno, adentro de la pantalla donde
 * se ejecuta.
 *
 * **Por qué acá y no en un manual.** El sistema de manuales (`lib/manuales`) existe justo
 * para esto —el procedimiento, editable sin deploy— y fue el primer lugar donde se cargó.
 * No sirvió: un manual se abre desde un botón "Cómo se usa" genérico, y esto no es la
 * ayuda de una pantalla, es el trabajo. Tiene que estar a un clic de las listas que
 * nombra, y cada bloque tiene que **llevar** a su lista en vez de describirla.
 *
 * De ahí la decisión de forma: cada bloque trae su botón, que aplica el filtro y cierra.
 * Si algún día la guía deja de poder apretar un botón por bloque, va a ser señal de que
 * volvió a ser un documento y le corresponde el manual.
 */

/** Lo que un bloque le pide a la pantalla. Lo resuelve `CRM.tsx`, que es quien tiene el estado. */
export type AccionGuia = 'contactar' | 'reposicion' | 'frios'

type Bloque = {
  momento: string
  titulo: string
  donde: React.ReactNode
  quienes: string
  objetivo: string
  accion: { texto: string; k: AccionGuia }
  tono: { fg: string; bg: string; bd: string }
}

const BLOQUES: Bloque[] = [
  {
    momento: 'Mañana',
    titulo: 'Clientes en cierre',
    donde: (
      <>
        La tarjeta <b>Para contactar (caja rápida)</b>.
      </>
    ),
    quienes: 'Te pidieron precio, dijeron "te pido esta semana" o están eligiendo.',
    objetivo: 'Cerrar la venta, cobrar y despachar.',
    accion: { texto: 'Ver los de hoy', k: 'contactar' },
    tono: { fg: 'var(--mo-danger-ink)', bg: 'var(--mo-danger-bg)', bd: 'var(--mo-danger-border)' },
  },
  {
    momento: 'Mediodía',
    titulo: 'Reposición de activos',
    donde: (
      <>
        Los <b>Activos</b> ordenados por último pedido. Buscá los de <b>hace 10 a 15 días</b>.
      </>
    ),
    quienes: 'Ya compraron y tienen la mercadería en el local.',
    objetivo: 'Preguntar cómo rotó el producto y ofrecer reposición de stock.',
    accion: { texto: 'Ver activos por fecha', k: 'reposicion' },
    tono: { fg: 'var(--mo-warning-ink)', bg: 'var(--mo-warning-bg)', bd: 'var(--mo-warning-border)' },
  },
  {
    momento: 'Tarde',
    titulo: 'Recontacto de dormidos y leads',
    donde: (
      <>
        Las tarjetas <b>🧊 Fríos</b> o <b>Dormidos</b>, o la pestaña <b>Leads</b>. Solo{' '}
        <b>10 por día</b>, sin presionar.
      </>
    ),
    quienes: 'Los que se apagaron, y los que todavía no te compraron nunca.',
    objetivo: 'Tanteo humano en 2 pasos para reactivar la charla.',
    accion: { texto: 'Ver los fríos', k: 'frios' },
    tono: { fg: 'var(--mo-brand)', bg: 'var(--mo-brand-bg)', bd: 'var(--mo-brand-border)' },
  },
]

const PASOS = [
  {
    cuando: 'El mismo día',
    que: 'Lo agendás y seguís. No lo dejes dando vueltas en la cabeza.',
    proximo: 'En 3 o 4 días',
    nota: 'Enviado / Sin respuesta (Intento 1)',
  },
  {
    cuando: 'A los 3 o 4 días',
    que: 'Te figura como Vencido. Mandale un audio corto o una propuesta distinta.',
    proximo: 'En 7 días',
    nota: 'Sin respuesta (Intento 2)',
  },
  {
    cuando: 'A los 7 días',
    que: 'Saludo de cierre relajado: "Sé que andás a mil, te mando un abrazo…".',
    proximo: 'En 60 o 90 días',
    nota: 'Dormido / Recontactar en 3 meses',
  },
]

const NOTAS = [
  { emoji: '🔴', texto: 'En cierre / Pide esta semana', plazo: '24 a 48 hs' },
  { emoji: '🟡', texto: 'Evaluando / Recontactar', plazo: '3 a 5 días' },
  { emoji: '🟢', texto: 'Compró / Controlar rotación', plazo: '10 a 15 días' },
]

const H = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: font.sm, fontWeight: 700, color: color.mut, textTransform: 'uppercase', letterSpacing: '.04em', margin: `${space[5]} 0 ${space[3]}` }}>
    {children}
  </div>
)

const Etiqueta = ({ children }: { children: React.ReactNode }) => (
  <span style={{ fontSize: font.xs, fontWeight: 700, color: color.mut2, textTransform: 'uppercase', letterSpacing: '.04em' }}>{children}</span>
)

type Props = { onCerrar: () => void; onIr: (k: AccionGuia) => void }

export function GuiaTrabajo({ onCerrar, onIr }: Props) {
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Guía de trabajo" ancho="ancho" pie={<Button onClick={onCerrar}>Cerrar</Button>}>
      {/* La regla de oro va arriba y sin plegar: es la que se rompe sola cuando el día viene
          movido, y es la razón por la que existe todo lo de abajo. */}
      <div style={{ border: `1px solid ${color.brandBorder}`, background: color.brandBg, borderRadius: 'var(--mo-r-lg)', padding: `${space[3]} ${space[4]}` }}>
        <div style={{ fontSize: font.base, fontWeight: 700, color: color.brand, marginBottom: space[2] }}>La regla de oro</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: font.base, color: color.ink2, lineHeight: 1.7 }}>
          <li><b>Nunca</b> busques a quién escribirle mirando WhatsApp.</li>
          <li>El día arranca <b>siempre</b> por la columna <b>Próximo contacto</b>.</li>
          <li>Le escribís <b>únicamente</b> a los que están en fecha: vencidos y de esta semana.</li>
        </ul>
      </div>

      <H>La rutina del día</H>
      <div style={{ display: 'grid', gap: space[3] }}>
        {BLOQUES.map((b) => (
          <div key={b.titulo} style={{ border: `1px solid ${color.line2}`, borderLeft: `3px solid ${b.tono.bd}`, borderRadius: 'var(--mo-r-lg)', padding: `${space[3]} ${space[4]}` }}>
            <div style={{ display: 'flex', gap: space[3], alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontSize: font.xs, fontWeight: 700, color: b.tono.fg, background: b.tono.bg, border: `1px solid ${b.tono.bd}`, padding: '2px 8px', borderRadius: 999 }}>
                {b.momento}
              </span>
              <span style={{ fontSize: font.lg, fontWeight: 700, color: color.ink }}>{b.titulo}</span>
              <Button size="sm" variant="outline" onClick={() => onIr(b.accion.k)} style={{ marginLeft: 'auto' }}>
                {b.accion.texto} →
              </Button>
            </div>
            <div style={{ marginTop: space[2], fontSize: font.base, color: color.ink2, lineHeight: 1.7 }}>
              <div>{b.donde}</div>
              <div style={{ marginTop: 4 }}><Etiqueta>Quiénes son</Etiqueta> · {b.quienes}</div>
              <div><Etiqueta>Objetivo</Etiqueta> · {b.objetivo}</div>
            </div>
          </div>
        ))}
      </div>

      <H>Si no te responde</H>
      <div style={{ display: 'grid', gap: space[2] }}>
        {PASOS.map((p, i) => (
          <div key={p.cuando} style={{ display: 'flex', gap: space[3], alignItems: 'flex-start' }}>
            <span style={{ flex: '0 0 auto', width: 22, height: 22, borderRadius: '50%', background: color.brandSolid, color: '#fff', fontSize: font.xs, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
              {i + 1}
            </span>
            <div style={{ fontSize: font.base, color: color.ink2, lineHeight: 1.7 }}>
              <b style={{ color: color.ink }}>{p.cuando}.</b> {p.que}
              <div style={{ marginTop: 2 }}>
                <Etiqueta>Próximo contacto</Etiqueta> · {p.proximo} &nbsp;·&nbsp; <Etiqueta>Nota</Etiqueta>{' '}
                <code style={{ fontSize: font.sm, background: color.bg2, padding: '1px 6px', borderRadius: 4 }}>{p.nota}</code>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: space[3], fontSize: font.sm, color: color.mut, fontStyle: 'italic' }}>
        Después del paso 3 te liberás la cabeza: el CRM te lo vuelve a mostrar solo, en 3 meses.
      </div>

      <H>Las 3 notas de siempre</H>
      <div style={{ display: 'grid', gap: space[2] }}>
        {NOTAS.map((n) => (
          <div key={n.texto} style={{ display: 'flex', gap: space[2], alignItems: 'center', fontSize: font.base, color: color.ink2 }}>
            <span style={{ fontSize: font.lg }}>{n.emoji}</span>
            <code style={{ fontSize: font.sm, background: color.bg2, padding: '2px 8px', borderRadius: 4 }}>{n.texto}</code>
            <span style={{ color: color.mut }}>→ próximo contacto: <b style={{ color: color.ink2 }}>{n.plazo}</b></span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: space[5], paddingTop: space[3], borderTop: `1px dashed ${color.line}`, fontSize: font.sm, color: color.mut, lineHeight: 1.7 }}>
        La nota y el próximo contacto se cargan <b>entrando a la ficha</b>: tocá la fila del cliente.
        Para 1, 2, 3 días o 1 semana están los botones de <b>&quot;Le escribí hoy&quot;</b>; para 4, 60 o 90
        días tocá la <b>fecha</b> y elegila del calendario.
      </div>
    </Modal>
  )
}
