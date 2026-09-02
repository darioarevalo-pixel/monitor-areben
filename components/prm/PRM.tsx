'use client'

/**
 * "PRM" (key `prm`, área Proveedores). **El SABER**: quién es cada proveedor y si vuelvo.
 *
 * # Por qué es una sección aparte de Recorridas
 *
 * El corte lo puso Bruno el 30-ago-2026: *«no es lo mismo comprar o querer comprar que analizar al
 * partner o proveedor»*. Son dos preguntas con dos ritmos y dos lectores —una se contesta parado en
 * la galería con el celular, la otra sentado antes de decidir— y meterlas en una pantalla las
 * arruina a las dos. Por eso el área es propia y está **al mismo nivel que Clientes**, que es donde
 * vive el CRM: PRM es a los proveedores lo que el CRM es a los clientes.
 *
 * ⛔ **Acá no se carga lo de la calle**: la visita, el interés y el compromiso se anotan en
 * `recorridas`, área Compras. Las dos secciones miran las MISMAS tablas y comparten `lib/prm/` —
 * ⛔ ninguna regla se escribe dos veces. Es el mismo arreglo que `lib/crm/`, que alimenta la sección
 * Clientes y el panel de WhatsApp.
 *
 * 🔑 **La pestaña «Lo prometido» es la que justifica la sección**: los compromisos abiertos de
 * TODOS los proveedores juntos, ordenados por urgencia. Es lo único que no se puede ver desde la
 * ficha de a uno, y es lo que se mira antes de salir.
 *
 * # 🆕 Las tres columnas MEDIDAS (2-sep-2026)
 *
 * Bruno, mirando esta lista: *«¿y la vista PRM para qué estaría hecha?»*. Medido ese día: de sus
 * cinco columnas de dato, **cuatro decían «—» en las 34 filas** —galería, zona, rubro, última
 * visita y prometido salen todas de la mano de la calle, que nadie dio todavía— así que la lista
 * era 34 nombres y un botón «Abrir».
 *
 * ⇒ **Comprado · Vendido · por día**, que sí están medidos, y que ⛔ no se pueden ver abriendo
 * fichas de a una. Contestan **¿a quién le recompro?**, que es la única pregunta que esta pantalla
 * puede contestar y la ficha no.
 *
 * 🔴 **La columna «Vendido» ⛔ NO SE PUEDE SUMAR** y ⛔ no es «cuánto de lo suyo se vendió»: son las
 * ventas de **los productos que él trajo**, y un producto traído por dos proveedores cuenta entero
 * en los dos (2 de 349 al 2-sep). Las dos frases van en la pantalla, no acá.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import {
  Badge,
  BuscarInput,
  Button,
  EmptyState,
  Esqueleto,
  FilterBar,
  Notice,
  TBody,
  TableWrap,
  THead,
  Td,
  Th,
  Tr,
  color,
  space,
} from '@/components/ui'
import { abiertosOrdenados, normalizarNombre } from '@/lib/prm/core'
import { comparativa as calcularComparativa, type FilaComparativa } from '@/lib/prm/movimiento'
import { diaDeIngreso } from '@/lib/recepciones/core'
import { leerComparativa } from '@/lib/prm/cliente'
import { usePRM } from './usePRM'
import { FichaProveedor } from './FichaProveedor'

const TONO_SITUACION = { vencido: 'danger', hoy: 'warning', por_venir: 'neutral', sin_fecha: 'neutral', cumplido: 'success' } as const

/** La ventana de la columna «Vendido». 30 días es «los últimos días» sin que un lote viejo la infle. */
const DIAS = 30

const entero = (n: number) => Math.round(n).toLocaleString('es-AR')
const decimal = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

type Columna = 'nombre' | 'comprado' | 'vendidas' | 'porDia' | 'ultima'

/** ⛔ `toISOString()` da UTC y después de las 21:00 de acá cambia el día. */
function hoyLocal() {
  return new Date().toLocaleDateString('en-CA')
}

export function PRM() {
  const { marca } = useSesion()
  const { locales, opciones, cargando, error, recargar } = usePRM(marca)
  const [vista, setVista] = useState<'padron' | 'prometido'>('padron')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [medido, setMedido] = useState<Map<string, FilaComparativa> | null>(null)
  const [mudas, setMudas] = useState<string[]>([])
  const [orden, setOrden] = useState<{ col: Columna; desc: boolean }>({ col: 'vendidas', desc: true })

  const hoy = hoyLocal()

  /**
   * 🔑 **Va en su propio pedido, aparte del padrón.** Cruza las órdenes contra las ventas de las dos
   * marcas: hacerlo adentro del GET de la lista dejaría la pantalla en blanco hasta que llegue.
   */
  useEffect(() => {
    if (!marca) return
    let vivo = true
    void (async () => {
      try {
        const c = await leerComparativa(marca, DIAS)
        if (!vivo) return
        const filas = calcularComparativa(c.locales, c.ocs, c.lineas, c.ventasPorProducto, c.dias, (o) =>
          diaDeIngreso({ fecha_ingreso: o.fecha_ingreso ?? null, confirmada_at: o.confirmada_at, recibido_en: o.recibido_en ?? '' }),
        )
        setMedido(new Map(filas.map((f) => [f.localId, f])))
        setMudas(c.marcasMudas || [])
      } catch {
        // ⛔ Sin cartel de error: la lista sirve igual sin las columnas medidas, y un rojo arriba de
        // una pantalla que anda manda a arreglar lo que no está roto. Las celdas quedan en «—».
        if (vivo) setMedido(new Map())
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  const filtrados = useMemo(() => {
    const q = normalizarNombre(busca)
    const base = !q
      ? locales
      : locales.filter((l) =>
          normalizarNombre(`${l.nombre} ${l.galeria ?? ''} ${l.rubro ?? ''} ${l.zona ?? ''}`).includes(q),
        )
    // 🔑 El orden se aplica acá y ⛔ no en el servidor: las columnas medidas llegan en otro pedido,
    // así que ordenar allá dejaría la lista en un orden y los números en otro.
    const valor = (id: string, col: Columna): number => {
      const m = medido?.get(id)
      if (!m) return -1
      if (col === 'ultima') return m.ultima ? Number(m.ultima.replace(/-/g, '')) : -1
      return m[col] as number
    }
    return [...base].sort((a, b) => {
      if (orden.col === 'nombre') {
        const c = a.nombre.localeCompare(b.nombre, 'es')
        return orden.desc ? -c : c
      }
      const c = valor(a.id, orden.col) - valor(b.id, orden.col)
      return orden.desc ? -c : c
    })
  }, [locales, busca, medido, orden])

  const compartidos = useMemo(
    () => (medido ? [...medido.values()].filter((f) => f.compartidos > 0).length : 0),
    [medido],
  )

  const cabecera = (col: Columna, texto: string, align: 'left' | 'right' = 'right') => (
    <Th
      align={align}
      sort={orden.col === col ? (orden.desc ? 'desc' : 'asc') : null}
      onClick={() => setOrden((o) => (o.col === col ? { col, desc: !o.desc } : { col, desc: true }))}
    >
      {texto}
    </Th>
  )

  /**
   * 🔴 **Mientras carga dice «…», ⛔ NO «—».** Un guion afirma «este proveedor no vendió nada» y lo
   * afirmaría del que más vende, durante el segundo que tarda el pedido.
   */
  const celda = (id: string, f: (m: FilaComparativa) => string, dependeDeVentas = true) => {
    if (!medido) return <span style={{ color: color.mut2 }}>…</span>
    const m = medido.get(id)
    if (!m) return '—'
    // 🔴 Si la base de su marca no contestó, acá va «?» y ⛔ NO un 0. Un cero dice «no vendió nada»
    // de un proveedor del que no se pudo preguntar — y el día que falte una credencial serían 28
    // de 34 filas mintiendo con cara de dato.
    if (dependeDeVentas && m.stores.some((st) => mudas.includes(st))) {
      return <span style={{ color: color.mut2 }} title="No se pudo preguntar por esa marca">?</span>
    }
    return f(m)
  }

  /** Los compromisos abiertos de todos, con el nombre del local pegado. */
  const prometido = useMemo(() => {
    const nombre = new Map(locales.map((l) => [l.id, l.nombre]))
    const todos = locales.flatMap((l) => l.compromisosAbiertos)
    return abiertosOrdenados(todos, hoy).map((c) => ({ ...c, local: nombre.get(c.local_id) ?? '—' }))
  }, [locales, hoy])

  if (!marca) return null

  if (abierto) {
    return (
      <div style={{ padding: space[4] }}>
        <FichaProveedor
          marca={marca}
          id={abierto}
          hoy={hoy}
          opciones={opciones}
          onVolver={() => setAbierto(null)}
          onCambio={recargar}
        />
      </div>
    )
  }

  return (
    <div style={{ padding: space[4], display: 'grid', gap: space[3] }}>
      <div style={{ display: 'flex', gap: space[2] }}>
        <Button variant={vista === 'padron' ? 'solid' : 'ghost'} onClick={() => setVista('padron')}>
          Proveedores ({locales.length})
        </Button>
        <Button variant={vista === 'prometido' ? 'solid' : 'ghost'} onClick={() => setVista('prometido')}>
          Lo prometido ({prometido.length})
        </Button>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {cargando && <Esqueleto />}

      {!cargando && vista === 'padron' && (
        <>
          <FilterBar>
            <BuscarInput value={busca} onChange={setBusca} placeholder="Buscar por nombre, galería, rubro o zona" />
          </FilterBar>

          {/*
            🔴 Las dos frases que hacen que las columnas medidas no mientan. Van arriba de la tabla
            y ⛔ no en un tooltip: sin la primera, «Vendido» se lee como «cuánto de lo suyo se
            vendió» y un proveedor puede aparecer vendiendo más de lo que trajo.
          */}
          <p style={{ fontSize: 12, color: color.mut, margin: 0 }}>
            <strong>Vendido</strong> son las unidades de <strong>los productos que él trajo</strong>,
            en los últimos {DIAS} días. ⛔ No es «cuánto de lo suyo se vendió»: el mismo producto pudo
            entrar por otra orden o ya estar en el depósito.
            {compartidos > 0 && (
              <>
                {' '}Los {compartidos} marcados con <strong>*</strong> comparten algún producto con otro
                proveedor y esa venta cuenta en los dos, así que <strong>la columna no se suma</strong>.
              </>
            )}
          </p>

          {mudas.length > 0 && (
            <Notice tone="warning">
              No se pudo preguntar por las ventas de {mudas.join(' y ')}. Esas filas muestran
              <strong> ?</strong> en «Vendido» y «Por día»: ⛔ no es que no hayan vendido, es que no
              se pudo preguntar.
            </Notice>
          )}

          {!locales.length ? (
            <EmptyState
              title="Todavía no hay proveedores cargados."
              hint="Los locales se cargan en Recorridas, en el área de Compras."
            />
          ) : (
            <TableWrap>
              <THead>
                <Tr>
                  {cabecera('nombre', 'Proveedor', 'left')}
                  <Th>Dónde</Th>
                  <Th>Enganches</Th>
                  {cabecera('comprado', 'Comprado')}
                  {cabecera('vendidas', `Vendido ${DIAS} d`)}
                  {cabecera('porDia', 'Por día')}
                  {cabecera('ultima', 'Última orden')}
                  <Th>Última visita</Th>
                  <Th>Prometido</Th>
                  <Th></Th>
                </Tr>
              </THead>
              <TBody>
                {filtrados.map((l) => (
                  <Tr key={l.id}>
                    <Td strong>{l.nombre}</Td>
                    <Td wrap>
                      <span style={{ fontSize: 12, color: color.mut }}>
                        {[l.galeria, l.zona, l.rubro].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </Td>
                    {/* 🔑 Se queda: es lo que explica un «—» en las tres columnas medidas. */}
                    <Td>
                      {l.proveedor_id_ingresos != null && <Badge tone="success" subtle>entregas</Badge>}{' '}
                      {l.proveedor_gn && <Badge tone="brand" subtle>ventas</Badge>}
                      {l.proveedor_id_ingresos == null && !l.proveedor_gn && (
                        <span style={{ color: color.mut2, fontSize: 12 }}>sin enganchar</span>
                      )}
                    </Td>
                    <Td align="right" mono>{celda(l.id, (m) => entero(m.comprado), false)}</Td>
                    <Td align="right" mono>
                      {celda(l.id, (m) => entero(m.vendidas))}
                      {/* El asterisco es el solape: sus ventas también cuentan en otro proveedor. */}
                      {medido?.get(l.id)?.compartidos ? <span style={{ color: color.mut2 }}> *</span> : null}
                    </Td>
                    <Td align="right" mono>{celda(l.id, (m) => decimal(m.porDia))}</Td>
                    <Td align="right" mono>{celda(l.id, (m) => m.ultima ?? '—', false)}</Td>
                    <Td>{l.ultimaVisita?.fecha ?? '—'}</Td>
                    <Td>
                      {l.compromisosAbiertos.length ? (
                        <Badge tone="warning" subtle>{l.compromisosAbiertos.length}</Badge>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td>
                      <Button size="sm" onClick={() => setAbierto(l.id)}>Abrir</Button>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </TableWrap>
          )}
        </>
      )}

      {!cargando && vista === 'prometido' && (
        <>
          {!prometido.length ? (
            <EmptyState
              title="No hay nada prometido pendiente."
              hint="Lo que se promete se anota en la calle, desde Recorridas."
            />
          ) : (
            <TableWrap>
              <THead>
                <Tr>
                  <Th>Situación</Th>
                  <Th>Proveedor</Th>
                  <Th>Qué</Th>
                  <Th>De quién</Th>
                  <Th>Para cuándo</Th>
                  <Th>Esperando</Th>
                </Tr>
              </THead>
              <TBody>
                {prometido.map((c) => (
                  <Tr key={c.id}>
                    <Td>
                      <Badge tone={TONO_SITUACION[c.situacion]} subtle>
                        {c.situacion === 'vencido' ? `vencido hace ${c.dias}` : c.situacion.replace('_', ' ')}
                      </Badge>
                    </Td>
                    <Td strong>{c.local}</Td>
                    <Td wrap>{c.que}</Td>
                    <Td>{c.de_quien === 'yo' ? 'yo' : 'ellos'}</Td>
                    <Td>{c.para_cuando ?? '—'}</Td>
                    <Td align="right" mono>{c.diasEsperando} d</Td>
                  </Tr>
                ))}
              </TBody>
            </TableWrap>
          )}
        </>
      )}
    </div>
  )
}
