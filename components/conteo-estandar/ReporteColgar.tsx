'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Marca } from '@/lib/nav.datos'
import { leerHistorial } from '@/lib/conteo-deposito/cliente'
import type { ConteoHistorial } from '@/lib/conteo-deposito/tipos'
import { armarReporte, diasConReporte, type FilaColgar } from '@/lib/conteo-estandar/reporte'
import type { CeProducto, Linea } from '@/lib/conteo-estandar/tipos'
import { descargarXlsx } from '@/lib/excel'
import { leerNoVa, marcarNoVa } from '@/lib/conteo-estandar/no-va'
import { Button, Chips, EmptyState, Esqueleto, Notice, color, font, space, useToast } from '@/components/ui'

type Marca_ = 'ok' | 'no'
type Filtro = 'pendientes' | 'colgados' | 'no_van' | 'de_mas'

const claveLs = (marca: Marca, linea: Linea, dia: string) => `monitor_colgar_${marca}_${linea}_${dia}`
function leerMarcas(k: string): Record<string, Marca_> {
  try {
    const x = JSON.parse(localStorage.getItem(k) || '{}')
    return x && typeof x === 'object' ? x : {}
  } catch {
    return {}
  }
}

const fechaLarga = (dia: string) => {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

/**
 * ⛔ «Sin unidades» (ni en el salón ni en el depósito) se sacó de la pantalla el 27-sep-2026: a
 * Bruno no le sirve —lo que no está se corrige en el AJUSTE, no colgando—. `armarReporte` lo sigue
 * devolviendo por si otro uso lo pide.
 *
 * «Para colgar»: después del conteo, cada talle y color de lo contado que no está en el salón.
 * La lógica es `lib/conteo-estandar/reporte.ts`; acá se elige el día, se marca a mano lo que a
 * propósito no va colgado («No va») y lo que se va reponiendo («Colgado ✓»), y se baja el Excel.
 *
 * «No va» se recuerda entre conteos, por variante y en el servidor (`lib/conteo-estandar/no-va.ts`).
 * «Colgado ✓» es del día: vive en el `localStorage` de este dispositivo, por día y línea, y sirve
 * para ir tildando mientras se repone.
 */
export function ReporteColgar({ marca, linea, feed, lineaLabel }: { marca: Marca; linea: Linea; feed: CeProducto[]; lineaLabel: string }) {
  const toast = useToast()
  const [hist, setHist] = useState<{ cargando: boolean; conteos: ConteoHistorial[]; error: string | null }>({ cargando: true, conteos: [], error: null })
  const [dia, setDia] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('pendientes')
  // Sube cada vez que se marca algo, para releer las marcas guardadas.
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let vivo = true
    leerHistorial(marca)
      .then((conteos) => vivo && setHist({ cargando: false, conteos, error: null }))
      .catch((e: Error) => vivo && setHist({ cargando: false, conteos: [], error: e.message }))
    return () => {
      vivo = false
    }
  }, [marca])

  const dias = useMemo(() => diasConReporte(hist.conteos, linea), [hist.conteos, linea])
  const diaSel = dia || dias[0] || ''
  const rep = useMemo(() => (diaSel ? armarReporte(hist.conteos, linea, diaSel, feed) : null), [hist.conteos, linea, diaSel, feed])

  const clave = diaSel ? claveLs(marca, linea, diaSel) : ''
  const marcas = useMemo(() => (clave ? leerMarcas(clave) : {}), [clave, version]) // eslint-disable-line react-hooks/exhaustive-deps

  // «No va» se recuerda entre conteos (por variante, en el servidor); «Colgado ✓» es del día.
  const [noVa, setNoVa] = useState<{ claves: Set<string>; enServidor: boolean } | null>(null)
  useEffect(() => {
    let vivo = true
    void leerNoVa(marca).then((r) => vivo && setNoVa(r))
    return () => {
      vivo = false
    }
  }, [marca])

  const marcaDe = (key: string): Marca_ | undefined => (noVa?.claves.has(key) ? 'no' : marcas[key] === 'ok' ? 'ok' : undefined)

  const guardarDia = (next: Record<string, Marca_>) => {
    try {
      localStorage.setItem(clave, JSON.stringify(next))
    } catch {
      /* sin almacenamiento: la marca no queda */
    }
    setVersion((v) => v + 1)
  }
  const cambiarNoVa = (f: FilaColgar, activo: boolean) => {
    setNoVa((prev) => {
      const claves = new Set(prev?.claves || [])
      if (activo) claves.add(f.key)
      else claves.delete(f.key)
      return { claves, enServidor: prev?.enServidor ?? false }
    })
    void marcarNoVa(marca, { clave: f.key, producto: f.producto, variante: f.variante, sku: f.sku }, activo).then((ok) => {
      if (!ok) setNoVa((prev) => (prev ? { ...prev, enServidor: false } : prev))
    })
  }
  const marcar = (f: FilaColgar, m: Marca_) => {
    const actual = marcaDe(f.key)
    const dia = { ...marcas }
    if (m === 'no') {
      delete dia[f.key]
      guardarDia(dia)
      cambiarNoVa(f, actual !== 'no')
      return
    }
    if (actual === 'no') cambiarNoVa(f, false)
    if (actual === 'ok') delete dia[f.key]
    else dia[f.key] = 'ok'
    guardarDia(dia)
  }

  if (hist.cargando) return <Esqueleto forma="tabla" filas={6} />
  if (hist.error) return <Notice tone="danger" icon="⚠">No pude leer el historial: {hist.error}</Notice>
  if (!rep || !dias.length)
    return (
      <EmptyState
        icon="🧥"
        title={`Todavía no hay conteos guardados de ${lineaLabel}`}
        hint='El reporte sale de lo que se guardó al terminar el conteo ("Generar el ajuste" → "Generar Excel y guardar" o "Guardar el conteo igual").'
        dashed
      />
    )

  const pend = rep.paraColgar.filter((f) => !marcaDe(f.key))
  const colg = rep.paraColgar.filter((f) => marcaDe(f.key) === 'ok')
  const noVan = rep.paraColgar.filter((f) => marcaDe(f.key) === 'no')
  const lista = filtro === 'pendientes' ? pend : filtro === 'colgados' ? colg : filtro === 'no_van' ? noVan : rep.deMas

  const bajarExcel = async () => {
    const filas = [
      ['Categoría', 'SKU', 'Producto', 'Talle / color', 'En el depósito', 'Código de barras'],
      ...pend.map((f) => [f.categoria ? `${f.grupo} · ${f.categoria}` : f.grupo, f.skuProd, f.producto, f.variante, f.deposito, f.barcode]),
    ]
    try {
      await descargarXlsx(filas, { archivo: `para_colgar_${marca}_${linea}_${diaSel}.xlsx`, hoja: 'Para colgar', anchos: [22, 14, 30, 16, 14, 18] })
    } catch (e) {
      toast.error('No pude armar el Excel: ' + (e as Error).message)
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <p style={{ fontSize: font.sm, color: color.mut, marginBottom: space[3] }}>
        De lo que se contó, cada talle y color que <b>no está colgado en el salón</b>. En el local tiene que haber uno exhibido de cada uno. Marcá <b>No va</b> en lo que a propósito no se cuelga y{' '}
        <b>Colgado ✓</b> a medida que lo reponen. Está en el orden del depósito. Lo que marques <b>No va</b> se recuerda para los próximos conteos.
      </p>

      {noVa && !noVa.enServidor && (
        <Notice tone="warning" icon="📱" style={{ marginBottom: space[3] }}>
          Por ahora los <b>No va</b> quedan guardados solo en este teléfono.
        </Notice>
      )}

      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', marginBottom: space[3] }}>
        <select className="mo-input" value={diaSel} onChange={(e) => setDia(e.target.value)} aria-label="Día del conteo" style={{ height: 44, fontSize: 16, flex: 1, minWidth: 200 }}>
          {dias.map((d) => (
            <option key={d} value={d}>
              Conteo del {fechaLarga(d)}
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={() => void bajarExcel()} disabled={!pend.length}>
          Descargar Excel
        </Button>
      </div>

      <Notice tone="neutral" icon="🧥" style={{ marginBottom: space[3] }}>
        Se contaron <b>{rep.productos}</b> productos ({rep.variantes} talles y colores). Sin colgar y con unidades en el depósito: <b>{rep.paraColgar.length}</b>.
      </Notice>

      <div style={{ marginBottom: space[3] }}>
        <Chips<Filtro>
          value={filtro}
          onChange={setFiltro}
          opciones={[
            { key: 'pendientes', label: 'Para colgar', n: pend.length },
            { key: 'colgados', label: 'Colgados', n: colg.length },
            { key: 'no_van', label: 'No van', n: noVan.length },
            { key: 'de_mas', label: 'Colgados de más', n: rep.deMas.length, title: 'Talles con 2 o más unidades en el salón' },
          ]}
        />
      </div>


      {filtro === 'de_mas' && rep.deMas.length > 0 && (
        <Notice tone="warning" icon="👀" style={{ marginBottom: space[3] }}>
          Talles con <b>2 o más unidades en el salón</b>. Puede estar colgado dos veces a propósito, o puede ser una prenda escaneada dos veces: en ese caso el stock quedó con una de más. Conviene ir a mirarlos.
        </Notice>
      )}

      {!lista.length ? (
        <EmptyState icon={filtro === 'pendientes' ? '🎉' : '—'} title={filtro === 'pendientes' ? 'No queda nada para colgar' : 'Nada por acá'} dashed />
      ) : (
        <ListaColgar filas={lista} marcaDe={marcaDe} conBotones={filtro !== 'de_mas'} onMarcar={marcar} />
      )}
    </div>
  )
}

function ListaColgar({ filas, marcaDe, conBotones, onMarcar }: { filas: FilaColgar[]; marcaDe: (key: string) => Marca_ | undefined; conBotones: boolean; onMarcar: (f: FilaColgar, m: Marca_) => void }) {
  return (
    <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 'var(--mo-r-xl)', overflow: 'hidden' }}>
      {filas.map((f, i) => {
        const titulo = i === 0 || f.grupo !== filas[i - 1].grupo
        const m = marcaDe(f.key)
        return (
          <div key={f.key}>
            {titulo && (
              <div style={{ padding: `${space[2]} ${space[3]}`, background: color.brandBg, color: color.brand, fontWeight: 700, fontSize: font.sm, borderTop: `1px solid ${color.line}` }}>
                {f.grupo}
                {f.categoria ? ` · ${f.categoria}` : ''}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[2]} ${space[3]}`, borderTop: `1px solid ${color.line}`, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 170 }}>
                <div>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: font.xs, color: color.mut, marginRight: 6 }}>{f.skuProd || 'sin SKU'}</span>
                  <b style={{ color: color.ink }}>{f.producto}</b>
                </div>
                <div style={{ fontSize: font.sm, color: color.ink2 }}>
                  {f.variante}
                  {f.exhibido >= 2 && (
                    <span style={{ color: color.warningInk }}>
                      {' '}
                      · <b>{f.exhibido}</b> en el salón
                    </span>
                  )}
                  {f.deposito > 0 && (
                    <span style={{ color: color.mut }}>
                      {' '}
                      · <b>{f.deposito}</b> en el depósito
                    </span>
                  )}
                </div>
              </div>
              {conBotones && (
                <div style={{ display: 'flex', gap: space[2] }}>
                  <Button size="sm" variant={m === 'no' ? 'solid' : 'outline'} tone="neutral" onClick={() => onMarcar(f, 'no')}>
                    No va
                  </Button>
                  <Button size="sm" variant={m === 'ok' ? 'solid' : 'outline'} tone="success" onClick={() => onMarcar(f, 'ok')}>
                    Colgado ✓
                  </Button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
