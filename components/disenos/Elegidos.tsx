'use client'

/**
 * Los diseños confirmados: el final de la sección, que hasta ago-2026 no existía.
 *
 * 🔑 **Por qué es una pestaña y no un chip más del filtro.** Medido: en la única ronda que hubo
 * votaron 10 personas y salió un ranking de 5,00 a 1,29 — y **ni un solo diseño se movió a
 * Confirmado**. La sección terminaba en una tabla de resultados. Una pestaña con el badge en 0
 * —el único que se muestra valiendo cero, a propósito— dice "todavía no elegiste nada" cada vez
 * que se entra; un chip perdido en una fila de cinco no dice eso.
 *
 * Y es de acá que sale la orden: los confirmados se pasan a una importación de Ingresos
 * proyectados, que es donde se les ponen modelos, cantidades y proveedor. Los que ya vienen en
 * una importación quedan plegados abajo, y uno elegido de más se saca de vuelta a «Por revisar».
 */

import { useState } from 'react'
import { elegidosPorComprar, etiquetaPuntaje, ordenar, yaEnImportacion } from '@/lib/disenos/core'
import type { Diseno } from '@/lib/disenos/tipos'
import type { PuntajesDeRonda } from '@/lib/disenos/votacion'
import { Button, EmptyState, color, font, radius, space } from '@/components/ui'

export function Elegidos({
  disenos,
  puntajes,
  onVer,
  onSacar,
  acciones,
}: {
  disenos: Diseno[]
  puntajes: PuntajesDeRonda
  onVer: (url: string) => void
  /** Lo devuelve a «Por revisar»: deja de estar elegido y puede volver a una votación. */
  onSacar: (id: string) => void
  /** El botón de pasar a una importación y el PDF. Los pone el shell, que sabe de marca y permisos. */
  acciones: React.ReactNode
}) {
  // 🔑 Las que ya vienen en una importación van plegadas: ya están compradas, y mostrarlas arriba
  // hacía que la pestaña nunca se vaciara (19-oct-2026: 29 elegidos, 27 ya en la IMPO 5).
  const [verCompradas, setVerCompradas] = useState(false)
  const items = ordenar(elegidosPorComprar(disenos), 'puntaje', puntajes)
  const compradas = ordenar(
    disenos.filter((d) => d.estado === 'confirmado' && yaEnImportacion(d)),
    'puntaje',
    puntajes,
  )

  if (!items.length && !compradas.length) {
    return (
      <EmptyState
        icon="✅"
        title="Todavía no confirmaste ningún diseño"
        hint="En «Votaciones» está el ranking de la ronda, y desde ahí se confirman los mejores de una vez. También se puede elegir varios en el tablero y confirmarlos juntos."
        dashed
      />
    )
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', marginBottom: space[3] }}>
        <div style={{ fontSize: font.sm, color: color.ink2 }}>
          {items.length ? (
            <>
              <b>{items.length}</b> {items.length === 1 ? 'diseño elegido' : 'diseños elegidos'} sin importación, ordenados por lo que votó el equipo.
            </>
          ) : (
            'Todos los elegidos ya vienen en una importación.'
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: space[2], flexWrap: 'wrap' }}>{acciones}</div>
      </div>

      {items.length > 0 && (
        <Grilla>
          {items.map((d, i) => (
            <Tarjeta key={d.id} d={d} n={i + 1} puntajes={puntajes} onVer={onVer} onSacar={() => onSacar(d.id)} />
          ))}
        </Grilla>
      )}

      {compradas.length > 0 && (
        <div style={{ marginTop: space[4] }}>
          <Button variant="ghost" size="sm" onClick={() => setVerCompradas((v) => !v)}>
            {verCompradas ? 'Ocultar' : 'Mostrar'} {compradas.length === 1 ? 'la que ya viene' : `las ${compradas.length} que ya vienen`} en una importación
          </Button>
          {verCompradas && (
            <div style={{ marginTop: space[3], opacity: 0.75 }}>
              <Grilla>
                {compradas.map((d, i) => (
                  <Tarjeta key={d.id} d={d} n={i + 1} puntajes={puntajes} onVer={onVer} />
                ))}
              </Grilla>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function Grilla({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: space[3] }}>{children}</div>
}

function Tarjeta({ d, n, puntajes, onVer, onSacar }: { d: Diseno; n: number; puntajes: PuntajesDeRonda; onVer: (url: string) => void; onSacar?: () => void }) {
  const enviado = d.enviados?.length ? d.enviados[d.enviados.length - 1] : null
  return (
    <div style={{ border: `1px solid ${color.line}`, borderRadius: radius.md, overflow: 'hidden', background: color.surface }}>
      <div style={{ position: 'relative' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={d.url}
          alt=""
          loading="lazy"
          onClick={() => onVer(d.url)}
          style={{ width: '100%', height: 180, objectFit: 'cover', cursor: 'zoom-in', background: color.bg2, display: 'block' }}
        />
        <div style={{ position: 'absolute', top: 6, left: 6, background: color.scrim, color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
          #{n}
        </div>
        <div style={{ position: 'absolute', left: 6, bottom: 6, background: color.scrim, color: '#fff', fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 20 }}>
          {etiquetaPuntaje(puntajes[d.id])}
        </div>
      </div>
      <div style={{ padding: space[2] }}>
        {/* El nombre es lo que va a cruzar contra Gestión Nube: si está vacío o sigue
            siendo el del archivo, la venta de esta compra no se puede medir. */}
        <div style={{ fontSize: font.sm, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.name}>
          {d.name || <span style={{ color: color.danger, fontWeight: 500 }}>sin nombre</span>}
        </div>
        <div style={{ fontSize: font.xs, color: enviado ? color.success : color.mut2, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {enviado ? `${enviado.vinculo ? '📦 ya viene en' : '→'} ${enviado.ingresoDesc || 'una importación'}` : 'sin mandar a ninguna importación'}
        </div>
        {/* Sólo a las que faltan comprar: sacar una comprada la devolvería a la próxima votación. */}
        {onSacar && (
          <Button size="sm" variant="ghost" tone="danger" onClick={onSacar} style={{ marginTop: space[1] }}>
            Sacar de Elegidos
          </Button>
        )}
      </div>
    </div>
  )
}
