'use client'

import { useMemo, useState } from 'react'
import { Button, Notice, color, font, space, useConfirmar, useToast, weight } from '@/components/ui'
import type { Marca } from '@/lib/nav'
import type { EscaneoLibre } from '@/lib/exhib/libre'
import type { ExhibItem } from '@/lib/exhib/tipos'
import { guardarMapa, type MapaGuardado } from '@/lib/mapa-local/cliente'
import { TIPOS_INICIALES } from '@/lib/mapa-local/inicial'
import { armarRelevamiento, cierreDelRelevamiento, mapaDesdeRelevamiento, PALABRA_DE } from '@/lib/mapa-local/relevamiento'
import { useEdadStock } from './useEdadStock'

/**
 * **El relevamiento de «Chequeo + mapa», al finalizar** (y al abrir uno guardado): cómo está armado
 * el local, qué hay en cada barra, qué falta exhibir y qué sobra, y el botón para guardarlo como el
 * Mapa del local.
 *
 * 🔑 **Falta y sobra se ven SÓLO acá**, ⛔ mientras se camina: lo pidió Bruno el 5-oct-2026.
 *
 * 🔴 **«Falta exhibir» es una afirmación sobre el local ENTERO**: si quedó un módulo (o una altura)
 * sin relevar, se dice PROVISORIO y se nombra qué faltó caminar — lo que «falta» puede estar ahí.
 *
 * 🔑 **El panel entero es de quien edita el Mapa del local** (Bruno o Darío, 5-oct-2026): quien
 * escanea termina con un «listo» (`ExhibLibre`) y ⛔ ve este panel. El botón vuelve a pedir el permiso
 * por si alguien lo monta en otro lado, y el servidor lo exige igual.
 */
export function RelevamientoPanel({
  escaneos,
  items,
  marca,
  guardado,
  onGuardado,
  onTraerStock,
  trayendo,
}: {
  escaneos: EscaneoLibre[]
  items: ExhibItem[]
  marca: Marca
  /** El mapa guardado con su permiso. `null` = ⛔ se pudo leer. */
  guardado: MapaGuardado | null
  onGuardado: (g: MapaGuardado) => void
  onTraerStock: () => Promise<void>
  trayendo: boolean
}) {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [guardando, setGuardando] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)
  const { stockViejo, texto: textoStock } = useEdadStock(marca, items)

  const r = useMemo(() => armarRelevamiento(escaneos), [escaneos])
  const cierre = useMemo(() => cierreDelRelevamiento(escaneos, items, guardado?.mapa ?? null), [escaneos, items, guardado])
  const propuesta = useMemo(() => mapaDesdeRelevamiento(r, guardado?.mapa ?? null, TIPOS_INICIALES), [r, guardado])

  const provisorio = cierre.sinRelevar === null || cierre.sinRelevar.length > 0
  const ver = (k: string) => setAbierto((a) => (a === k ? null : k))

  async function guardar() {
    if (!guardado) return
    const ok = await confirmar({
      titulo: '¿Guardar como mapa del local?',
      ok: 'Guardar',
      mensaje: (
        <div>
          <div style={{ marginBottom: space[2] }}>Cada barra relevada queda con los modelos que se escanearon ahí. Lo que nadie caminó queda como estaba.</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {propuesta.cambios.map((c, i) => (
              <li key={i} style={{ fontWeight: c.que === 'barras' ? undefined : weight.bold }}>{c.texto}</li>
            ))}
          </ul>
        </div>
      ),
    })
    if (!ok) return
    setGuardando(true)
    try {
      const res = await guardarMapa(propuesta.mapa, guardado.actualizadoEn)
      toast.ok('Mapa del local guardado')
      onGuardado({ ...guardado, mapa: propuesta.mapa, actualizadoEn: res.actualizadoEn, actualizadoPor: res.actualizadoPor })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  const fila = (titulo: React.ReactNode, sub: React.ReactNode, key: string) => (
    <div key={key} style={{ padding: '6px 2px', borderBottom: `1px solid ${color.line}` }}>
      <div style={{ fontSize: font.base, color: color.ink }}>{titulo}</div>
      {sub && <div style={{ fontSize: font.xs, color: color.mut }}>{sub}</div>}
    </div>
  )
  const conColor = (nombre: string, col: string) => (col ? `${nombre} · ${col}` : nombre)

  return (
    <div style={{ marginBottom: space[4] }}>
      <div style={{ fontSize: font.lg, fontWeight: weight.bold, color: color.ink, marginBottom: space[2] }}>Relevamiento del local</div>

      {/* ── La estructura y lo que hay en cada barra ── */}
      {r.modulos.length === 0 ? (
        <Notice tone="neutral" icon="🗺️" style={{ marginBottom: space[3] }}>
          No se escaneó en ningún módulo (D, I o ISLA): no hay nada para llevar al mapa.
        </Notice>
      ) : (
        <div style={{ marginBottom: space[3] }}>
          {r.modulos.map((m) => (
            <div key={m.codigo} style={{ borderBottom: `1px solid ${color.line}`, padding: '6px 2px' }}>
              <div style={{ display: 'flex', gap: space[3], alignItems: 'baseline', flexWrap: 'wrap' }}>
                <b style={{ minWidth: 44 }}>{m.codigo}</b>
                <span style={{ fontSize: font.sm, color: color.mut }}>{m.estructura}</span>
                {m.barras.map((b) => (
                  <Button key={b.pos} size="sm" variant="ghost" onClick={() => ver(`${m.codigo}-${b.pos}`)} disabled={!b.relevada || !b.prendas.length}>
                    {m.estructura === 'doble' ? `${PALABRA_DE[b.pos]} ` : ''}
                    {b.relevada ? `${b.prendas.length} perchas` : 'sin relevar'}
                  </Button>
                ))}
              </div>
              {m.barras.map(
                (b) =>
                  abierto === `${m.codigo}-${b.pos}` && (
                    <div key={b.pos} style={{ maxHeight: 260, overflowY: 'auto', marginTop: space[1] }}>
                      {b.prendas.map((p) => fila(conColor(p.nombre, p.color), p.tipo, p.clave))}
                    </div>
                  ),
              )}
            </div>
          ))}
          {r.otrosLugares.length > 0 && (
            <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[2] }}>
              También se escaneó en: {r.otrosLugares.join(', ')} (cuentan como exhibido, no van al mapa).
            </div>
          )}
        </div>
      )}

      {r.dudosos.length > 0 && (
        <Notice tone="warning" icon="⚠" style={{ marginBottom: space[3] }}>
          {r.dudosos.join(', ')}: se escaneó como simple y como doble. Se toma doble; lo escaneado sin altura no queda en ninguna barra.
        </Notice>
      )}
      {r.enDosBarras.length > 0 && (
        <Notice tone="neutral" icon="↔" style={{ marginBottom: space[3] }}>
          <div>
            <b>{r.enDosBarras.length}</b> {r.enDosBarras.length === 1 ? 'modelo está' : 'modelos están'} en dos barras. El mapa guarda el modelo en una sola: queda donde más se lo vio.{' '}
            <Button size="sm" variant="ghost" onClick={() => ver('dos')}>{abierto === 'dos' ? 'Ocultar' : 'Ver cuáles'}</Button>
          </div>
          {abierto === 'dos' && r.enDosBarras.map((d) => fila(d.nombre, `${d.barras.join(' · ')} → queda en ${d.queda}`, d.productId))}
        </Notice>
      )}

      {/* ── Falta exhibir y sobra: sólo al finalizar ── */}
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', fontSize: font.sm, color: stockViejo ? color.warningInk : color.mut, marginBottom: space[2], flexWrap: 'wrap' }}>
        <span title="El local vende unas 160 prendas por día: con el stock viejo, la lista puede marcar como faltantes cosas que ya se vendieron.">{textoStock}</span>
        <Button size="sm" variant={stockViejo ? 'solid' : 'outline'} tone={stockViejo ? 'brand' : undefined} onClick={() => void onTraerStock()} loading={trayendo}>
          Actualizar stock
        </Button>
      </div>

      <Notice tone={provisorio ? 'warning' : 'neutral'} icon="🧺" style={{ marginBottom: space[3] }}>
        <div>
          <b>Falta exhibir: {cierre.faltaExhibir.length}</b> {cierre.faltaExhibir.length === 1 ? 'modelo y color' : 'modelos y colores'} con stock en el Local que no pasaron por el lector en ningún lugar.
          {cierre.faltaExhibir.length > 0 && (
            <>
              {' '}
              <Button size="sm" variant="ghost" onClick={() => ver('falta')}>{abierto === 'falta' ? 'Ocultar' : 'Ver cuáles'}</Button>
            </>
          )}
        </div>
        {provisorio && (
          <div style={{ fontSize: font.sm, marginTop: space[1] }}>
            <b>Provisorio:</b>{' '}
            {cierre.sinRelevar === null
              ? 'no hay un mapa guardado para saber si quedó algún módulo sin caminar.'
              : `quedó sin relevar ${cierre.sinRelevar.join(', ')}. Lo que falta puede estar colgado ahí.`}
          </div>
        )}
        {abierto === 'falta' && (
          <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: space[2] }}>
            {cierre.faltaExhibir.map((f) => fila(conColor(f.nombre, f.color), `${f.tipo} · ${f.unidades} u en el Local`, f.clave))}
          </div>
        )}
      </Notice>

      {cierre.sobran.length > 0 && (
        <Notice tone="neutral" icon="＋" style={{ marginBottom: space[3] }}>
          <div>
            <b>Sobran: {cierre.sobran.length}</b> (sin stock en el sistema, o la misma prenda en dos lugares).{' '}
            <Button size="sm" variant="ghost" onClick={() => ver('sobra')}>{abierto === 'sobra' ? 'Ocultar' : 'Ver cuáles'}</Button>
          </div>
          {abierto === 'sobra' &&
            cierre.sobran.map((s) =>
              fila(conColor(s.nombre, s.color), s.motivo === 'sin-stock' ? `el sistema la tiene en cero · en ${s.lugares.join(', ')}` : `en ${s.lugares.join(' y ')}`, s.clave),
            )}
        </Notice>
      )}
      {cierre.sinIdentificar > 0 && (
        <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[3] }}>
          {cierre.sinIdentificar} {cierre.sinIdentificar === 1 ? 'código quedó' : 'códigos quedaron'} sin identificar: no cuentan.
        </div>
      )}

      {/* ── Guardar como mapa ── */}
      {guardado?.puede.editar && r.modulos.length > 0 && (
        <Button variant="solid" tone="brand" onClick={() => void guardar()} loading={guardando} disabled={guardado.sinTabla}>
          Guardar como mapa del local
        </Button>
      )}
    </div>
  )
}
