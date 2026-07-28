'use client'

/**
 * El padrón: la lista de personas con las que hacemos (o hicimos) canjes.
 *
 * Ordena por **hace cuánto que no le proponemos nada**, no alfabético ni por fecha de alta: la
 * pregunta que trae a alguien a esta pantalla es "¿a quién llamo esta semana?", y la respuesta
 * tiene que estar arriba de todo sin filtrar nada.
 *
 * ⚠️ El padrón **no se filtra por marca**, a propósito: la creadora que trabajó para BDI tiene que
 * aparecer cuando marketing de Zattia busca a quién llamar. Lo que sí se oculta son los datos de
 * los canjes de otras marcas, y eso lo hace el servidor (`resumenCiego` en `api/_canjes.js`), no
 * esta pantalla.
 */

import { useMemo, useState } from 'react'
import {
  Badge, BuscarInput, Chips, EmptyState, StatusPill, TableWrap, THead, TBody, Tr, Th, Td,
  color, font, space, weight, type ChipOpt, type Tone,
} from '@/components/ui'
import { instagramHref, instagramParaMostrar } from '@/lib/canjes/instagram'
import { CONTACTO_LABEL, type EstadoContacto } from '@/lib/canjes/seguimiento'
import { STORE_LABEL, type CanjeStore } from '@/lib/canjes/tipos'
import type { PersonaEnLista } from './useCanjes'

const CONTACTO_TONE: Record<EstadoContacto, Tone> = {
  vencido: 'warning',
  proximo: 'action',
  nunca: 'neutral',
  aldia: 'success',
}

type Filtro = 'todas' | 'vencido' | 'nunca' | 'destacadas' | 'vetadas'

const FILTROS: ChipOpt<Filtro>[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'vencido', label: 'Hace rato', title: 'Pasó su cadencia sin que le propongamos nada' },
  { key: 'nunca', label: 'Nunca', title: 'Están en el padrón pero todavía no hicimos ninguna acción' },
  { key: 'destacadas', label: 'Destacadas' },
  { key: 'vetadas', label: 'Vetadas' },
]

/** "hace 34 días" / "hace 1 día" / "nunca". La concordancia se resuelve acá, no en el JSX. */
function haceCuanto(dias: number | null): string {
  if (dias == null) return 'Nunca'
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Hace 1 día'
  return `Hace ${dias} días`
}

export function ListaPersonas({
  personas,
  onAbrir,
}: {
  personas: PersonaEnLista[]
  onAbrir: (id: number) => void
}) {
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')

  const visibles = useMemo(() => {
    const busca = q.trim().toLowerCase()
    return personas.filter((p) => {
      if (filtro === 'vencido' && p._seg.estado !== 'vencido') return false
      if (filtro === 'nunca' && p._seg.estado !== 'nunca') return false
      if (filtro === 'destacadas' && !p.destacada) return false
      if (filtro === 'vetadas' && !p.vetada) return false
      if (!busca) return true
      // Se busca por @ y por nombre a la vez: quien la conoce por el @ lo tipea, quien la conoce
      // por el nombre tipea el nombre, y ninguno de los dos tiene por qué saber cuál guardamos.
      return (
        p.instagram.includes(busca) ||
        p._nombre.toLowerCase().includes(busca) ||
        (p.ciudad || '').toLowerCase().includes(busca)
      )
    })
  }, [personas, q, filtro])

  if (!personas.length) {
    return (
      <EmptyState
        dashed
        title="Todavía no hay nadie en el padrón"
        hint="Agregá a la primera creadora con su Instagram. Es el único dato que hace falta para empezar; el resto se completa después."
      />
    )
  }

  return (
    <>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', marginBottom: space[3] }}>
        <BuscarInput value={q} onChange={setQ} placeholder="Buscar por @, nombre o ciudad" />
        <Chips opciones={FILTROS} value={filtro} onChange={setFiltro} />
        <span style={{ marginLeft: 'auto', color: color.mut, fontSize: font.sm }}>
          {visibles.length === 1 ? '1 persona' : `${visibles.length} personas`}
        </span>
      </div>

      {!visibles.length ? (
        <EmptyState dashed title="Nadie coincide con eso" hint="Probá con otro texto o sacá los filtros." />
      ) : (
        <TableWrap>
          <THead>
            <Tr>
              <Th>Persona</Th>
              <Th>Última acción</Th>
              <Th>Marcas</Th>
              <Th align="right">Canjes cerrados</Th>
              <Th>Seguidores</Th>
            </Tr>
          </THead>
          <TBody>
            {visibles.map((p) => (
              <Tr key={p.id} onClick={() => onAbrir(p.id)} style={{ cursor: 'pointer' }}>
                <Td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                      <strong style={{ fontWeight: weight.medium }}>{p._nombre}</strong>
                      {p.destacada && <Badge tone="brand" subtle>Destacada</Badge>}
                      {p.vetada && <Badge tone="danger" subtle>Vetada</Badge>}
                    </span>
                    <span style={{ color: color.mut, fontSize: font.sm }}>
                      {/* El @ abre el perfil sin pasar por la ficha: es el chequeo de 5 segundos
                          que se hace antes de decidir si vale la pena abrirla. */}
                      <a
                        href={instagramHref(p.instagram)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: color.brand, textDecoration: 'none' }}
                      >
                        {instagramParaMostrar(p.instagram, p.instagram_raw)}
                      </a>
                      {p.ciudad ? <span style={{ color: color.mut2 }}> · {p.ciudad}</span> : null}
                    </span>
                  </div>
                </Td>
                <Td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <StatusPill tone={CONTACTO_TONE[p._seg.estado]} label={CONTACTO_LABEL[p._seg.estado]} />
                    <span style={{ color: color.mut2, fontSize: font.sm }}>{haceCuanto(p._seg.dias)}</span>
                  </div>
                </Td>
                <Td>
                  <MarcasDeLaPersona canjes={p._canjes} />
                </Td>
                <Td align="right">{p._cerrados || <span style={{ color: color.mut2 }}>—</span>}</Td>
                <Td>
                  {p.seguidores_ig ? (
                    <span title={p.seguidores_at ? `Cargado el ${p.seguidores_at.slice(0, 10)}` : undefined}>
                      {p.seguidores_ig.toLocaleString('es-AR')}
                    </span>
                  ) : (
                    <span style={{ color: color.mut2 }}>—</span>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </TableWrap>
      )}
    </>
  )
}

/**
 * Para qué marcas trabajó. Los canjes de otras marcas llegan ciegos pero **se muestran igual**:
 * ocultar la existencia destruiría la única razón por la que el padrón es compartido. Lo que no se
 * muestra es la plata, y esa nunca viajó al browser.
 */
function MarcasDeLaPersona({ canjes }: { canjes: PersonaEnLista['_canjes'] }) {
  const marcas = useMemo(() => {
    const s = new Set<CanjeStore>()
    for (const c of canjes) if (c.estado !== 'borrador' && c.estado !== 'rechazado') s.add(c.store)
    return [...s]
  }, [canjes])

  if (!marcas.length) return <span style={{ color: color.mut2 }}>—</span>
  return (
    <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {marcas.map((m) => (
        <Badge key={m} tone="neutral" subtle>{STORE_LABEL[m]}</Badge>
      ))}
    </span>
  )
}
