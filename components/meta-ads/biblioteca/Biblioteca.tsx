'use client'

/**
 * Biblioteca — **todos los avisos de todas las cuentas en una grilla**, con la pieza a la vista.
 *
 * # Qué pregunta contesta que ninguna otra pantalla contestaba
 *
 * Los creativos se veían **campaña por campaña y a demanda**: había que entrar a Campañas, desplegar
 * una fila y recién ahí aparecían sus avisos. Nunca se veían todos juntos, así que «¿cuál de todas
 * las piezas que hicimos funcionó mejor?» no tenía dónde hacerse — y es la pregunta con la que se
 * decide qué producir después.
 *
 * # Los dos límites, escritos en la pantalla y no escondidos
 *
 * 1. **La historia empieza cuando empezó la foto diaria** (21-may-2026 a nivel aviso), no cuando
 *    empezó la cuenta. La fecha se muestra MEDIDA sobre lo que vino, no como constante.
 * 2. **Un aviso borrado en Meta aparece con sus números y sin pieza.** Su historia sigue viva en la
 *    foto; el objeto no. Se dice con una etiqueta, no se lo hace pasar por pausado.
 *
 * 🔑 **Los números salen de la base y las piezas de Meta**, y la mitad de la base sobrevive sola: si
 * Graph no contesta, la grilla igual se dibuja completa y con un cartel que dice por qué no hay
 * fotos. Ver `api/_meta-biblioteca.js`.
 */

import { useBiblioteca } from '@/components/meta-ads/biblioteca/useBiblioteca'
import { TarjetaAviso } from '@/components/meta-ads/biblioteca/TarjetaAviso'
import { ESTADOS, ORDENES, type ClaveOrden, type FiltroEstado } from '@/lib/meta-ads/biblioteca'
import { FORMATOS, ROTULO_FORMATO, type FormatoCreativo } from '@/lib/meta-ads/creativos'
import { entero, pctCien, plata, roas as roasTxt } from '@/lib/meta-ads/formato'
import {
  BuscarInput, Button, Card, EmptyState, FilterBar, Notice, SectionCard, Select,
  color, font, space, weight,
} from '@/components/ui'

export function Biblioteca() {
  const b = useBiblioteca()

  if (b.estado.fase === 'cargando') {
    return <Card style={{ color: color.mut2 }}>Leyendo la foto diaria y trayendo las piezas de Meta…</Card>
  }
  if (b.estado.fase === 'error') {
    return (
      <Notice tone="danger">
        No se pudo leer la biblioteca: {b.estado.motivo}
        <div style={{ fontSize: font.sm, marginTop: space[1] }}>
          Los números salen de <code>meta_ads_snapshot_dia</code>. Si nunca corrió la foto diaria, la
          tabla está vacía y no hay nada que mostrar.
        </div>
      </Notice>
    )
  }

  const d = b.estado.data
  const t = b.totales

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/* Si Meta no contestó, la grilla igual trae TODOS los números: decirlo evita la conclusión
          equivocada («no tenemos las piezas») sobre algo que sí está, del otro lado. */}
      {d.sinPiezas && (
        <Notice tone="warning">
          Se ven los números pero no las piezas: {d.sinPiezas}
        </Notice>
      )}

      {/* Un aviso sin marca asignada no se puede cortar por permiso, así que no se muestra. Callarlo
          dejaría a la Biblioteca mintiendo por omisión, y el arreglo es de una vez. */}
      {d.sinLinea > 0 && (
        <Notice tone="brand">
          {d.sinLinea} aviso{d.sinLinea === 1 ? '' : 's'} no se muestra{d.sinLinea === 1 ? '' : 'n'} porque
          su campaña todavía no tiene marca asignada. Se les asigna en <strong>Campañas</strong>, al pie.
        </Notice>
      )}

      <SectionCard
        title="Biblioteca de anuncios"
        subtitle={
          `${b.visibles.length} de ${b.delEje.length} avisos${d.desdeReal ? ` · la foto empieza el ${d.desdeReal}` : ''}`
          + ' · los números salen de la foto diaria y las piezas, de Meta.'
        }
      >
        <FilterBar>
          <BuscarInput
            value={b.filtros.texto}
            onChange={(v: string) => b.setFiltros({ ...b.filtros, texto: v })}
            placeholder="Buscar en el nombre y en el texto del aviso…"
          />
          {/* Los `width` fijos no son cosmética: `.mo-filterbar` es un flex con `wrap`, y un
              `<select>` sin ancho se estira a la fila entera y apila los filtros uno por renglón. */}
          <span style={{ fontSize: font.sm, color: color.mut }}>Ordenar por</span>
          <Select
            value={b.orden}
            onChange={(e) => b.setOrden(e.target.value as ClaveOrden)}
            style={{ width: 190 }}
            aria-label="Ordenar por"
          >
            {ORDENES.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
          </Select>
          <Select
            value={b.filtros.estado}
            onChange={(e) => b.setFiltros({ ...b.filtros, estado: e.target.value as FiltroEstado })}
            style={{ width: 190 }}
            aria-label="Estado"
          >
            {ESTADOS.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
          </Select>
          <Select
            value={b.filtros.formato}
            onChange={(e) => b.setFiltros({ ...b.filtros, formato: e.target.value as FormatoCreativo | 'todos' })}
            style={{ width: 190 }}
            aria-label="Formato"
          >
            <option value="todos">Todos los formatos</option>
            {FORMATOS.map((f) => <option key={f} value={f}>{ROTULO_FORMATO[f]}</option>)}
          </Select>
          <Button
            variant={b.filtros.soloFavoritos ? 'solid' : 'outline'}
            onClick={() => b.setFiltros({ ...b.filtros, soloFavoritos: !b.filtros.soloFavoritos })}
            title="Sólo las piezas marcadas por el equipo"
          >
            ★ Marcadas
          </Button>
        </FilterBar>

        {/* Los totales de LO QUE SE ESTÁ VIENDO, no de la cuenta: con un filtro puesto, un total que
            no se mueve es el que hace dudar de la pantalla entera. Los ratios se recalculan. */}
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', gap: space[3], padding: `${space[2]}px 0`,
            fontSize: font.sm, color: color.mut, borderBottom: `1px solid ${color.line}`,
            marginBottom: space[3],
          }}
        >
          <span>Gasto <strong style={{ color: color.ink, fontWeight: weight.semibold }}>{plata(t.spend)}</strong></span>
          <span>ROAS <strong style={{ color: color.ink, fontWeight: weight.semibold }}>{roasTxt(t.roas)}</strong></span>
          <span>Compras <strong style={{ color: color.ink, fontWeight: weight.semibold }}>{entero(t.compras)}</strong></span>
          <span>CPA <strong style={{ color: color.ink, fontWeight: weight.semibold }}>{t.cpa == null ? '—' : plata(t.cpa)}</strong></span>
          <span>CTR <strong style={{ color: color.ink, fontWeight: weight.semibold }}>{pctCien(t.ctr)}</strong></span>
        </div>

        {b.errorFav && <Notice tone="danger" style={{ marginBottom: space[3] }}>No se pudo guardar la marca: {b.errorFav}</Notice>}

        {b.visibles.length === 0 ? (
          <EmptyState
            title={b.delEje.length === 0 ? 'No hay avisos en este rango' : 'Ningún aviso pasa los filtros'}
            hint={
              b.delEje.length === 0
                ? 'Probá con un rango más largo, o con «Todas» las cuentas arriba. La foto diaria a nivel aviso arrancó en mayo de 2026.'
                : 'Sacá alguno de los filtros, o buscá otra cosa.'
            }
            dashed
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: space[3] }}>
            {b.visibles.map((a) => (
              <TarjetaAviso
                key={a.id}
                a={a}
                marcando={b.marcando === a.id}
                onFavorito={() => { void b.alternarFavorito(a) }}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
