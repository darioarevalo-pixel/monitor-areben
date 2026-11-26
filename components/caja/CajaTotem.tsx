'use client'

/**
 * El tótem verificador de precios (`/pos/totem`, rediseño fase 4 = V2): la clienta escanea una prenda
 * con el lector y ve la foto, los talles que hay en el local, el precio y las tres formas de pago. Unos
 * segundos después vuelve a «Escaneá el producto». Es SÓLO lectura: ⛔ cobra ni escribe.
 *
 * 🖤 Diseño aprobado por Bruno el 26-nov (Black Friday): colores de la TIENDA (blanco y negro, ⛔ los del monitor: es para la
 * clienta), Montserrat, fotos que pasan solas, las tres formas de pago iguales (⛔ priorizar el efectivo) y, en BF, la cinta.
 * El dibujo vive en `TotemVista.tsx`; acá, lo que se lee y se calcula.
 *
 * - 🔑 La prenda y el precio salen de lo que el tótem ya cargó (`indiceDelTotem`): aparecen al escanear. Si el código
 *   ⛔ está cargado o lo comparten varias prendas, como el POS (`buscarProducto`).
 * - 🩱 Una PARTE de bikini (corpiño o bombacha) muestra SU bikini (Bruno 26-nov: se vende sólo la bikini completa), al precio de
 *   la bikini de la Caja (`config.conjuntos`), con los talles de cada parte y el descuento por cantidad que cobra la Caja HOY.
 * - 🔴 El stock se dibuja recién CONFIRMADO en vivo (`stockEnVivo`, una lectura de Gestión Nube o del ERP): lo cargado
 *   atrasa en lo vendido hoy (medido el 4-nov: decía «hay» de una prenda en 0). Hasta entonces, cuadros vacíos; si
 *   ⛔ se pudo confirmar, lo dice, manda a caja y ⛔ dibuja talles.
 * - El precio, de los datos de la marca como en el POS; las formas de pago, del núcleo (`lib/caja/totem.ts`).
 *
 * - 🔑 La tarjeta de la encargada (`TARJETA_ENCARGADA`): con una prenda en pantalla, suma dónde está en el
 *   depósito y su stock (`elegirVariante`, una lectura de GN sólo cuando se pide); sin prenda, espera la
 *   próxima 30 segundos.
 * - 🔑 `?prueba=1`: la entrada se ve y también busca por nombre, para probar sin lector ni etiqueta. Sin
 *   eso, la pantalla de la clienta sigue igual: sólo el escaneo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useTnPromo } from '@/components/productos/useTnImages'
import { imagenesDe } from '@/lib/tn'
import { precioDeCaja } from '@/lib/caja/precio'
import { hoyIso } from '@/lib/agenda'
import { buscarNombre, buscarProducto, elegirVariante, leerConfig, stockEnVivo, type Candidato, type Config, type ProductoLista, type Variante } from '@/lib/caja/cliente'
import { bikiniDeLaParte, coloresDelProducto, enBlackFriday, escaleraDeHoy, esTarjetaEncargada, fotosDeLaPrenda, indiceDelTotem, opcionesDelLocal, partesDeLaBikini, precioTotem, primeroLosDelLocal, recargaDelTotem, TOTEM_MS, varianteDelCodigo } from '@/lib/caja/totem'
import { TTL_MS } from '@/lib/cache'
import { traerAudit } from '@/lib/tn-audit'
import type { ProductoFchk } from '@/lib/tncat/tipos'
import { marcaParaPOS, storeCaja, useMarcaDeLaUrl, usarMarcaCaja } from '@/lib/caja/marca'
import type { Marca } from '@/lib/nav.datos'
import { Cabecera, Espera, ListaPrueba, Prenda, TOTEM_CSS, TOTEM_FUENTE, type Resultado, type Ubicacion } from '@/components/caja/TotemVista'

/** `no`: la prenda ⛔ está (404). `falla`: ⛔ se pudo consultar (GN, la red): son cosas distintas (robustez, 11-oct). */
type Estado = { que: 'espera' } | { que: 'buscando' } | { que: 'no' } | { que: 'falla' } | { que: 'lista'; productos: ProductoLista[] } | { que: 'encargada' } | { que: 'ok'; r: Resultado }

export function CajaTotem() {
  const { marca, setMarca } = useSesion()
  // El precio sale de los datos de la marca, igual que en el POS (V4: `?marca=` o la del shell).
  const quiere = marcaParaPOS(useMarcaDeLaUrl(), marca)
  useEffect(() => {
    if (marca !== quiere) setMarca(quiere as Marca)
  }, [marca, quiere, setMarca])
  if (marca !== quiere) return <div style={{ minHeight: '100dvh', background: '#fff' }} />
  usarMarcaCaja(quiere)
  return <Totem key={quiere} />
}

/** La hora, cada minuto: la cinta del Black Friday aparece y se va sola. */
function useAhora() {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  return ahora
}

function Totem() {
  const { datos } = useDatosMonitor()
  const tnIdx = useTnPromo(storeCaja())
  const tnIdxStunned = useTnPromo(storeCaja() === 'zattia' ? 'stunned' : storeCaja())
  const indice = useMemo(() => (datos ? indiceDelTotem(datos.allVariantes) : null), [datos])
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

  const ahora = useAhora()
  const bf = enBlackFriday(ahora)
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

  // 🔑 El tótem queda prendido días: sin recargar, seguiría con los precios y el stock del día que se abrió.
  // Pasado el vencimiento del caché (más un margen, para que la recarga lo encuentre vencido), y sólo en espera.
  // 🖤 Alrededor del Black Friday, más seguido (`recargaDelTotem`): los precios cambian al apretar «Aplicar».
  const [abierto] = useState(() => Date.now())
  useEffect(() => {
    if (estado.que !== 'espera') return
    const t = setInterval(() => {
      if (!navigator.onLine) return
      const ahora = Date.now()
      const r = recargaDelTotem(ahora)
      if (r ? ahora - abierto < r.cadaMs : ahora - abierto <= TTL_MS + 10 * 60_000) return
      // `refrescar`: el catálogo de TN fresco también del lado del servidor (su caché es de una hora).
      const antes = r?.refrescar ? Promise.allSettled([traerAudit(storeCaja(), { refrescar: true }), traerAudit(storeCaja(), { variantes: true, refrescar: true })]) : Promise.resolve()
      void antes.then(() => window.location.reload())
    }, 60_000)
    return () => clearInterval(t)
  }, [estado.que, abierto])

  const precioYFoto = useCallback(
    (productId: number) => {
      const p = datos?.allProductos.find((x) => String(x.id) === String(productId))
      if (!p || !tnIdx) return { precio: null, antes: null, foto: null, fotos: [] as string[], categorias: [] as string[] }
      // Las categorías de Tienda Nube: las promos por categoría (las mismas que manda el POS).
      // Stunned, sólo su Tienda Nube (`lib/caja/precio.ts`). `reglas: null`: la oferta la pone `precioTotem`.
      const { precio, antes, foto, categorias } = precioDeCaja(p, { store: storeCaja(), idx: tnIdx, idxStunned: tnIdxStunned, reglas: null, localStunned: config?.stunned_local ?? null })
      const fotos = [...imagenesDe(p, tnIdx), ...(tnIdxStunned ? imagenesDe(p, tnIdxStunned) : [])]
      return { precio, antes: antes ?? null, foto, fotos, categorias }
    },
    [datos, tnIdx, tnIdxStunned, config?.stunned_local],
  )

  /** Arma la prenda con sus talles y su precio. `n`: la vuelta que la pidió; si ya hubo otra, ⛔ se muestra. */
  async function mostrar(variante: Variante, n: number) {
    if (vuelta.current !== n) return
    const hoy = hoyIso()
    const { precio, antes, foto, fotos, categorias } = precioYFoto(variante.product_id)
    const cols = coloresDelProducto(audit, variante.sku)
    const kit = bikiniDeLaParte(config?.conjuntos, variante.product_id, variante.size_id)
    if (kit) {
      // 🩱 La bikini: el nombre y el precio de la bikini, los talles de cada parte y las fotos de las dos.
      const partes = partesDeLaBikini(kit)
      const fotosPartes = partes.flatMap((pt) => precioYFoto(pt.product_id).fotos)
      setEstado({
        que: 'ok',
        r: {
          variante,
          nombre: kit.nombre,
          tipo: 'Bikini',
          fotos: fotosDeLaPrenda(cols.foto, cols.fotos, foto, fotos, fotosPartes),
          colores: [],
          colorActual: null,
          talles: [],
          partes: partes.map((pt) => ({ ...pt, talles: opcionesDelLocal(indice?.porProducto.get(pt.product_id) ?? [], []).talles })),
          precio: precioTotem({ product_id: variante.product_id, size_id: variante.size_id, precio: kit.precio, antes: (kit as { lista?: number | null }).lista ?? null, reglas: config?.reglas ?? null, hoy, categorias, bikini: kit }),
          escalera: escaleraDeHoy(config?.reglas ?? null, hoy, kit.piezas.map((p) => p.product_id), categorias),
          bikini: true,
          stock: 'confirmando',
        },
      })
      volverEn(TOTEM_MS.encontrada)
      void confirmarStockBikini(variante, partes.map((p) => p.product_id))
      return
    }
    // Los talles cargados, para dibujarlos ya: el stock de cada uno ⛔ se afirma hasta confirmarlo.
    const variantes = indice?.porProducto.get(variante.product_id) ?? []
    const opciones = opcionesDelLocal(variantes, cols.colores)
    const fotoDelColor = opciones.colores.map((c) => c.foto)
    setEstado({
      que: 'ok',
      r: {
        variante,
        nombre: variante.product_name,
        tipo: null,
        fotos: fotosDeLaPrenda(cols.foto, cols.fotos, foto, fotos, fotoDelColor),
        colores: opciones.colores,
        colorActual: cols.actual ?? (opciones.talles.length ? null : variante.size_name),
        precio: precioTotem({ product_id: variante.product_id, size_id: variante.size_id, precio, antes, reglas: config?.reglas ?? null, hoy, categorias }),
        escalera: escaleraDeHoy(config?.reglas ?? null, hoy, [variante.product_id], categorias),
        bikini: false,
        talles: opciones.talles,
        partes: [],
        stock: 'confirmando',
      },
    })
    volverEn(TOTEM_MS.encontrada)
    void confirmarStock(variante, cols.colores)
  }

  /** Con un reintento: el 429 de Gestión Nube se pasa en segundos. ⛔ Toca el reloj de la ficha. */
  async function vivosDe(productId: number): Promise<Candidato[] | null> {
    for (const espera of [0, TOTEM_MS.reintentoStock]) {
      if (espera) await new Promise((r) => setTimeout(r, espera))
      const vivos = await stockEnVivo(productId).then((r) => r.variantes).catch(() => null)
      if (vivos) return vivos
    }
    return null
  }
  const ponerEn = (variante: Variante) => (cambio: Partial<Resultado>) =>
    setEstado((e) => (e.que === 'ok' && e.r.variante === variante ? { que: 'ok', r: { ...e.r, ...cambio } } : e))

  async function confirmarStock(variante: Variante, colores: { nombre: string; foto: string | null }[]) {
    const poner = ponerEn(variante)
    const vivos = await vivosDe(variante.product_id)
    if (!vivos) return poner({ stock: 'sin-confirmar' })
    const { colores: conStock, talles } = opcionesDelLocal([...vivos].sort(primeroLosDelLocal), colores)
    poner({ stock: 'confirmado', colores: conStock, talles })
  }

  /** 🩱 Las dos partes de la bikini, cada una con su stock en vivo. Si alguna ⛔ se confirma, ⛔ se afirma ninguna. */
  async function confirmarStockBikini(variante: Variante, productos: number[]) {
    const poner = ponerEn(variante)
    const vivos = await Promise.all(productos.map(vivosDe))
    if (vivos.some((v) => !v)) return poner({ stock: 'sin-confirmar' })
    setEstado((e) =>
      e.que === 'ok' && e.r.variante === variante
        ? { que: 'ok', r: { ...e.r, stock: 'confirmado', partes: e.r.partes.map((pt, i) => ({ ...pt, talles: opcionesDelLocal([...(vivos[i] as Candidato[])].sort(primeroLosDelLocal), []).talles })) } }
        : e,
    )
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
    const cargada = indice && varianteDelCodigo(indice, q)
    if (!cargada) setEstado({ que: 'buscando' })
    try {
      const r = cargada ? { variante: cargada } : await buscarProducto(q)
      if (prueba && 'candidatos' in r && r.candidatos.length > 1 && (await mostrarLista(q, n))) return
      if (vuelta.current !== n) return
      const variante = 'variante' in r ? r.variante : r.candidatos[0]
      if (!variante) throw new Error('sin producto')
      await mostrar(variante, n)
      if (conUbicacion && vuelta.current === n) void pedirUbicacion(variante, n)
    } catch (e) {
      if (vuelta.current !== n) return
      const status = (e as { status?: number }).status
      const noEsta = status === 404 || (e as Error).message === 'sin producto'
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
      className="totem"
      style={{ height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      // El lector tipea donde esté el foco: se lo devuelve siempre a la entrada.
      onClick={() => entrada.current?.focus()}
    >
      <link rel="stylesheet" href={TOTEM_FUENTE} />
      <style>{TOTEM_CSS}</style>
      <Cabecera logo={config?.ticket_logo ?? null} />
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
        aria-label="Código del producto"
        placeholder={prueba ? 'Modo prueba: código, SKU o nombre, y Enter' : undefined}
        autoComplete="off"
        spellCheck={false}
        // 🔑 El lector escribe igual; tocar la pantalla ⛔ abre el teclado. En modo prueba hace falta para tipear.
        inputMode={prueba ? undefined : 'none'}
        // Invisible pero enfocable: la clienta ⛔ tipea, escanea.
        className={prueba ? 'totem-prueba' : undefined}
        style={prueba ? undefined : { position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }}
      />
      <main style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
        {estado.que === 'ok' ? (
          <Prenda key={`${estado.r.variante.product_id}-${estado.r.variante.size_id}`} r={estado.r} bf={bf} ubicacion={ubicacion} arranques={arranques} tocar={() => volverEn(ubicacion ? TOTEM_MS.encargada : TOTEM_MS.encontrada)} msReloj={ubicacion ? TOTEM_MS.encargada : TOTEM_MS.encontrada} />
        ) : estado.que === 'lista' ? (
          <ListaPrueba productos={estado.productos} elegir={(p) => void elegir(p)} />
        ) : (
          <Espera bf={bf} no={estado.que === 'no'} falla={estado.que === 'falla'} buscando={estado.que === 'buscando'} encargada={estado.que === 'encargada'} />
        )}
      </main>
    </div>
  )
}
