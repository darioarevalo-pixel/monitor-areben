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
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { indexarTn, type IndiceTn } from '@/lib/tn'
import { indicesDe } from '@/lib/tn-audit'
import type { Marca } from '@/lib/nav'
import { auditVariantes, bustAudit, desvincularColor, vincularColor } from '@/lib/tncat/cliente'
import { stockPorProductoTn, ventas90PorProductoTn } from '@/lib/tncat/agotados'
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
import type { ImagenFchk, ProductoFchk } from '@/lib/tncat/tipos'
import { Badge, Button, Card, Chips, color as paleta, font, KpiCard, Notice, space, useConfirmar, useToast } from '@/components/ui'
import { FichaProducto } from './FichaProducto'

const MAX = 80

export function FotosCard({ marca }: { marca: Marca }) {
  const { pedirTexto } = useConfirmar()
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
    // Si alguna de las dos no se puede leer se sigue igual: mostrar de más es preferible a
    // esconder un producto que hay que arreglar.
    leerIgnorados(marca)
      .then((l) => vivo && setIgnorados(new Set(l.map((x) => String(x.tn_id)))))
      .catch(() => {})
    leerVerificadas(marca)
      .then((l) => vivo && setHuellas(mapaDe(l)))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [marca])

  const stockPorTn = useMemo(() => (idx && datos ? stockPorProductoTn(datos.allProductos, idx) : undefined), [idx, datos])
  const ventas90PorTn = useMemo(() => (idx && datos ? ventas90PorProductoTn(datos.allProductos, idx) : undefined), [idx, datos])

  const filas = useMemo(
    () => armarFilas(data, { stockPorTn, ventas90PorTn, huellasVerificadas: huellas }),
    [data, stockPorTn, ventas90PorTn, huellas],
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

  const lista = useMemo(
    () => (buscando ? ordenar(buscar(filas, busqueda)) : ordenar(recortadas.filter(predicadoDe(filtro)))),
    [buscando, filas, busqueda, recortadas, filtro],
  )

  const tablero = useMemo(() => resumen(recortadas), [recortadas])
  const categorias = useMemo(() => categoriasDe(filas), [filas])
  const nVerificados = filas.filter((f) => f.verificado).length
  const nCambiados = recortadas.filter((f) => f.cambioDesdeRevision).length

  // Cuántos productos con problema quedaron afuera por los recortes. Sin esto, filtrar de más
  // se ve idéntico a "no hay nada roto": el tablero muestra cero y no dice por qué.
  const conProblema = useMemo(() => filas.filter((f) => f.estado.hayProblema || f.cambioDesdeRevision).length, [filas])
  const escondidos = conProblema - tablero.productos
  // El stock y las ventas salen del ETL, que carga aparte y tarda. Mientras no esté, los
  // recortes que dependen de él no filtran nada — hay que decirlo, no simularlo.
  const cruceListo = !!stockPorTn
  const abiertaFila = abierto ? (lista.find((f) => String(f.producto.id) === abierto) ?? filas.find((f) => String(f.producto.id) === abierto)) : null

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
            return j.error || ((j.variantesObjetivo ?? 0) === 0 ? `El color "${color}" no coincide con ninguna variante en la tienda.` : `Se vincularon ${j.variantesAsignadas ?? 0} de ${j.variantesObjetivo}.`)
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
            return j.error || `Se quitaron ${j.variantesDesasignadas ?? 0} de ${j.variantesObjetivo ?? 0}.`
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
        Que ningún color muestre la foto de otro. Cada color × modelo es una publicación distinta, así que una foto mal
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
            <KpiCard label="Productos para revisar" value={tablero.productos} sub={`${nVerificados} ya verificados`} />
          </div>

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
                  ]}
                />
              </div>
            </>
          )}

          {!buscando && !verIgnorados && escondidos > 0 && (
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
          fila={abiertaFila}
          marca={marca}
          acciones={accionesDe(abiertaFila)}
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
  onAbrir,
  onApartar,
  onRestaurar,
}: {
  f: FilaAuditoria
  apartado: boolean
  onAbrir: () => void
  onApartar: () => void
  onRestaurar: () => void
}) {
  const { estado: e, producto: p } = f
  const grave = e.variantesCruzadas > 0
  const miniaturas = e.choques[0]?.foto ? [e.choques[0].foto] : []

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
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      {miniaturas.map((src) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt="" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 6, border: `2px solid ${paleta.danger}`, flex: '0 0 auto' }} />
      ))}

      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>{p.name}</span>
          {f.cambioDesdeRevision && <Badge tone="warning">cambió desde la revisión</Badge>}
          {f.verificado && <Badge tone="success">verificado</Badge>}
          {e.cola === 'fotografia' && <Badge tone="neutral">falta fotografiar</Badge>}
        </div>
        <div style={{ fontSize: font.sm, color: paleta.mut, marginTop: 2 }}>
          {e.variantesCruzadas > 0 && (
            <b style={{ color: paleta.dangerInk }}>
              {e.variantesCruzadas === 1 ? '1 publicación con la foto de otro color' : `${e.variantesCruzadas} publicaciones con la foto de otro color`}
            </b>
          )}
          {e.variantesCruzadas > 0 && e.variantesSinFoto > 0 && ' · '}
          {e.variantesSinFoto > 0 && `${e.variantesSinFoto} sin foto propia`}
          {!e.hayProblema && (f.cambioDesdeRevision ? 'Sin problemas detectables, pero hay que volver a mirarlo.' : 'Sin problemas detectados.')}
        </div>
        <div style={{ fontSize: font.xs, color: paleta.mut2, marginTop: 2 }}>
          {referenciaDe(p)}
          {f.ventas90 !== undefined && ` · ${f.ventas90} vendidas en 90 días`}
          {f.stock !== undefined && ` · ${f.stock} en stock`}
        </div>
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
