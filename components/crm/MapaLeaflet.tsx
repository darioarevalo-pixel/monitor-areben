'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import type { Map as LMap, LayerGroup } from 'leaflet'
import type { Prospecto } from '@/lib/crm/prospectos'

/**
 * El mapa de la pestaña «Mapa» del CRM: un punto por local, del color de su estado.
 *
 * 🔑 Las teselas son de OpenStreetMap: gratis y sin clave (Darío, 26-oct-2026: *«mapa gratis, no
 * Google»*). Su política pide la atribución visible, por eso el renglón de abajo a la derecha.
 *
 * ⚠️ Leaflet toca `window` al importarse: se carga adentro del efecto, nunca arriba del archivo.
 * ⚠️ Los colores van por CLASE y no por `fillColor`: Leaflet los escribe como atributo SVG, y un
 * `var(--mo-*)` en un atributo no se resuelve.
 */
export function MapaLeaflet({
  puntos,
  elegido,
  onElegir,
  encuadre,
}: {
  puntos: Prospecto[]
  elegido: string | null
  onElegir: (id: string) => void
  /** Cuando cambia, el mapa se acomoda a los puntos (al cambiar de ciudad). */
  encuadre: string
}) {
  const caja = useRef<HTMLDivElement>(null)
  const mapa = useRef<LMap | null>(null)
  const capa = useRef<LayerGroup | null>(null)
  const L = useRef<typeof import('leaflet') | null>(null)
  const ultimoEncuadre = useRef<string | null>(null)
  const onElegirRef = useRef(onElegir)
  onElegirRef.current = onElegir

  // Se crea UNA vez.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const mod = await import('leaflet')
      if (!vivo || !caja.current || mapa.current) return
      L.current = mod
      const m = mod.map(caja.current, { zoomControl: true }).setView([-37.6, -57.3], 9)
      mod.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m)
      capa.current = mod.layerGroup().addTo(m)
      mapa.current = m
      dibujar()
    })()
    return () => {
      vivo = false
      mapa.current?.remove()
      mapa.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function dibujar() {
    const mod = L.current
    const m = mapa.current
    const g = capa.current
    if (!mod || !m || !g) return
    g.clearLayers()
    const con = puntos.filter((p) => p.lat != null && p.lng != null)
    for (const p of con) {
      const sel = p.id === elegido
      mod
        .circleMarker([p.lat as number, p.lng as number], {
          radius: sel ? 10 : 7,
          weight: sel ? 3 : 1.5,
          className: `pm-punto pm-${p.estado}${sel ? ' pm-sel' : ''}`,
        })
        .bindTooltip(p.nombre, { direction: 'top', offset: [0, -6] })
        .on('click', () => onElegirRef.current(p.id))
        .addTo(g)
    }
    if (ultimoEncuadre.current !== encuadre && con.length) {
      ultimoEncuadre.current = encuadre
      m.fitBounds(mod.latLngBounds(con.map((p) => [p.lat as number, p.lng as number] as [number, number])), { padding: [24, 24], maxZoom: 15 })
    }
  }

  useEffect(dibujar, [puntos, elegido, encuadre])

  return (
    <>
      <style>{`
        .pm-punto { stroke: var(--mo-surface); fill-opacity: .9; cursor: pointer; }
        .pm-sin_contactar { fill: var(--mo-mut2); }
        .pm-contactado { fill: var(--mo-brand); }
        .pm-respondio { fill: var(--mo-success); }
        .pm-descartado { fill: var(--mo-danger); fill-opacity: .35; }
        .pm-sel { stroke: var(--mo-ink); }
      `}</style>
      <div ref={caja} style={{ width: '100%', height: '100%', minHeight: 420, borderRadius: 10, overflow: 'hidden', zIndex: 0 }} />
    </>
  )
}
