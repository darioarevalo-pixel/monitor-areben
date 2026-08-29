'use client'

/**
 * Insumos (key `insumos`, área Administración): lo que la empresa consume y no vende.
 *
 * # Qué hueco tapa
 *
 * Bolsas, rollos de etiquetas, ribbon, cajas, papel, yerba. Hasta hoy vivían en WhatsApp: **80
 * avisos en 2026** del tipo *«estamos usando el último rollo de etiquetas zebra»* o *«no hay más
 * bolsas de despachos de zattia»*. El manual del puesto ya tenía la regla —*«los insumos se piden
 * con el anteúltimo, porque con el último ya es tarde»*— y lo único que faltaba era el lugar donde
 * el hecho existe.
 *
 * ⛔ **No es stock de mercadería.** Un insumo no existe en Gestión Nube, así que ni el espejo ni el
 * motor de conteos (que exige `inventory_id`) sirven acá: es el primer stock propio del monitor.
 *
 * 🔑 **La pantalla está armada para decidir, no para archivar.** Arriba, las dos preguntas que se
 * hacen todos los días —¿qué hay que pedir? ¿qué falta en un local?— y recién después el catálogo.
 * Son dos acciones distintas: lo que falta en un local teniendo en el depósito **no se compra, se
 * sube**, y confundirlas cuesta los días que tarda un proveedor.
 *
 * ⚠️ **No se filtra por marca**, a propósito: el depósito es uno solo y el pedido al proveedor se
 * hace una vez. Filtrar escondería la mitad de lo que hay que comprar y obligaría a cambiar de
 * marca para verlo. Cada fila lleva su chip cuando el insumo es de una marca sola.
 */

import { useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import {
  Button,
  BuscarInput,
  Chips,
  EmptyState,
  Esqueleto,
  FilterBar,
  KpiCard,
  MarcaChip,
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
  formatMoney,
  space,
  useFiltroUrl,
  type ChipOpt,
} from '@/components/ui'
import {
  CLAVES_UBICACION,
  mirarTodos,
  paraComprar,
  paraSubir,
  pedidosDemorados,
  rotuloTipo,
  rotuloUbicacion,
  rotuloUnidad,
  type VistaInsumo,
} from '@/lib/insumos/core'
import type { Ubicacion } from '@/lib/insumos/tipos'
import { useInsumos } from './useInsumos'
import { FichaInsumo } from './FichaInsumo'

type Ver = 'todos' | 'comprar' | 'subir' | 'sin-contar' | 'pedidos' | 'demorados'

const VISTAS: ChipOpt<Ver>[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'comprar', label: 'Para pedir' },
  { key: 'pedidos', label: 'Ya pedidos' },
  { key: 'demorados', label: 'Demorados' },
  { key: 'subir', label: 'Falta en un local' },
  { key: 'sin-contar', label: 'Sin contar' },
]

/** Un número con su unidad, o el rótulo de que nadie lo contó. ⛔ Nunca un 0 inventado. */
function cantidad(n: number | null, unidad: string): React.ReactNode {
  if (n == null) return <span style={{ color: color.mut2 }}>sin contar</span>
  return `${Math.round(n * 100) / 100} ${rotuloUnidad(unidad as never, n)}`
}

/** Cuántos días hace de una fecha ISO. Es la espera, y sale del libro, ⛔ no de `updated_at`. */
function haceDias(iso: string): number {
  const t = Date.parse(`${iso}T00:00:00`)
  return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : 0
}

export function Insumos() {
  const { marca } = useSesion()
  const { insumos, movimientos, pedidos, comprasPorMarca, sinRitmo, cargando, error, recargar } = useInsumos(marca)
  const [ver, setVer] = useFiltroUrl<Ver>('ver', 'todos')
  const [lugar, setLugar] = useFiltroUrl<Ubicacion | 'todas'>('ubicacion', 'todas')
  const [busca, setBusca] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [alta, setAlta] = useState(false)

  const vistas = useMemo(
    () => mirarTodos(insumos, movimientos, pedidos, comprasPorMarca),
    [insumos, movimientos, pedidos, comprasPorMarca],
  )

  const comprar = useMemo(() => paraComprar(vistas), [vistas])
  // 🔑 «Ya pedidos» y «para pedir» son listas DISTINTAS y ninguna es subconjunto de la otra: lo que
  // se pidió sale de la cola de pedir (ver `paraComprar`) pero sigue estando bajo el mínimo.
  const enCamino = useMemo(() => vistas.filter((v) => v.insumo.activo && v.pedido), [vistas])
  const demorados = useMemo(() => pedidosDemorados(vistas), [vistas])
  const subir = useMemo(() => paraSubir(vistas), [vistas])
  const sinContar = useMemo(() => vistas.filter((v) => v.insumo.activo && v.total == null), [vistas])

  const filtradas = useMemo(() => {
    let lista = vistas
    if (ver === 'comprar') lista = comprar
    else if (ver === 'subir') lista = subir.filter((g) => lugar === 'todas' || g.ubicacion === lugar).flatMap((g) => g.vistas)
    else if (ver === 'sin-contar') lista = sinContar
    else if (ver === 'pedidos') lista = enCamino
    else if (ver === 'demorados') lista = demorados
    const q = busca.trim().toLowerCase()
    if (q) lista = lista.filter((v) => v.insumo.nombre.toLowerCase().includes(q) || rotuloTipo(v.insumo.tipo).toLowerCase().includes(q))
    // Sin filtro, los apagados no se muestran: un insumo apagado es uno que se decidió no reponer.
    if (ver === 'todos' && !q) lista = lista.filter((v) => v.insumo.activo)
    return [...new Set(lista)]
  }, [vistas, comprar, subir, sinContar, enCamino, demorados, ver, lugar, busca])

  const elegida = abierto ? vistas.find((v) => v.insumo.id === abierto) ?? null : null

  if (error) {
    return (
      <div style={{ padding: space[4] }}>
        <Notice tone="danger"><strong>No se pudieron leer los insumos.</strong> {error}</Notice>
      </div>
    )
  }

  return (
    <div style={{ padding: space[4], display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/*
        🔑 Si el ritmo de una marca no se pudo medir hay que DECIRLO. Sin este cartel, un insumo de
        Zattia sin días de vida se ve igual que uno que nadie configuró — y son dos problemas de dos
        personas distintas.
      */}
      {sinRitmo.length > 0 && (
        <Notice tone="warning">
          <strong>Falta medir cuánto se gasta.</strong> No se pudieron leer las ventas de {sinRitmo.join(' y ')}, así que los insumos atados a esas
          ventas van a decir «sin ritmo». Lo que se contó a mano se sigue viendo igual.
        </Notice>
      )}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <KpiCard
          label="Para pedir"
          value={String(comprar.length)}
          sub={comprar.length ? `el más viejo, hace ${haceDias(comprar[0].reposicion.comprar!.desde)} días` : 'nada por ahora'}
          tone={comprar.length ? 'warning' : 'neutral'}
          onClick={() => setVer(ver === 'comprar' ? 'todos' : 'comprar')}
          activo={ver === 'comprar'}
        />
        <KpiCard
          label="Ya pedidos"
          value={String(enCamino.length)}
          /*
            🔑 El sub dice lo DEMORADO y no el total: un pedido en fecha no necesita a nadie, y el
            número que hace falta mirar es el que se pasó. Sin esta línea el KPI cuenta tranquilidad.
          */
          sub={demorados.length ? `${demorados.length} demorado${demorados.length > 1 ? 's' : ''}` : enCamino.length ? 'todos en fecha' : 'ninguno en camino'}
          tone={demorados.length ? 'danger' : enCamino.length ? 'brand' : 'neutral'}
          onClick={() => setVer(ver === 'pedidos' ? 'todos' : 'pedidos')}
          activo={ver === 'pedidos' || ver === 'demorados'}
        />
        <KpiCard
          label="Falta en un local"
          value={String(subir.reduce((a, g) => a + g.vistas.length, 0))}
          sub={subir.length ? 'hay en otro lugar: se sube, no se compra' : 'nada por ahora'}
          tone={subir.length ? 'warning' : 'neutral'}
          onClick={() => setVer(ver === 'subir' ? 'todos' : 'subir')}
          activo={ver === 'subir'}
        />
        <KpiCard
          label="Sin contar"
          value={String(sinContar.length)}
          sub="hasta que alguien los cuente no avisan"
          tone={sinContar.length ? 'brand' : 'neutral'}
          onClick={() => setVer(ver === 'sin-contar' ? 'todos' : 'sin-contar')}
          activo={ver === 'sin-contar'}
        />
      </div>

      <FilterBar>
        <BuscarInput value={busca} onChange={setBusca} placeholder="Buscar un insumo…" />
        <Chips opciones={VISTAS} value={ver} onChange={setVer} />
        {ver === 'subir' && (
          <Chips
            opciones={[
              { key: 'todas' as const, label: 'Todos los lugares' },
              ...CLAVES_UBICACION.map((u) => ({ key: u, label: rotuloUbicacion(u) })),
            ]}
            value={lugar}
            onChange={setLugar}
          />
        )}
        <Button variant="solid" tone="brand" onClick={() => setAlta(true)}>Cargar un insumo</Button>
      </FilterBar>

      {cargando && !insumos.length ? (
        <Esqueleto filas={6} />
      ) : !filtradas.length ? (
        <EmptyState
          title={ver === 'todos' ? 'Todavía no hay insumos cargados' : 'Nada por acá'}
          hint={
            ver === 'todos'
              ? 'Cargá lo que se consume y no se vende: bolsas, rollos de etiquetas, cajas, papel. Después, un recuento por lugar y la pantalla empieza a avisar sola.'
              : 'Probá con otro filtro.'
          }
        />
      ) : (
        <SectionCard>
          <TableWrap>
            <THead>
              <Tr>
                <Th>Insumo</Th>
                {CLAVES_UBICACION.map((u) => <Th key={u} align="right">{rotuloUbicacion(u)}</Th>)}
                <Th align="right">Total</Th>
                <Th align="right">Precio</Th>
                <Th align="right">Dura</Th>
                <Th>Estado</Th>
              </Tr>
            </THead>
            <TBody>
              {filtradas.map((v) => (
                <Fila key={v.insumo.id} v={v} onAbrir={() => setAbierto(v.insumo.id)} />
              ))}
            </TBody>
          </TableWrap>
        </SectionCard>
      )}

      {(elegida || alta) && (
        <FichaInsumo
          marca={marca}
          vista={elegida}
          onCerrar={() => {
            setAbierto(null)
            setAlta(false)
          }}
          onCambio={recargar}
        />
      )}
    </div>
  )
}

function Fila({ v, onAbrir }: { v: VistaInsumo; onAbrir: () => void }) {
  const { insumo: i, precio, dias, reposicion, pedido } = v
  return (
    <Tr onClick={onAbrir}>
      <Td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <strong>{i.nombre}</strong>
          {/* El chip sale sólo cuando el insumo es de UNA marca: vacío quiere decir las dos. */}
          {i.marcas.length === 1 && <MarcaChip marca={i.marcas[0] as 'bdi' | 'zattia'} />}
          {!i.activo && <StatusPill tone="neutral" label="apagado" />}
        </div>
        <div style={{ fontSize: 12, color: color.mut2 }}>
          {rotuloTipo(i.tipo)}
          {i.bulto && i.porBulto ? ` · se compra por ${i.bulto} de ${i.porBulto}` : ''}
        </div>
      </Td>
      {CLAVES_UBICACION.map((u) => (
        <Td key={u} align="right">{cantidad(v.porUbicacion[u] ?? null, i.unidad)}</Td>
      ))}
      <Td align="right"><strong>{cantidad(v.total, i.unidad)}</strong></Td>
      <Td align="right">
        {precio ? (
          <span title={`${precio.clase === 'promedio' ? `${precio.compras} compras` : 'una sola compra'} · desde ${precio.desde}`}>
            {formatMoney(precio.unitario)}
            <span style={{ color: color.mut2, fontSize: 11 }}>{precio.clase === 'promedio' ? ' prom.' : ' últ.'}</span>
          </span>
        ) : (
          <span style={{ color: color.mut2 }}>—</span>
        )}
      </Td>
      <Td align="right">
        {dias == null ? <span style={{ color: color.mut2 }}>sin ritmo</span> : `${Math.floor(dias)} días`}
      </Td>
      <Td>
        {/*
          🔴 **El pedido se muestra AL LADO de que falta, ⛔ no en vez de.** Que el insumo esté bajo
          el mínimo sigue siendo cierto: lo único que cambió es que la pelota está del lado del
          proveedor. Taparlo sería la pantalla afirmando que ya no falta.
        */}
        {pedido && (
          <div style={{ marginBottom: 4 }}>
            <StatusPill
              tone={pedido.demorado ? 'danger' : 'success'}
              label={
                pedido.demorado
                  ? `Pedido hace ${pedido.diasEsperando} días — se esperaba el ${pedido.esperadoEl}`
                  : `Pedido hace ${pedido.diasEsperando} días`
              }
            />
          </div>
        )}
        {reposicion.comprar ? (
          <StatusPill
            tone="warning"
            label={reposicion.comprar.motivo === 'unidades' ? 'Queda el anteúltimo' : 'No llega hasta la reposición'}
          />
        ) : reposicion.subir.length ? (
          <StatusPill tone="warning" label={`Falta en ${reposicion.subir.map((s) => rotuloUbicacion(s.ubicacion)).join(', ')}`} />
        ) : v.total == null ? (
          <StatusPill tone="neutral" label="Sin contar" />
        ) : (
          <StatusPill tone="success" label="Alcanza" />
        )}
      </Td>
    </Tr>
  )
}
