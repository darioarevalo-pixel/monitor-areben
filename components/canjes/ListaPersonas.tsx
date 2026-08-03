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
  Badge, BuscarInput, Button, Chips, EmptyState, StatusPill, TableWrap, THead, TBody, Tr, Th, Td,
  color, font, space, weight, type ChipOpt, type Tone,
} from '@/components/ui'
import { instagramHref, instagramParaMostrar } from '@/lib/canjes/instagram'
import { MINIMO_CANJES_CERRADOS, NIVEL_LABEL, porQueNoHayPuntaje, type NivelPuntaje } from '@/lib/canjes/puntaje'
import { CONTACTO_LABEL, type EstadoContacto } from '@/lib/canjes/seguimiento'
import { STORE_LABEL, type CanjeStore, type EstadoCanje } from '@/lib/canjes/tipos'
import { useBorrarPersona, type PersonaEnLista } from './useCanjes'

const CONTACTO_TONE: Record<EstadoContacto, Tone> = {
  vencido: 'warning',
  proximo: 'action',
  nunca: 'neutral',
  aldia: 'success',
}

const NIVEL_TONE: Record<NivelPuntaje, Tone> = {
  alta: 'success',
  media: 'action',
  baja: 'warning',
}

/** Estados que NO cuentan como haber trabajado para esa marca. */
const SIN_ANTECEDENTE: EstadoCanje[] = ['propuesta', 'enviada', 'rechazado', 'no_acepto']

type Filtro = 'todas' | 'vencido' | 'nunca' | 'destacadas' | 'buenas' | 'vetadas'

const FILTROS: ChipOpt<Filtro>[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'vencido', label: 'Hace rato', title: 'Pasó su cadencia sin que le propongamos nada' },
  { key: 'nunca', label: 'Nunca', title: 'Están en el padrón pero todavía no hicimos ninguna acción' },
  { key: 'destacadas', label: 'Destacadas' },
  { key: 'buenas', label: 'Muy buenas', title: 'Las que ya tienen puntaje y les fue muy bien. Hace falta un mínimo de canjes cerrados para tenerlo' },
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
  store,
  onAbrir,
  onProponer,
  onBorrada,
}: {
  personas: PersonaEnLista[]
  store: CanjeStore
  onAbrir: (id: number) => void
  /** El atajo de la fila: proponerle un canje sin abrir la ficha. */
  onProponer: (p: PersonaEnLista) => void
  /** Se fue del padrón: la lista se vuelve a pedir. */
  onBorrada: () => Promise<void>
}) {
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const pedirBorrar = useBorrarPersona(store)

  const visibles = useMemo(() => {
    const busca = q.trim().toLowerCase()
    return personas.filter((p) => {
      if (filtro === 'vencido' && p._seg.estado !== 'vencido') return false
      if (filtro === 'nunca' && p._seg.estado !== 'nunca') return false
      if (filtro === 'destacadas' && !p.destacada) return false
      if (filtro === 'buenas' && !(p._puntaje.hay && p._puntaje.nivel === 'alta')) return false
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
              <Th>Puntaje</Th>
              <Th>Seguidores</Th>
              <Th />
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
                      {/* El canje nace de una idea sobre alguien que ya está acá: tener que abrir
                          la ficha primero es el paso que hace que se termine anotando en otro
                          lado. Va pegado al nombre —y no al fondo de la fila— porque la decisión
                          se toma mirando de quién se trata, no recorriendo las seis columnas.
                          `stopPropagation` porque la fila entera abre la ficha. */}
                      <Button
                        variant="soft"
                        tone="brand"
                        size="sm"
                        disabled={p.vetada}
                        title={p.vetada ? 'Está vetada' : 'Proponerle un canje'}
                        onClick={(e) => { e.stopPropagation(); onProponer(p) }}
                      >
                        + canje
                      </Button>
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
                  <PuntajeChip puntaje={p._puntaje} />
                </Td>
                <Td>
                  {p.seguidores_ig ? (
                    <span title={p.seguidores_at ? `Cargado el ${p.seguidores_at.slice(0, 10)}` : undefined}>
                      {p.seguidores_ig.toLocaleString('es-AR')}
                    </span>
                  ) : (
                    <span style={{ color: color.mut2 }}>—</span>
                  )}
                </Td>
                <Td align="right">
                  {/* Borrar desde la fila, sin entrar: lo que se saca del padrón es el @ mal
                      tipeado y la ficha duplicada, y para eso abrir la ficha es puro trámite. Si
                      ya hizo canjes el servidor lo frena y manda a vetarla — eso es historial. */}
                  <Button
                    variant="ghost"
                    tone="danger"
                    size="sm"
                    title="Borrar del padrón"
                    onClick={(e) => { e.stopPropagation(); void pedirBorrar({ id: p.id, nombre: p._nombre }, onBorrada) }}
                  >
                    Borrar
                  </Button>
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
 * El puntaje, que la mayor parte del tiempo **no existe** — y eso está bien.
 *
 * Cuando no alcanza no se muestra un número en gris ni un "0": se muestra un guion, y el motivo
 * completo en el tooltip. Un puntaje provisorio se lee como definitivo dos semanas después.
 */
function PuntajeChip({ puntaje }: { puntaje: PersonaEnLista['_puntaje'] }) {
  if (!puntaje.hay) {
    return (
      <span style={{ color: color.mut2 }} title={porQueNoHayPuntaje(puntaje)}>
        {puntaje.motivo === 'vetada' ? '—' : `${puntaje.cerrados}/${MINIMO_CANJES_CERRADOS}`}
      </span>
    )
  }
  return (
    <span
      style={{ display: 'flex', alignItems: 'center', gap: space[2] }}
      title={`Sobre ${puntaje.cerrados === 1 ? '1 canje cerrado' : `${puntaje.cerrados} canjes cerrados`}`}
    >
      <strong style={{ fontWeight: weight.medium }}>{puntaje.total}</strong>
      <StatusPill tone={NIVEL_TONE[puntaje.nivel]} label={NIVEL_LABEL[puntaje.nivel]} />
    </span>
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
    // Los dos "no" no cuentan como haber trabajado para la marca: ni el nuestro (`rechazado`) ni
    // el de ella (`no_acepto`). Una propuesta que no prosperó no es un antecedente.
    for (const c of canjes) if (!SIN_ANTECEDENTE.includes(c.estado)) s.add(c.store)
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
