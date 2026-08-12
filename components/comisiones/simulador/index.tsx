'use client'

/**
 * El simulador de margen, sacado de `Comisiones.tsx` para que lo use también Liquidación.
 *
 * Son las cuatro piezas que responden "¿cuánto me queda si lo vendo a este precio?":
 * la **matriz** (forma de pago × canal), el **breakeven** (markup mínimo para no perder),
 * el **detalle** (la cascada completa de una celda) y el **piso** (el PVP mínimo para un margen
 * objetivo). Eran funciones internas de `components/comisiones/Comisiones.tsx`.
 *
 * ⛔ **Se movieron tal cual, sin tocarles una fórmula.** La matemática vive en
 * `lib/comisiones/core.ts` y tiene paridad byte-fiel con el legacy: copiarla o "mejorarla" acá es
 * cómo se termina con dos márgenes distintos para el mismo producto y una discusión sobre cuál
 * está bien. Este archivo sólo dibuja.
 *
 * Quien las use tiene que traer la config compartida — `useCfgComisiones(marca)`, al lado.
 */

import { breakevenMarkup, calcular, comFmt, pisoPvp } from '@/lib/comisiones/core'
import type { ComCfg, ResultadoMargen } from '@/lib/comisiones/tipos'
import { color } from '@/components/ui'

/**
 * Cuánto de cada celda se dibuja bajo el margen en pesos.
 *
 * `completo` son los tres renglones históricos (el `%· Nd`, los tags y el `IVA recup.`) y es el
 * default, así que **Comisiones no cambia en nada**. Los otros dos nacieron para el modal de
 * Liquidación, que se pasa producto por producto y no puede pedir scroll: medido, esos tres
 * renglones llevan la tabla de 251px a 457. `una-linea` dice lo mismo en un renglón (~300px) y
 * `ninguno` deja sólo el margen.
 */
export type DetalleCelda = 'completo' | 'una-linea' | 'ninguno'

/** La matriz de margen neto: una celda por forma de pago × canal. Tocar una abre el detalle. */
export function MatrizSim({ cfg, cans, costo, pvp, onCelda, detalleCelda = 'completo' }: { cfg: ComCfg; cans: string[]; costo: number; pvp: number; onCelda: (forma: string, canal: string) => void; detalleCelda?: DetalleCelda }) {
  const cells = cfg.formas.flatMap((f) => cans.map((c) => ({ f, c, m: calcular(cfg, costo, pvp, f, c).margen })))
  const best = cells.length ? cells.reduce((a, b) => (b.m > a.m ? b : a)) : null
  const worst = cells.length ? cells.reduce((a, b) => (b.m < a.m ? b : a)) : null
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={{ textAlign: 'left', padding: '6px 10px' }}>Forma de pago</th>{cans.map((c) => <th key={c} style={{ textAlign: 'center', padding: '6px 10px', fontSize: 12 }}>{c}</th>)}</tr></thead>
        <tbody>
          {cfg.formas.map((f) => (
            <tr key={f}>
              <td style={{ padding: '6px 10px', fontWeight: 500, borderTop: `1px solid ${color.line}` }}>{f}</td>
              {cans.map((c) => {
                const r = calcular(cfg, costo, pvp, f, c)
                const bg = best && best.f === f && best.c === c ? color.successBg : worst && worst.f === f && worst.c === c ? color.dangerBg : undefined
                const cel = cfg.matriz[c]?.[f]
                const tags: string[] = []
                if (r.desc > 0) tags.push(`−${r.desc}%`)
                if (cel && cel.aplicaImp === false) tags.push('s/imp')
                return (
                  <td key={c} onClick={() => onCelda(f, c)} title="Ver detalle" style={{ textAlign: 'center', padding: '6px 10px', borderTop: `1px solid ${color.line}`, cursor: 'pointer', background: bg }}>
                    <div style={{ fontWeight: 700, color: r.margen < 0 ? color.danger : '#111' }}>{comFmt(r.margen)}</div>
                    {detalleCelda === 'completo' && (
                      <>
                        <div style={{ fontSize: 11, color: color.mut }}>{r.margenPct.toFixed(1)}% · {r.dias}d</div>
                        {tags.length > 0 && <div style={{ fontSize: 10, color: color.brand }}>{tags.join(' · ')}</div>}
                        {cfg.saldoIva && <div style={{ fontSize: 10, color: color.brandSolid }}>IVA recup. {comFmt(r.ivaRecuperado)}</div>}
                      </>
                    )}
                    {detalleCelda === 'una-linea' && (
                      <div style={{ fontSize: 10, color: color.mut }}>
                        {r.margenPct.toFixed(1)}% · {r.dias}d
                        {tags.length > 0 && <span style={{ color: color.brand }}> · {tags.join(' · ')}</span>}
                        {cfg.saldoIva && <span style={{ color: color.brandSolid }}> · IVA {comFmt(r.ivaRecuperado)}</span>}
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: color.mut2, marginTop: 8 }}>
        {detalleCelda === 'ninguno'
          ? <>🟩 mejor · 🟥 peor · <b>tocá una celda para ver el detalle</b> · margen neto en $</>
          : <>🟩 mejor · 🟥 peor · <b>tocá una celda para ver el detalle</b> · margen $ y % · &quot;d&quot; = días de acreditación{cfg.saldoIva ? ' · IVA recup. = saldo a favor que recuperás (no es costo)' : ' · IVA descontado como costo (saldo agotado)'}</>}
      </div>
    </div>
  )
}

/** Markup mínimo sobre el costo para no perder, forma por forma. */
export function Breakeven({ cfg, cans, costo, markup }: { cfg: ComCfg; cans: string[]; costo: number; markup: string }) {
  if (!(costo > 0)) return null
  const mkActual = parseFloat(markup)
  const hayMk = markup !== '' && mkActual >= 0
  const filas = cfg.formas.map((f) => ({ f, celdas: cans.map((c) => ({ c, be: breakevenMarkup(cfg, costo, f, c) })) }))
  const conBe = filas.flatMap((fl) => fl.celdas.filter((cd) => cd.be != null).map((cd) => ({ f: fl.f, c: cd.c, be: cd.be as number })))
  const peor = conBe.length ? conBe.reduce((a, b) => (b.be > a.be ? b : a)) : null
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ border: `1px solid ${color.line}`, borderRadius: 10, padding: '12px 14px', background: color.bg }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>⚖️ Markup de equilibrio (breakeven)</div>
        <div style={{ fontSize: 11, color: color.mut2, marginBottom: 10 }}>Markup mínimo sobre el costo para no perder. Por <b>debajo</b> de este %, esa venta da pérdida.{hayMk ? ' 🟢 = tu markup zafa · 🔴 = estás por debajo (pérdida).' : ''}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ textAlign: 'left', padding: '6px 10px' }}>Forma de pago</th>{cans.map((c) => <th key={c} style={{ textAlign: 'center', padding: '6px 10px', fontSize: 12 }}>{c}</th>)}</tr></thead>
          <tbody>
            {filas.map(({ f, celdas }) => (
              <tr key={f}>
                <td style={{ padding: '6px 10px', fontWeight: 500, borderTop: `1px solid ${color.line}` }}>{f}</td>
                {celdas.map(({ c, be }) => {
                  let bg: string | undefined, col: string | undefined
                  if (be != null && hayMk) { const ok = mkActual >= be; bg = ok ? color.successBg : color.dangerBg; col = ok ? color.success : color.danger }
                  return <td key={c} style={{ textAlign: 'center', padding: '6px 10px', borderTop: `1px solid ${color.line}`, fontWeight: 600, background: bg, color: col }}>{be == null ? <span style={{ color: color.mut2 }}>—</span> : be.toFixed(0) + '%'}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {peor && <div style={{ fontSize: 12, color: '#444', marginTop: 8 }}>Para estar a salvo en <b>todas</b> las formas/canales, el markup tiene que superar <b>{peor.be.toFixed(0)}%</b> (lo exige <b>{peor.f} · {peor.c}</b>).</div>}
        <div style={{ fontSize: 11, color: color.mut2, marginTop: 6 }}>⚠️ Este equilibrio cubre impuestos y comisiones, <b>no</b> los gastos fijos de estructura (alquiler, sueldos, tiempo de venta). El piso real es más alto.</div>
      </div>
    </div>
  )
}

/** La cascada completa de una celda: de qué se come el precio hasta el margen final. */
export function Detalle({ cfg, costo, pvp, forma, canal, onCerrar }: { cfg: ComCfg; costo: number; pvp: number; forma: string; canal: string; onCerrar: () => void }) {
  const r: ResultadoMargen = calcular(cfg, costo, pvp, forma, canal)
  const fila = (lbl: string, val: number, o: { signo?: boolean; tot?: boolean; col?: string } = {}) => {
    const monto = o.signo ? '−' + comFmt(Math.abs(val)) : comFmt(val)
    const c = o.col || (o.signo ? color.danger : val < 0 ? color.danger : '#111')
    return (
      <tr style={{ borderTop: o.tot ? `1px solid ${color.line2}` : undefined }}>
        <td style={{ padding: '3px 0', fontWeight: o.tot ? 700 : undefined, color: '#444' }}>{lbl}</td>
        <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: o.tot ? 700 : 500, color: c }}>{monto}</td>
      </tr>
    )
  }
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ border: `1px solid ${color.line}`, borderRadius: 10, padding: '14px 16px', background: color.bg, maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Detalle — {forma} · {canal}</div>
          <button onClick={onCerrar} title="Cerrar" style={{ background: 'none', border: 'none', color: color.mut2, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <tbody>
            {fila('Precio de lista (PVP)', r.pvp)}
            {r.desc > 0 && fila(`Descuento (${r.desc}%)`, r.pvp - r.pvpEf, { signo: true, col: color.brand })}
            {fila('Precio que cobrás', r.pvpEf, { tot: true })}
            {fila(r.aplicaImp ? 'Precio neto (sin IVA)' : 'Precio (sin impuestos)', r.precioNeto)}
            {fila('Costo del producto', r.costoNeto, { signo: true })}
            {fila(`Comisión (${r.com}%)`, r.comisionM, { signo: true })}
            {r.finanM > 0 && fila(`Costo financiero (${r.fin}%)`, r.finanM, { signo: true })}
            {r.aplicaImp && fila(`IIBB (${cfg.imp.iibb}% s/neto)`, r.iibbM, { signo: true })}
            {r.aplicaImp && fila(`DREI (${cfg.imp.drei}% c/IVA)`, r.dreiM, { signo: true })}
            {r.canalM > 0 && fila('Costo de canal', r.canalM, { signo: true })}
            {r.aplicaImp && !cfg.saldoIva && fila('IVA a pagar', r.ivaPagar, { signo: true })}
            {fila('= Contribución', r.contrib, { tot: true })}
            {fila(`Impuesto a las Ganancias (${cfg.imp.ganancias}%)`, r.ganancias, { signo: true })}
            {fila('= MARGEN NETO FINAL', r.margen, { tot: true, col: r.margen < 0 ? color.danger : color.success })}
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: color.mut, marginTop: 8 }}>
          Margen <b>{r.margenPct.toFixed(1)}%</b> · acreditación <b>{r.dias} días</b>
          {r.aplicaImp && cfg.saldoIva ? <> · IVA recuperado (saldo a favor, no es costo): <b>{comFmt(r.ivaPagar)}</b></> : null}
          {!r.aplicaImp ? ' · sin IVA/IIBB/DREI' : ''}
        </div>
      </div>
    </div>
  )
}

/** El simulador al revés: dado un margen objetivo, el PVP mínimo que lo consigue. */
export function Piso({ cfg, cans, costo, objetivo }: { cfg: ComCfg; cans: string[]; costo: number; objetivo: number }) {
  if (!(costo >= 0)) return <div style={{ color: color.mut2, fontSize: 13, padding: 10 }}>Cargá el costo neto (en el simulador de arriba).</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={{ textAlign: 'left', padding: '6px 10px' }}>Forma de pago</th>{cans.map((c) => <th key={c} style={{ textAlign: 'center', padding: '6px 10px', fontSize: 12 }}>{c}</th>)}</tr></thead>
        <tbody>
          {cfg.formas.map((f) => (
            <tr key={f}>
              <td style={{ padding: '6px 10px', fontWeight: 500, borderTop: `1px solid ${color.line}` }}>{f}</td>
              {cans.map((c) => {
                const p = pisoPvp(cfg, costo, objetivo, f, c)
                return <td key={c} style={{ textAlign: 'center', padding: '6px 10px', borderTop: `1px solid ${color.line}`, fontWeight: 600 }}>{p == null ? <span style={{ color: color.mut2 }}>—</span> : comFmt(p)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: color.mut2, marginTop: 8 }}>PVP mínimo (IVA incluido) para ese margen objetivo. &quot;—&quot; = inalcanzable con esa configuración.</div>
    </div>
  )
}
