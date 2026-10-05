'use client'

import { useState } from 'react'
import { Button, Notice, font, space, weight } from '@/components/ui'

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/**
 * **El final de «Chequeo + mapa» para quien escaneó**: terminó, quedó guardado a tal hora, ⛔ tiene
 * que hacer nada más. Lo pidió Bruno el 5-oct-2026: *«me preocupa que no le aparezca nada, y que
 * diga ya terminé, ¿tengo que apretar algo más?»*.
 *
 * 🔑 **El relevamiento —falta exhibir, sobra, guardar el mapa— ⛔ se le muestra**: es de quien edita
 * el Mapa del local (Bruno o Darío), que lo abre con un botón acá o desde la lista. `relevamiento`
 * llega sólo si quien mira tiene ese permiso.
 *
 * ⚠️ «Quedó guardado» es cierto cuando esto se dibuja: `cerrar` ⛔ cierra con escaneos sin subir, y
 * sólo después de que el servidor confirmó el cierre se llega acá.
 */
export function FinMapa({ hora: cuando, escaneos, lugares, relevamiento }: { hora: string; escaneos: number; lugares: number; relevamiento: React.ReactNode | null }) {
  const [ver, setVer] = useState(false)
  return (
    <>
      <Notice tone="success" icon="✓" style={{ marginBottom: space[3] }}>
        <div style={{ fontSize: font.lg, fontWeight: weight.bold }}>Terminaste. Quedó guardado a las {hora(cuando)}.</div>
        <div style={{ marginTop: 4 }}>
          {escaneos} {escaneos === 1 ? 'escaneo' : 'escaneos'} en {lugares} {lugares === 1 ? 'lugar' : 'lugares'}. <b>No tenés que hacer nada más.</b>
        </div>
      </Notice>
      {relevamiento &&
        (ver ? (
          relevamiento
        ) : (
          <Button variant="outline" onClick={() => setVer(true)} style={{ marginBottom: space[3] }}>
            Ver el relevamiento
          </Button>
        ))}
    </>
  )
}
