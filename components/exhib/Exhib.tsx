'use client'

import { useMemo, useRef, useState } from 'react'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useSesion } from '@/components/SesionProvider'
import { dispararSyncStock } from '@/lib/sync-gn'
import { generarReporteExhib } from '@/lib/exhib/pdf'
import { contarSinMarcar, exhibId, faltantes, filtrarPorCat, precioDeGondola, sospechososNoExhibidos, tnAdminUrl, agruparPDF } from '@/lib/exhib/core'
import { useColaReetiquetado } from '@/components/etiquetas/useColaReetiquetado'
import { sinEtiquetar } from '@/lib/etiquetas/cola'
import { puedeVer } from '@/lib/permisos'
import type { ExhibItem } from '@/lib/exhib/tipos'
import { useExhib, type ResultadoMarca } from './useExhib'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Button, Card, Field, Input, Notice, Select, color, font, formatMoney, space, useConfirmar, useToast, weight } from '@/components/ui'

type Fase = 'config' | 'scan' | 'triage'

/**
 * El precio que la etiqueta de esta prenda tendría que decir hoy.
 *
 * 🔑 **Va GRANDE y es un solo número.** Quien lo lee está parado en el local con la prenda en una
 * mano y el teléfono en la otra, comparando contra un cartelito de papel: lo único que necesita es
 * "cuánto tiene que decir". El precio de lista aparece tachado al lado **sólo cuando hay oferta**,
 * porque ahí es la explicación de por qué el número cambió — sin oferta sería ruido.
 *
 * Sin dato se dice "sin precio en Tienda Nube" y no un cero: un cero se lee como regalado, y
 * mostrar el de lista cuando no sabemos si hay oferta manda a reimprimir una etiqueta que está bien.
 */
function PrecioEtiqueta({ it }: { it: ExhibItem }) {
  const { aCobrar, lista, enOferta, pct } = precioDeGondola(it)
  if (aCobrar == null) {
    return <span style={{ fontSize: font.sm, color: color.mut }}>sin precio en Tienda Nube</span>
  }
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

/**
 * "👕 Chequeo de exhibición" (key `exhib`).
 *
 * Recorrer el Local con el lector físico confirmando que cada variante con stock está
 * colgada; después triage de faltantes + reporte PDF + registro de categorías a corregir
 * en TN. Read-only sobre Supabase/TN; solo escribe localStorage (mismas claves que el
 * legacy). No escribe stock ni GN.
 *
 * Rediseño jul-2026 (patrón Flujo operativo): las tres fases —configurar, recorrer,
 * faltantes— existían pero no se veían; ahora hay una barra de pasos, así se sabe dónde
 * estás y cuánto falta. El recorrido se hace caminando el local con el lector en la mano,
 * así que es de las pantallas que más importaba llevar al teléfono: el campo de escaneo
 * ocupa el ancho, y los botones de triage tienen tamaño de dedo. Los confirm/alert
 * nativos pasan a diálogos y Toast del kit.
 */
export function Exhib() {
  const { datos } = useDatosMonitor()
  const { marca, perfil } = useSesion()
  const { confirmar } = useConfirmar()
  const toast = useToast()
  const productos = useMemo(() => datos?.allProductos ?? [], [datos])
  const ex = useExhib(marca, productos)

  /**
   * Lo que la cola de reetiquetado deriva acá: prendas **con stock** a las que nadie les hizo la
   * etiqueta días después de cambiarles el precio. Ver `sospechososNoExhibidos`.
   *
   * Sólo se pide con el permiso de Etiquetas, que es de donde sale el dato: sin él la vista
   * contesta 403 y esta pantalla mostraría un error que no es suyo.
   */
  const cola = useColaReetiquetado(marca, puedeVer(perfil, marca, 'etiquetas'))
  // 🔑 El corte se mide contra **cuándo leyó el servidor**, no contra el reloj del navegador: es el
  // mismo dato que la cola muestra en Etiquetas, y sin lectura no hay lista (en vez de un cero que
  // se lee como «no hay ninguna»).
  const pidsSinEtiquetar = useMemo(
    () => (cola.leidoEn ? sinEtiquetar(cola.pendientes, Date.parse(cola.leidoEn)).map((p) => p.pid) : []),
    [cola.pendientes, cola.leidoEn],
  )

  const [fase, setFase] = useState<Fase>('config')
  const [persona, setPersona] = useState('')
  const [catSel, setCatSel] = useState('')
  const [syncLabel, setSyncLabel] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fb, setFb] = useState<ResultadoMarca | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  // Nombre por defecto: el usuario logueado (salvo "local").
  const personaVal = persona || (perfil && perfil.name !== 'local' ? perfil.name : '')

  const lista = useMemo(() => filtrarPorCat(ex.items, catSel), [ex.items, catSel])
  const hechos = useMemo(() => lista.filter((it) => ex.estados[exhibId(it)] === 'exhibido').length, [lista, ex.estados])
  const pendientes = useMemo(() => faltantes(lista, ex.estados), [lista, ex.estados])
  const faltas = pendientes // en triage son lo mismo (los no 'exhibido')
  const sinMarcar = useMemo(() => contarSinMarcar(faltas, ex.estados), [faltas, ex.estados])
  const sospechosos = useMemo(() => sospechososNoExhibidos(faltas, pidsSinEtiquetar), [faltas, pidsSinEtiquetar])
  const enCurso = Object.keys(ex.estados).length

  function foco() {
    setTimeout(() => scanRef.current?.focus(), 150)
  }
  function iniciar() {
    setFase('scan')
    setFb(null)
    foco()
  }
  function marcar(code: string) {
    const c = code.trim()
    if (!c) return
    setFb(ex.marcarPorCodigo(c, catSel))
  }
  function vaAca(pid: string) {
    ex.marcarErrorCat(pid, catSel)
    setFb(null)
  }

  async function reiniciar() {
    if (Object.keys(ex.estados).length || Object.keys(ex.errores).length) {
      const ok = await confirmar({
        titulo: 'Reiniciar el chequeo',
        tono: 'danger',
        ok: 'Borrar y empezar',
        mensaje: `Se borra el chequeo en curso (${enCurso} ${enCurso === 1 ? 'ítem marcado' : 'ítems marcados'}) y se empieza de cero.`,
      })
      if (!ok) return
    }
    ex.reiniciar()
    setFase('config')
  }

  async function traerGN() {
    if (syncLabel) return
    setSyncLabel('Pidiendo a GN…')
    try {
      const done = await dispararSyncStock(marca, setSyncLabel)
      setSyncLabel('Recargando…')
      await ex.recargar()
      if (!done) toast.aviso('La sincronización con GN está tardando más de lo normal. Te muestro lo último disponible.')
      else toast.ok('Inventario actualizado')
    } catch (e) {
      toast.error('No se pudo actualizar: ' + (e as Error).message)
    } finally {
      setSyncLabel(null)
    }
  }

  async function generarPDF() {
    const grupos = agruparPDF(lista, ex.estados)
    if (grupos['sin-marcar'].length) {
      const ok = await confirmar({
        titulo: 'Hay faltantes sin estado',
        tono: 'warning',
        ok: 'Generar igual',
        mensaje: `Tenés ${grupos['sin-marcar'].length} ${grupos['sin-marcar'].length === 1 ? 'faltante' : 'faltantes'} sin cargar estado. Lo ideal es marcar cada uno (Solucionado / Una sola unidad / No se encuentra) antes de terminar.`,
      })
      if (!ok) return
    }
    await generarReporteExhib({ lista, persona: personaVal || '(sin nombre)', catLabel: catSel || 'Todas las categorías', estados: ex.estados, errores: ex.errores, marca })
  }

  return (
    <>
      <HeaderAcciones>
        {fase === 'config' && (
          <>
            <Button variant="outline" onClick={() => void traerGN()} loading={!!syncLabel} title="Trae lo más nuevo de GN (stock y productos recién llegados) y recarga la lista (~2-4 min)">
              {syncLabel || 'Traer de GN'}
            </Button>
            <Button variant="solid" tone="brand" onClick={iniciar} disabled={ex.cargando || !lista.length}>Iniciar recorrido</Button>
          </>
        )}
        {fase === 'scan' && (
          <>
            <Button variant="outline" onClick={() => setFase('config')}>
              Cancelar
            </Button>
            <Button variant="solid" tone="brand" onClick={() => setFase('triage')}>
              Terminar recorrido
            </Button>
          </>
        )}
        {fase === 'triage' && (
          <>
            <Button variant="ghost" onClick={() => void reiniciar()}>
              Reiniciar
            </Button>
            <Button
              variant="outline"
              onClick={() => {
 setFase('scan')
 foco()
 }}
 >
 ← Volver a escanear</Button>
            <Button variant="solid" tone="brand" onClick={() => void generarPDF()}>
              Generar reporte PDF
            </Button>
          </>
        )}
      </HeaderAcciones>

      <Pasos fase={fase} hechos={hechos} total={lista.length} faltantes={faltas.length} />

      {/* ── Configurar ── */}
      {fase === 'config' && (
        <Card>
          {ex.errorMsg ? (
            <Notice tone="danger" icon="⚠" style={{ marginBottom: space[4] }}>
              Error cargando inventario: {ex.errorMsg}
            </Notice>
          ) : ex.cargando ? (
            <Notice tone="neutral" icon="⏳" style={{ marginBottom: space[4] }}>
              Cargando inventario…
            </Notice>
          ) : (
            <Notice tone="warning" icon="📅" style={{ marginBottom: space[4] }}>
              <b>{ex.items.length}</b> variantes con stock en Local. Los datos son de la última sincronización diaria y pueden tener unas horas: conviene chequear en momentos de baja venta.
            </Notice>
          )}

          <div style={{ display: 'flex', gap: space[4], flexWrap: 'wrap', marginBottom: space[4] }}>
            <Field label="Persona" width={220}>
              <Input value={personaVal} onChange={(e) => setPersona(e.target.value)} />
            </Field>
            <Field label="Categoría a recorrer" width={240}>
              <Select value={catSel} onChange={(e) => setCatSel(e.target.value)}>
                <option value="">Todas las categorías</option>
                {ex.cats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <p style={{ fontSize: font.base, color: color.ink2 }}>
            Vas a chequear <b>{lista.length}</b> {lista.length === 1 ? 'variante' : 'variantes'}
            {catSel ? ' de esta categoría' : ''}. Cada una debería estar colgada en el local.
          </p>

          {enCurso > 0 && (
            <Notice tone="brand" icon="↩" style={{ marginTop: space[4] }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
                <span>
                  Hay un chequeo en curso con <b>{enCurso}</b> {enCurso === 1 ? 'ítem marcado' : 'ítems marcados'}.
                </span>
                <Button size="sm" variant="outline" tone="brand" onClick={iniciar}>Retomar</Button>
              </div>
            </Notice>
          )}
        </Card>
      )}

      {/* ── Recorrer ── */}
      {fase === 'scan' && (
        <Card>
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center', marginBottom: space[3], flexWrap: 'wrap' }}>
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
 Marcar</Button>
          </div>

          <div style={{ minHeight: 26, marginBottom: space[4] }}>
            {fb?.tipo === 'no-encontrado' && (
              <Notice tone="danger" icon="✗">
                Ese código no está en la lista ({fb.code})
              </Notice>
            )}
            {fb?.tipo === 'ok' && (
              <Notice tone="success" icon="✓">
                <div>{fb.it.name} · {fb.it.size}</div>
                <div style={{ marginTop: 2 }}>
                  <PrecioEtiqueta it={fb.it} />
                </div>
              </Notice>
            )}
            {fb?.tipo === 'cruce' && (
              <Notice tone="warning" icon="⚠">
                <div style={{ fontWeight: 700 }}>&quot;{fb.it.name}&quot; no es de «{fb.catSel}»</div>
                {/* El precio va también acá: la prenda está en la mano igual, y el cruce de categoría
                    no tiene nada que ver con la etiqueta. Sin esto, controlar el cartelito dependería
                    de que el producto esté bien colgado en TN. */}
                <div style={{ margin: '2px 0' }}>
                  <PrecioEtiqueta it={fb.it} />
                </div>
                <div style={{ margin: '2px 0 8px' }}>En TN figura en «{fb.it.cat}». ¿Qué hacés?</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Button size="sm" variant="solid" tone="brand" onClick={() => vaAca(fb.it.productId)}>
                    Va acá → corregir TN
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setFb(null)}>
                    Es de «{fb.it.cat}», mal colgado
                  </Button>
                </div>
              </Notice>
            )}
          </div>

          <Subtitulo>Pendientes de escanear ({pendientes.length})</Subtitulo>
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {pendientes.length ? (
              pendientes.map((it) => <Fila key={exhibId(it)} it={it} onPreview={setPreview} />)
            ) : (
              <div style={{ color: color.successInk, padding: 14, textAlign: 'center', fontWeight: 600 }}>¡Todo escaneado! 🎉 Tocá &quot;Terminar recorrido&quot;.</div>
            )}
          </div>
        </Card>
      )}

      {/* ── Faltantes ── */}
      {fase === 'triage' && (
        <Card>
          <Subtitulo>Faltantes: marcá qué pasó con cada uno</Subtitulo>

          {/*
            La derivación de la cola de reetiquetado. Va ARRIBA de la lista y no como una columna:
            son pocos y son los que más probablemente no estén colgados, así que la caminata empieza
            por ellos. No los marca como resueltos ni les cambia el estado — la decisión sigue
            siendo de quien recorre.
          */}
          {sospechosos.length > 0 && (
            <Notice tone="warning" icon="🏷️" style={{ margin: `${space[3]}px 0` }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {sospechosos.length === 1 ? 'Una de estas prendas lleva' : `${sospechosos.length} de estas prendas llevan`} días con el precio cambiado y sin etiquetar
              </div>
              <div style={{ fontSize: font.sm }}>
                Tienen stock y nadie les hizo la etiqueta nueva: suele querer decir que no están colgadas en el salón.{' '}
                {sospechosos.slice(0, 10).map((it) => `${it.name}${it.size ? ` · ${it.size}` : ''}`).join(', ')}
                {sospechosos.length > 10 ? ` y ${sospechosos.length - 10} más` : ''}.
              </div>
            </Notice>
          )}

          {Object.keys(ex.errores).length > 0 && (
            <Notice tone="warning" icon="⚠" style={{ margin: `${space[3]}px 0` }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Categorías a corregir en TN ({Object.keys(ex.errores).length})</div>
              {Object.entries(ex.errores).map(([pid, e]) => {
                const url = tnAdminUrl(e.tnId, marca)
                return (
                  <div key={pid} style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${color.warningBorder}` }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{e.name}</div>
                      <div style={{ fontSize: font.xs }}>
                        SKU: {e.sku || '—'} · TN: «{e.catTN}» → debería: «{e.catCorrecta}»
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 'none' }}>
                      {url && (
                        <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: color.brand, fontSize: font.sm, whiteSpace: 'nowrap', fontWeight: 600 }}>
                          Editar en TN ↗
                        </a>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => ex.quitarError(pid)}>
                        quitar
                      </Button>
                    </div>
                  </div>
                )
              })}
            </Notice>
          )}

          <div style={{ maxHeight: 460, overflowY: 'auto', marginBottom: space[3] }}>
            {faltas.length ? (
              faltas.map((it) => <Fila key={exhibId(it)} it={it} triage estado={ex.estados[exhibId(it)]} onEstado={ex.setEstado} onPreview={setPreview} />)
            ) : (
              <div style={{ color: color.successInk, padding: 14, textAlign: 'center', fontWeight: 600 }}>No quedaron faltantes: todo escaneado ✅</div>
            )}
          </div>

          {sinMarcar ? (
            <Notice tone="warning" icon="⚠">
              Te faltan marcar <b>{sinMarcar}</b> de {faltas.length} faltantes antes de generar el reporte.
            </Notice>
          ) : faltas.length ? (
            <Notice tone="success" icon="✓">
              Todos los faltantes tienen estado. Listo para el reporte.
            </Notice>
          ) : null}
        </Card>
      )}

      {preview && (
        <div onClick={() => setPreview(null)} className="mo-backdrop" style={{ cursor: 'zoom-out', background: 'rgba(16,24,40,.88)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" style={{ maxWidth: '96%', maxHeight: '96%', borderRadius: 8 }} />
        </div>
      )}
    </>
  )
}

/** Las tres fases del recorrido, visibles. Antes existían pero no se anunciaban. */
function Pasos({ fase, hechos, total, faltantes }: { fase: Fase; hechos: number; total: number; faltantes: number }) {
  const pasos: { id: Fase; label: string; detalle?: string }[] = [
    { id: 'config', label: 'Configurar', detalle: total ? `${total} variantes` : undefined },
    { id: 'scan', label: 'Recorrer', detalle: fase !== 'config' ? `${hechos}/${total}` : undefined },
    { id: 'triage', label: 'Faltantes', detalle: fase === 'triage' ? String(faltantes) : undefined },
  ]
  const idx = pasos.findIndex((p) => p.id === fase)
  return (
    <div style={{ display: 'flex', gap: space[2], marginBottom: space[4], flexWrap: 'wrap' }}>
      {pasos.map((p, i) => {
        const activo = i === idx
        const hecho = i < idx
        return (
          <div
            key={p.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 14px',
              borderRadius: 999,
              fontSize: font.sm,
              fontWeight: 600,
              color: activo ? '#fff' : hecho ? color.successInk : color.mut,
              background: activo ? color.brandSolid : hecho ? color.successBg : color.bg2,
              border: `1px solid ${activo ? color.brandSolid : hecho ? color.successBorder : color.line}`,
            }}
          >
            <span aria-hidden style={{ opacity: 0.85 }}>
              {hecho ? '✓' : i + 1}
            </span>
            {p.label}
            {p.detalle && <span style={{ opacity: 0.8, fontWeight: 500 }}>· {p.detalle}</span>}
          </div>
        )
      })}
    </div>
  )
}

function Subtitulo({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: font.xs, fontWeight: 700, color: color.mut, letterSpacing: 0, marginBottom: space[2] }}>{children}</div>
}

function Fila({ it, triage, estado, onEstado, onPreview }: { it: ExhibItem; triage?: boolean; estado?: string; onEstado?: (id: string, e: 'solucionado' | 'una-unidad' | 'no-encuentra') => void; onPreview: (u: string) => void }) {
  const id = exhibId(it)
  const btn = (est: 'solucionado' | 'una-unidad' | 'no-encuentra', txt: string, tone: 'action' | 'warning' | 'danger') => (
    <Button size="sm" variant={estado === est ? 'solid' : 'outline'} tone={estado === est ? tone : 'neutral'} onClick={() => onEstado?.(id, est)}>
      {txt}
    </Button>
  )
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 4px', borderBottom: `1px solid ${color.line}`, flexWrap: 'wrap' }}>
      {it.img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={it.img} loading="lazy" onClick={() => onPreview(it.img!)} title="Tocá para verla grande" alt="" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 6, background: color.bg2, flex: 'none', cursor: 'zoom-in' }} />
      ) : (
        <div style={{ width: 46, height: 46, borderRadius: 6, background: color.bg2, flex: 'none' }} />
      )}
      <div style={{ flex: '1 1 160px', minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: font.base, color: color.ink }}>
          {it.name} · {it.size}
        </div>
        <div style={{ fontSize: font.xs, color: color.mut }}>
          SKU: {it.sku || '—'} · Local: {it.qty}
        </div>
      </div>
      {triage && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 'none' }}>
          {btn('solucionado', 'Solucionado', 'action')}
          {btn('una-unidad', 'Una sola unidad', 'warning')}
          {btn('no-encuentra', 'No se encuentra', 'danger')}
        </div>
      )}
    </div>
  )
}
