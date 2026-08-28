'use client'

/**
 * "Faltantes" (key `pedidos-clientes`, área Compras).
 *
 * # Qué problema resuelve
 *
 * El local escucha todo el día qué le piden y no tiene. Eso no quedaba en ningún lado: se lo decía a
 * quien estuviera al lado y a la semana no se acordaba nadie. Cuando llega el momento de decidir qué
 * comprar, la única evidencia que el monitor puede mostrar es **lo que ya se vende** — o sea, la
 * demanda de lo que no tenemos es justo el dato que ninguna otra pantalla puede tener, porque no
 * existe una venta que lo registre.
 *
 * 🔑 **Esta pantalla es para LEERLA, no para llenarla.** El alta vive adentro de «Atención al
 * cliente» (`components/atencion/Atencion.tsx`), que es la pantalla abierta mientras se atiende. Acá
 * hay un botón de anotar igual —el mismo componente— para el que se acuerda después, pero si la
 * carga dependiera de entrar acá, esta lista estaría vacía.
 *
 * ⛔ **No es «Solicitudes de productos»** (Marketing), que es pedir un producto para fotografiarlo.
 * Es lo contrario: un producto que se pide para comprar y que no está.
 */

import { useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { HeaderAcciones } from '@/components/layout/acciones'
import {
  Badge,
  Button,
  Chips,
  EmptyState,
  Esqueleto,
  FilterBar,
  Notice,
  SectionCard,
  StatusPill,
  TBody,
  TableWrap,
  THead,
  Td,
  Th,
  Tr,
  color,
  font,
  space,
  useConfirmar,
  useToast,
} from '@/components/ui'
import {
  ETIQUETA_CANAL,
  ETIQUETA_TIPO,
  comoSeConto,
  haceCuanto,
  porQueVacio,
  rankear,
  ventanaDeDias,
} from '@/lib/pedidos-clientes/core'
import { borrarPedido, cambiarEstado } from '@/lib/pedidos-clientes/cliente'
import type { EstadoPedido, PedidoCliente, TipoFaltante } from '@/lib/pedidos-clientes/tipos'
import { AnotarFaltante } from './AnotarFaltante'
import { usePedidosClientes } from './usePedidosClientes'

/** Las ventanas que se ofrecen. Es un filtro con nombre, no un default escondido: ver `rankear`. */
const VENTANAS = [30, 90, 365] as const
type Dias = (typeof VENTANAS)[number]

type FiltroTipo = 'todo' | TipoFaltante

export function PedidosClientes() {
  const { marca } = useSesion()
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const { pedidos, decidir, ahora, cargando, error, recargar } = usePedidosClientes(marca)

  const [dias, setDias] = useState<Dias>(30)
  const [filtro, setFiltro] = useState<FiltroTipo>('todo')
  const [anotando, setAnotando] = useState(false)

  const ventana = useMemo(() => ventanaDeDias(dias, ahora), [dias, ahora])
  const delTipo = useMemo(
    () => (filtro === 'todo' ? pedidos : pedidos.filter((p) => p.tipo === filtro)),
    [pedidos, filtro],
  )
  const ranking = useMemo(() => rankear(delTipo, ventana), [delTipo, ventana])

  // La lista cruda es la misma ventana y el mismo filtro que el ranking. Que fueran distintos —una
  // lista "de todo" abajo de un ranking de 30 días— haría que los dos números no cierren y que el
  // que mira no sepa cuál creer.
  const crudos = useMemo(() => {
    const t0 = ventana.desde
    const t1 = ventana.hasta
    return delTipo
      .filter((p) => {
        const t = Date.parse(p.creado_en)
        return Number.isFinite(t) && t >= t0 && t <= t1
      })
      .sort((a, b) => (Date.parse(b.creado_en) || 0) - (Date.parse(a.creado_en) || 0))
  }, [delTipo, ventana])

  const cuenta = useMemo(
    () => ({
      todo: pedidos.length,
      no_trabajamos: pedidos.filter((p) => p.tipo === 'no_trabajamos').length,
      sin_stock: pedidos.filter((p) => p.tipo === 'sin_stock').length,
    }),
    [pedidos],
  )

  async function mover(p: PedidoCliente, estado: EstadoPedido) {
    if (!marca) return
    try {
      await cambiarEstado(marca, p.id, estado)
      await recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el estado.')
    }
  }

  async function borrar(p: PedidoCliente) {
    if (!marca) return
    const ok = await confirmar({
      titulo: '¿Eliminar este faltante?',
      mensaje: `«${p.texto}» — eliminar es para el error de carga. Si lo miraste y no lo vas a traer, va «Descartar»: así sigue contando que te lo pidieron.`,
      ok: 'Eliminarlo',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarPedido(marca, p.id)
      await recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar.')
    }
  }

  return (
    <div style={{ display: 'grid', gap: space[5] }}>
      <HeaderAcciones>
        <Button variant="solid" tone="brand" iconLeft="＋" onClick={() => setAnotando(true)}>
          Anotar un faltante
        </Button>
      </HeaderAcciones>

      <Notice tone="action">
        Lo que los clientes piden y no tenemos. <strong>Se anota desde Atención al cliente</strong>,
        que es la pantalla abierta mientras se atiende — acá se lee.{' '}
        {decidir
          ? 'Cuando algo se consigue o se decide no traerlo, se marca abajo.'
          : 'Marcar algo como conseguido o descartado lo hace Compras.'}
      </Notice>

      {error && <Notice tone="danger">{error}</Notice>}

      <FilterBar>
        <Chips
          value={String(dias)}
          onChange={(v) => setDias(Number(v) as Dias)}
          opciones={VENTANAS.map((d) => ({ key: String(d), label: d === 365 ? 'Un año' : `${d} días` }))}
        />
        <Chips
          value={filtro}
          onChange={(v) => setFiltro(v as FiltroTipo)}
          opciones={[
            { key: 'todo', label: 'Todo', n: cuenta.todo },
            { key: 'no_trabajamos', label: ETIQUETA_TIPO.no_trabajamos, n: cuenta.no_trabajamos, title: 'Variedad que no vendemos: es una compra nueva.' },
            { key: 'sin_stock', label: ETIQUETA_TIPO.sin_stock, n: cuenta.sin_stock, title: 'Lo vendemos y se acabó: es reposición.' },
          ]}
        />
      </FilterBar>

      {cargando ? (
        <Esqueleto />
      ) : (
        <>
          <SectionCard
            title={`Lo más pedido en ${dias === 365 ? 'el último año' : `los últimos ${dias} días`}`}
            /* ⚠️ El subtítulo NO es decorativo: es el "qué se contó". Un ranking sin él afirma que
               sus renglones son todo lo que pasó, y lo que quedó afuera no tiene dónde decirse. */
            subtitle={comoSeConto(ranking)}
          >
            {ranking.grupos.length === 0 ? (
              <EmptyState
                icon="🗒️"
                title={pedidos.length === 0 ? 'Todavía no anotó nadie' : 'Nada en esta ventana'}
                hint={porQueVacio(ranking, pedidos.length)}
              />
            ) : (
              <div style={{ display: 'grid', gap: space[2] }}>
                {ranking.grupos.map((g, i) => (
                  <div
                    key={g.clave}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: space[3],
                      padding: '10px 12px',
                      border: `1px solid ${color.line}`,
                      borderRadius: 10,
                      background: color.bg,
                    }}
                  >
                    <div style={{ fontSize: font.lg, fontWeight: 700, color: color.mut2, minWidth: 28, textAlign: 'right' }}>
                      {i + 1}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {/* La etiqueta es el texto tal como lo escribieron, no la clave normalizada:
                          ver `etiquetaDe` en el núcleo. */}
                      <div style={{ fontWeight: 600, color: color.ink }}>{g.etiqueta}</div>
                      {/* 🔑 Los SKU van en el renglón del ranking porque son lo que se hace DESPUÉS
                          de leerlo: el que compra no vuelve a buscar el producto por nombre. Van
                          todos los pedidos —son los talles— y no el primero: uno solo afirmaría que
                          las 7 veces fueron de ése. */}
                      {g.skus.length > 0 && (
                        <div style={{ fontSize: font.xs, color: color.mut, fontFamily: 'monospace' }}>
                          {g.skus.slice(0, 3).join(' · ')}
                          {g.skus.length > 3 ? ` +${g.skus.length - 3}` : ''}
                        </div>
                      )}
                      <div style={{ fontSize: font.xs, color: color.mut2 }}>
                        {g.canales.map((c) => ETIQUETA_CANAL[c]).join(' · ')}
                        {g.ultimo ? ` · último ${haceCuanto(g.ultimo, ahora) || g.ultimo}` : ''}
                        {g.total > 1 ? ` · escrito de ${new Set(g.pedidos.map((p) => p.texto.trim().toLowerCase())).size} formas` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                      {/* El corte por tipo va en cada renglón y no sólo en el filtro de arriba: con
                          «Todo» puesto, un 7 que son 6 reposiciones y 1 de variedad no es lo mismo
                          que 7 de variedad, y son dos compras distintas. */}
                      {g.porTipo.no_trabajamos > 0 && (
                        <Badge tone="neutral" subtle>{g.porTipo.no_trabajamos} no lo trabajamos</Badge>
                      )}
                      {g.porTipo.sin_stock > 0 && <Badge tone="warning" subtle>{g.porTipo.sin_stock} sin stock</Badge>}
                      {/* 🔴 Los dos van juntos y no sólo el verde. Caminarlo en prod (23-ago-2026)
                          mostró que con «1 conseguido» al lado de un 3, el descartado queda
                          invisible: el total sigue diciendo la verdad y **la pantalla afirma que
                          quedan 2 pendientes cuando queda 1**. Un estado que no se nombra se lee
                          como el default. */}
                      {g.conseguidos > 0 && <Badge tone="success" subtle>{g.conseguidos} conseguido{g.conseguidos > 1 ? 's' : ''}</Badge>}
                      {g.descartados > 0 && <Badge tone="neutral" subtle>{g.descartados} descartado{g.descartados > 1 ? 's' : ''}</Badge>}
                      <div style={{ fontSize: font.lg, fontWeight: 700, minWidth: 34, textAlign: 'right' }}>{g.total}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Todo lo anotado"
            subtitle={`Los ${crudos.length} de la misma ventana, del más nuevo al más viejo. Acá se corrige y se marca.`}
          >
            {crudos.length === 0 ? (
              <EmptyState icon="🗒️" title="Nada en esta ventana" hint={porQueVacio(ranking, pedidos.length)} />
            ) : (
              <TableWrap>
                <THead>
                  <Tr>
                    <Th>Qué pidieron</Th>
                    <Th>Por qué falta</Th>
                    <Th>Canal</Th>
                    <Th>Cuándo</Th>
                    <Th>Quién lo anotó</Th>
                    <Th>Estado</Th>
                    <Th />
                  </Tr>
                </THead>
                <TBody>
                  {crudos.map((p) => (
                    <Tr key={p.id}>
                      <Td>
                        <div style={{ fontWeight: 600 }}>{p.texto}</div>
                        {/* El artículo elegido, cuando lo eligieron. Es la diferencia entre «me
                            pidieron un corset» y «me pidieron el talle 2, sku ZT-1043-2». */}
                        {p.producto_id && (
                          <div style={{ fontSize: font.xs, color: color.mut }}>
                            {p.variante ? `${p.variante} · ` : ''}
                            <span style={{ fontFamily: 'monospace' }}>{p.sku || 's/sku'}</span>
                          </div>
                        )}
                        {(p.cliente || p.nota) && (
                          <div style={{ fontSize: font.xs, color: color.mut2 }}>
                            {[p.cliente, p.nota].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </Td>
                      <Td>{ETIQUETA_TIPO[p.tipo]}</Td>
                      <Td>{ETIQUETA_CANAL[p.canal]}</Td>
                      <Td>{haceCuanto(p.creado_en, ahora) || p.creado_en}</Td>
                      <Td>{p.creado_por || '—'}</Td>
                      <Td>
                        {p.estado === 'conseguido' ? (
                          <StatusPill tone="success" label="CONSEGUIDO" />
                        ) : p.estado === 'descartado' ? (
                          <StatusPill tone="neutral" label="DESCARTADO" />
                        ) : (
                          <StatusPill tone="warning" label="PEDIDO" />
                        )}
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {decidir &&
                            (p.estado === 'pedido' ? (
                              <>
                                <Button size="sm" variant="outline" tone="success" onClick={() => void mover(p, 'conseguido')}>
                                  Conseguido
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => void mover(p, 'descartado')}>
                                  Descartar
                                </Button>
                              </>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => void mover(p, 'pedido')}>
                                Volver a pedido
                              </Button>
                            ))}
                          <Button size="sm" variant="ghost" tone="danger" onClick={() => void borrar(p)}>
                            Eliminar
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </TableWrap>
            )}
          </SectionCard>
        </>
      )}

      <AnotarFaltante
        marca={marca}
        abierto={anotando}
        onCerrar={() => setAnotando(false)}
        onAnotado={() => void recargar()}
      />
    </div>
  )
}
