'use client'

import { useState } from 'react'
import { Badge, BuscarInput, Button, Field, MenuMulti, Notice, NumberField, SectionCard, Select, color, font, space, weight } from '@/components/ui'
import { coincide, cupoDe, idNivel, type Alerta, type Ubicacion } from '@/lib/mapa-local/core'
import type { LineaBarra, MapaLocal, ModoCupo, Modulo, Nivel, PosNivel } from '@/lib/mapa-local/tipos'
import { Prendas } from './Prendas'

const NOMBRE_POS: Record<PosNivel, string> = { alta: 'Barra de arriba', baja: 'Barra de abajo', simple: 'Barra simple', frente: 'De frente' }
const NOMBRE_LINEA: Record<LineaBarra, string> = { nc: 'Colección', sale: 'Sale', ambas: 'Las dos' }

type Armado = 'doble' | 'simple' | 'frente'
const armadoDe = (m: Modulo): Armado => (m.niveles.some((n) => n.pos === 'simple') ? 'simple' : m.niveles.some((n) => n.pos === 'frente') ? 'frente' : 'doble')

/**
 * Cambiar el armado conserva lo que se pueda: la línea y los tipos pasan a la barra nueva que
 * ocupa el mismo lugar, y las alturas salen de la regla de largos (arriba 180, abajo 105, simple 165).
 */
function rearmar(m: Modulo, a: Armado): Nivel[] {
  const de = (pos: PosNivel) => m.niveles.find((n) => n.pos === pos)
  const base = m.niveles[0]
  const copia = (pos: PosNivel, alturaCm: number, desde?: Nivel): Nivel => ({ pos, alturaCm, linea: (desde || base).linea, tipos: [...(desde || base).tipos], cupo: null })
  if (a === 'simple') return [copia('simple', 165, de('simple') || de('baja') || de('alta'))]
  if (a === 'frente') return [copia('frente', 175, de('frente') || de('alta')), copia('baja', 105, de('baja') || de('simple'))]
  return [copia('alta', 180, de('alta') || de('frente') || de('simple')), copia('baja', 105, de('baja') || de('simple'))]
}

type Props = {
  mapa: MapaLocal
  modo: ModoCupo
  modulo: Modulo
  u: Ubicacion
  alertas: Alerta[]
  /** Los tipos que se pueden elegir para una barra, con cuántas prendas hay de cada uno. */
  opcionesTipo: { key: string; label: string; n: number }[]
  editar: boolean
  onCambiar: (m: Modulo) => void
  onImprimir: () => void
}

export function Detalle({ mapa, modo, modulo, u, alertas, opcionesTipo, editar, onCambiar, onImprimir }: Props) {
  const cambiarNivel = (pos: PosNivel, cambio: Partial<Nivel>) => onCambiar({ ...modulo, niveles: modulo.niveles.map((n) => (n.pos === pos ? { ...n, ...cambio } : n)) })
  const orden = { frente: 0, alta: 1, simple: 2, baja: 3 } as const
  // El buscador vale para el módulo abierto: al cambiar de módulo arranca vacío.
  const [busqueda, setBusqueda] = useState({ codigo: modulo.codigo, q: '' })
  const q = busqueda.codigo === modulo.codigo ? busqueda.q.trim() : ''
  const todas = modulo.niveles.flatMap((n) => u.porBarra[idNivel(modulo, n)] || [])
  const halladas = q ? todas.filter((p) => coincide(p, q)).length : 0
  return (
    <SectionCard
      title={`Módulo ${modulo.codigo}`}
      subtitle={`${modulo.anchoCm} cm de ancho · ${modulo.orden}° en el recorrido`}
      actions={
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          <Button variant="outline" onClick={onImprimir}>
            Imprimir la hoja
          </Button>
          {editar && (
            <Select value={armadoDe(modulo)} onChange={(e) => onCambiar({ ...modulo, niveles: rearmar(modulo, e.target.value as Armado) })} aria-label="Armado del módulo">
              <option value="doble">Doble barra</option>
              <option value="simple">Barra simple</option>
              <option value="frente">De frente + barra</option>
            </Select>
          )}
        </div>
      }
    >
      {alertas.map((a, i) => (
        <Notice key={i} tone={a.grave ? 'danger' : 'warning'} style={{ marginBottom: space[2] }}>
          {a.pos ? <b>{NOMBRE_POS[a.pos]}: </b> : null}
          {a.texto}
        </Notice>
      ))}
      {todas.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
          <BuscarInput value={q ? busqueda.q : ''} onChange={(v) => setBusqueda({ codigo: modulo.codigo, q: v })} placeholder={`Buscar en ${modulo.codigo}: modelo o color`} />
          {q && <span style={{ fontSize: font.sm, color: halladas ? color.ink2 : color.warningInk }}>{halladas ? `${halladas} de ${todas.length} en ${modulo.codigo}` : `No está en ${modulo.codigo}`}</span>}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
        {[...modulo.niveles].sort((a, b) => orden[a.pos] - orden[b.pos]).map((n) => {
          const prendas = u.porBarra[idNivel(modulo, n)] || []
          const cupo = cupoDe(mapa, modulo, n, modo)
          const auto = cupoDe(mapa, modulo, { ...n, cupo: null }, modo)
          return (
            <div key={n.pos}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap', marginBottom: space[2] }}>
                <span style={{ fontSize: font.md, fontWeight: weight.bold, color: color.ink }}>{NOMBRE_POS[n.pos]}</span>
                <span style={{ fontSize: font.sm, color: color.mut }}>a {n.alturaCm} cm</span>
                <Badge tone={n.linea === 'sale' ? 'warning' : n.linea === 'nc' ? 'brand' : 'neutral'}>{NOMBRE_LINEA[n.linea]}</Badge>
                <span style={{ fontSize: font.sm, color: prendas.length >= cupo ? color.warningInk : color.mut }}>
                  {prendas.length} de {cupo} perchas{modo === 'tope' ? ' al tope' : ''}
                </span>
              </div>
              {n.modelos?.length ? (
                <Notice tone="brand" style={{ marginBottom: space[2] }}>
                  <b>{n.modelos.length} modelos elegidos a mano.</b> Esta barra lleva sólo esos, con todos sus colores, y ⛔ no reparte por tipo ni línea.
                  {editar && (
                    <>
                      {' '}
                      <Button variant="ghost" onClick={() => cambiarNivel(n.pos, { modelos: undefined })}>
                        Volver a repartir por tipo
                      </Button>
                    </>
                  )}
                </Notice>
              ) : null}
              {editar ? (
                <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', marginBottom: space[3] }}>
                  <Field label="Altura (cm)">
                    <NumberField value={n.alturaCm} min={20} max={300} onChange={(v) => v !== '' && cambiarNivel(n.pos, { alturaCm: v })} />
                  </Field>
                  <Field label="Línea">
                    <Select value={n.linea} onChange={(e) => cambiarNivel(n.pos, { linea: e.target.value as LineaBarra })}>
                      <option value="nc">Colección</option>
                      <option value="sale">Sale</option>
                      <option value="ambas">Las dos</option>
                    </Select>
                  </Field>
                  <Field label="Tipos de prenda">
                    <MenuMulti
                      opciones={opcionesTipo}
                      seleccion={new Set(n.tipos)}
                      onCambiar={(s) => cambiarNivel(n.pos, { tipos: [...s] })}
                      etiqueta={(k, unico) => (k === 1 && unico ? unico : `${k} tipos`)}
                      vacio="Ninguno"
                      ancho={220}
                    />
                  </Field>
                  <Field label="Cupo" hint={`Vacío = ${auto}, por ancho y tipo`}>
                    <NumberField value={n.cupo ?? ''} min={0} max={500} placeholder={String(auto)} onChange={(v) => cambiarNivel(n.pos, { cupo: v === '' ? null : v })} />
                  </Field>
                </div>
              ) : (
                <div style={{ fontSize: font.sm, color: color.ink2, marginBottom: space[2] }}>{n.tipos.length ? n.tipos.join(' · ') : 'Sin tipos asignados'}</div>
              )}
              <Prendas prendas={q ? prendas.filter((p) => coincide(p, q)) : prendas} vacio={q ? 'Nada de lo buscado en esta barra.' : 'No cae ninguna prenda en esta barra.'} />
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}
