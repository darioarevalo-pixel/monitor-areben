'use client'

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useTnPromo } from '@/components/productos/useTnImages'
import { esAdmin as esAdminFn, puedeSub } from '@/lib/permisos'
import { ponerPuenteAsignar } from '@/lib/tncat/puente'
import { credencialConPrompt } from '@/lib/sesion'
import { matchTn, type IndiceTn } from '@/lib/tn'
import { useComisiones } from './useComisiones'
import {
  armarItemSale,
  canales as canalesDe,
  markupDePvp,
  pvpDeMarkup,
  redondear90,
} from '@/lib/comisiones/core'
import { exportarSalePDF, exportarSaleXLSX } from '@/lib/comisiones/export'
import type { Celda, ComCfg } from '@/lib/comisiones/tipos'
// Las cuatro piezas del simulador viven aparte: las usa también el modal de Liquidación.
import { Breakeven, Detalle, MatrizSim, Piso } from './simulador'
import type { Producto } from '@/lib/etl/tipos'
import { Button, Card, color, font, space, useConfirmar, useToast } from '@/components/ui'
import { InfoPopover } from '@/components/ui/InfoPopover'

/** Credencial para los guardados admin. A nivel módulo: es estable entre renders. */
const obtenerCred = () => credencialConPrompt('del Monitor')

const CELDA_DEF: Celda = { comision: 0, finan: 0, dias: 0, descuento: 0, aplicaImp: true }
const num = (s: string) => parseFloat(s) || 0

export function Comisiones() {
  const { avisar, confirmar, pedirTexto } = useConfirmar()
  const toast = useToast()
  const router = useRouter()
  const { marca, perfil } = useSesion()
  const admin = esAdminFn(perfil)
  // La asignación masiva por lista existe sólo en Zattia y detrás de su sub-permiso: el botón
  // aparece con la misma condición con la que la card existe del otro lado, así que no puede
  // llevar a una pantalla donde no esté (el legacy navegaba igual y avisaba después).
  const verAsig = marca === 'zattia' && (admin || puedeSub(perfil, marca, 'tncat', 'asignar'))
  const { datos } = useDatosMonitor()
  const tnIdx = useTnPromo(marca)
  const com = useComisiones(marca, admin, obtenerCred)
  const { cfg, guardar } = com

  const cans = useMemo(() => canalesDe(marca === 'zattia'), [marca])
  const [canalSel, setCanalSel] = useState(cans[0])
  const canal = cans.includes(canalSel) ? canalSel : cans[0]

  const [costo, setCosto] = useState('')
  const [markup, setMarkup] = useState('')
  const [pvp, setPvp] = useState('')
  const [prodSel, setProdSel] = useState<Producto | null>(null)
  const [detalle, setDetalle] = useState<{ forma: string; canal: string } | null>(null)
  const [pisoObj, setPisoObj] = useState('40')

  // Inputs vinculados: costo + (markup ⇄ PVP).
  const onMarkup = (v: string) => {
    setMarkup(v)
    const c = num(costo)
    const mk = parseFloat(v)
    if (c > 0 && mk >= 0) setPvp(String(pvpDeMarkup(c, mk)))
  }
  const onPvp = (v: string) => {
    setPvp(v)
    const c = num(costo)
    const p = parseFloat(v)
    if (c > 0 && p > 0) setMarkup(String(markupDePvp(c, p)))
  }
  const onCosto = (v: string) => {
    setCosto(v)
    const c = parseFloat(v)
    if (markup !== '' && c > 0 && parseFloat(markup) >= 0) setPvp(String(pvpDeMarkup(c, parseFloat(markup))))
    else {
      const p = num(pvp)
      if (c > 0 && p > 0) setMarkup(String(markupDePvp(c, p)))
    }
  }
  const simularPrecio = (precio: number) => {
    setPvp(String(Math.round(precio)))
    const c = num(costo)
    if (c > 0 && precio > 0) setMarkup(String(markupDePvp(c, precio)))
  }

  // ── Mutadores de config (clonan y persisten) ──
  const setImp = (k: keyof ComCfg['imp'], v: string) => guardar({ ...cfg, imp: { ...cfg.imp, [k]: num(v) } })
  const setSaldo = (on: boolean) => guardar({ ...cfg, saldoIva: on })
  const setCostoCanal = (patch: Partial<ComCfg['costoCanal'][string]>) =>
    guardar({ ...cfg, costoCanal: { ...cfg.costoCanal, [canal]: { ...(cfg.costoCanal[canal] || { valor: 0, tipo: '$' }), ...patch } } })
  const setCelda = (forma: string, campo: keyof Celda, v: number | boolean) => {
    const cel = { ...(cfg.matriz[canal]?.[forma] || CELDA_DEF), [campo]: v }
    guardar({ ...cfg, matriz: { ...cfg.matriz, [canal]: { ...cfg.matriz[canal], [forma]: cel } } })
  }
  const addForma = async () => {
    const nombre = ((await pedirTexto('Nombre de la forma de pago', '', { titulo: 'Nueva forma de pago', ok: 'Agregar' })) || '').trim()
    if (!nombre) return
    if (cfg.formas.includes(nombre)) return void avisar('Ya existe esa forma de pago.')
    const matriz = { ...cfg.matriz }
    cans.forEach((c) => (matriz[c] = { ...matriz[c], [nombre]: { ...CELDA_DEF } }))
    guardar({ ...cfg, formas: [...cfg.formas, nombre], matriz })
  }
  const removeForma = async (forma: string) => {
    const ok = await confirmar({
      titulo: 'Quitar la forma de pago',
      tono: 'danger',
      ok: 'Quitar',
      mensaje: `Se borra "${forma}" y sus comisiones cargadas en todos los canales.`,
    })
    if (!ok) return
    const matriz = { ...cfg.matriz }
    cans.forEach((c) => {
      const m = { ...matriz[c] }
      delete m[forma]
      matriz[c] = m
    })
    guardar({ ...cfg, formas: cfg.formas.filter((f) => f !== forma), matriz })
  }

  const costoN = parseFloat(costo)
  const pvpN = parseFloat(pvp)
  const simListo = costoN >= 0 && pvpN > 0

  return (
    <div>
      {/* PARTE 1: CONFIGURACIÓN */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
          <TituloCard texto="1 · Configuración" info="La configuración">
            Los números con los que se calcula todo lo de abajo: los impuestos y, para cada canal, la
            comisión, el costo financiero, el descuento y los días de acreditación de cada forma de pago.
            <b> La config es una sola para todo el equipo</b>: la guarda un admin y el resto la ve (el cartel
            de la derecha avisa si se guardó). <b>Saldo IVA ACTIVO</b> quiere decir que el IVA de la venta se
            recupera contra saldo a favor y no toca el margen; en <b>AGOTADO</b> se descuenta y el margen baja.
          </TituloCard>
          <span style={{ fontSize: 11, color: com.shareStatus.color }}>{com.shareStatus.txt}</span>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
          {(['iva', 'iibb', 'drei', 'ganancias'] as const).map((k) => (
            <label key={k} style={lbl}>
              {k === 'ganancias' ? 'Ganancias' : k.toUpperCase()} %<br />
              <input type="number" step={0.1} value={cfg.imp[k]} onChange={(e) => setImp(k, e.target.value)} className="mo-input mo-input--num" style={{ width: 80 }} />
            </label>
          ))}
          <label style={{ fontSize: 12, color: '#444', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: color.bg2, borderRadius: 8, cursor: 'pointer' }}>
            <input type="checkbox" style={{ accentColor: "var(--mo-brand-solid)" }} checked={cfg.saldoIva} onChange={(e) => setSaldo(e.target.checked)} /> Saldo IVA a favor <b>{cfg.saldoIva ? 'ACTIVO' : 'AGOTADO'}</b>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10, borderTop: `1px solid ${color.line}`, paddingTop: 12 }}>
          <label style={lbl}>Canal<br />
            <select value={canal} onChange={(e) => setCanalSel(e.target.value)} className="mo-select" style={{ minWidth: 140 }}>
              {cans.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={lbl}>Costo de canal por venta<br />
            <input type="number" step={0.01} value={cfg.costoCanal[canal]?.valor ?? 0} onChange={(e) => setCostoCanal({ valor: num(e.target.value) })} className="mo-input mo-input--num" style={{ width: 90 }} />
            <select value={cfg.costoCanal[canal]?.tipo ?? '$'} onChange={(e) => setCostoCanal({ tipo: e.target.value as '$' | '%' })} className="mo-select" style={{ width: 110, marginLeft: 4 }}>
              <option value="$">$</option>
              <option value="%">% del PVP</option>
            </select>
          </label>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: color.mut, fontSize: 12 }}>
                <th style={thc}>Forma de pago</th>
                <th style={{ ...thc, textAlign: 'center' }}>Comisión %</th>
                <th style={{ ...thc, textAlign: 'center' }}>Costo financiero %</th>
                <th style={{ ...thc, textAlign: 'center' }}>Descuento %</th>
                <th style={{ ...thc, textAlign: 'center' }} title="Si está apagado, esta forma no aplica IVA/IIBB/DREI">Aplica imp.</th>
                <th style={{ ...thc, textAlign: 'center' }}>Días acred.</th>
                <th style={thc}></th>
              </tr>
            </thead>
            <tbody>
              {cfg.formas.map((f) => {
                const m = cfg.matriz[canal]?.[f] || CELDA_DEF
                const cellInp = (campo: keyof Celda, v: number) => (
                  <input type="number" step={0.01} value={v} onChange={(e) => setCelda(f, campo, num(e.target.value))} className="mo-input mo-input--num" style={{ width: 90, textAlign: 'center', height: 32, padding: '0 6px' }} />
                )
                return (
                  <tr key={f}>
                    <td style={{ padding: '4px 6px', fontWeight: 500 }}>{f}</td>
                    <td style={{ textAlign: 'center' }}>{cellInp('comision', m.comision)}</td>
                    <td style={{ textAlign: 'center' }}>{cellInp('finan', m.finan)}</td>
                    <td style={{ textAlign: 'center' }}>{cellInp('descuento', m.descuento || 0)}</td>
                    <td style={{ textAlign: 'center' }}><input type="checkbox" style={{ accentColor: "var(--mo-brand-solid)" }} checked={m.aplicaImp} onChange={(e) => setCelda(f, 'aplicaImp', e.target.checked)} title="Aplica IVA / IIBB / DREI" /></td>
                    <td style={{ textAlign: 'center' }}>{cellInp('dias', m.dias)}</td>
                    <td style={{ textAlign: 'center' }}><button onClick={() => void removeForma(f)} title="Quitar" style={{ background: 'none', border: 'none', color: color.mut2, cursor: 'pointer', fontSize: 15 }}>×</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Button size="sm" variant="outline" onClick={() => void addForma()} style={{ marginTop: 8 }}>
          + Agregar forma de pago
        </Button>
      </Card>

      {/* PARTE 2: SIMULADOR */}
      <Card style={{ marginTop: space[4] }}>
        <TituloCard texto="2 · Simulador de margen por producto" info="El simulador">
          Traés un producto y ves, forma de pago por forma de pago y canal por canal, qué margen neto queda.
          El <b>costo va neto, sin IVA</b>, y el <b>PVP con IVA</b>. Tocando una celda se abre la cascada
          completa: comisión, costo financiero, IIBB, DREI, costo de canal y Ganancias.
          <b> Es una simulación</b>: no cambia ningún precio en Gestión Nube ni en la tienda.
        </TituloCard>
        <BuscadorProducto
          productos={datos?.allProductos ?? []}
          tnIdx={tnIdx}
          onElegir={(p, tn) => {
            setProdSel(p)
            setCosto(p.unit_cost ? String(p.unit_cost) : '')
            const normal = tn && (tn.price || 0) > 0 ? tn.price! : p.retailer_price || 0
            if (normal > 0) simularPrecio(normal)
          }}
          onSimular={simularPrecio}
          onAgregarSale={() => {
            if (!prodSel) return void avisar('Primero traé un producto.')
            const sale = parseFloat(pvp)
            const c = num(costo)
            if (!sale || sale <= 0) return void avisar('Definí un precio de sale: poné un % de descuento, o el precio.')
            const tn = tnIdx ? matchTn(prodSel, tnIdx) : null
            const actual = tn && (tn.price || 0) > 0 ? tn.price! : prodSel.retailer_price || 0
            com.agregarSale(armarItemSale(prodSel, sale, c, actual))
          }}
        />

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', margin: '12px 0' }}>
          <label style={lbl}>Costo neto (sin IVA) $<br /><input type="number" step={0.01} value={costo} onChange={(e) => onCosto(e.target.value)} className="mo-input mo-input--num" style={{ width: 120 }} /></label>
          <label style={lbl}>Markup % (s/ costo)<br /><input type="number" step={1} value={markup} onChange={(e) => onMarkup(e.target.value)} placeholder="ej. 130" className="mo-input mo-input--num" style={{ width: 110 }} /></label>
          <label style={lbl}>PVP (IVA incluido) $<br /><input type="number" step={0.01} value={pvp} onChange={(e) => onPvp(e.target.value)} className="mo-input mo-input--num" style={{ width: 120 }} /></label>
        </div>
        <div style={{ fontSize: 11, color: color.mut2, margin: '-4px 0 12px' }}>Cargá <b>costo</b> y luego el <b>markup</b> (se calcula el PVP) o el <b>PVP</b> (se calcula el markup). Son intercambiables.</div>

        {simListo ? (
          <>
            <MatrizSim cfg={cfg} cans={cans} costo={costoN} pvp={pvpN} onCelda={(forma, c) => setDetalle({ forma, canal: c })} />
            <Breakeven cfg={cfg} cans={cans} costo={costoN} markup={markup} />
            {detalle && <Detalle cfg={cfg} costo={costoN} pvp={pvpN} forma={detalle.forma} canal={detalle.canal} onCerrar={() => setDetalle(null)} />}
          </>
        ) : (
          <div style={{ color: color.mut2, fontSize: font.base, padding: 10 }}>Cargá el costo neto y el markup (o el PVP) para ver el margen.</div>
        )}
      </Card>

      {/* LISTA DE PRECIOS DE SALE */}
      <Card style={{ marginTop: space[4] }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <TituloCard texto="🏷️ Lista de precios de sale" info="La lista de sale">
            Los productos que fuiste agregando desde el simulador con el precio de sale que les pusiste, para
            bajar la lista en Excel o PDF. <b>Vive en este navegador</b>: es un borrador tuyo, no lo ve el
            resto del equipo y no toca los precios de la tienda.
          </TituloCard>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button size="sm" variant="outline" onClick={() => exportarSaleXLSX(com.saleList, marca).catch(() => toast.error('No se pudo exportar el Excel.'))} disabled={!com.saleList.length}>
              Excel (.xlsx)
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportarSalePDF(com.saleList, marca).catch(() => toast.error('No se pudo exportar el PDF.'))} disabled={!com.saleList.length}>
              PDF
            </Button>
            {verAsig && (
              <Button
                size="sm"
                variant="soft"
                tone="brand"
                disabled={!com.saleList.length}
                title="Lleva estos productos a Asignar categoría de Tienda Nube, con los nombres ya cargados"
                onClick={() => {
                  const nn = [...new Set(com.saleList.map((x) => x.name.trim()).filter(Boolean))]
                  if (!nn.length) return void avisar('Los productos de la lista no tienen nombre, así que no hay con qué cruzarlos contra Tienda Nube.')
                  ponerPuenteAsignar(nn)
                  router.push('/tncat/categorias')
                }}
              >
                🗂️ Asignar categoría en TN
              </Button>
            )}
            <Button size="sm" variant="ghost" tone="danger" onClick={com.vaciarSale} disabled={!com.saleList.length}>Vaciar</Button>
          </div>
        </div>
        <ListaSale saleList={com.saleList} onQuitar={com.quitarSale} />
      </Card>

      {/* PISO DE PRECIO */}
      <Card style={{ marginTop: space[4] }}>
        <TituloCard texto="3 · Piso de precio (PVP mínimo para un margen objetivo)" info="El piso de precio">
          Es el simulador al revés: en vez de fijar el precio y ver qué margen queda, ponés el margen que
          querés y te dice el PVP mínimo que lo consigue, para cada forma de pago. Toma el <b>costo neto</b>
          que cargaste arriba, así que sirve para saber hasta dónde podés descontar sin perder plata.
        </TituloCard>
        <div style={{ marginBottom: 12, fontSize: 12, color: color.mut }}>
          Usa el <b>Costo neto</b> de arriba. Margen objetivo %
          <input type="number" step={1} value={pisoObj} onChange={(e) => setPisoObj(e.target.value)} className="mo-input mo-input--num" style={{ width: 90, marginLeft: 6 }} />
        </div>
        <Piso cfg={cfg} cans={cans} costo={costoN} objetivo={num(pisoObj) / 100} />
      </Card>
    </div>
  )
}

/**
 * Título de cada parte de la sección con su ⓘ al lado. `texto` es el rótulo numerado que se ve en
 * la pantalla; `info` es el encabezado del panel, sin el número (el "1 ·" ahí adentro no dice nada).
 */
function TituloCard({ texto, info, children }: { texto: string; info: string; children: ReactNode }) {
  return (
    <div style={{ fontSize: font.xs, fontWeight: 700, color: color.mut, letterSpacing: 0, marginBottom: space[3], display: 'inline-flex', alignItems: 'center' }}>
      {texto}
      <InfoPopover titulo={info}>{children}</InfoPopover>
    </div>
  )
}

function BuscadorProducto({
  productos,
  tnIdx,
  onElegir,
  onSimular,
  onAgregarSale,
}: {
  productos: Producto[]
  tnIdx: IndiceTn | null
  onElegir: (p: Producto, tn: ReturnType<typeof matchTn>) => void
  onSimular: (precio: number) => void
  onAgregarSale: () => void
}) {
  const { avisar } = useConfirmar()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Producto | null>(null)
  const [descPct, setDescPct] = useState('')
  const [precioNuevo, setPrecioNuevo] = useState('')
  const res = useMemo(() => {
    const qq = q.trim().toLowerCase()
    if (qq.length < 2) return []
    return productos
      .filter((p) => String(p.name || '').toLowerCase().includes(qq) || String(p.sku || '').toLowerCase().includes(qq))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))
      .slice(0, 25)
  }, [q, productos])

  const tn = sel && tnIdx ? matchTn(sel, tnIdx) : null
  const normal = tn && (tn.price || 0) > 0 ? tn.price! : sel?.retailer_price || 0
  const promo = tn && (tn.promo_price || 0) > 0 ? tn.promo_price! : null
  const foto = tn?.images?.[0] || null
  const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-AR')

  const elegir = (p: Producto) => {
    setSel(p)
    setQ(`${p.name}${p.sku ? ' · ' + p.sku : ''}`)
    onElegir(p, tnIdx ? matchTn(p, tnIdx) : null)
  }

  return (
    <div style={{ background: color.brandBg, border: `1px solid ${color.brandBorder}`, borderRadius: 9, padding: '10px 12px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: color.brand, marginBottom: 8 }}>🔎 Traer un producto real (en vez de simular a mano)</div>
      <label style={lbl}>Producto
        <input value={q} onChange={(e) => { setQ(e.target.value); setSel(null) }} autoComplete="off" placeholder="Buscá por nombre o SKU…" className="mo-input" style={{ display: 'block', width: 300, maxWidth: '100%', marginTop: 3 }} />
      </label>
      {!sel && q.trim().length >= 2 && (
        <div style={{ marginTop: 4, maxWidth: 340 }}>
          {res.length ? (
            <div style={{ border: `1px solid ${color.line}`, borderRadius: 8, maxHeight: 240, overflow: 'auto', background: '#fff' }}>
              {res.map((p) => (
                <div key={p.id} onClick={() => elegir(p)} style={{ padding: '7px 10px', borderTop: `1px solid ${color.bg2}`, cursor: 'pointer', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{p.name || '—'}</span>
                  {p.sku && <span style={{ color: color.mut2, fontSize: 11, whiteSpace: 'nowrap' }}>{p.sku}</span>}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: color.mut2, padding: '4px 2px' }}>Sin resultados.</div>
          )}
        </div>
      )}
      {sel && (
        <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt="" style={{ width: 66, height: 66, objectFit: 'cover', borderRadius: 8, background: color.bg2, flex: 'none', border: `1px solid ${color.line}` }} />
          ) : (
            <div style={{ width: 66, height: 66, borderRadius: 8, background: color.bg2, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: color.mut2 }}>Sin foto</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: color.ink2, marginBottom: 8 }}><b>{sel.name}</b>{sel.sku ? ' · ' : ''}{sel.sku && <span style={{ color: color.mut2 }}>{sel.sku}</span>} · Costo: <b>{sel.unit_cost ? fmt(sel.unit_cost) : '—'}</b></div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ fontSize: 12, color: color.mut }}>Precio normal TN<br /><div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}><b style={{ fontSize: 14 }}>{normal ? fmt(normal) : '—'}</b>{normal > 0 && <button onClick={() => onSimular(normal)} style={simBtn(color.brandSolid)}>Simular</button>}</div></div>
              <div style={{ fontSize: 12, color: color.mut }}>Precio promo TN<br /><div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}><b style={{ fontSize: 14, color: color.success }}>{promo ? fmt(promo) : '—'}</b>{promo && promo > 0 && <button onClick={() => onSimular(promo)} style={simBtn(color.success)}>Simular</button>}</div></div>
            </div>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${color.line}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: color.brand, marginBottom: 6 }}>🏷️ Definir precio de sale</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={lbl}>% descuento<br /><input type="number" value={descPct} placeholder="ej. 20" onChange={(e) => {
                  setDescPct(e.target.value)
                  const pct = parseFloat(e.target.value)
                  if (normal > 0 && !isNaN(pct)) {
                    const nuevo = redondear90(normal * (1 - pct / 100))
                    setPrecioNuevo(String(nuevo))
                    onSimular(nuevo)
                  }
                }} className="mo-input mo-input--num" style={{ width: 80 }} /></label>
                <label style={lbl}>Precio sale (termina en 90)<br /><input type="number" value={precioNuevo} placeholder="$" onChange={(e) => setPrecioNuevo(e.target.value)} className="mo-input mo-input--num" style={{ width: 120 }} /></label>
                <button onClick={() => { const v = parseFloat(precioNuevo); if (!v || v <= 0) return void avisar('Cargá el precio de sale, o un % de descuento.'); onSimular(v) }} style={{ ...simBtn(color.brand), padding: '7px 11px' }}>Simular</button>
                <button onClick={onAgregarSale} style={{ ...simBtn(color.ink), padding: '7px 11px' }}>➕ Agregar a la lista</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ListaSale({ saleList, onQuitar }: { saleList: import('@/lib/comisiones/tipos').ItemSale[]; onQuitar: (pid: string) => void }) {
  if (!saleList.length) return <div style={{ fontSize: 12, color: color.mut2, padding: '8px 0' }}>Todavía no agregaste productos. Traé un producto, definí el sale (% o precio) y tocá &quot;➕ Agregar a la lista&quot;.</div>
  const fmt = (v: number | null) => (v == null ? '—' : '$' + Math.round(v).toLocaleString('es-AR'))
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead><tr style={{ fontSize: 11, color: color.mut2, textAlign: 'left' }}><th style={{ padding: '5px 6px' }}>Producto</th><th style={{ textAlign: 'right' }}>Actual</th><th style={{ textAlign: 'right' }}>Sale</th><th style={{ textAlign: 'center' }}>% desc</th><th style={{ textAlign: 'center' }}>Markup</th><th style={{ textAlign: 'center' }}>Margen</th><th></th></tr></thead>
      <tbody>
        {saleList.map((x) => (
          <tr key={x.pid} style={{ borderTop: `1px solid ${color.bg2}` }}>
            <td style={{ padding: '5px 6px', fontWeight: 500 }}>{x.name}{x.sku && <span style={{ fontSize: 11, color: color.mut2 }}> {x.sku}</span>}</td>
            <td style={{ textAlign: 'right', color: color.mut2 }}>{fmt(x.actual)}</td>
            <td style={{ textAlign: 'right', fontWeight: 700, color: color.brand }}>{fmt(x.sale)}</td>
            <td style={{ textAlign: 'center' }}>{x.desc}%</td>
            <td style={{ textAlign: 'center' }}>{x.markup != null ? Math.round(x.markup) + '%' : '—'}</td>
            <td style={{ textAlign: 'center', color: x.margin != null && x.margin < 0 ? color.danger : color.success, fontWeight: 600 }}>{x.margin != null ? Math.round(x.margin) + '%' : '—'}</td>
            <td style={{ textAlign: 'right' }}><button onClick={() => onQuitar(String(x.pid))} title="Quitar" style={{ border: 'none', background: 'none', color: color.mut2, cursor: 'pointer', fontSize: 15 }}>×</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* La etiqueta de cada control de la configuración. Los inputs usan la clase `mo-input`
   del kit, así heredan foco, densidad y estados sin repetir bordes. */
const lbl: CSSProperties = { fontSize: font.sm, color: color.mut }
const thc: CSSProperties = { padding: '6px', color: color.mut, fontWeight: 600 }
function simBtn(bg: string): CSSProperties {
  return { background: bg, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 9px', fontSize: 12, cursor: 'pointer' }
}
