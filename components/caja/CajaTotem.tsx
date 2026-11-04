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
 * - 🔑 La tarjeta de la encargada (`TARJETA_ENCARGADA`): con una prenda en pantalla, suma dónde está en el
 *   depósito y su stock (`elegirVariante`, una lectura de GN sólo cuando se pide); sin prenda, espera la
 *   próxima 30 segundos.
 * - 🔑 `?prueba=1`: la entrada se ve y también busca por nombre, para probar sin lector ni etiqueta. Sin
 *   eso, la pantalla de la clienta sigue igual: sólo el escaneo.
 *
 * ⛔ Decidido: si es la misma tablet que la pantalla de la clienta, y si escanea con la cámara (plan v3,
 * paso 0 de V2). Esta ruta sirve para cualquiera de los dos casos; la cámara, fuera.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useTnPromo } from '@/components/productos/useTnImages'
import { imagenesDe } from '@/lib/tn'
import { precioDeCaja } from '@/lib/caja/precio'
import { hoyIso } from '@/lib/agenda'
import { buscarNombre, buscarProducto, elegirVariante, leerConfig, type Config, type ProductoLista, type Variante } from '@/lib/caja/cliente'
import { plata } from '@/lib/caja/ticket'
import { coloresDelProducto, esTarjetaEncargada, fotosDeLaPrenda, opcionesDelLocal, precioTotem, TOTEM_MS, type ColorTotem, type PrecioTotem } from '@/lib/caja/totem'
import { nombreDeColor } from '@/lib/caja/pantalla-cliente'
import { traerAudit } from '@/lib/tn-audit'
import type { ProductoFchk } from '@/lib/tncat/tipos'
import { MARCA_CAJA, marcaParaPOS, storeCaja, useMarcaDeLaUrl, usarMarcaCaja } from '@/lib/caja/marca'
import type { Marca } from '@/lib/nav.datos'
import { CabeceraMarca, ESTILOS_CLIENTA, FONDO_FOTO } from '@/components/caja/CajaCliente'
import { color, font, radius, space, weight } from '@/components/ui'

type Resultado = { variante: Variante; fotos: string[]; precio: PrecioTotem | null; talles: { talle: string; hay: boolean }[]; colores: ColorTotem[]; colorActual: string | null }
/** Lo que ve la encargada al pasar su tarjeta. */
type Ubicacion = { que: 'buscando' } | { que: 'falla' } | { que: 'ok'; atras: string[]; deposito: number; local: number }

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
/** `no`: la prenda ⛔ está (404). `falla`: ⛔ se pudo consultar (GN, la red): son cosas distintas (robustez, 11-oct). */
type Estado = { que: 'espera' } | { que: 'buscando' } | { que: 'no' } | { que: 'falla' } | { que: 'lista'; productos: ProductoLista[] } | { que: 'encargada' } | { que: 'ok'; r: Resultado }

export function CajaTotem() {
  const { marca, setMarca } = useSesion()
  // El precio sale de los datos de la marca, igual que en el POS (V4: `?marca=` o la del shell).
  const quiere = marcaParaPOS(useMarcaDeLaUrl(), marca)
  useEffect(() => {
    if (marca !== quiere) setMarca(quiere as Marca)
  }, [marca, quiere, setMarca])
  if (marca !== quiere) return <div style={{ minHeight: '100dvh', background: color.surface }} />
  usarMarcaCaja(quiere)
  return <Totem key={quiere} />
}

function Totem() {
  const { datos } = useDatosMonitor()
  const tnIdx = useTnPromo(storeCaja())
  const tnIdxStunned = useTnPromo(storeCaja() === 'zattia' ? 'stunned' : storeCaja())
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
    traerAudit<ProductoFchk>(storeCaja(), { variantes: true })
      .then((ps) => vivo && setAudit(ps))
      .catch(() => {
        /* sin el detalle de TN: la foto del producto y sin fila de colores */
      })
    return () => {
      vivo = false
    }
  }, [])

  // 🔑 Instalarlo desde acá abre el tótem a pantalla completa: el manifest general arranca en Inicio.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (!link) return
    const general = link.getAttribute('href')
    link.setAttribute('href', '/totem.webmanifest')
    return () => {
      if (general) link.setAttribute('href', general)
    }
  }, [])

  const [prueba] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('prueba') === '1')
  const [estado, setEstado] = useState<Estado>({ que: 'espera' })
  const [codigo, setCodigo] = useState('')
  const entrada = useRef<HTMLInputElement>(null)
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vuelta = useRef(0)
  const encargada = useRef(false)
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null)
  // Cada vez que arranca el reloj, la barra que lo muestra vuelve a empezar.
  const [arranques, setArranques] = useState(0)

  const volverEn = useCallback((ms: number) => {
    if (reloj.current) clearTimeout(reloj.current)
    setArranques((n) => n + 1)
    reloj.current = setTimeout(() => {
      encargada.current = false
      setUbicacion(null)
      setEstado({ que: 'espera' })
    }, ms)
  }, [])
  useEffect(() => () => void (reloj.current && clearTimeout(reloj.current)), [])

  const precioYFoto = useCallback(
    (productId: number) => {
      const p = datos?.allProductos.find((x) => String(x.id) === String(productId))
      if (!p || !tnIdx) return { precio: null, foto: null, fotos: [] as string[], categorias: [] as string[] }
      // Las categorías de Tienda Nube: las promos por categoría (las mismas que manda el POS).
      // Stunned, sólo su Tienda Nube (`lib/caja/precio.ts`). `reglas: null`: la oferta la pone `precioTotem`.
      const { precio, foto, categorias } = precioDeCaja(p, { store: storeCaja(), idx: tnIdx, idxStunned: tnIdxStunned, reglas: null, localStunned: config?.stunned_local ?? null })
      const fotos = [...imagenesDe(p, tnIdx), ...(tnIdxStunned ? imagenesDe(p, tnIdxStunned) : [])]
      return { precio, foto, fotos, categorias }
    },
    [datos, tnIdx, tnIdxStunned, config?.stunned_local],
  )

  /** Arma la prenda con sus talles y su precio. `n`: la vuelta que la pidió; si ya hubo otra, ⛔ se muestra. */
  async function mostrar(variante: Variante, n: number) {
    // Los talles del producto: la lista por nombre trae cada variante con el stock del local de anoche.
    const lista = await buscarNombre(variante.product_name).catch(() => null)
    const prod = lista && [...lista.conStock, ...lista.sinStock].find((p) => p.product_id === variante.product_id)
    if (vuelta.current !== n) return
    const { precio, foto, fotos, categorias } = precioYFoto(variante.product_id)
    const cols = coloresDelProducto(audit, variante.sku)
    const opciones = opcionesDelLocal(prod?.variantes ?? [], cols.colores)
    const fotoDelColor = opciones.colores.map((c) => c.foto)
    setEstado({
      que: 'ok',
      r: {
        variante,
        fotos: fotosDeLaPrenda(cols.foto, cols.fotos, foto, fotos, fotoDelColor),
        colores: opciones.colores,
        colorActual: cols.actual ?? (opciones.talles.length ? null : variante.size_name),
        precio: precioTotem({ product_id: variante.product_id, size_id: variante.size_id, precio, reglas: config?.reglas ?? null, hoy: hoyIso(), categorias }),
        talles: opciones.talles,
      },
    })
    volverEn(TOTEM_MS.encontrada)
  }

  async function pedirUbicacion(variante: Variante, n: number) {
    setUbicacion({ que: 'buscando' })
    volverEn(TOTEM_MS.encargada)
    try {
      const r = await elegirVariante(variante)
      if (vuelta.current !== n) return
      setUbicacion('variante' in r ? { que: 'ok', atras: r.stock.atras ?? [], deposito: r.stock.deposito, local: r.stock.local } : { que: 'falla' })
    } catch {
      if (vuelta.current === n) setUbicacion({ que: 'falla' })
    }
  }

  /** Modo prueba: lo que se tipeó puede ser un nombre. `true` si encontró productos y mostró la lista. */
  async function mostrarLista(q: string, n: number) {
    const lista = await buscarNombre(q).catch(() => null)
    if (vuelta.current !== n) return true
    const productos = lista ? [...lista.conStock, ...lista.sinStock] : []
    if (!productos.length) return false
    if (reloj.current) clearTimeout(reloj.current)
    setEstado({ que: 'lista', productos })
    return true
  }

  async function buscar(q: string) {
    const n = ++vuelta.current
    if (esTarjetaEncargada(q)) {
      if (estado.que === 'ok') {
        void pedirUbicacion(estado.r.variante, n)
      } else {
        encargada.current = true
        setEstado({ que: 'encargada' })
        volverEn(TOTEM_MS.encargada)
      }
      return
    }
    const conUbicacion = encargada.current
    encargada.current = false
    setUbicacion(null)
    setEstado({ que: 'buscando' })
    try {
      const r = await buscarProducto(q)
      if (prueba && 'candidatos' in r && r.candidatos.length > 1 && (await mostrarLista(q, n))) return
      if (vuelta.current !== n) return
      const variante = 'variante' in r ? r.variante : r.candidatos[0]
      if (!variante) throw new Error('sin prenda')
      await mostrar(variante, n)
      if (conUbicacion && vuelta.current === n) void pedirUbicacion(variante, n)
    } catch (e) {
      if (vuelta.current !== n) return
      const status = (e as { status?: number }).status
      const noEsta = status === 404 || (e as Error).message === 'sin prenda'
      if (prueba && noEsta && (await mostrarLista(q, n))) return
      if (vuelta.current !== n) return
      setEstado({ que: noEsta ? 'no' : 'falla' })
      volverEn(TOTEM_MS.noEncontrada)
    }
  }

  async function elegir(p: ProductoLista) {
    // Una variante con stock si hay: la foto y el color salen de ella.
    const variante = p.variantes.find((v) => (v.local ?? 0) > 0) ?? p.variantes[0]
    if (!variante) return
    const n = ++vuelta.current
    setEstado({ que: 'buscando' })
    try {
      await mostrar(variante, n)
    } catch {
      if (vuelta.current !== n) return
      setEstado({ que: 'falla' })
      volverEn(TOTEM_MS.noEncontrada)
    }
  }

  return (
    <div
      style={{ height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: color.surface, color: color.ink }}
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
        placeholder={prueba ? 'Modo prueba: código, SKU o nombre, y Enter' : undefined}
        autoComplete="off"
        spellCheck={false}
        // 🔑 El lector escribe igual; tocar la pantalla ⛔ abre el teclado. En modo prueba hace falta para tipear.
        inputMode={prueba ? undefined : 'none'}
        // Invisible pero enfocable: la clienta ⛔ tipea, escanea.
        style={prueba ? { margin: `${space[2]}px ${space[4]}px`, padding: `${space[2]}px ${space[3]}px`, fontSize: font.lg, border: `1.5px dashed ${color.line2}`, borderRadius: radius.xl, background: color.surface, color: color.ink } : { position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }}
      />
      <main style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {estado.que === 'ok' ? (
          <Prenda key={`${estado.r.variante.product_id}-${estado.r.variante.size_id}`} r={estado.r} ubicacion={ubicacion} arranques={arranques} tocar={() => volverEn(ubicacion ? TOTEM_MS.encargada : TOTEM_MS.encontrada)} msReloj={ubicacion ? TOTEM_MS.encargada : TOTEM_MS.encontrada} />
        ) : estado.que === 'lista' ? (
          <ListaPrueba productos={estado.productos} elegir={(p) => void elegir(p)} />
        ) : (
          <Espera no={estado.que === 'no'} falla={estado.que === 'falla'} buscando={estado.que === 'buscando'} encargada={estado.que === 'encargada'} />
        )}
      </main>
    </div>
  )
}

/** Sólo con `?prueba=1`: lo que encontró la búsqueda por nombre. */
function ListaPrueba({ productos, elegir }: { productos: ProductoLista[]; elegir: (p: ProductoLista) => void }) {
  return (
    <div style={{ flex: 1, display: 'grid', alignContent: 'start', gap: space[2], padding: space[4] }}>
      {productos.map((p) => (
        <button key={p.product_id} type="button" onClick={() => elegir(p)} style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], padding: space[3], fontSize: font.lg, textAlign: 'left', background: color.surface, color: color.ink, border: `1px solid ${color.line2}`, borderRadius: radius.xl, cursor: 'pointer' }}>
          <span>{p.product_name}</span>
          <span style={{ color: color.mut, flex: 'none' }}>{p.local > 0 ? `${p.local} en el local` : 'Sin stock en el local'}</span>
        </button>
      ))}
    </div>
  )
}

function Espera({ no: noEsta, falla, buscando, encargada }: { no: boolean; falla: boolean; buscando: boolean; encargada: boolean }) {
  const no = noEsta || falla
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', alignContent: 'center', textAlign: 'center', gap: space[4], padding: space[8], background: `radial-gradient(circle at 50% 40%, ${MARCA_CAJA.acentoBg}, ${color.surface} 60%)` }}>
      <div className={no ? undefined : 'caja-latido'} style={{ width: 'clamp(88px, 11vw, 140px)', aspectRatio: '1', borderRadius: 28, background: no ? color.bg2 : MARCA_CAJA.acento, color: no ? color.mut : color.surface, display: 'grid', placeItems: 'center' }}>
        <Trazo d={no ? 'alerta' : 'lector'} />
      </div>
      <h1 style={{ margin: 0, fontSize: 'clamp(30px, 4.6vw, 60px)', letterSpacing: '-0.03em', maxWidth: '18ch', textWrap: 'balance' }}>
        {encargada ? 'Escaneá la prenda para ver su ubicación' : falla ? 'No pudimos consultar el precio' : no ? 'No encontramos esta prenda' : buscando ? 'Buscando…' : 'Escaneá una prenda para ver su precio'}
      </h1>
      <p style={{ margin: 0, fontSize: 'clamp(16px, 1.8vw, 24px)', color: color.mut }}>{falla ? 'Probá de nuevo en un momento o consultá en caja.' : no ? 'Consultá en caja y te ayudamos.' : 'Acercá la etiqueta al lector.'}</p>
    </div>
  )
}

/** Foto grande con flechas, puntos y deslizar. Cada toque le da otros 10 segundos a la ficha (`tocar`). */
function Galeria({ fotos, i, setI, tocar }: { fotos: string[]; i: number; setI: (i: number) => void; tocar: () => void }) {
  const inicioX = useRef<number | null>(null)
  const hay = fotos.length > 1
  const ir = (paso: number) => {
    setI((i + paso + fotos.length) % fotos.length)
    tocar()
  }
  const flecha = (paso: number, rotulo: string, d: string) => (
    <button
      type="button"
      aria-label={rotulo}
      tabIndex={-1}
      onClick={() => ir(paso)}
      style={{ position: 'absolute', top: '50%', [paso < 0 ? 'left' : 'right']: space[3], transform: 'translateY(-50%)', width: 64, height: 64, borderRadius: '50%', border: 'none', background: 'rgba(255, 255, 255, .88)', color: color.ink, boxShadow: '0 4px 12px rgba(16, 24, 40, .22)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
    >
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{ width: 30, height: 30 }}>
        <path d={d} />
      </svg>
    </button>
  )
  return (
    <div
      style={{ position: 'relative', minHeight: 0, background: FONDO_FOTO, overflow: 'hidden', touchAction: 'pan-y' }}
      onPointerDown={(e) => {
        inicioX.current = e.clientX
      }}
      onPointerUp={(e) => {
        if (inicioX.current == null || !hay) return
        const dx = e.clientX - inicioX.current
        inicioX.current = null
        if (Math.abs(dx) > 50) ir(dx < 0 ? 1 : -1)
      }}
    >
      {fotos[i] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fotos[i]} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', userSelect: 'none' }} />
      )}
      {hay && (
        <>
          {flecha(-1, 'Foto anterior', 'M15 5l-7 7 7 7')}
          {flecha(1, 'Foto siguiente', 'M9 5l7 7-7 7')}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: space[4], display: 'flex', justifyContent: 'center', gap: space[1.5] }}>
            {fotos.map((f, n) => (
              <i key={f} aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: n === i ? MARCA_CAJA.acento : 'rgba(255, 255, 255, .85)', boxShadow: '0 0 0 1px rgba(0, 0, 0, .12)' }} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Sólo con la tarjeta de la encargada: dónde está la prenda y cuánto hay. */
function PanelUbicacion({ u }: { u: Ubicacion }) {
  const caja: React.CSSProperties = { background: color.ink, color: color.surface, borderRadius: radius.xl, padding: space[4], display: 'grid', gap: space[1], fontSize: font.lg }
  if (u.que === 'buscando') return <div style={caja}>Buscando la ubicación…</div>
  if (u.que === 'falla') return <div style={caja}>No se pudo consultar la ubicación.</div>
  return (
    <div style={caja}>
      <span>Ubicación en depósito</span>
      <strong style={{ fontSize: font['2xl'] + 4 }}>{u.atras.length ? u.atras.join(' · ') : 'Sin estante cargado'}</strong>
      <span>Stock: {u.deposito} en depósito · {u.local} en el local</span>
    </div>
  )
}

function Prenda({ r, ubicacion, arranques, msReloj, tocar }: { r: Resultado; ubicacion: Ubicacion | null; arranques: number; msReloj: number; tocar: () => void }) {
  const { variante, precio, talles } = r
  // Un color con `hay: null` ⛔ sabe de stock: decide lo que sí se sabe.
  const conocidas = [...talles, ...r.colores].filter((o) => o.hay !== null)
  const sinStock = conocidas.length > 0 && conocidas.every((o) => o.hay === false)
  const [foto, setFoto] = useState(0)
  const [elegido, setElegido] = useState(r.colorActual)
  const mismo = (a: string | null, b: string) => a?.trim().toLowerCase() === b.trim().toLowerCase()
  const elegirColor = (c: ColorTotem) => {
    setElegido(c.nombre)
    const n = c.foto ? r.fotos.indexOf(c.foto) : -1
    if (n >= 0) setFoto(n)
    tocar()
  }
  return (
    <div className="totem-prenda" style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'grid', position: 'relative' }}>
      <style>{`.totem-prenda { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); grid-template-rows: minmax(0, 1fr); } @media (max-aspect-ratio: 1/1) { .totem-prenda { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; } }`}</style>
      <Galeria fotos={r.fotos} i={foto} setI={setFoto} tocar={tocar} />
      <div style={{ padding: 'clamp(16px, 2.6vw, 40px)', display: 'grid', alignContent: 'center', gap: space[3], overflowY: 'auto', minHeight: 0 }}>
        {ubicacion && <PanelUbicacion u={ubicacion} />}
        {variante.sku && <p style={{ margin: 0, color: color.mut, fontSize: font.lg, letterSpacing: '0.04em' }}>{variante.sku}</p>}
        <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 54px)', letterSpacing: '-0.03em', lineHeight: 1.05 }}>{variante.product_name}</h1>
        {r.colores.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${space[2]}px ${space[4]}px`, fontSize: font.lg, color: color.ink2 }}>
            {r.colores.map((c) => (
              <button
                key={c.nombre}
                type="button"
                tabIndex={-1}
                onClick={() => elegirColor(c)}
                aria-pressed={mismo(elegido, c.nombre)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: space[1.5], minHeight: 56, padding: `0 ${space[3]}px`, borderRadius: radius.xl, background: color.surface, cursor: 'pointer', font: 'inherit', fontWeight: mismo(elegido, c.nombre) ? weight.bold : weight.medium, color: c.hay === false ? color.mut2 : color.ink2, textDecoration: c.hay === false ? 'line-through' : 'none', border: mismo(elegido, c.nombre) ? `2px solid ${MARCA_CAJA.acento}` : `1px ${c.hay === false ? 'dashed' : 'solid'} ${color.line2}` }}
              >
                {/* TN ⛔ trae el hex: el punto es la foto del color en un círculo (sin foto, vacío). */}
                <i
                  aria-hidden
                  style={{
                    width: 22, height: 22, borderRadius: '50%', flex: 'none',
                    border: '1px solid rgba(0, 0, 0, .12)',
                    background: c.foto ? `center / cover no-repeat url("${c.foto.replace(/"/g, '%22')}")` : FONDO_FOTO,
                  }}
                />
                {nombreDeColor(c.nombre)}
              </button>
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
          <Precio rotulo="Oferta · precio final" monto={precio.final} pie="Sólo efectivo o transferencia" />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: font.xl, color: color.ink2 }}>
              <span>Precio de lista</span>
              <b style={{ fontSize: font['2xl'] + 4, fontVariantNumeric: 'tabular-nums' }}>{plata(precio.lista)}</b>
            </div>
            <Precio rotulo={precio.conTransferencia ? 'En efectivo o transferencia' : 'En efectivo'} monto={precio.efectivo} pie={[precio.promo, precio.ahorro > 0 ? `Ahorrás ${plata(precio.ahorro)}` : ''].filter(Boolean).join(' · ')} />
            {precio.transferencia != null && !precio.conTransferencia && <Precio rotulo="Con transferencia" monto={precio.transferencia} pie="" />}
          </>
        )}
      </div>
      {/* Lo que falta para volver a «Escaneá una prenda». */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, background: color.bg2 }}>
        <style>{`@keyframes totem-vaciar { from { width: 100%; } to { width: 0; } } @media (prefers-reduced-motion: reduce) { .totem-barra { animation: none !important; } }`}</style>
        <i key={arranques} className="totem-barra" style={{ display: 'block', height: '100%', background: MARCA_CAJA.acento, animation: `totem-vaciar ${msReloj}ms linear forwards` }} />
      </div>
    </div>
  )
}

function Precio({ rotulo, monto, pie }: { rotulo: string; monto: number; pie: string }) {
  return (
    <div style={{ background: MARCA_CAJA.acento, color: color.surface, borderRadius: 16, padding: `${space[4]}px ${space[5]}px`, display: 'grid', gap: space[0.5] }}>
      <span style={{ fontSize: font.xl, fontWeight: weight.semibold, opacity: 0.9 }}>{rotulo}</span>
      <strong style={{ fontSize: 'clamp(34px, 4.6vw, 64px)', letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{plata(monto)}</strong>
      {pie && <small style={{ fontSize: font.lg, opacity: 0.85 }}>{pie}</small>}
    </div>
  )
}
