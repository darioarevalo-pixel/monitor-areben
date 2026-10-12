'use client'

import { useEffect, useState } from 'react'
import { color, font, space } from '@/components/ui'
import { decir, guardarVoz, vocesEnEspanol, vozGuardada } from '@/lib/sonido'
import { calidadDe, elegirVoz, nombreDeVoz } from '@/lib/voces'

/**
 * **Elegir la voz en este teléfono** (Darío, 11-oct-2026: *«hoy la voz es demasiado eléctrica»*).
 * Va al lado de «Escuchar los avisos», que es cuando se prueba cómo suena antes de salir a caminar.
 *
 * 🔑 Si la mejor voz que hay ⛔ es mejorada ni premium, dice cómo bajarla: es lo que más cambia, y
 * ⛔ lo puede hacer la app — se hace una vez en Ajustes del iPhone.
 */
export function ElegirVoz() {
  const [voces, setVoces] = useState<SpeechSynthesisVoice[]>([])
  const [elegida, setElegida] = useState<string | null>(null)

  useEffect(() => {
    const s = typeof window !== 'undefined' ? window.speechSynthesis : undefined
    if (!s) return
    // ⚠️ En iPhone la lista llega vacía la primera vez y se llena con `voiceschanged`.
    const leer = () => {
      const v = vocesEnEspanol()
      setVoces(v)
      setElegida(elegirVoz(v, vozGuardada())?.voiceURI ?? null)
    }
    leer()
    s.addEventListener?.('voiceschanged', leer)
    return () => s.removeEventListener?.('voiceschanged', leer)
  }, [])

  if (!voces.length) return null
  const actual = voces.find((v) => v.voiceURI === elegida) ?? voces[0]
  const hayBuena = voces.some((v) => calidadDe(v) === 'premium' || calidadDe(v) === 'mejorada')

  return (
    <div style={{ marginTop: space[2], fontSize: font.sm, color: color.ink2 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        Voz:
        <select
          className="mo-input"
          value={actual.voiceURI}
          onChange={(e) => {
            guardarVoz(e.target.value)
            setElegida(e.target.value)
            decir('Blusa Milano negro, talle S')
          }}
          style={{ height: 32, width: 'auto', fontSize: font.sm }}
        >
          {voces.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {nombreDeVoz(v)}
            </option>
          ))}
        </select>
      </label>
      {!hayBuena && (
        <div style={{ marginTop: 4, color: color.mut }}>
          ¿Suena robótica? En el iPhone: <b>Ajustes › Accesibilidad › Contenido leído › Voces › Español</b>, bajá una voz «Mejorada» o «Premium» y volvé a abrir esta pantalla.
        </div>
      )}
    </div>
  )
}
