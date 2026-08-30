'use client'

/**
 * "Recorridas" (key `recorridas`, área Compras). **El HACER**: a quién voy a ver, y qué anoto
 * parado adentro del local.
 *
 * # Qué hueco tapa
 *
 * Los locales de Flores vivían en una nota de texto, en los lugares guardados de Google Maps y en
 * la cabeza. Cada viaje empezaba de cero: sin la lista, sin lo que me había interesado la vez
 * anterior y sin lo que me habían prometido.
 *
 * ⛔ **No es el PRM.** Acá se carga y se camina; la ficha de cada proveedor —su historia, si entrega
 * lo que le pedimos y cómo vendió su mercadería— vive en `prm`, área Proveedores. El corte lo puso
 * Bruno: *«no es lo mismo comprar o querer comprar que analizar al partner»*. Las dos secciones
 * miran las MISMAS tablas y comparten `lib/prm/`.
 *
 * 🔴 **La compra NO se carga acá.** Se le manda al sistema de Ingresos y vuelve **contada** por la
 * orden de compra. Lo que se anota es el hecho ("compré") y qué, para acordarse.
 */
import { useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import {
  Badge,
  BuscarInput,
  Button,
  Chips,
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
import { escribir } from '@/lib/prm/cliente'
import { nuevoId, normalizarNombre } from '@/lib/prm/core'
import { useRecorridas } from './useRecorridas'
import { Importar } from './Importar'
import { Viaje } from './Viaje'

const ESTADOS = [
  { key: 'por_visitar', label: 'Por visitar' },
  { key: 'visitado', label: 'Visitado' },
  { key: 'compro', label: 'Le compro' },
  { key: 'descartado', label: 'Descartado' },
]

const TONO_ESTADO = { por_visitar: 'brand', visitado: 'neutral', compro: 'success', descartado: 'neutral' } as const

/** La fecha de hoy en local. ⛔ `toISOString()` da UTC y después de las 21:00 de acá cambia el día. */
function hoyLocal() {
  return new Date().toLocaleDateString('en-CA')
}

export function Recorridas() {
  const { marca } = useSesion()
  const { locales, recorridas, cargando, error, recargar } = useRecorridas(marca)
  const [vista, setVista] = useState<'locales' | 'viajes'>('locales')
  const [viaje, setViaje] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const [busca, setBusca] = useState('')
  const [estado, setEstado] = useState('')
  const [zona, setZona] = useState('')
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [aviso, setAviso] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const zonas = useMemo(() => [...new Set(locales.map((l) => l.zona).filter(Boolean))] as string[], [locales])

  const filtrados = useMemo(() => {
    const q = normalizarNombre(busca)
    return locales.filter((l) => {
      if (estado && l.estado !== estado) return false
      if (zona && l.zona !== zona) return false
      if (!q) return true
      return normalizarNombre(`${l.nombre} ${l.galeria ?? ''} ${l.direccion ?? ''} ${l.rubro ?? ''}`).includes(q)
    })
  }, [locales, busca, estado, zona])

  const sinPunto = locales.filter((l) => l.lat == null).length

  function alternar(id: string) {
    setElegidos((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  async function armarRecorrida() {
    if (!marca || !elegidos.size) return
    setTrabajando(true)
    setAviso(null)
    try {
      const r = await escribir<{ ok: true; paradas: number; sinPunto: string[] }>(marca, 'recorrida.crear', {
        id: nuevoId('rc'),
        fecha: hoyLocal(),
        zona: zona || zonas[0] || null,
        locales: [...elegidos],
      })
      // Lo que no se pudo ubicar se dice ACÁ, armando el viaje — ⛔ no cuando la persona está en la
      // calle mirando una lista que parece completa.
      setAviso(
        `Recorrida armada con ${r.paradas} parada(s)` +
          (r.sinPunto.length ? `. ${r.sinPunto.length} quedaron al final: no se pudo ubicarlas en el mapa.` : '.'),
      )
      setElegidos(new Set())
      setVista('viajes')
      recargar()
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo armar la recorrida.')
    } finally {
      setTrabajando(false)
    }
  }

  async function ubicarPendientes() {
    if (!marca) return
    setTrabajando(true)
    setAviso(null)
    try {
      const r = await escribir<{ ok: true; resueltos: number; motivos: Record<string, string> }>(
        marca,
        'geocodificar',
        {},
      )
      const fallados = Object.keys(r.motivos).length
      setAviso(
        `Se ubicaron ${r.resueltos}.` +
          (fallados ? ` ${fallados} no se pudieron: ${[...new Set(Object.values(r.motivos))].join(' · ')}` : ''),
      )
      recargar()
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo geocodificar.')
    } finally {
      setTrabajando(false)
    }
  }

  if (!marca) return null
  if (viaje) return <Viaje marca={marca} id={viaje} hoy={hoyLocal()} onVolver={() => { setViaje(null); recargar() }} />

  return (
    <div style={{ padding: space[4], display: 'grid', gap: space[3] }}>
      <div style={{ display: 'flex', gap: space[2] }}>
        <Button variant={vista === 'locales' ? 'solid' : 'ghost'} onClick={() => setVista('locales')}>
          Locales ({locales.length})
        </Button>
        <Button variant={vista === 'viajes' ? 'solid' : 'ghost'} onClick={() => setVista('viajes')}>
          Recorridas ({recorridas.length})
        </Button>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {aviso && <Notice tone="neutral" onClose={() => setAviso(null)}>{aviso}</Notice>}

      {cargando && <Esqueleto />}

      {!cargando && vista === 'locales' && (
        <>
          <FilterBar>
            <BuscarInput value={busca} onChange={setBusca} placeholder="Buscar por nombre, galería, dirección o rubro" />
            <Chips
              opciones={[{ key: '', label: 'Todos' }, ...ESTADOS]}
              value={estado}
              onChange={setEstado}
            />
            {zonas.length > 1 && (
              <Chips
                opciones={[{ key: '', label: 'Toda zona' }, ...zonas.map((z) => ({ key: z, label: z }))]}
                value={zona}
                onChange={setZona}
              />
            )}
          </FilterBar>

          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            <Button onClick={() => setImportando(true)}>Cargar en tanda</Button>
            <Button variant="outline" disabled={!elegidos.size || trabajando} onClick={() => void armarRecorrida()}>
              Armar recorrida con {elegidos.size}
            </Button>
            {sinPunto > 0 && (
              <Button variant="ghost" disabled={trabajando} onClick={() => void ubicarPendientes()}>
                Ubicar los {sinPunto} sin punto
              </Button>
            )}
          </div>

          {!locales.length ? (
            <EmptyState
              title="Todavía no hay locales cargados."
              hint="Pegá la nota que ya tenés o subí los lugares guardados de Google Maps."
              action={<Button onClick={() => setImportando(true)}>Cargar en tanda</Button>}
            />
          ) : (
            <TableWrap>
              <THead>
                <Tr>
                  <Th></Th>
                  <Th>Local</Th>
                  <Th>Dónde</Th>
                  <Th>Estado</Th>
                  <Th>Última visita</Th>
                  <Th>Abiertos</Th>
                </Tr>
              </THead>
              <TBody>
                {filtrados.map((l) => (
                  <Tr key={l.id}>
                    <Td>
                      <input type="checkbox" checked={elegidos.has(l.id)} onChange={() => alternar(l.id)} />
                    </Td>
                    <Td strong>
                      {l.nombre}
                      {l.rubro && <span style={{ color: color.mut2, fontSize: 11 }}> · {l.rubro}</span>}
                    </Td>
                    <Td wrap>
                      <span style={{ fontSize: 12, color: color.mut }}>
                        {[l.galeria, l.direccion].filter(Boolean).join(' · ') || '—'}
                        {l.lat == null && <span style={{ color: color.warningInk }}> · sin ubicar</span>}
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={TONO_ESTADO[l.estado]} subtle>
                        {ESTADOS.find((e) => e.key === l.estado)?.label ?? l.estado}
                      </Badge>
                    </Td>
                    <Td>{l.ultimaVisita?.fecha ?? '—'}</Td>
                    <Td>
                      {l.interesesAbiertos > 0 && <Badge tone="brand" subtle>{l.interesesAbiertos} interés</Badge>}{' '}
                      {l.compromisosAbiertos.length > 0 && (
                        <Badge tone="warning" subtle>{l.compromisosAbiertos.length} prometido</Badge>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </TableWrap>
          )}
        </>
      )}

      {!cargando && vista === 'viajes' && (
        <>
          {!recorridas.length ? (
            <EmptyState title="Todavía no armaste ninguna recorrida." hint="Elegí locales en la pestaña de al lado." />
          ) : (
            <TableWrap>
              <THead>
                <Tr>
                  <Th>Fecha</Th>
                  <Th>Zona</Th>
                  <Th>Estado</Th>
                  <Th></Th>
                </Tr>
              </THead>
              <TBody>
                {recorridas.map((r) => (
                  <Tr key={r.id}>
                    <Td>{r.fecha}</Td>
                    <Td>{r.zona ?? '—'}</Td>
                    <Td>
                      <Badge tone={r.estado === 'cerrada' ? 'neutral' : 'brand'} subtle>{r.estado}</Badge>
                    </Td>
                    <Td>
                      <Button size="sm" onClick={() => setViaje(r.id)}>Abrir</Button>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </TableWrap>
          )}
        </>
      )}

      {importando && marca && (
        <Importar
          marca={marca}
          existentes={locales}
          onCerrar={() => setImportando(false)}
          onGuardado={recargar}
        />
      )}
    </div>
  )
}
