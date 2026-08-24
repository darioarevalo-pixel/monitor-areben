'use client'

/**
 * El tablero: todas las fundas en una grilla, filtradas, ordenadas por lo que dijo la votación, y
 * decidibles en lote.
 *
 * # Por qué no hay más kanban
 *
 * Había cuatro columnas —Por revisar / Confirmados / En duda / Rechazados— y el 24-ago-2026 se
 * midió que **tres estaban vacías**: los 37 diseños de BDI vivían en una sola. Una columna es una
 * lista vertical, así que la pantalla era una tira de 37 tarjetas con tres columnas de aire al
 * costado. La misma información en grilla entra en seis filas.
 *
 * Los cuatro estados no se fueron: pasaron a ser los chips del filtro, que es donde un estado se
 * usa de verdad (para mirar un subconjunto), y no una columna que hay que mantener aunque no tenga
 * nada.
 */

import { useMemo, useState } from 'react'
import {
  aplicarEstadoALote,
  conteos,
  filtrarDisenos,
  ordenar,
  podarSeleccion,
  quitarLote,
} from '@/lib/disenos/core'
import { DB_ESTADOS, type Diseno, type EstadoDiseno, type OrdenDiseno } from '@/lib/disenos/tipos'
import type { PuntajesDeRonda } from '@/lib/disenos/votacion'
import { PAGE_SIZE, paginar, totalPaginas } from '@/lib/tabla'
import { BarraLote } from '@/components/disenos/BarraLote'
import { TarjetaDiseno } from '@/components/disenos/TarjetaDiseno'
import {
  BuscarInput,
  Button,
  Chips,
  EmptyState,
  FilterBar,
  Paginacion,
  Select,
  color,
  radius,
  space,
  useConfirmar,
  useFiltroUrl,
} from '@/components/ui'

export function Tablero({
  disenos,
  puntajes,
  hayRonda,
  onCambiar,
  onNombre,
  onEstado,
  onVer,
  onCargar,
  acciones,
}: {
  disenos: Diseno[]
  puntajes: PuntajesDeRonda
  hayRonda: boolean
  /** Aplica una mutación pura al tablero. Un solo `setDisenos` ⇒ un solo POST. */
  onCambiar: (mutar: (ds: Diseno[]) => Diseno[]) => void
  onNombre: (id: string, v: string) => void
  onEstado: (id: string, e: EstadoDiseno) => void
  onVer: (url: string) => void
  onCargar: (files: FileList | null) => void
  /** La fila de botones de la sección (PDF, revisión rápida, vaciar…). */
  acciones: React.ReactNode
}) {
  const { confirmar } = useConfirmar()
  const [q, setQcrudo] = useFiltroUrl<string>('q', '')
  const [estado, setEstadoCrudo] = useFiltroUrl<EstadoDiseno | 'todos'>('e', 'todos')
  // El orden por defecto es el puntaje sólo si hay una ronda: sin votos, ordenar por puntaje es
  // ordenar por nada y el orden de carga es más honesto.
  const [orden, setOrden] = useState<OrdenDiseno>(hayRonda ? 'puntaje' : 'carga')
  const [pagina, setPagina] = useState(1)
  const [selCruda, setSel] = useState<Set<string>>(new Set())

  // Cambiar de filtro vuelve a la página 1 en el mismo gesto que lo cambia. Hacerlo con un efecto
  // sobre [q, estado, orden] sería un setState en cascada, que el lint del repo rechaza con razón.
  const setQ = (v: string) => { setQcrudo(v); setPagina(1) }
  const setEstado = (v: EstadoDiseno | 'todos') => { setEstadoCrudo(v); setPagina(1) }
  const setOrdenYVolver = (v: OrdenDiseno) => { setOrden(v); setPagina(1) }

  const n = useMemo(() => conteos(disenos), [disenos])
  const visibles = useMemo(
    () => ordenar(filtrarDisenos(disenos, { q, estado }), orden, puntajes),
    [disenos, q, estado, orden, puntajes],
  )
  const paginas = totalPaginas(visibles.length)
  const pag = Math.min(pagina, Math.max(1, paginas))
  const enPantalla = useMemo(() => paginar(visibles, pag), [visibles, pag])

  // 🔑 La selección se poda a lo que está en pantalla, y se poda **al leer**, no con un efecto.
  // Sin esto, tildar doce, cambiar el chip a "Rechazados" y apretar "Confirmar los 12" mueve doce
  // diseños que ya no se ven — y el botón dice un número que no es el que hay delante. Derivarlo en
  // vez de sincronizarlo evita además el render en cascada (y el lint del repo lo prohíbe).
  const sel = useMemo(() => podarSeleccion(selCruda, enPantalla), [selCruda, enPantalla])

  const elegir = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSel(() => {
      const out = new Set(sel)
      // Shift elige el rango desde la última: con 34 fundas, tildar de a una es el mismo problema
      // que tenía el kanban.
      if (e.shiftKey && out.size) {
        const ids = enPantalla.map((d) => d.id)
        const desde = ids.findIndex((x) => out.has(x))
        const hasta = ids.indexOf(id)
        if (desde >= 0 && hasta >= 0) for (const x of ids.slice(Math.min(desde, hasta), Math.max(desde, hasta) + 1)) out.add(x)
        return out
      }
      if (out.has(id)) out.delete(id)
      else out.add(id)
      return out
    })
  }

  const enLote = (est: EstadoDiseno) => {
    onCambiar((ds) => aplicarEstadoALote(ds, sel, est))
    setSel(new Set())
  }
  const quitarElegidos = async () => {
    const ok = await confirmar({
      titulo: sel.size === 1 ? 'Quitar el diseño' : `Quitar ${sel.size} diseños`,
      tono: 'danger',
      ok: `Quitar ${sel.size === 1 ? 'el elegido' : 'los ' + sel.size}`,
      mensaje: `Se sacan del tablero compartido, para todo el equipo. Los votos que ya recibieron en una ronda quedan.`,
    })
    if (!ok) return
    onCambiar((ds) => quitarLote(ds, sel))
    setSel(new Set())
  }

  const todoElegido = enPantalla.length > 0 && enPantalla.every((d) => sel.has(d.id))

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', marginBottom: space[3] }}>{acciones}</div>

      <FilterBar>
        <BuscarInput value={q} onChange={setQ} placeholder="Buscar por nombre…" />
        <Chips<EstadoDiseno | 'todos'>
          value={estado}
          onChange={setEstado}
          opciones={[
            { key: 'todos', label: 'Todos', n: n.todos },
            ...DB_ESTADOS.map((e) => ({ key: e.k as EstadoDiseno | 'todos', label: e.lbl, n: n[e.k] })),
          ]}
        />
        <Select value={orden} onChange={(e) => setOrdenYVolver(e.target.value as OrdenDiseno)} style={{ width: 190 }} aria-label="Orden">
          <option value="puntaje">★ Puntaje de la ronda</option>
          <option value="carga">Orden de carga</option>
          <option value="nombre">Nombre</option>
        </Select>
      </FilterBar>

      {!disenos.length ? (
        <EmptyState
          icon="🖼"
          title="Todavía no hay diseños en el tablero"
          hint="Soltá las imágenes en el recuadro de abajo para empezar. Lo que cargues lo ve todo el equipo."
          dashed
        />
      ) : !visibles.length ? (
        <EmptyState
          icon="🔍"
          title="Ningún diseño coincide"
          hint={q ? `Nada para «${q}».` : 'Probá con otro estado.'}
          dashed
        />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], margin: `${space[2]}px 0`, flexWrap: 'wrap' }}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSel(todoElegido ? new Set() : new Set(enPantalla.map((d) => d.id)))}
            >
              {todoElegido ? 'Destildar los de esta página' : `Elegir ${enPantalla.length === visibles.length ? 'todos' : 'los ' + enPantalla.length + ' de esta página'}`}
            </Button>
            <span style={{ fontSize: 12, color: color.mut2 }}>Tocá una foto para elegirla · shift para un rango · ⤢ para verla grande</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: space[3] }}>
            {enPantalla.map((d) => (
              <TarjetaDiseno
                key={d.id}
                d={d}
                pt={puntajes[d.id]}
                elegida={sel.has(d.id)}
                onElegir={elegir}
                onVer={onVer}
                onNombre={onNombre}
                onEstado={onEstado}
              />
            ))}
          </div>
          {visibles.length > PAGE_SIZE && (
            <Paginacion pagina={pag} paginas={paginas} total={visibles.length} onCambiar={setPagina} singular="diseño" plural="diseños" />
          )}
        </>
      )}

      <BarraLote n={sel.size} onEstado={enLote} onQuitar={() => void quitarElegidos()} onLimpiar={() => setSel(new Set())} />

      <div
        onDragOver={(e) => {
          e.preventDefault()
          e.currentTarget.style.background = color.brandBg
        }}
        onDragLeave={(e) => (e.currentTarget.style.background = '')}
        onDrop={(e) => {
          e.preventDefault()
          e.currentTarget.style.background = ''
          onCargar(e.dataTransfer.files)
        }}
        style={{ marginTop: space[3], border: `2px dashed ${color.mut2}`, borderRadius: radius.lg, padding: 14, textAlign: 'center', color: color.mut2, fontSize: 13 }}
      >
        Arrastrá acá las imágenes de los diseños
      </div>
    </>
  )
}
