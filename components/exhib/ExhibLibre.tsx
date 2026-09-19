'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Button, Card, Field, Input, Notice, color, font, formatMoney, space, useConfirmar, useToast, weight } from '@/components/ui'
import { descargarXlsx } from '@/lib/excel'
import { exhibId, precioDeGondola } from '@/lib/exhib/core'
import { leerRecorrido, leerRecorridos } from '@/lib/exhib/cliente'
import { agruparPorLugar, ANCHOS_EXPORT, filasExport, hallazgoDe, type EscaneoLibre, type RecorridoLibre } from '@/lib/exhib/libre'
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

export function ExhibLibre({ items, buscables, enCero, cargando, errorMsg, selector }: { items: ExhibItem[]; buscables: ExhibItem[]; enCero: number; cargando: boolean; errorMsg: string | null; selector: React.ReactNode }) {
  const { marca } = useSesion()
  const { confirmar } = useConfirmar()
  const toast = useToast()
  // 🔑 El lector engancha contra TODO el Local —`buscables`—, ⛔ no contra lo que tiene stock: una
  // prenda colgada que el sistema tiene en cero es un hallazgo, y antes caía en «no cruzó».
  const lib = useExhibLibre(marca, buscables)

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
      // 🔑 «Ese recorrido no está» ⛔ no es una falla: pasa cuando nunca llegó a subir (sin señal),
      // y el borrador del teléfono ya se limpió igual. Cortar acá dejaba la pantalla trabada en el
      // recorrido, con un cartel rojo, sobre algo que sí se eliminó.
      const msg = (e as Error).message
      if (!/no está/i.test(msg)) toast.error('No se pudo eliminar: ' + msg)
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
              Tenés <b>{items.length}</b> variantes con stock en Local contra las que cruzar
              {/* 🔑 Las en cero se dicen acá: son la mitad del salón y **también se pueden escanear**.
                  Callarlas dejaba creer que una prenda sin stock no se podía registrar. */}
              {enCero > 0 && <> · <b>{enCero}</b> más figuran en cero y también se pueden escanear</>}.
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
          <Field label="¿En qué lugar estás?" hint="Por ejemplo: perchero tops. Cuando termines de escribirlo, tocá Enter y ya podés escanear." width={320}>
            <Input
              ref={lugarRef}
              value={lib.lugar}
              onChange={(e) => lib.setLugar(e.target.value)}
              /*
               * 🔴 **El lector de códigos TIPEA, y termina con Enter.** Si el foco quedó acá, el
               * código de barras entra como si fuera el nombre del lugar: el escaneo se pierde y
               * ⛔ nadie se entera —no hay error, el campo simplemente dice «7790001234567»—. Por
               * eso Enter y salir del campo mandan el foco al escaneo, que es donde tiene que
               * estar todo el tiempo que se camina.
               */
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  foco(scanRef)
                }
              }}
              onBlur={() => lib.lugar.trim() && foco(scanRef)}
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
            {/* 🔑 La prenda EN CERO es un hallazgo con nombre y apellido, ⛔ no un código huérfano:
                existe, está colgada, y el sistema la tiene en cero. Hasta el 19-sep-2026 el lector
                ni siquiera la encontraba y caía en «no cruzó», junto con las lecturas malas. */}
            {fb?.tipo === 'stock-cero' && (
              <Notice tone="warning" icon="⚠">
                <div style={{ fontWeight: 700 }}>{fb.it.name}{fb.it.size ? ` · ${fb.it.size}` : ''} — el sistema la tiene en CERO</div>
                <div style={{ margin: '2px 0' }}><PrecioEtiqueta it={fb.it} /></div>
                <div>Queda anotada con este lugar: está colgada y el stock está mal.</div>
              </Notice>
            )}
            {/* 🔑 El que no cruza se GUARDA, y el cartel lo dice. Antes se contestaba «ese código no
                está en la lista» y el dato se perdía: una prenda colgada que no figura en el Local
                es justo lo que después nadie puede reconstruir. */}
            {fb?.tipo === 'no-cruzo' && (
              <Notice tone="warning" icon="⚠">
                <div style={{ fontWeight: 700 }}>{fb.e.codigo_crudo} no cruzó con el inventario del Local</div>
                <div>
                  {fb.parecidos
                    ? `Queda anotado igual. Hay ${fb.parecidos} códigos parecidos: si fue una lectura a medias, escaneá de nuevo o tipealo completo.`
                    : 'Queda anotado igual, con este lugar: está colgado y el sistema no lo tiene.'}
                </div>
              </Notice>
            )}
            {/*
              🔴 **El único cartel que todavía NO guardó nada.** `buscarItem` sigue pidiendo el
              código completo —aflojarlo engancharía la prenda equivocada, que es peor—, así que lo
              parcial se muestra y confirma la persona, que tiene la prenda en la mano.
              ⚠️ Si llega otro escaneo o se cierra el recorrido sin tocar nada, esto se guarda solo
              como «no cruzó»: preguntar ⛔ no puede costar un escaneo.
            */}
            {fb?.tipo === 'candidatos' && (
              <Notice tone="brand" icon="?">
                <div style={{ fontWeight: 700 }}>«{fb.codigo}» no es un código completo. ¿Es alguna de éstas?</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0' }}>
                  {fb.candidatos.map((c) => (
                    <Button
                      key={exhibId(c)}
                      size="sm"
                      variant="outline"
                      tone="brand"
                      // `height:auto` + `white-space:normal`: `.shell-content button` fija altura y
                      // `.mo-btn` es `nowrap`, así que un nombre largo se saldría de la caja en el
                      // teléfono, que es donde se usa esto.
                      style={{ height: 'auto', whiteSpace: 'normal', textAlign: 'left', justifyContent: 'flex-start', padding: '8px 10px' }}
                      onClick={() => {
                        setFb(lib.confirmar(c, fb.codigo, fb.lugar))
                        foco(scanRef)
                      }}
                    >
                      {c.name}{c.size ? ` · ${c.size}` : ''} — {c.sku || 'sin SKU'}{c.barcode ? ` · ${c.barcode}` : ''} · Local: {c.qty}
                    </Button>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setFb(lib.descartar(fb.codigo, fb.lugar))
                    foco(scanRef)
                  }}
                >
                  Ninguna de éstas
                </Button>
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
  // 🔑 El mismo `hallazgoDe` que escribe la columna del Excel: la pantalla y la planilla ⛔ no
  // pueden decir cosas distintas de la misma prenda.
  const hallazgo = hallazgoDe(e)
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 4px', borderBottom: `1px solid ${color.line}`, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 160px', minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: font.base, color: hallazgo ? color.warningInk : color.ink }}>
          {e.encontrado ? `${e.product_name}${e.size ? ` · ${e.size}` : ''}` : `${e.codigo_crudo} · no cruzó`}
          {hallazgo && <span style={{ fontSize: font.xs, fontWeight: 700, marginLeft: 6 }}>· {hallazgo}</span>}
        </div>
        <div style={{ fontSize: font.xs, color: color.mut }}>
          {e.encontrado ? `SKU: ${e.sku || '—'} · Local: ${e.qty ?? '—'}` : 'No cruzó con el inventario del Local'}
          {e.cats.length > 0 && ` · ${e.cats.join(' / ')}`}
        </div>
      </div>
      {onSacar && (
        <Button size="sm" variant="ghost" onClick={() => onSacar(e)}>sacar</Button>
      )}
    </div>
  )
}
