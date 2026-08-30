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
 */
import { useMemo, useState } from 'react'
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
import { usePRM } from './usePRM'
import { FichaProveedor } from './FichaProveedor'

const TONO_SITUACION = { vencido: 'danger', hoy: 'warning', por_venir: 'neutral', sin_fecha: 'neutral', cumplido: 'success' } as const

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

  const hoy = hoyLocal()

  const filtrados = useMemo(() => {
    const q = normalizarNombre(busca)
    if (!q) return locales
    return locales.filter((l) =>
      normalizarNombre(`${l.nombre} ${l.galeria ?? ''} ${l.rubro ?? ''} ${l.zona ?? ''}`).includes(q),
    )
  }, [locales, busca])

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

          {!locales.length ? (
            <EmptyState
              title="Todavía no hay proveedores cargados."
              hint="Los locales se cargan en Recorridas, en el área de Compras."
            />
          ) : (
            <TableWrap>
              <THead>
                <Tr>
                  <Th>Proveedor</Th>
                  <Th>Dónde</Th>
                  <Th>Enganches</Th>
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
                    <Td>
                      {l.proveedor_id_ingresos != null && <Badge tone="success" subtle>entregas</Badge>}{' '}
                      {l.proveedor_gn && <Badge tone="brand" subtle>ventas</Badge>}
                      {l.proveedor_id_ingresos == null && !l.proveedor_gn && (
                        <span style={{ color: color.mut2, fontSize: 12 }}>sin enganchar</span>
                      )}
                    </Td>
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
