'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useGenTalles } from './useGenTalles'
import { extraerTabla, tablaActualHtml } from './tabla-dom'
import {
  computarPendientes,
  emparejarMedidas,
  filtrarPendientes,
  generarHtml,
  limpiarData,
  parseTalles,
  tipoDesdeNombre,
  type FiltrosPendientes,
} from '@/lib/gen-talles/core'
import { GEN_TALLES_PLANTILLAS, type TablaGuardada } from '@/lib/gen-talles/plantillas'
import type { TnProducto } from '@/lib/tn'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Button, Card, Field, Input, Select, color, font, space, useConfirmar, useToast } from '@/components/ui'

const PRIMER_TIPO = Object.keys(GEN_TALLES_PLANTILLAS)[0] // 'top', como la 1ª opción del legacy

export function GenTalles() {
  const { marca, perfil } = useSesion()
  /**
   * 🔴 **Escribir en la tienda desde acá pide su propio permiso desde el 1-sep-2026.** Lo decidió
   * Bruno: las que cargan —Camila Quintana y Josefina Batter— ⛔ no publican; publica
   * administración, o él y Darío. Y las dos tenían `gen-talles` tildado **desde el día uno**, o
   * sea que este botón les escribía en la tienda viva sin que nadie lo hubiera decidido.
   *
   * ⚠️ El botón **⛔ no se esconde**: se deshabilita y dice por qué. Una pantalla que se guarda un
   * botón sin explicarlo manda a buscar algo que no está — que es la misma trampa que la entrada
   * de menú que se dibujaba y rebotaba a Inicio.
   *
   * 📌 Esto es un candado de PANTALLA. El pedido que escribe sale del navegador derecho a
   * `bdi-catalogo`, que es otro repo y otro deploy, así que el candado del servidor va allá.
   */
  const puedeEscribirEnTienda = esAdmin(perfil) || puedeSub(perfil, marca, 'gen-talles', 'publicar')
  const gt = useGenTalles(marca)
  const { datos } = useDatosMonitor()
  const { confirmar, avisar } = useConfirmar()
  const toast = useToast()

  const [tipo, setTipo] = useState<string>(PRIMER_TIPO)
  const [tallesStr, setTallesStr] = useState<string>(GEN_TALLES_PLANTILLAS[PRIMER_TIPO].talles.join(', '))
  const [gtData, setGtData] = useState<Record<string, string>>({})
  const [elegido, setElegido] = useState<TnProducto | null>(null)
  const [cargandoTN, setCargandoTN] = useState(false)

  const plantilla = GEN_TALLES_PLANTILLAS[tipo]
  const talles = useMemo(() => parseTalles(tallesStr), [tallesStr])
  const html = useMemo(() => generarHtml(plantilla, talles, gtData), [plantilla, talles, gtData])

  // Cambiar de tipo: resetea talles al default de la plantilla y limpia la grilla.
  const onTipo = (k: string) => {
    setTipo(k)
    setTallesStr(GEN_TALLES_PLANTILLAS[k].talles.join(', '))
    setGtData({})
  }
  // Cambiar los talles: limpia las claves de gtData que ya no correspondan.
  const onTalles = (v: string) => {
    setTallesStr(v)
    setGtData((prev) => limpiarData(prev, plantilla, parseTalles(v)))
  }
  const onCell = (talle: string, letra: string, val: string) => setGtData((prev) => ({ ...prev, [talle + '|' + letra]: val }))

  const onElegir = (p: TnProducto) => {
    setElegido(p)
    const tk = tipoDesdeNombre(p.name || '', GEN_TALLES_PLANTILLAS)
    if (tk) onTipo(tk)
  }

  const onCargarGuardada = () => {
    if (!elegido) return
    const s = gt.guardadas[String(elegido.id)]
    if (!s) return
    setTipo(s.tipo || 'remera')
    setTallesStr(s.talles || '')
    setGtData({ ...(s.gtData || {}) })
  }

  const onImportar = async () => {
    if (!elegido) return
    const ext = extraerTabla(elegido.raw_desc)
    if (!ext) {
      await avisar('No pude leer la tabla. Cargá los datos a mano desde la tabla de arriba.')
      return
    }
    setTallesStr(ext.talles.join(', '))
    setGtData(emparejarMedidas(ext.talles, ext.medidas, plantilla))
    // Aviso y no Toast: hay que REVISAR antes de escribir en TN, así que conviene que
    // pida un clic en vez de irse solo a los cinco segundos.
    await avisar({
      titulo: 'Datos recuperados',
      mensaje: `Se cargaron sobre el tipo "${plantilla.nombre}". Revisá que cada medida haya quedado en su columna antes de mandarla a Tienda Nube.`,
    })
  }

  const guardarActual = async (): Promise<boolean> => {
    if (!elegido) return false
    const tabla: TablaGuardada = { tipo, talles: tallesStr, gtData: { ...gtData }, name: elegido.name || '', ts: new Date().toISOString() }
    return gt.guardarVinculado(String(elegido.id), tabla)
  }

  const onCopiar = async () => {
    try {
      await navigator.clipboard.writeText(html)
      toast.ok('HTML copiado: pegalo en la descripción del producto')
    } catch {
      toast.error('No se pudo copiar automáticamente.')
    }
  }

  const onCargarEnTN = async () => {
    // El botón ya está deshabilitado; esto es el segundo cerrojo, para que un camino nuevo a esta
    // función no se salte la regla sin que nadie lo note.
    if (!puedeEscribirEnTienda) {
      await avisar('Escribir la tabla en la tienda lo hace administración. Podés copiar el HTML y pasárselo.')
      return
    }
    if (!elegido) {
      await avisar('Elegí un producto primero.')
      return
    }
    const ok = await confirmar({
      titulo: 'Cargar la tabla en Tienda Nube',
      tono: 'brand',
      ok: 'Cargar en TN',
      mensaje: `Se escribe en la descripción de "${elegido.name}". No se elimina el resto de la descripción; si ya tenía una tabla nuestra, se reemplaza.`,
    })
    if (!ok) return
    setCargandoTN(true)
    const r = await gt.cargarEnTN(elegido.id!, html)
    if (!r.ok) {
      toast.error('No se pudo cargar en TN. ' + (r.error || ''))
      setCargandoTN(false)
      return
    }
    await guardarActual()
    const fresco = await gt.refrescarAudit(elegido.id)
    if (fresco) setElegido(fresco)
    toast.ok(r.accion === 'reemplazada' ? 'Tabla actualizada en Tienda Nube' : 'Tabla cargada en Tienda Nube')
    setCargandoTN(false)
  }

  const tablaActual = elegido ? tablaActualHtml(elegido.raw_desc) : null

  return (
    <>
      <HeaderAcciones>
        <Button variant="outline" onClick={() => void onCopiar()}>
          Copiar HTML
        </Button>
        {elegido && (
          <Button
            variant="solid"
            tone="brand"
            onClick={() => void onCargarEnTN()}
            loading={cargandoTN}
            disabled={!puedeEscribirEnTienda}
            title={puedeEscribirEnTienda ? undefined : 'Escribir en la tienda lo hace administración. Copiá el HTML y pasáselo.'}
          >
            {cargandoTN ? 'Cargando…' : 'Cargar en TN'}
          </Button>
        )}
      </HeaderAcciones>

      {marca === 'zattia' && (
        <PendientesCard
          productos={(datos?.allProductos ?? []) as { name?: string | null; sku?: string | null; stock?: number; ingresoMes?: string | null }[]}
          idx={gt.tnIdx}
          guardadas={gt.guardadas}
          elegidoId={elegido?.id}
          onElegir={onElegir}
        />
      )}

      <Card style={{ marginBottom: space[4] }}>
        <div style={{ display: 'flex', gap: space[4], flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: space[4] }}>
          <Field label="Tipo de prenda" width={190}>
            <Select value={tipo} onChange={(e) => onTipo(e.target.value)}>
              {Object.entries(GEN_TALLES_PLANTILLAS).map(([k, p]) => (
                <option key={k} value={k}>{p.nombre}</option>
              ))}
            </Select>
          </Field>
          <Field label="Talles (separados por coma)" width={280}>
            <Input value={tallesStr} onChange={(e) => onTalles(e.target.value)} />
          </Field>
        </div>

        <div style={{ borderTop: `1px solid ${color.line}`, margin: `${space[2]}px 0 ${space[4]}px`, paddingTop: space[3] }}>
          <Subtitulo>Vincular a un producto de Tienda Nube (opcional)</Subtitulo>
          <VincularProducto
            productos={gt.tnProducts}
            elegido={elegido}
            tieneGuardada={!!(elegido && gt.guardadas[String(elegido.id)])}
            tipoDetectado={elegido ? (tipoDesdeNombre(elegido.name || '', GEN_TALLES_PLANTILLAS) ? plantilla.nombre : null) : null}
            onElegir={onElegir}
            onCargarGuardada={onCargarGuardada}
          />
          {elegido && (
            <div style={{ marginTop: 10 }}>
              {tablaActual ? (
                <>
                  <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[2] }}>Tabla actual del producto en TN:</div>
                  <div style={{ border: `1px solid ${color.line}`, borderRadius: 'var(--mo-r-md)', padding: 10, overflowX: 'auto', background: color.surface }} dangerouslySetInnerHTML={{ __html: tablaActual }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', marginTop: space[2] }}>
                    <Button size="sm" variant="outline" onClick={() => void onImportar()}>
                      Recuperar datos de esta tabla
                    </Button>
                    <span style={{ fontSize: font.xs, color: color.mut2 }}>Si no se carga bien, copiá los números a mano desde la tabla de arriba.</span>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: font.sm, color: color.mut2 }}>Este producto todavía no tiene tabla en su descripción.</div>
              )}
            </div>
          )}
        </div>

        <Subtitulo>Cargá las medidas</Subtitulo>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thGrid}>Talle</th>
                {plantilla.medidas.map((m) => (
                  <th key={m.letra} style={thGrid}>{m.nombre} ({m.letra})</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {talles.map((t) => (
                <tr key={t}>
                  <td style={{ padding: '6px 8px', border: `1px solid ${color.line}`, fontWeight: 600, textAlign: 'center', background: color.bg }}>{t}</td>
                  {plantilla.medidas.map((m) => (
                    <td key={m.letra} style={{ padding: 3, border: `1px solid ${color.line}` }}>
                      <input
                        className="mo-input"
                        inputMode="decimal"
                        aria-label={`${m.nombre} del talle ${t}`}
                        value={gtData[t + '|' + m.letra] || ''}
                        onChange={(e) => onCell(t, m.letra, e.target.value)}
                        style={{ width: 68, textAlign: 'center', padding: '0 4px', height: 32 }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: space[3], flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: font.md, fontWeight: 700, color: color.ink }}>Vista previa</h2>
          <span style={{ color: color.mut2, fontSize: font.sm }}>así se va a ver en Tienda Nube</span>
        </div>
        <div style={{ border: `1px dashed ${color.line2}`, borderRadius: 'var(--mo-r-lg)', padding: 16, background: color.surface }} dangerouslySetInnerHTML={{ __html: html }} />
      </Card>
    </>
  )
}

function Subtitulo({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: font.xs, fontWeight: 700, color: color.mut, letterSpacing: 0, marginBottom: space[2] }}>{children}</div>
}

function VincularProducto({
  productos,
  elegido,
  tieneGuardada,
  tipoDetectado,
  onElegir,
  onCargarGuardada,
}: {
  productos: TnProducto[]
  elegido: TnProducto | null
  tieneGuardada: boolean
  tipoDetectado: string | null
  onElegir: (p: TnProducto) => void
  onCargarGuardada: () => void
}) {
  const [q, setQ] = useState('')
  const matches = useMemo(() => {
    const qq = q.trim().toLowerCase()
    if (qq.length < 2) return []
    return productos.filter((p) => (p.name || '').toLowerCase().includes(qq) || (p.sku || '').toLowerCase().includes(qq)).slice(0, 8)
  }, [q, productos])

  return (
    <div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto por nombre o SKU…" style={{ maxWidth: 520 }} />
      {q.trim().length >= 2 && (
        <div style={{ marginTop: 6 }}>
          {matches.length ? (
            matches.map((p) => (
              <Button
                key={String(p.id)}
                size="sm"
                variant="outline"
                fullWidth
                style={{ justifyContent: 'flex-start', marginBottom: 4 }}
                onClick={() => {
 onElegir(p)
 setQ('')
 }}
 >
 {p.name}{p.sku ? ' · ' + p.sku : ''}</Button>
            ))
          ) : (
            <div style={{ fontSize: font.sm, color: color.mut2 }}>Sin resultados.</div>
          )}
        </div>
      )}
      {elegido && (
        <div style={{ marginTop: space[2], fontSize: font.base, display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          <span>
            Producto: <strong style={{ color: color.ink }}>{elegido.name}</strong>
          </span>
          {tipoDetectado && <span style={{ color: color.successInk }}>· tipo detectado: {tipoDetectado}</span>}
          {tieneGuardada && (
            <Button size="sm" variant="outline" onClick={onCargarGuardada}>↺ Cargar la guardada</Button>
          )}
        </div>
      )}
    </div>
  )
}

function PendientesCard({
  productos,
  idx,
  guardadas,
  elegidoId,
  onElegir,
}: {
  productos: { name?: string | null; sku?: string | null; stock?: number; ingresoMes?: string | null }[]
  idx: ReturnType<typeof useGenTalles>['tnIdx']
  guardadas: Record<string, TablaGuardada>
  elegidoId?: string | number
  onElegir: (p: TnProducto) => void
}) {
  const [estado, setEstado] = useState<FiltrosPendientes['estado']>('todas')
  const [categoria, setCategoria] = useState('')
  const [mes, setMes] = useState('')
  const [soloStock, setSoloStock] = useState(true)

  const base = useMemo(() => computarPendientes(productos, idx, guardadas), [productos, idx, guardadas])
  const cats = useMemo(() => [...new Set(base.flatMap((x) => x.categoriasTN))].sort((a, b) => a.localeCompare(b, 'es')), [base])
  const meses = useMemo(() => [...new Set(base.map((x) => x.ingresoMes).filter((m): m is string => !!m))].sort().reverse(), [base])
  const items = useMemo(() => filtrarPendientes(base, { estado, categoria, mes, soloStock }), [base, estado, categoria, mes, soloStock])

  return (
    <Card style={{ marginBottom: space[4] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: space[2], marginBottom: space[3] }}>
        <div>
          <div style={{ fontSize: font.lg, fontWeight: 700, color: color.ink }}>Pendientes de tabla de talles</div>
          <div style={{ fontSize: font.sm, color: color.mut, marginTop: 2 }}>Productos sin nuestra tabla nueva (vieja o sin tabla). Elegí uno para actualizarlo abajo.</div>
        </div>
        <span style={{ fontSize: font.sm, color: color.mut, whiteSpace: 'nowrap' }}>
          {items.length} {items.length === 1 ? 'pendiente' : 'pendientes'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: space[3] }}>
        <Field label="Estado" width={170}>
          <Select value={estado} onChange={(e) => setEstado(e.target.value as FiltrosPendientes['estado'])}>
            <option value="todas">A migrar (todas)</option>
            <option value="vieja">Tabla vieja</option>
            <option value="sin">Sin tabla</option>
          </Select>
        </Field>
        <Field label="Categoría" width={190}>
          <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas las categorías</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Mes de ingreso" width={170}>
          <Select value={mes} onChange={(e) => setMes(e.target.value)}>
            <option value="">Todos los meses</option>
            {meses.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <label style={{ fontSize: font.sm, color: color.mut, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', paddingBottom: 8 }}>
          <input type="checkbox" checked={soloStock} onChange={(e) => setSoloStock(e.target.checked)} style={{ accentColor: 'var(--mo-brand-solid)' }} /> Solo con stock
        </label>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {items.length ? (
          items.map((x) => {
            const hl = elegidoId != null && x.tn.id === elegidoId
            const cat = x.categoriasTN[0] ? ' · ' + x.categoriasTN[0] : ''
            return (
              <Button
                key={String(x.tn.id)}
                size="sm"
                variant={hl ? 'soft' : 'outline'}
                tone={hl ? 'success' : 'neutral'}
                fullWidth
                style={{ justifyContent: 'flex-start', marginBottom: 4 }}
                onClick={() => onElegir(x.tn)}
              >
                {x.nombre} <span style={{ color: color.mut2 }}>· stock {x.stock}{cat}</span>
                {x.tablaVieja ? (
                  <span style={{ color: color.warningInk, fontSize: font.xs }}> · tabla vieja</span>
                ) : (
                  <span style={{ color: color.danger, fontSize: font.xs }}> · sin tabla</span>
                )}
              </Button>
            )
          })
        ) : (
          <div style={{ fontSize: font.sm, color: color.mut2 }}>No hay pendientes con esos filtros 🎉</div>
        )}
      </div>
    </Card>
  )
}

const thGrid: CSSProperties = { padding: '6px 8px', border: `1px solid ${color.line}`, background: color.bg2, fontSize: font.sm, whiteSpace: 'nowrap', color: color.mut }
