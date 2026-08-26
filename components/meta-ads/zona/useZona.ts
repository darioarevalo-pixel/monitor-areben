'use client'

/**
 * La lectura de la zona de rendimiento.
 *
 * 🔑 **Se pide SOLA al montar, y eso es todo el punto.** El Parte no puede —son cinco llamadas a
 * Graph y el cupo es un porcentaje—, así que su decisión terminaba tomándose afuera con el texto
 * pegado en otro lado. Esto sale de la foto: una consulta a la base, sin token y sin cupo.
 *
 * El estado va keyeado por `linea|dias` y ⛔ no se limpia con un efecto: al cambiar de línea, la
 * respuesta vieja deja de coincidir con la clave y la fase vuelve a «cargando» sola. Un efecto que
 * arregla el estado después de pintar deja un cuadro con los números de la línea anterior — y un
 * número dibujado no se lee como provisorio, que es justo el defecto que Bruno cazó en Rentabilidad
 * el 22-ago-2026.
 */

import { useCallback, useEffect, useState } from 'react'
import { traerZona } from '@/lib/meta-ads/cliente'
import type { RespuestaZona } from '@/lib/meta-ads/rendimiento'

export type EstadoZona =
  | { fase: 'sin-linea' }
  | { fase: 'cargando' }
  | { fase: 'error'; motivo: string }
  | { fase: 'ok'; data: RespuestaZona }

export function useZona(linea: string | null, dias: number) {
  const [resp, setResp] = useState<{ key: string; r: EstadoZona } | null>(null)
  const [tic, setTic] = useState(0)
  const key = linea ? `${linea}|${dias}` : ''

  useEffect(() => {
    if (!linea) return
    let vivo = true
    traerZona(linea, dias).then((r) => {
      if (!vivo) return
      setResp({ key: `${linea}|${dias}`, r: r.ok ? { fase: 'ok', data: r.dato } : { fase: 'error', motivo: r.motivo } })
    })
    return () => { vivo = false }
  }, [linea, dias, tic])

  const recargar = useCallback(() => setTic((n) => n + 1), [])
  const estado: EstadoZona = !linea
    ? { fase: 'sin-linea' }
    : !resp || resp.key !== key
      ? { fase: 'cargando' }
      : resp.r
  return { estado, recargar }
}
