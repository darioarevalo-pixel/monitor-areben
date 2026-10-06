'use client'

/**
 * El tótem verificador de precios (`/pos/totem`, rediseño fase 4 = V2): la clienta escanea una prenda
 * con el lector y ve la foto, los talles que hay en el local, el precio de lista y el de efectivo. Diez
 * segundos después vuelve a «Escaneá una prenda». Es SÓLO lectura: ⛔ cobra ni escribe.
 *
 * - La prenda se resuelve igual que en el POS (`buscarProducto`: código de barras o SKU).
 * - Los talles salen de la lista por producto (`buscarNombre`): el stock del local de ANOCHE, que alcanza
 *   para «hay / no hay» y ⛔ gasta el cupo de Gestión Nube.
 * - El precio de lista, de los datos de Zattia como en el POS; el de efectivo, del núcleo (`lib/caja/totem.ts`).
 *
 * ⛔ Decidido: si es la misma tablet que la pantalla de la clienta, y si escanea con la cámara (plan v3,
 * paso 0 de V2). Esta ruta sirve para cualquiera de los dos casos; la cámara, fuera.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useTnPromo } from '@/components/productos/useTnImages'
import { construirPrecios } from '@/lib/etiquetas/core'
import { imagenDe } from '@/lib/tn'
import { buscarNombre, buscarProducto, leerConfig, type Config, type Variante } from '@/lib/caja/cliente'
import { plata } from '@/lib/caja/ticket'
import { coloresDelProducto, precioTotem, tallesDelLocal, TOTEM_MS, type PrecioTotem } from '@/lib/caja/totem'
import { nombreDeColor } from '@/lib/caja/pantalla-cliente'
import { traerAudit } from '@/lib/tn-audit'
import type { ProductoFchk } from '@/lib/tncat/tipos'
import { MARCA_CAJA } from '@/lib/caja/marca'
import { CabeceraMarca, ESTILOS_CLIENTA, FONDO_FOTO, FotoPrenda } from '@/components/caja/CajaCliente'
import { color, font, radius, space, weight } from '@/components/ui'

type Color = { nombre: string; foto: string | null }
type Resultado = { variante: Variante; foto: string | null; precio: PrecioTotem | null; talles: { talle: string; hay: boolean }[]; colores: Color[]; colorActual: string | null }

/** El marco del lector con las barras (espera) y la alerta (no encontrada): trazos del prototipo aprobado. */
const TRAZO = {
  lector: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M14 8v8M17 8v8',
  alerta: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
} as const
function Trazo({ d }: { d: keyof typeof TRAZO }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: '55%', height: '55%' }}>
      <path d={TRAZO[d]} />
    </svg>
  )
}
type Estado = { que: 'espera' } | { que: 'buscando' } | { que: 'no' } | { que: 'ok'; r: Resultado }

export function CajaTotem() {
  const { marca, setMarca } = useSesion()
  // El precio sale de los datos de Zattia, igual que en el POS.
  useEffect(() => {
    if (marca !== 'zattia') setMarca('zattia')
  }, [marca, setMarca])
  if (marca !== 'zattia') return <div style={{ minHeight: '100dvh', background: color.surface }} />
  return <Totem />
}

function Totem() {
  const { datos } = useDatosMonitor()
  const tnIdx = useTnPromo('zattia')
  const [config, setConfig] = useState<Config | null>(null)
  useEffect(() => {
    leerConfig()
      .then(setConfig)
      .catch(() => {})
  }, [])
  // Los colores del producto y la foto del COLOR (como el POS): del audit de Tienda Nube, por SKU.
  const [audit, setAudit] = useState<ProductoFchk[]>([])
  useEffect(() => {
    let vivo = true
    traerAudit<ProductoFchk>('zattia', { variantes: true })
      .then((ps) => vivo && setAudit(ps))
      .catch(() => {
        /* sin el detalle de TN: la foto del producto y sin fila de colores */
      })
    return () => {
      vivo = false
    }
  }, [])

  const [estado, setEstado] = useState<Estado>({ que: 'espera' })
  const [codigo, setCodigo] = useState('')
  const entrada = useRef<HTMLInputElement>(null)
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vuelta = useRef(0)

  const volverEn = useCallback((ms: number) => {
    if (reloj.current) clearTimeout(reloj.current)
    reloj.current = setTimeout(() => setEstado({ que: 'espera' }), ms)
  }, [])
  useEffect(() => () => void (reloj.current && clearTimeout(reloj.current)), [])

  const precioYFoto = useCallback(
    (productId: number) => {
      const p = datos?.allProductos.find((x) => String(x.id) === String(productId))
      if (!p || !tnIdx) return { precio: null, foto: null }
      return { precio: construirPrecios([p], tnIdx).precios[p.id] || null, foto: imagenDe(p, tnIdx) }
    },
    [datos, tnIdx],
  )

  async function buscar(q: string) {
    const n = ++vuelta.current
    setEstado({ que: 'buscando' })
    try {
      const r = await buscarProducto(q)
      const variante = 'variante' in r ? r.variante : r.candidatos[0]
      if (!variante) throw new Error('sin prenda')
      // Los talles del producto: la lista por nombre trae cada variante con el stock del local de anoche.
      const lista = await buscarNombre(variante.product_name).catch(() => null)
      const prod = lista && [...lista.conStock, ...lista.sinStock].find((p) => p.product_id === variante.product_id)
      if (vuelta.current !== n) return
      const { precio, foto } = precioYFoto(variante.product_id)
      const cols = coloresDelProducto(audit, variante.sku)
      setEstado({
        que: 'ok',
        r: {
          variante,
          foto: cols.foto || foto,
          colores: cols.colores,
          colorActual: cols.actual,
          precio: precioTotem({ product_id: variante.product_id, size_id: variante.size_id, precio, reglas: config?.reglas ?? null }),
          talles: prod ? tallesDelLocal(prod.variantes) : [],
        },
      })
      volverEn(TOTEM_MS.encontrada)
    } catch {
      if (vuelta.current !== n) return
      setEstado({ que: 'no' })
      volverEn(TOTEM_MS.noEncontrada)
    }
  }

  return (
    <div
      style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: color.surface, color: color.ink }}
      // El lector tipea donde esté el foco: se lo devuelve siempre a la entrada.
      onClick={() => entrada.current?.focus()}
    >
      <style>{ESTILOS_CLIENTA}</style>
      <CabeceraMarca logo={config?.ticket_logo ?? null} derecha="Consultá el precio" />
      <input
        ref={entrada}
        autoFocus
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        onBlur={() => setTimeout(() => entrada.current?.focus(), 0)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          const q = codigo.trim()
          setCodigo('')
          if (q) void buscar(q)
        }}
        aria-label="Código de la prenda"
        autoComplete="off"
        spellCheck={false}
        // Invisible pero enfocable: la clienta ⛔ tipea, escanea.
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }}
      />
      <main style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {estado.que === 'ok' ? (
          <Prenda r={estado.r} />
        ) : (
          <Espera no={estado.que === 'no'} buscando={estado.que === 'buscando'} />
        )}
      </main>
    </div>
  )
}

function Espera({ no, buscando }: { no: boolean; buscando: boolean }) {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', alignContent: 'center', textAlign: 'center', gap: space[4], padding: space[8], background: `radial-gradient(circle at 50% 40%, ${MARCA_CAJA.acentoBg}, ${color.surface} 60%)` }}>
      <div className={no ? undefined : 'caja-latido'} style={{ width: 'clamp(88px, 11vw, 140px)', aspectRatio: '1', borderRadius: 28, background: no ? color.bg2 : MARCA_CAJA.acento, color: no ? color.mut : color.surface, display: 'grid', placeItems: 'center' }}>
        <Trazo d={no ? 'alerta' : 'lector'} />
      </div>
      <h1 style={{ margin: 0, fontSize: 'clamp(30px, 4.6vw, 60px)', letterSpacing: '-0.03em', maxWidth: '18ch', textWrap: 'balance' }}>
        {no ? 'No encontramos esta prenda' : buscando ? 'Buscando…' : 'Escaneá una prenda para ver su precio'}
      </h1>
      <p style={{ margin: 0, fontSize: 'clamp(16px, 1.8vw, 24px)', color: color.mut }}>{no ? 'Consultá en caja y te ayudamos.' : 'Acercá la etiqueta al lector.'}</p>
    </div>
  )
}

function Prenda({ r }: { r: Resultado }) {
  const { variante, precio, talles } = r
  const sinStock = talles.length > 0 && !talles.some((t) => t.hay)
  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', position: 'relative' }}>
      <div style={{ display: 'grid', placeItems: 'center', padding: space[6], background: FONDO_FOTO }}>
        <div style={{ width: 'min(100%, 420px)' }}>
          <FotoPrenda src={r.foto} sombra="grande" />
        </div>
      </div>
      <div style={{ padding: 'clamp(20px, 3.4vw, 48px)', display: 'grid', alignContent: 'center', gap: space[4] }}>
        {variante.sku && <p style={{ margin: 0, color: color.mut, fontSize: font.lg, letterSpacing: '0.04em' }}>{variante.sku}</p>}
        <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 54px)', letterSpacing: '-0.03em', lineHeight: 1.05 }}>{variante.product_name}</h1>
        {r.colores.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${space[2]}px ${space[4]}px`, fontSize: font.lg, color: color.ink2 }}>
            {r.colores.map((c) => (
              <span key={c.nombre} style={{ display: 'inline-flex', alignItems: 'center', gap: space[1.5], fontWeight: c.nombre === r.colorActual ? weight.bold : weight.medium }}>
                {/* TN ⛔ trae el hex: el punto es la foto del color en un círculo (sin foto, vacío). */}
                <i
                  aria-hidden
                  style={{
                    width: 22, height: 22, borderRadius: '50%', flex: 'none',
                    border: c.nombre === r.colorActual ? `2px solid ${MARCA_CAJA.acento}` : '1px solid rgba(0, 0, 0, .12)',
                    background: c.foto ? `center / cover no-repeat url("${c.foto.replace(/"/g, '%22')}")` : FONDO_FOTO,
                  }}
                />
                {nombreDeColor(c.nombre)}
              </span>
            ))}
          </div>
        )}
        {talles.length > 0 && (
          <>
            <h2 style={{ margin: 0, fontSize: font.md, textTransform: 'uppercase', letterSpacing: '0.08em', color: color.mut }}>Talles en el local</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2] }}>
              {talles.map((t) => (
                <span
                  key={t.talle}
                  style={{
                    minWidth: 56, height: 56, padding: `0 ${space[3]}px`, borderRadius: radius.xl, display: 'grid', placeItems: 'center', fontWeight: weight.bold, fontSize: font.xl,
                    border: t.hay ? `1.5px solid ${MARCA_CAJA.acento}` : `1.5px dashed ${color.line2}`,
                    color: t.hay ? MARCA_CAJA.acento : color.mut2,
                    textDecoration: t.hay ? 'none' : 'line-through',
                  }}
                >
                  {t.talle}
                </span>
              ))}
            </div>
          </>
        )}
        {sinStock ? (
          <div style={{ background: color.bg2, color: color.ink2, borderRadius: radius.xl, padding: space[4], fontSize: font.xl }}>Sin stock en el local. Consultá en caja.</div>
        ) : !precio ? (
          <div style={{ background: color.bg2, color: color.ink2, borderRadius: radius.xl, padding: space[4], fontSize: font.xl }}>Precio: consultá en caja.</div>
        ) : precio.feria ? (
          <Precio rotulo="Feria · precio final" monto={precio.final} pie="Sólo efectivo o transferencia" />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: font.xl, color: color.ink2 }}>
              <span>Precio de lista</span>
              <b style={{ fontSize: font['2xl'] + 4, fontVariantNumeric: 'tabular-nums' }}>{plata(precio.lista)}</b>
            </div>
            <Precio rotulo={precio.conTransferencia ? 'En efectivo o transferencia' : 'En efectivo'} monto={precio.efectivo} pie={precio.ahorro > 0 ? `Ahorrás ${plata(precio.ahorro)}` : ''} />
          </>
        )}
      </div>
      {/* Lo que falta para volver a «Escaneá una prenda». */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, background: color.bg2 }}>
        <style>{`@keyframes totem-vaciar { from { width: 100%; } to { width: 0; } } @media (prefers-reduced-motion: reduce) { .totem-barra { animation: none !important; } }`}</style>
        <i className="totem-barra" style={{ display: 'block', height: '100%', background: MARCA_CAJA.acento, animation: `totem-vaciar ${TOTEM_MS.encontrada}ms linear forwards` }} />
      </div>
    </div>
  )
}

function Precio({ rotulo, monto, pie }: { rotulo: string; monto: number; pie: string }) {
  return (
    <div style={{ background: MARCA_CAJA.acento, color: color.surface, borderRadius: 16, padding: `${space[4]}px ${space[5]}px`, display: 'grid', gap: space[0.5] }}>
      <span style={{ fontSize: font.xl, fontWeight: weight.semibold, opacity: 0.9 }}>{rotulo}</span>
      <strong style={{ fontSize: 'clamp(40px, 6vw, 80px)', letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{plata(monto)}</strong>
      {pie && <small style={{ fontSize: font.lg, opacity: 0.85 }}>{pie}</small>}
    </div>
  )
}
