'use client'

/**
 * «Tus pantallas»: al pie de «Hoy», las demás pantallas del Monitor que esta persona puede abrir
 * (Camila el chequeo de exhibición, Agustina los conteos). Sale del mismo `catsVisibles` que el
 * menú, así que muestra exactamente lo que el menú le muestra: un permiso nuevo aparece solo acá.
 *
 * Es para el equipo en el celular, donde el menú queda escondido detrás del ☰.
 */

import Link from 'next/link'
import { useSesion } from '@/components/SesionProvider'
import { color, font, space, weight } from '@/components/ui'
import { Icono, hayIcono } from '@/components/ui/Icono'
import { catsVisibles, estaEnVariosGrupos, iconoDe, labelDeMenu } from '@/lib/nav'
import { Titulo } from './Titulo'

/** Las que ⛔ van: la Agenda es esta misma pantalla, y el resto es de todos y no es trabajo del día. */
const FUERA = new Set(['inicio', 'agenda', 'resumen', 'novedades', 'manuales', 'usuarios'])

type Entrada = { href: string; label: string; icono: string | undefined }

export function TusPantallas() {
  const { perfil, marca } = useSesion()
  const vistas = new Set<string>()
  const entradas: Entrada[] = []
  const sumar = (key: string, e: Entrada) => {
    if (FUERA.has(key) || vistas.has(e.href)) return
    vistas.add(e.href)
    entradas.push(e)
  }
  for (const cat of catsVisibles(perfil, marca)) {
    const keys = [...cat.keys, ...cat.grupos.flatMap((g) => g.keys)]
    const items = [...cat.items, ...cat.grupos.flatMap((g) => g.items)]
    for (const k of keys) {
      sumar(k, { href: estaEnVariosGrupos(k) ? `/${k}?g=${cat.id}` : `/${k}`, label: labelDeMenu(k), icono: iconoDe(k) })
    }
    for (const it of items) sumar(it.key, { href: it.ruta, label: it.label, icono: it.icono ?? iconoDe(it.key) })
  }
  if (!entradas.length) return null

  return (
    <section style={{ display: 'grid', gap: space[3] }}>
      <Titulo>Tus pantallas</Titulo>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: space[2] }}>
        {entradas.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            style={{
              display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[3]}px`,
              background: color.surface, border: `1px solid ${color.line}`, borderRadius: 12,
              color: color.ink, fontSize: font.md, fontWeight: weight.semibold, textDecoration: 'none',
              minHeight: 48,
            }}
          >
            {hayIcono(e.icono) && <span style={{ color: color.brand, display: 'grid' }}><Icono nombre={e.icono} size={18} /></span>}
            <span style={{ minWidth: 0 }}>{e.label}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
