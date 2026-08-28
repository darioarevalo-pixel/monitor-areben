'use client'

/**
 * Revisar fotos por variante: que ningún color muestre la foto de otro color, y que eso se
 * mantenga solo con el tiempo.
 *
 * Nació preguntándose una sola cosa —"¿este color tiene alguna foto?"— y así dejaba pasar el
 * error que más caro sale: **la misma foto vinculada a dos colores distintos**. El producto
 * figura como "4 de 4 colores con foto ✓", el filtro lo esconde, y mientras tanto dos colores
 * muestran la funda equivocada. Como cada combinación color × modelo es una publicación
 * distinta en Mercado Libre, eso llega al cliente: compra violeta y recibe negra.
 *
 * Tres decisiones que ordenan la pantalla:
 *
 * - **Se cuentan publicaciones, no productos.** BORDER CASE ensucia 3 y PROTECTOR DE CÁMARA
 *   METALIZADO ensucia 63. Una lista que dice "5 productos con problema" los pone en la misma
 *   fila y hace que se les dedique el mismo esfuerzo.
 * - **El buscador se saltea los filtros.** Los filtros son para cuando no sabés por dónde
 *   empezar; el buscador, para cuando sí sabés. Antes buscaba dentro de lo ya filtrado, y por
 *   eso buscar "BORDER CASE" no devolvía nada: el producto que originó esta auditoría era
 *   invisible al buscador de la pantalla que debería encontrarlo.
 * - **"Verificado" caduca solo.** Se guarda junto con una firma del estado de fotos; si alguien
 *   las toca, el producto vuelve a la lista. Sin eso, un verificado viejo taparía un error
 *   nuevo, que es peor que no auditar.
 *
 * La lógica pura está en `lib/tncat/auditoria.ts` (qué está roto) y `lib/tncat/prioridad.ts`
 * (en qué orden y sobre qué recorte). Acá solo vive el estado de la pantalla.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { indexarTn, type IndiceTn } from '@/lib/tn'
import { indicesDe } from '@/lib/tn-audit'
import type { Marca } from '@/lib/nav'
import { auditVariantes, bustAudit, desvincularColor, vincularColor } from '@/lib/tncat/cliente'
import { stockPorProductoTn, ventas90PorProductoTn } from '@/lib/tncat/agotados'
import { indexarStockGn } from '@/lib/tncat/stock-variante'
import { cruzarParaSesion, MOTIVO_EXCLUIDO_LABEL, porMotivo } from '@/lib/tncat/a-sesion-fotos'
import { ponerPuenteFotos } from '@/lib/sesionfotos/puente'
import { exportarPendientesXLSX } from '@/lib/tncat/export'
import {
  aplicarRecortes,
  armarFilas,
  buscar,
  categoriasDe,
  ordenar,
  predicadoDe,
  referenciaDe,
  resumen,
  type FilaAuditoria,
  type FiltroProblema,
} from '@/lib/tncat/prioridad'
import { dejarDeIgnorar, ignorarProducto, leerIgnorados, MOTIVOS_IGNORAR } from '@/lib/tncat/ignorados'
import { desmarcarVerificado, leerVerificadas, mapaDe, marcarVerificado } from '@/lib/tncat/verificadas'
import { fichaDe, type ColorEnFicha } from '@/lib/tncat/auditoria'
import { frasesDeProblema } from '@/lib/tncat/texto'
import type { ImagenFchk, ProductoFchk } from '@/lib/tncat/tipos'
import { Badge, Button, Card, Chips, color as paleta, font, KpiCard, Notice, space, useConfirmar, useToast } from '@/components/ui'
import { FichaProducto } from './FichaProducto'
import { FotoTn } from './FotoTn'

const MAX = 80

/** El detalle que devuelve el endpoint cuando algo no se aplicó. Sin esto el error no se diagnostica. */
const detalle = (errores?: string[]) => (errores?.length ? errores.join(' · ') : '')

export function FotosCard({ marca }: { marca: Marca }) {
  const router = useRouter()
  const { pedirTexto, avisar, confirmar } = useConfirmar()
  const toast = useToast()
  const { perfil } = useSesion()
  const { datos } = useDatosMonitor()

  const [data, setData] = useState<ProductoFchk[]>([])
  const [cargando, setCargando] = useState(true)
  /**
   * Por qué no hay datos. Antes esto se tragaba en un `catch {}` y la pantalla quedaba en
   * cero — que es indistinguible de "está todo bien" y es la peor cara que puede poner un
   * tablero: dice que no hay nada roto justo cuando no pudo mirar.
   */
  const [error, setError] = useState<string | null>(null)
  const [idx, setIdx] = useState<IndiceTn | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)

  const [filtro, setFiltro] = useState<FiltroProblema>('todo')
  const [busqueda, setBusqueda] = useState('')
  const [soloConStock, setSoloConStock] = useState(true)
  const [soloQueSeVende, setSoloQueSeVende] = useState(false)
  const [categoria, setCategoria] = useState('')
  const [verVerificados, setVerVerificados] = useState(false)

  const [ignorados, setIgnorados] = useState<Set<string>>(new Set())
  const [verIgnorados, setVerIgnorados] = useState(false)
  const [huellas, setHuellas] = useState<Map<string, string>>(new Map())
  /** Por qué no se pudo leer qué productos ya se revisaron. Se muestra: ver el efecto de abajo. */
  const [errorRevisiones, setErrorRevisiones] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)

  // ── Datos ─────────────────────────────────────────────────────────────────────
  /**
   * `sigueVivo` evita pisar el estado con la respuesta de una marca que ya no es la que se está
   * mirando: cambiar de marca dispara otra bajada y la vieja puede llegar después.
   */
  const cargar = useCallback(
    async (refrescar: boolean, sigueVivo: () => boolean) => {
      setCargando(true)
      try {
        const d = await auditVariantes(marca, refrescar)
        if (!sigueVivo()) return
        setData(d)
        setIdx(indicesDe(d).promo)
        setError(d.length ? null : 'La tienda contestó, pero sin ningún producto.')
      } catch (e) {
        if (!sigueVivo()) return
        setData([])
        setIdx(indexarTn([]))
        setError('No se pudo traer el catálogo de TiendaNube: ' + (e instanceof Error ? e.message : String(e)))
      } finally {
        if (sigueVivo()) setCargando(false)
      }
    },
    [marca],
  )

  useEffect(() => {
    let vivo = true
    void (async () => {
      await cargar(false, () => vivo)
    })()
    return () => {
      vivo = false
    }
  }, [cargar])

  useEffect(() => {
    let vivo = true
    // Los apartados pueden fallar en silencio: no poder leerlos muestra de más, que es el lado
    // seguro del error.
    leerIgnorados(marca)
      .then((l) => vivo && setIgnorados(new Set(l.map((x) => String(x.tn_id)))))
      .catch(() => {})
    // Las revisiones NO. Si no se pueden leer, todo lo ya verificado reaparece como pendiente y
    // el trabajo hecho se ve como trabajo por hacer — sin nada que lo explique. Hay que decirlo.
    leerVerificadas(marca)
      .then((l) => {
        if (!vivo) return
        setHuellas(mapaDe(l))
        setErrorRevisiones(null)
      })
      .catch((e) => vivo && setErrorRevisiones(e instanceof Error ? e.message : String(e)))
    return () => {
      vivo = false
    }
  }, [marca])

  const stockPorTn = useMemo(() => (idx && datos ? stockPorProductoTn(datos.allProductos, idx) : undefined), [idx, datos])
  const ventas90PorTn = useMemo(() => (idx && datos ? ventas90PorProductoTn(datos.allProductos, idx) : undefined), [idx, datos])

  /**
   * Stock de Gestión Nube por código, para llegar a las unidades **por variante**.
   *
   * Van también las huérfanas (`?? []`): son variantes con stock cuyo producto todavía no está en
   * `productos` —recién cargado en GN— y son justamente las que más chance tienen de no tener foto.
   */
  const stockGn = useMemo(
    () => (datos ? indexarStockGn([...datos.allVariantes, ...(datos.allVariantesHuerfanas ?? [])]) : undefined),
    [datos],
  )

  const filas = useMemo(
    () => armarFilas(data, { stockPorTn, ventas90PorTn, stockGn, huellasVerificadas: huellas }),
    [data, stockPorTn, ventas90PorTn, stockGn, huellas],
  )

  // ── Qué se está mirando ───────────────────────────────────────────────────────
  // El buscador manda sobre todo lo demás: si lo estás buscando a propósito, ya decidiste que
  // te importa, esté como esté (sin stock, verificado, apartado, o sin ningún problema).
  const buscando = busqueda.trim().length > 0

  const recortadas = useMemo(
    () =>
      verIgnorados
        ? filas.filter((f) => ignorados.has(String(f.producto.id)))
        : aplicarRecortes(filas, {
            soloConStock,
            soloQueSeVende,
            categoria: categoria || null,
            ignorados,
            verVerificados,
          }),
    [filas, verIgnorados, ignorados, soloConStock, soloQueSeVende, categoria, verVerificados],
  )

  const lista = useMemo(() => {
    if (buscando) return ordenar(buscar(filas, busqueda))
    const base = recortadas.filter(predicadoDe(filtro))
    // Cuando se está mirando qué fotografiar, el orden es por unidades: es un reporte para salir a
    // sacar fotos, y lo primero tiene que ser lo que más mercadería tiene parada sin foto.
    if (filtro === 'fotografia') {
      return [...base].sort(
        (a, b) => (b.unidadesSinFoto ?? -1) - (a.unidadesSinFoto ?? -1) || b.impacto - a.impacto,
      )
    }
    return ordenar(base)
  }, [buscando, filas, busqueda, recortadas, filtro])

  const tablero = useMemo(() => resumen(recortadas), [recortadas])
  const categorias = useMemo(() => categoriasDe(filas), [filas])
  const nVerificados = filas.filter((f) => f.verificado).length
  const nCambiados = recortadas.filter((f) => f.cambioDesdeRevision).length

  // Cuántos productos con problema quedaron afuera por los recortes. Sin esto, filtrar de más
  // se ve idéntico a "no hay nada roto": el tablero muestra cero y no dice por qué.
  const conProblema = useMemo(() => filas.filter((f) => f.estado.hayProblema || f.cambioDesdeRevision).length, [filas])
  const paraRevisar = useMemo(() => recortadas.filter(predicadoDe('para-revisar')).length, [recortadas])
  const escondidos = conProblema - tablero.productos
  // El stock y las ventas salen del ETL, que carga aparte y tarda. Mientras no esté, los
  // recortes que dependen de él no filtran nada — hay que decirlo, no simularlo.
  const cruceListo = !!stockPorTn
  const abiertaFila = abierto ? (lista.find((f) => String(f.producto.id) === abierto) ?? filas.find((f) => String(f.producto.id) === abierto)) : null

  /**
   * Dónde está parada la ficha dentro de la lista, para poder encadenar la revisión sin salir a
   * buscar el próximo a mano.
   *
   * Los ids se calculan **antes** de verificar: al marcar un producto, ese producto sale de la
   * lista y todos los de atrás se corren un lugar. Guardando el id —y no la posición— el salto
   * cae donde tiene que caer. Con `pos = -1` (se llegó por el buscador, o el producto ya salió
   * de la lista) no hay a dónde ir y los controles no aparecen.
   */
  const pos = abierto ? lista.findIndex((f) => String(f.producto.id) === abierto) : -1
  const anteriorId = pos > 0 ? String(lista[pos - 1].producto.id) : null
  const siguienteId = pos >= 0 && pos < lista.length - 1 ? String(lista[pos + 1].producto.id) : null

  // ── Escrituras ────────────────────────────────────────────────────────────────
  /**
   * Refleja el cambio en memoria y avisa que el catálogo cacheado quedó viejo. Sin lo segundo,
   * al volver a entrar a la sección se vería el estado de antes y el cambio parecería perdido
   * (en TiendaNube sí quedó hecho).
   */
  const aplicarLocal = (prodId: string | number, color: string, nuevaFoto: string | null) => {
    void bustAudit(marca)
    setData((prev) =>
      prev.map((x) =>
        String(x.id) !== String(prodId)
          ? x
          : { ...x, variantes: (x.variantes || []).map((v) => (v.color === color ? { ...v, image_url: nuevaFoto } : v)) },
      ),
    )
  }

  const accionesDe = (fila: FilaAuditoria) => {
    const prodId = fila.producto.id
    const id = String(prodId)
    return {
      vincular: async (color: string, imagen: ImagenFchk): Promise<string | null> => {
        try {
          const j = await vincularColor(marca, prodId, imagen.id, color)
          if (!j.ok || !(j.variantesObjetivo ?? 0) || (j.variantesAsignadas ?? 0) < (j.variantesObjetivo ?? 0)) {
            return j.error || ((j.variantesObjetivo ?? 0) === 0 ? `El color "${color}" no coincide con ninguna variante en la tienda.` : `Se vincularon ${j.variantesAsignadas ?? 0} de ${j.variantesObjetivo}. ${detalle(j.linkErrores)}`)
          }
          aplicarLocal(prodId, color, imagen.src)
          return null
        } catch {
          return 'Error de conexión.'
        }
      },
      quitar: async (color: string): Promise<string | null> => {
        try {
          const j = await desvincularColor(marca, prodId, color)
          if (!j.ok || !(j.variantesObjetivo ?? 0) || (j.variantesDesasignadas ?? 0) < (j.variantesObjetivo ?? 0)) {
            return j.error || `Se sacaron ${j.variantesDesasignadas ?? 0} de ${j.variantesObjetivo ?? 0}. ${detalle(j.linkErrores)}`
          }
          aplicarLocal(prodId, color, null)
          return null
        } catch {
          return 'Error de conexión.'
        }
      },
      verificar: async (huella: string): Promise<string | null> => {
        try {
          await marcarVerificado(marca, id, huella, fila.producto.name, perfil?.name)
          setHuellas((prev) => new Map(prev).set(id, huella))
          return null
        } catch (e) {
          return e instanceof Error ? e.message : String(e)
        }
      },
      desverificar: async (): Promise<string | null> => {
        try {
          await desmarcarVerificado(marca, id)
          setHuellas((prev) => {
            const n = new Map(prev)
            n.delete(id)
            return n
          })
          return null
        } catch (e) {
          return e instanceof Error ? e.message : String(e)
        }
      },
    }
  }

  const ignorar = async (fila: FilaAuditoria) => {
    const p = fila.producto
    const motivo = await pedirTexto(`¿Por qué no hay que revisar "${p.name}"?`, MOTIVOS_IGNORAR[0], {
      titulo: 'Apartar el producto',
      ok: 'Apartar',
      placeholder: MOTIVOS_IGNORAR.join(' · '),
    })
    if (motivo === null) return
    const id = String(p.id)
    setIgnorados((prev) => new Set([...prev, id]))
    try {
      await ignorarProducto(marca, id, p.name, motivo.trim() || 'Otro', perfil?.name)
    } catch (e) {
      setIgnorados((prev) => {
        const n = new Set(prev)
        n.delete(id)
        return n
      })
      toast.error('No se pudo guardar: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const exportar = async () => {
    setExportando(true)
    try {
      await exportarPendientesXLSX(lista.map((f) => ({ producto: f.producto, estado: f.estado })), marca, stockGn)
    } catch (e) {
      toast.error('No se pudo exportar: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setExportando(false)
    }
  }

  /**
   * La cola de fotos → el borrador de una sesión.
   *
   * Es la misma lista que exporta el Excel, pero en vez de terminar en un archivo que alguien
   * vuelve a tipear en el buscador del borrador, cruza a Gestión Nube y abre la solicitud con los
   * productos y **las variantes sin foto ya tildadas**.
   *
   * 🔴 El cruce no es total (BDI 89,5 % / Zattia 73,3 %), así que lo que queda afuera se dice
   * ANTES de navegar, con el motivo de cada uno: no es lo mismo «no cruza por código» (mapear el
   * SKU) que «no queda una unidad» (esperar el ingreso). Si no se pudo cruzar ninguno, no se
   * navega: abrir un borrador vacío se lee como que no había nada que fotografiar.
   */
  const mandarASesion = async () => {
    if (!datos) return
    const { pedir, excluidos } = cruzarParaSesion(
      lista.map((f) => f.producto),
      datos.allVariantes,
      datos.allVariantesHuerfanas ?? [],
    )
    if (!pedir.length) {
      await avisar({
        titulo: 'No hay nada para pedir',
        mensaje: excluidos.length
          ? `Ninguno de los ${excluidos.length} productos de la cola se pudo llevar a una sesión: ` +
            porMotivo(excluidos).map((x) => `${x.n} ${MOTIVO_EXCLUIDO_LABEL[x.motivo]}`).join(' · ') + '.'
          : 'No hay productos esperando una foto en esta vista.',
      })
      return
    }
    const unidades = pedir.reduce((a, p) => a + p.vids.length, 0)
    const detalleExcluidos = porMotivo(excluidos)
      .map((x) => `• ${x.n} ${MOTIVO_EXCLUIDO_LABEL[x.motivo]}`)
      .join('\n')
    const ok = await confirmar({
      titulo: 'Pedir una sesión de fotos',
      mensaje:
        `Se abre un borrador con ${pedir.length} ${pedir.length === 1 ? 'producto' : 'productos'} y ` +
        `${unidades} ${unidades === 1 ? 'variante tildada' : 'variantes tildadas'}.` +
        (detalleExcluidos ? `\n\nQuedan afuera ${excluidos.length}:\n${detalleExcluidos}` : ''),
      ok: 'Abrir el borrador',
    })
    if (!ok) return
    ponerPuenteFotos({
      pids: pedir.map((p) => p.pid),
      vids: pedir.flatMap((p) => p.vids),
      // 🔑 Acá la puerta SÍ sabe de dónde viene: esta lista es, por definición, lo que está a la
      // venta sin foto de su color. Por eso no se pregunta.
      disparador: 'faltante',
    })
    router.push('/sesion-fotos')
  }

  const restaurar = async (fila: FilaAuditoria) => {
    const id = String(fila.producto.id)
    setIgnorados((prev) => {
      const n = new Set(prev)
      n.delete(id)
      return n
    })
    try {
      await dejarDeIgnorar(marca, id)
    } catch (e) {
      setIgnorados((prev) => new Set([...prev, id]))
      toast.error('No se pudo guardar: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  // ── Pantalla ──────────────────────────────────────────────────────────────────
  return (
    <Card>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: font.xl, fontWeight: 700 }}>Revisar fotos por variante</div>
        <Button variant="outline" size="sm" style={{ marginLeft: 'auto' }} onClick={() => void cargar(true, () => true)} title="Volvé a traer el estado real desde TiendaNube">
          Actualizar
        </Button>
      </div>
      <div style={{ fontSize: font.sm, color: paleta.mut2, margin: '2px 0 12px' }}>
        Que ningún color muestre la foto de otro. Cada color × talle (o × modelo) es una publicación distinta, así que una foto mal
        pegada llega al cliente.
      </div>

      {cargando ? (
        <div style={{ padding: space[4], color: paleta.mut2 }}>Cargando estado de fotos…</div>
      ) : error ? (
        <Notice tone="danger">
          <b>No se pudo revisar nada.</b> {error}
          <div style={{ marginTop: space[2] }}>
            <Button size="sm" variant="outline" onClick={() => void cargar(true, () => true)}>
              Reintentar
            </Button>
          </div>
        </Notice>
      ) : (
        <>
          {/* El tablero: se cuentan publicaciones, no productos. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: space[3], marginBottom: space[4] }}>
            <KpiCard
              label="Publicaciones con la foto cruzada"
              value={tablero.cruzadas}
              tone={tablero.cruzadas ? 'danger' : 'success'}
              sub="El cliente compra un color y recibe otro"
              onClick={() => setFiltro('cruzada')}
              activo={filtro === 'cruzada'}
              accion="Ver solo estas →"
              accionActiva="Filtrando ✓"
            />
            <KpiCard
              label="Publicaciones sin foto propia"
              value={tablero.sinFoto}
              tone={tablero.sinFoto ? 'warning' : 'success'}
              sub="Muestran la foto principal del producto"
              onClick={() => setFiltro('sin-foto')}
              activo={filtro === 'sin-foto'}
              accion="Ver solo estas →"
              accionActiva="Filtrando ✓"
            />
            {/* La mercadería que está parada esperando una foto. Es lo que convierte "a este
                producto le falta una foto" en una decisión: 1.257 unidades no es lo mismo que 3. */}
            <KpiCard
              label="Unidades esperando foto"
              value={stockGn ? tablero.unidadesSinFoto.toLocaleString('es-AR') : '—'}
              tone={tablero.unidadesSinFoto ? 'warning' : 'neutral'}
              sub={stockGn ? 'En stock, sin foto de su color' : 'Cargando el stock de Gestión Nube…'}
              onClick={() => setFiltro('fotografia')}
              activo={filtro === 'fotografia'}
              accion="Qué fotografiar →"
              accionActiva="Filtrando ✓"
            />
            {/* La otra mitad del trabajo: los que figuran sanos y nadie miró todavía. El error
                que ninguna máquina puede ver —la foto de otro color, bien vinculada— vive
                justo acá, así que sin esta tarjeta esa cola no existía. */}
            <KpiCard
              label="Sanos, falta mirarlos a ojo"
              value={paraRevisar}
              tone={paraRevisar ? 'neutral' : 'success'}
              sub={nVerificados ? `${nVerificados} ya verificados` : 'Ninguno verificado todavía'}
              onClick={() => setFiltro('para-revisar')}
              activo={filtro === 'para-revisar'}
              accion="Empezar a revisar →"
              accionActiva="Revisando ✓"
            />
          </div>

          {errorRevisiones && (
            <Notice tone="warning" style={{ marginBottom: space[3] }}>
              <b>No se pudo leer qué productos ya revisaste</b>, así que abajo van a aparecer todos como pendientes
              aunque ya los hayas mirado. Lo demás de la pantalla anda bien.
              <div style={{ fontSize: font.sm, color: paleta.mut, marginTop: 4 }}>{errorRevisiones}</div>
            </Notice>
          )}

          {nCambiados > 0 && (
            <Notice tone="warning" style={{ marginBottom: space[3] }}>
              <b>{nCambiados === 1 ? 'Un producto cambió' : `${nCambiados} productos cambiaron`} después de la última
              revisión.</b> Alguien cargó o revinculó fotos, así que lo que se había dado por bueno hay que mirarlo de
              nuevo. Están en la lista, marcados.
            </Notice>
          )}

          {/* Buscador. Va arriba de todo y por fuera de los filtros a propósito: es el otro
              modo de usar la pantalla, no un filtro más. */}
          <div style={{ marginBottom: space[3] }}>
            <input
              className="mo-input"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o código (escaneá el producto)…"
              style={{ width: '100%', padding: '9px 11px', border: `1px solid ${busqueda ? paleta.brandBorder : paleta.line2}`, borderRadius: 8 }}
            />
            {buscando && (
              <div style={{ fontSize: font.sm, color: paleta.brand, marginTop: 4 }}>
                Buscando en el catálogo entero, sin filtros — {lista.length === 1 ? '1 producto' : `${lista.length} productos`}.{' '}
                <button onClick={() => setBusqueda('')} style={enlace}>
                  Volver a la lista
                </button>
              </div>
            )}
          </div>

          {!buscando && (
            <>
              <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', marginBottom: space[2], paddingBottom: space[2], borderBottom: `1px solid ${paleta.bg2}` }}>
                <label style={{ ...etiqueta, opacity: cruceListo ? 1 : 0.55 }} title={cruceListo ? undefined : 'Todavía se están cargando los datos de Gestión Nube'}>
                  <input type="checkbox" checked={soloConStock} disabled={verIgnorados} onChange={(e) => setSoloConStock(e.target.checked)} />
                  Solo con stock
                </label>
                <label style={{ ...etiqueta, opacity: cruceListo ? 1 : 0.55 }} title={cruceListo ? undefined : 'Todavía se están cargando los datos de Gestión Nube'}>
                  <input type="checkbox" checked={soloQueSeVende} disabled={verIgnorados} onChange={(e) => setSoloQueSeVende(e.target.checked)} />
                  Solo lo que se vende
                </label>
                {!cruceListo && (
                  <span style={{ fontSize: font.xs, color: paleta.mut2 }}>
                    (el stock y las ventas todavía se están cargando: por ahora estos dos no filtran)
                  </span>
                )}
                <InfoPopover titulo="Solo lo que se vende">
                  Mira las ventas de los últimos 90 días en Gestión Nube. Es el recorte que hace que la revisión se
                  pueda terminar: en Zattia son 288 productos con color en la variante y revisarlos todos a ojo no
                  termina nunca; revisar los que se venden, sí. Si mañana uno empieza a venderse, vuelve solo a la
                  lista. Los que no se pudieron cruzar con la tienda se muestran igual.
                </InfoPopover>

                {categorias.length > 0 && (
                  <label style={etiqueta}>
                    Categoría
                    <select
                      value={categoria}
                      disabled={verIgnorados}
                      onChange={(e) => setCategoria(e.target.value)}
                      style={{ padding: '5px 8px', border: `1px solid ${paleta.line2}`, borderRadius: 7, fontSize: font.base, cursor: 'pointer', maxWidth: 220 }}
                    >
                      <option value="">Todas</option>
                      {categorias.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                )}

                <label style={etiqueta}>
                  <input type="checkbox" checked={verVerificados} disabled={verIgnorados} onChange={(e) => setVerVerificados(e.target.checked)} />
                  Mostrar los ya verificados
                </label>

                <Button size="sm" variant={verIgnorados ? 'soft' : 'outline'} style={{ marginLeft: 'auto' }} onClick={() => setVerIgnorados((v) => !v)}>
                  {verIgnorados ? '← Volver a la revisión' : `Apartados (${ignorados.size})`}
                </Button>
              </div>

              <div style={{ marginBottom: space[3] }}>
                <Chips<FiltroProblema>
                  value={filtro}
                  onChange={setFiltro}
                  opciones={[
                    { key: 'todo', label: 'Todo lo que falta' },
                    { key: 'cruzada', label: 'Foto cruzada', title: 'La misma foto en dos colores: el cliente recibe otro color' },
                    { key: 'sin-foto', label: 'Sin foto propia' },
                    { key: 'escritorio', label: 'Se arregla acá', title: 'La foto ya existe en el producto: solo falta pegarla' },
                    { key: 'fotografia', label: 'Falta fotografiar', title: 'No hay ninguna foto de ese color' },
                    {
                      key: 'para-revisar',
                      label: `Mirar a ojo (${paraRevisar})`,
                      title: 'Figuran sanos, pero la máquina no puede ver si la foto es del color que dice',
                    },
                  ]}
                />
              </div>
            </>
          )}

          {!buscando && !verIgnorados && filtro === 'fotografia' && lista.length > 0 && (
            <Notice tone="warning" style={{ marginBottom: space[3] }}>
              <b>Esto es lo que hay que fotografiar</b>, ordenado por la mercadería que tiene parada sin foto de su
              color. Las unidades salen de Gestión Nube (local + depósito). Los que dicen «sin dato» no se pudieron
              cruzar por código — se muestran igual, porque no saber no es lo mismo que no tener.
              <div style={{ marginTop: space[2], display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                {/* El Excel saca la lista de la app; esto la mete en el trabajo. Antes, para pedir
                    la mercadería había que buscar cada producto de nuevo, a mano, en el borrador. */}
                <Button size="sm" variant="solid" disabled={!datos} onClick={() => void mandarASesion()}>
                  Pedir una sesión de fotos
                </Button>
                <Button size="sm" variant="outline" loading={exportando} onClick={() => void exportar()}>
                  Exportar a Excel ({lista.length} {lista.length === 1 ? 'producto' : 'productos'})
                </Button>
              </div>
            </Notice>
          )}

          {!buscando && !verIgnorados && filtro === 'para-revisar' && lista.length > 0 && (
            <Notice tone="neutral" style={{ marginBottom: space[3] }}>
              <b>Estos figuran bien y por eso hay que mirarlos.</b> La pantalla puede darse cuenta de que dos colores
              comparten una foto, pero no puede mirar una foto y decir de qué color es: si alguien pegó la violeta en
              el azul, y cada una es un archivo distinto, el producto se ve impecable. Abrí cada uno, confirmá que cada
              color muestre lo suyo y apretá <b>Verificado</b>. Van ordenados por lo que costaría que estén mal.
            </Notice>
          )}

          {!buscando && !verIgnorados && filtro !== 'para-revisar' && escondidos > 0 && (
            <div style={{ fontSize: font.sm, color: paleta.mut2, marginBottom: space[2] }}>
              {escondidos === 1 ? 'Hay 1 producto con problema fuera de esta vista' : `Hay ${escondidos} productos con problema fuera de esta vista`} por los
              filtros de arriba.{' '}
              <button
                onClick={() => {
                  setSoloConStock(false)
                  setSoloQueSeVende(false)
                  setCategoria('')
                }}
                style={enlace}
              >
                Ver todo
              </button>
            </div>
          )}

          {!lista.length ? (
            <div style={{ color: paleta.mut2, fontSize: font.base, padding: space[5], textAlign: 'center' }}>
              {buscando
                ? 'Ningún producto coincide con esa búsqueda.'
                : verIgnorados
                  ? 'No hay productos apartados de la revisión.'
                  : filtro === 'para-revisar'
                    ? '✓ No queda ninguno por mirar a ojo con estos filtros.'
                    : conProblema > 0
                    ? `Los ${conProblema} productos con algo para arreglar quedaron fuera de esta vista. Sacá los filtros de arriba para verlos.`
                    : `✓ Los ${data.length} productos de la tienda están bien.`}
            </div>
          ) : (
            <>
              {lista.slice(0, MAX).map((f) => (
                <Fila
                  key={String(f.producto.id)}
                  f={f}
                  apartado={verIgnorados}
                  mostrarUnidades={filtro === 'fotografia' && !buscando && !verIgnorados}
                  onAbrir={() => setAbierto(String(f.producto.id))}
                  onApartar={() => void ignorar(f)}
                  onRestaurar={() => void restaurar(f)}
                />
              ))}
              {lista.length > MAX && (
                <div style={{ color: paleta.mut2, fontSize: font.sm, textAlign: 'center', padding: space[2] }}>
                  Mostrando los {MAX} de mayor impacto, de {lista.length}. Afiná con los filtros o buscá el producto.
                </div>
              )}
            </>
          )}
        </>
      )}

      {abiertaFila && (
        <FichaProducto
          /* Remonta la ficha al saltar de producto: sin esto, el elegidor abierto y la foto
             candidata del anterior seguirían en pantalla sobre el nuevo. */
          key={String(abiertaFila.producto.id)}
          fila={abiertaFila}
          marca={marca}
          acciones={accionesDe(abiertaFila)}
          stockGn={stockGn}
          posicion={pos >= 0 ? { indice: pos + 1, total: lista.length } : null}
          anteriorId={anteriorId}
          siguienteId={siguienteId}
          onIr={setAbierto}
          onCerrar={() => setAbierto(null)}
        />
      )}
    </Card>
  )
}

/** Un producto en la lista: qué le pasa y cuánto duele. Se toca para abrir la ficha. */
function Fila({
  f,
  apartado,
  mostrarUnidades,
  onAbrir,
  onApartar,
  onRestaurar,
}: {
  f: FilaAuditoria
  apartado: boolean
  /**
   * Las unidades esperando foto solo se muestran en el reporte de fotografía, que es el único
   * lugar donde el número hace algo: es el que ordena esa lista. En el resto de la pantalla se
   * mide en variantes de color, y el dato de unidades era ruido al lado de eso.
   */
  mostrarUnidades: boolean
  onAbrir: () => void
  onApartar: () => void
  onRestaurar: () => void
}) {
  const { estado: e, producto: p } = f
  const grave = e.variantesCruzadas > 0 || e.sinNingunaFoto
  const frases = useMemo(() => frasesDeProblema(e), [e])
  // Cada color con su foto, para poder mirarlos sin abrir la ficha. Sin índice de stock: acá no
  // se muestran unidades.
  const colores = useMemo(() => fichaDe(p), [p])

  return (
    <div
      style={{
        border: `1px solid ${grave ? paleta.dangerBorder : e.hayProblema ? paleta.warningBorder : paleta.line}`,
        background: grave ? paleta.dangerBg : e.hayProblema ? paleta.warningBg : paleta.surface,
        borderRadius: 9,
        padding: space[3],
        marginBottom: space[2],
        display: 'flex',
        gap: space[3],
        alignItems: 'flex-start',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>{p.name}</span>
          {f.cambioDesdeRevision && <Badge tone="warning">cambió desde la revisión</Badge>}
          {f.verificado && <Badge tone="success">verificado</Badge>}
          {e.sinNingunaFoto && <Badge tone="danger">sin ninguna foto</Badge>}
          {!e.sinNingunaFoto && e.cola === 'fotografia' && <Badge tone="neutral">falta fotografiar</Badge>}
        </div>
        <div style={{ fontSize: font.sm, color: paleta.mut, marginTop: 2 }}>
          {frases.length
            ? frases.map((fr, i) => (
                <span key={fr.texto}>
                  {i > 0 && ' · '}
                  {fr.grave ? <b style={{ color: paleta.dangerInk }}>{fr.texto}</b> : fr.texto}
                </span>
              ))
            : f.cambioDesdeRevision
              ? 'Sin problemas detectables, pero hay que volver a mirarlo.'
              : e.colores.length > 1
                ? // En la cola de revisión el dato útil no es "está bien" —eso ya se sabe— sino
                  // cuánto hay en juego si resulta que no lo está.
                  `${e.colores.length} colores en ${(p.variantes || []).filter((v) => v.color).length} variantes — confirmá que cada color muestre lo suyo`
                : 'Sin problemas detectados.'}
        </div>
        {mostrarUnidades && f.unidadesSinFoto !== undefined && f.unidadesSinFoto > 0 && (
          <div style={{ fontSize: font.sm, color: paleta.warningInk, fontWeight: 600, marginTop: 2 }}>
            {f.unidadesSinFoto.toLocaleString('es-AR')} unidades esperando foto
          </div>
        )}
        <div style={{ fontSize: font.xs, color: paleta.mut2, marginTop: 2 }}>
          {referenciaDe(p)}
          {f.ventas90 !== undefined && ` · ${f.ventas90} vendidas en 90 días`}
          {f.stock !== undefined && ` · ${f.stock} en stock`}
        </div>

        <TiraDeColores colores={colores} />
      </div>

      <div style={{ display: 'flex', gap: space[2], flex: '0 0 auto' }}>
        {apartado ? (
          <Button size="sm" variant="outline" onClick={onRestaurar}>
            Revisar de nuevo
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={onApartar} title="Este producto no hay que revisarlo (mayorista, prueba)">
            Apartar
          </Button>
        )}
        <Button size="sm" variant={e.hayProblema ? 'solid' : 'soft'} onClick={onAbrir}>
          Ver fotos
        </Button>
      </div>
    </div>
  )
}

/** Cuántos colores entran en el renglón antes de resumir. El máximo real medido son 10. */
const TOPE_COLORES = 10

/**
 * Los colores del producto con su foto, en el renglón.
 *
 * Antes acá había una sola miniatura —la del primer choque— y para saber **qué** color estaba mal
 * había que abrir la ficha. En la cola de "mirar a ojo" eso significa abrirlas todas: es
 * justamente donde no hay nada detectado y lo único que resuelve es ver las fotos juntas. Con la
 * tira, la mayoría se descarta de un vistazo y solo se abre lo dudoso.
 */
function TiraDeColores({ colores }: { colores: ColorEnFicha[] }) {
  if (!colores.length) return null
  const visibles = colores.slice(0, TOPE_COLORES)
  const resto = colores.length - visibles.length

  return (
    <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[2] }}>
      {visibles.map((c) => {
        const borde = c.comparteCon.length ? paleta.danger : !c.foto ? paleta.warningBorder : paleta.line2
        return (
          <div key={c.color} style={{ width: 58, flex: '0 0 auto' }}>
            {c.foto ? (
              <FotoTn
                src={c.foto}
                alt={c.color}
                ancho={58}
                title={c.comparteCon.length ? `Comparte la foto con ${c.comparteCon.join(', ')}` : c.color}
                style={{ width: 58, height: 58, objectFit: 'cover', borderRadius: 6, border: `2px solid ${borde}`, background: paleta.bg2, display: 'block' }}
              />
            ) : (
              <div
                title="Sin foto propia: muestra la principal del producto"
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 6,
                  border: `2px dashed ${borde}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: paleta.mut2,
                  fontSize: font.xs,
                }}
              >
                sin foto
              </div>
            )}
            <div
              title={c.color}
              style={{
                fontSize: font.xs,
                color: c.comparteCon.length ? paleta.dangerInk : paleta.mut2,
                marginTop: 2,
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {c.color}
            </div>
          </div>
        )
      })}
      {resto > 0 && (
        <div style={{ alignSelf: 'center', fontSize: font.sm, color: paleta.mut2 }}>+{resto} colores más</div>
      )}
    </div>
  )
}

const etiqueta: React.CSSProperties = {
  fontSize: font.base,
  color: paleta.ink2,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
}

const enlace: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: paleta.brand,
  cursor: 'pointer',
  textDecoration: 'underline',
  font: 'inherit',
}
