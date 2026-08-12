'use client'

/**
 * La matriz de secciones por marca: 44 filas × 2 marcas, agrupadas por sector del menú.
 *
 * Es el **ajuste fino**, no la puerta de entrada. Dar de alta a alguien se hace eligiendo su
 * función en el alta guiada; acá se viene sólo cuando hay que correr una sección puntual. Por
 * eso vive dentro de un `Plegable` y arranca cerrada.
 *
 * Los sub-permisos ya no cuelgan de acá: se fueron a "Además puede…" (`Extras.tsx`). Con ellos
 * adentro la tabla eran ~76 filas y "puede aprobar canjes" quedaba a tres niveles de
 * profundidad — sección adentro de área plegada, sub adentro de sección.
 */

import { useMemo, useState } from 'react'
import { keysDeCat, NAV_CATS, PERM_CAT, type Marca } from '@/lib/nav'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { tienePermiso } from '@/lib/usuarios/core'
import type { UsuarioConfig } from '@/lib/usuarios/tipos'
import { BuscarInput, color, font, space, weight } from '@/components/ui'
import { Casilla, Leyenda } from './casilla'
import { CheckTri } from './CheckTri'

/** En qué grupos del menú aparece cada sección (una puede colgar de varios). */
const GRUPOS_DE = new Map<string, string[]>()
for (const c of NAV_CATS) {
  for (const k of keysDeCat(c)) GRUPOS_DE.set(k, [...(GRUPOS_DE.get(k) ?? []), c.id])
}

const LABEL_AREA = new Map(NAV_CATS.map((c) => [c.id, c.label]))

/**
 * Las secciones agrupadas por sector, en el orden del menú. La lista plana de 35 filas
 * sin jerarquía era el reclamo concreto: no se sabía a qué sector correspondía cada
 * permiso, así que dar de alta a alguien era ir tildando de memoria.
 *
 * El grupo sale del **menú**, no de `PermCat.area`. El área es una sola y el menú puede
 * mostrar la misma sección en varios sectores: `solicitudes` cuelga de cuatro (Local,
 * Depósito, Marketing y Administración) pero su área es `local`, así que Config la mostraba
 * únicamente ahí y darle Solicitudes a la cuenta de Depósito era imposible desde su sector —
 * había que saber que estaba escondida en Local. Es el reclamo de Bruno.
 *
 * Las que no tienen entrada de menú caen en su área: `resumen`, y `sesion-fotos` /
 * `solicitudes-internas`, que ya no son secciones sino el detalle de Solicitudes y siguen en
 * la lista por sus sub-permisos (editar, aprobar consumos).
 */
export const AREAS = NAV_CATS.map((c) => ({
  id: c.id,
  label: c.label,
  secciones: PERM_CAT.filter((p) => (GRUPOS_DE.get(p.key) ?? [p.area]).includes(c.id)).map((p) => {
    const otros = (GRUPOS_DE.get(p.key) ?? []).filter((g) => g !== c.id)
    return {
      ...p,
      // El menú le da a la misma sección un nombre por sector ("Solicitudes a preparar" en
      // Depósito). Config usa el mismo, porque es el que la persona va a ver.
      label: c.labels?.[p.key] ?? p.label,
      info: otros.length
        ? `${p.info ?? ''} · Es la MISMA sección que ${otros.map((g) => LABEL_AREA.get(g) ?? g).join(', ')}: el permiso es uno solo, tildarlo acá lo tilda en todos (cada sector ve adentro lo suyo).`
        : p.info,
    }
  }),
})).filter((a) => a.secciones.length > 0)

type AreaDef = (typeof AREAS)[number]

/** Sin acentos y en minúscula, para que buscar "seccion" encuentre "Sección". */
const plano = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function MatrizPermisos({
  u,
  onPerm,
  onPermArea,
}: {
  u: UsuarioConfig
  onPerm: (brand: Marca, clave: string, val: boolean) => void
  onPermArea: (brand: Marca, claves: string[], val: boolean) => void
}) {
  // Las áreas arrancan plegadas: abiertas de una son 44 filas más 11 encabezados por persona.
  const [areasAbiertas, setAreasAbiertas] = useState<ReadonlySet<string>>(() => new Set())
  const [busca, setBusca] = useState('')

  /**
   * Con 44 secciones repartidas en 11 sectores, "¿dónde está Cupones?" es una pregunta real y
   * la única forma de contestarla era abrir los once. Buscando, el área se abre sola: filtrar
   * y dejar el resultado escondido detrás de un triángulo sería no filtrar.
   */
  const filtradas: AreaDef[] = useMemo(() => {
    const q = plano(busca.trim())
    if (!q) return AREAS
    return AREAS.map((a) => ({ ...a, secciones: a.secciones.filter((s) => plano(`${s.label} ${a.label} ${s.key}`).includes(q)) })).filter(
      (a) => a.secciones.length > 0,
    )
  }, [busca])

  const buscando = busca.trim().length > 0

  return (
    <>
      <div style={{ marginBottom: space[2], maxWidth: 280 }}>
        <BuscarInput value={busca} onChange={setBusca} placeholder="Buscar una sección…" />
      </div>
      <Leyenda />
      {filtradas.length === 0 ? (
        <div style={{ fontSize: font.sm, color: color.mut2, padding: space[3] }}>Ninguna sección se llama así.</div>
      ) : (
        /* La matriz se queda en una <table> propia y NO va a `mo-table`: son 44 secciones, y
           la fila de 38px del kit la volvería una pantalla y media de scroll. Acá la densidad
           es la funcionalidad. El wrapper con overflow es porque la Card padre recorta (mismo
           recurso que usa Etiquetas para su tabla cruda). */
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.base, background: color.surface, borderRadius: 'var(--mo-r-lg)' }}>
            <thead>
              <tr style={{ color: color.mut2, fontSize: font.xs }}>
                <th style={{ textAlign: 'left', padding: '5px 8px' }}>Sección</th>
                <th style={{ width: 56 }}>BDI</th>
                <th style={{ width: 56 }}>Zattia</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((area) => (
                <Area
                  key={area.id}
                  area={area}
                  u={u}
                  abierta={buscando || areasAbiertas.has(area.id)}
                  onToggle={() =>
                    setAreasAbiertas((prev) => {
                      const s = new Set(prev)
                      if (!s.delete(area.id)) s.add(area.id)
                      return s
                    })
                  }
                  onPerm={onPerm}
                  onPermArea={onPermArea}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

/**
 * Un área del menú con sus secciones. El tilde del encabezado marca/desmarca el área
 * entera para esa marca — el alta de alguien pasa de 44 clics a uno por sector.
 *
 * Al plegarse, el tilde del encabezado es lo único que dice qué hay adentro, así que necesita
 * el tercer estado: sin el indeterminado, "ninguna sección" y "la mitad" se ven igual.
 */
function Area({
  area,
  u,
  abierta,
  onToggle,
  onPerm,
  onPermArea,
}: {
  area: AreaDef
  u: UsuarioConfig
  abierta: boolean
  onToggle: () => void
  onPerm: (brand: Marca, clave: string, val: boolean) => void
  onPermArea: (brand: Marca, claves: string[], val: boolean) => void
}) {
  const celdaArea = (brand: Marca) => {
    const keys = area.secciones.filter((s) => s.brands.includes(brand)).map((s) => s.key)
    if (!keys.length)
      return (
        <td key={brand} style={{ textAlign: 'center', color: color.line2 }}>
          —
        </td>
      )
    const todas = keys.every((k) => tienePermiso(u, brand, k))
    const algunas = keys.some((k) => tienePermiso(u, brand, k))
    return (
      // El clic no burbujea: darle un sector entero de un tilde es el atajo que ya existía y
      // tiene que seguir funcionando sin abrir el área.
      <td key={brand} style={{ textAlign: 'center', height: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <CheckTri
          checked={todas}
          indeterminado={algunas}
          title={todas ? `Sacarle todo ${area.label}` : `Darle todo ${area.label}`}
          onChange={(e) => onPermArea(brand, keys, e.target.checked)}
        />
      </td>
    )
  }

  const n = area.secciones.length
  // Cuántas de este sector ve, en alguna de las dos marcas. Es lo que hace que un área
  // plegada diga algo: "12 secciones" no distingue al que ve todo del que no ve nada.
  const conAcceso = area.secciones.filter((s) => s.brands.some((b) => tienePermiso(u, b, s.key))).length

  return (
    <>
      <tr style={{ background: color.bg, borderTop: `1px solid ${color.line}` }}>
        <td
          onClick={onToggle}
          style={{ padding: '6px 8px', height: 'auto', fontSize: font.sm, fontWeight: weight.bold, color: color.ink2, cursor: 'pointer', userSelect: 'none' }}
        >
          <span aria-hidden style={{ display: 'inline-block', width: 14, color: color.mut2 }}>
            {abierta ? '▾' : '▸'}
          </span>
          {area.label}
          <span style={{ fontWeight: weight.medium, color: color.mut2, fontSize: font.xs, marginLeft: 6 }}>
            {conAcceso} de {n} {n === 1 ? 'sección' : 'secciones'}
          </span>
        </td>
        {celdaArea('bdi')}
        {celdaArea('zattia')}
      </tr>
      {abierta &&
        area.secciones.map((sec) => (
          <tr key={sec.key} style={{ borderTop: `1px solid ${color.bg2}` }}>
            {/* `height: auto` inline porque el legacy le fija --mo-row-h a todo <td> de
                .shell-content, que en pantalla angosta son 44px: por 55 filas es media
                pantalla de más. El área táctil no se pierde — vive en la casilla. */}
            <td style={{ padding: '5px 4px', height: 'auto', fontSize: 13 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                {sec.label}
                {sec.info && <InfoPopover titulo={sec.label}>{sec.info}</InfoPopover>}
              </span>
            </td>
            <Casilla u={u} brand="bdi" clave={sec.key} brands={sec.brands} onPerm={onPerm} />
            <Casilla u={u} brand="zattia" clave={sec.key} brands={sec.brands} onPerm={onPerm} />
          </tr>
        ))}
    </>
  )
}
