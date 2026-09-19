'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Button, Card, Field, Input, Notice, color, font, formatMoney, space, useConfirmar, useToast, weight } from '@/components/ui'
import { descargarXlsx } from '@/lib/excel'
import { precioDeGondola } from '@/lib/exhib/core'
import { leerRecorrido, leerRecorridos } from '@/lib/exhib/cliente'
import { agruparPorLugar, ANCHOS_EXPORT, filasExport, type EscaneoLibre, type RecorridoLibre } from '@/lib/exhib/libre'
import type { ExhibItem } from '@/lib/exhib/tipos'
import { useExhibLibre, type ResultadoLibre } from './useExhibLibre'

/**
 * Chequeo de exhibición **libre**: se camina el local escaneando por LUGAR («perchero tops»), y
 * cada escaneo se guarda en la base con su lugar.
 *
 * 🔑 **Por qué no alcanzaba el modo por categoría.** Una misma categoría de Tienda Nube está
 * colgada en varios lugares del salón, y además engloba mal: el perchero de tops se compara contra
 * «TOPS Y BODIES», un bolsón de 291 que se come tops, bodies, blusas, camisas, corsets y
 * musculosas. Acá la unidad de trabajo es el mueble que uno tiene delante.
 *
 * ⛔ **Esta pantalla NO dice qué falta, y es una decisión.** Entrega el dato de qué se escaneó en
 * cada lugar —con TODAS las categorías de cada prenda— y la comparación se hace por afuera, con el
 * Excel. La app ⛔ no decide qué debería estar colgado en cada perchero.
 */

type Fase = 'config' | 'scan' | 'ver'

const fechaHora = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—'

export function ExhibLibre({ items, cargando, errorMsg, selector }: { items: ExhibItem[]; cargando: boolean; errorMsg: string | null; selector: React.ReactNode }) {
  const { marca } = useSesion()
  const { confirmar } = useConfirmar()
  const toast = useToast()
  const lib = useExhibLibre(marca, items)

  const [fase, setFase] = useState<Fase>('config')
  const [fb, setFb] = useState<ResultadoLibre | null>(null)
  const [previos, setPrevios] = useState<RecorridoLibre[] | null>(null)
  const [viendo, setViendo] = useState<{ recorrido: RecorridoLibre; escaneos: EscaneoLibre[] } | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)
  const lugarRef = useRef<HTMLInputElement>(null)

  const cargarPrevios = useCallback(() => {
    void leerRecorridos(marca)
      .then(setPrevios)
      // La lista de anteriores es un extra: si falla, el recorrido de hoy arranca igual. Se
      // distingue «no pude preguntar» (null) de «no hay ninguno» ([]), que es lo que dibuja abajo.
      .catch(() => setPrevios(null))
  }, [marca])

  useEffect(cargarPrevios, [cargarPrevios])

  function foco(ref: React.RefObject<HTMLInputElement | null>) {
    setTimeout(() => ref.current?.focus(), 150)
  }

  function iniciar() {
    lib.iniciar()
    setFb(null)
    setFase('scan')
    foco(lugarRef)
  }

  function marcar(code: string) {
    const c = code.trim()
    if (!c) return
    if (!lib.lugar.trim()) {
      toast.aviso('Escribí primero en qué lugar estás parado.')
      foco(lugarRef)
      return
    }
    setFb(lib.escanear(c, lib.lugar))
  }

  async function terminar() {
    try {
      await lib.cerrar()
    } catch (e) {
      toast.error((e as Error).message)
      return
    }
    toast.ok('Recorrido guardado')
    cargarPrevios()
    setFase('config')
  }

  async function eliminar() {
    const n = lib.escaneos.length
    const ok = await confirmar({
      titulo: '¿Eliminar este recorrido?',
      tono: 'danger',
      ok: 'Eliminar',
      mensaje: `Se van los ${n} ${n === 1 ? 'escaneo' : 'escaneos'} con sus lugares, acá y en el servidor. No se puede deshacer.`,
    })
    if (!ok) return
    try {
      await lib.eliminar()
    } catch (e) {
      toast.error('No se pudo eliminar: ' + (e as Error).message)
      return
    }
    setFase('config')
    cargarPrevios()
  }

  async function bajarExcel(escaneos: EscaneoLibre[], cuando: string) {
    if (!escaneos.length) {
      toast.aviso('Todavía no hay nada escaneado.')
      return
    }
    await descargarXlsx(filasExport(escaneos), {
      archivo: `chequeo-exhibicion-${marca}-${cuando.slice(0, 10)}.xlsx`,
      hoja: 'Exhibición',
      anchos: ANCHOS_EXPORT,
    })
  }

  function abrirPrevio(id: string) {
    void leerRecorrido(marca, id)
      .then((d) => {
        setViendo(d)
        setFase('ver')
      })
      .catch((e: Error) => toast.error('No se pudo abrir: ' + e.message))
  }

  const grupos = useMemo(() => agruparPorLugar(lib.escaneos), [lib.escaneos])
  const deEsteLugar = useMemo(() => grupos.find((g) => g.lugar === lib.lugar.trim())?.escaneos ?? [], [grupos, lib.lugar])

  return (
    <>
      <HeaderAcciones>
        {fase === 'config' && (
          <>
            {lib.recorridoId && (
              <Button variant="outline" onClick={() => { setFase('scan'); foco(scanRef) }}>Retomar</Button>
            )}
            <Button variant="solid" tone="brand" onClick={iniciar} disabled={cargando || !items.length || !!lib.recorridoId}>
              Iniciar recorrido
            </Button>
          </>
        )}
        {fase === 'scan' && (
          <>
            <Button variant="ghost" tone="danger" onClick={() => void eliminar()}>Eliminar</Button>
            <Button variant="outline" onClick={() => void bajarExcel(lib.escaneos, new Date().toISOString())}>Excel</Button>
            <Button variant="solid" tone="brand" onClick={() => void terminar()} loading={lib.subiendo}>Terminar y guardar</Button>
          </>
        )}
        {fase === 'ver' && viendo && (
          <>
            <Button variant="outline" onClick={() => { setViendo(null); setFase('config') }}>← Volver</Button>
            <Button variant="solid" tone="brand" onClick={() => void bajarExcel(viendo.escaneos, viendo.recorrido.creado_en)}>Descargar Excel</Button>
          </>
        )}
      </HeaderAcciones>

      {/* ── Configurar ── */}
      {fase === 'config' && (
        <Card>
          {selector}

          {errorMsg ? (
            <Notice tone="danger" icon="⚠" style={{ marginBottom: space[4] }}>Error cargando inventario: {errorMsg}</Notice>
          ) : cargando ? (
            <Notice tone="neutral" icon="⏳" style={{ marginBottom: space[4] }}>Cargando inventario…</Notice>
          ) : (
            <Notice tone="neutral" icon="🏷️" style={{ marginBottom: space[4] }}>
              Escaneás lo que hay en cada lugar del local —un perchero, una mesa, la vidriera— y todo queda guardado con ese lugar.
              Tenés <b>{items.length}</b> variantes con stock en Local contra las que cruzar.
            </Notice>
          )}

          {lib.recorridoId && (
            <Notice tone="brand" icon="↩" style={{ marginBottom: space[4] }}>
              Hay un recorrido en curso con <b>{lib.escaneos.length}</b> {lib.escaneos.length === 1 ? 'escaneo' : 'escaneos'}
              {lib.sinSubir > 0 && <> · <b>{lib.sinSubir}</b> sin subir</>}. Tocá <b>Retomar</b> para seguir.
            </Notice>
          )}

          <Subtitulo>Recorridos anteriores</Subtitulo>
          {previos === null ? (
            // 🔑 «No se pudo preguntar» ⛔ no es «no hay ninguno»: un cero acá se leería como que
            // nunca se hizo un recorrido, que es exactamente lo contrario de lo que pasa.
            <div style={{ color: color.mut, fontSize: font.sm, padding: '8px 0' }}>No se pudo leer la lista de recorridos.</div>
          ) : previos.length === 0 ? (
            <div style={{ color: color.mut, fontSize: font.sm, padding: '8px 0' }}>Todavía no hay ninguno guardado.</div>
          ) : (
            previos.map((r) => (
              <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px', borderBottom: `1px solid ${color.line}`, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: font.base, color: color.ink }}>
                    {fechaHora(r.creado_en)} · {r.persona || 'sin nombre'}
                  </div>
                  <div style={{ fontSize: font.xs, color: color.mut }}>
                    {r.escaneos ?? 0} {r.escaneos === 1 ? 'escaneo' : 'escaneos'} · {r.estado === 'cerrado' ? 'cerrado' : 'sin cerrar'}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => abrirPrevio(r.id)}>Ver</Button>
              </div>
            ))
          )}
        </Card>
      )}

      {/* ── Recorrer ── */}
      {fase === 'scan' && (
        <Card>
          <Field label="¿En qué lugar estás?" hint="Por ejemplo: perchero tops, mesa de la entrada, vidriera" width={320}>
            <Input
              ref={lugarRef}
              value={lib.lugar}
              onChange={(e) => lib.setLugar(e.target.value)}
              // 🔑 `datalist` y ⛔ no un desplegable: el salón se reacomoda, y una lista cerrada que
              // no tiene el perchero de hoy obliga a elegir uno que miente.
              list="mo-exhib-lugares"
              placeholder="perchero tops"
              autoComplete="off"
              style={{ height: 44, fontSize: 16 }}
            />
          </Field>
          <datalist id="mo-exhib-lugares">
            {lib.sugerencias.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>

          <div style={{ display: 'flex', gap: space[2], alignItems: 'center', margin: `${space[3]}px 0`, flexWrap: 'wrap' }}>
            <input
              ref={scanRef}
              className="mo-input"
              type="text"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  marcar((e.target as HTMLInputElement).value)
                  ;(e.target as HTMLInputElement).value = ''
                }
              }}
              placeholder="código de barras"
              aria-label="Código de barras"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              style={{ flex: '1 1 240px', maxWidth: 320, height: 46, fontSize: 17, textAlign: 'center', borderWidth: 2, borderColor: color.brandSolid }}
            />
            <Button
              variant="solid"
              tone="brand"
              size="lg"
              onClick={() => {
                if (scanRef.current) {
                  marcar(scanRef.current.value)
                  scanRef.current.value = ''
                  scanRef.current.focus()
                }
              }}
            >
              Marcar
            </Button>
          </div>

          <div style={{ minHeight: 26, marginBottom: space[3] }}>
            {fb?.tipo === 'ok' && (
              <Notice tone="success" icon="✓">
                <div>{fb.it.name} · {fb.it.size}</div>
                <div style={{ marginTop: 2 }}><PrecioEtiqueta it={fb.it} /></div>
              </Notice>
            )}
            {/* 🔑 El que no cruza se GUARDA, y el cartel lo dice. Antes se contestaba «ese código no
                está en la lista» y el dato se perdía: una prenda colgada que no figura con stock en
                el Local es justo lo que después nadie puede reconstruir. */}
            {fb?.tipo === 'sin-stock' && (
              <Notice tone="warning" icon="⚠">
                <div style={{ fontWeight: 700 }}>{fb.e.codigo_crudo} no figura con stock en el Local</div>
                <div>Queda anotado igual, con este lugar: está colgado y el sistema no lo tiene.</div>
              </Notice>
            )}
            {fb?.tipo === 'repetido' && (
              <Notice tone="neutral" icon="↺">
                Ya lo habías escaneado en «{fb.e.lugar}»{fb.it ? ` · ${fb.it.name}` : ''}.
              </Notice>
            )}
          </div>

          {lib.errorMsg && (
            <Notice tone="warning" icon="📡" style={{ marginBottom: space[3] }}>
              <div style={{ fontWeight: 700 }}>Hay {lib.sinSubir} {lib.sinSubir === 1 ? 'escaneo' : 'escaneos'} sin subir</div>
              <div style={{ margin: '2px 0 8px' }}>Seguí escaneando: no se pierde nada, queda guardado en el teléfono hasta que suba. ({lib.errorMsg})</div>
              <Button size="sm" variant="outline" onClick={() => void lib.reintentar()} loading={lib.subiendo}>Reintentar</Button>
            </Notice>
          )}

          <Subtitulo>
            {lib.enEsteLugar} {lib.enEsteLugar === 1 ? 'escaneo acá' : 'escaneos acá'} · {lib.escaneos.length} en el recorrido
            {lib.sinSubir > 0 && ` · ${lib.sinSubir} sin subir`}
          </Subtitulo>
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {deEsteLugar.length ? (
              deEsteLugar.map((e) => <FilaEscaneo key={e.variante_id} e={e} onSacar={lib.sacar} />)
            ) : (
              <div style={{ color: color.mut, padding: 14, textAlign: 'center' }}>
                {lib.lugar.trim() ? 'Nada escaneado en este lugar todavía.' : 'Escribí el lugar y empezá a escanear.'}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Ver uno guardado ── */}
      {fase === 'ver' && viendo && (
        <Card>
          <Notice tone="neutral" icon="📋" style={{ marginBottom: space[4] }}>
            Recorrido del <b>{fechaHora(viendo.recorrido.creado_en)}</b> · {viendo.recorrido.persona || 'sin nombre'} ·{' '}
            <b>{viendo.escaneos.length}</b> {viendo.escaneos.length === 1 ? 'escaneo' : 'escaneos'} ·{' '}
            {viendo.recorrido.estado === 'cerrado' ? 'cerrado' : 'sin cerrar'}
          </Notice>
          {agruparPorLugar(viendo.escaneos).map((g) => (
            <div key={g.lugar} style={{ marginBottom: space[4] }}>
              <Subtitulo>{g.lugar} ({g.escaneos.length})</Subtitulo>
              {g.escaneos.map((e) => <FilaEscaneo key={g.lugar + e.variante_id} e={e} />)}
            </div>
          ))}
        </Card>
      )}
    </>
  )
}

/** El precio que la etiqueta tendría que decir. Gemelo del de `Exhib.tsx`, sobre el escaneo guardado. */
function PrecioEtiqueta({ it }: { it: Pick<ExhibItem, 'precio' | 'promo'> }) {
  const { aCobrar, lista, enOferta, pct } = precioDeGondola(it)
  if (aCobrar == null) return <span style={{ fontSize: font.sm, color: color.mut }}>sin precio en Tienda Nube</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: font['2xl'], fontWeight: weight.bold, color: color.ink }}>{formatMoney(aCobrar)}</span>
      {enOferta && (
        <span style={{ fontSize: font.sm, color: color.mut }}>
          <s>{formatMoney(lista!)}</s> · en oferta −{pct}%
        </span>
      )}
    </span>
  )
}

function Subtitulo({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: font.xs, fontWeight: 700, color: color.mut, marginBottom: space[2] }}>{children}</div>
}

function FilaEscaneo({ e, onSacar }: { e: EscaneoLibre; onSacar?: (e: EscaneoLibre) => void }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 4px', borderBottom: `1px solid ${color.line}`, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 160px', minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: font.base, color: e.encontrado ? color.ink : color.warningInk }}>
          {e.encontrado ? `${e.product_name}${e.size ? ` · ${e.size}` : ''}` : `${e.codigo_crudo} · sin stock en el Local`}
        </div>
        <div style={{ fontSize: font.xs, color: color.mut }}>
          {e.encontrado ? `SKU: ${e.sku || '—'} · Local: ${e.qty ?? '—'}` : 'No cruzó con el inventario'}
          {e.cats.length > 0 && ` · ${e.cats.join(' / ')}`}
        </div>
      </div>
      {onSacar && (
        <Button size="sm" variant="ghost" onClick={() => onSacar(e)}>sacar</Button>
      )}
    </div>
  )
}
