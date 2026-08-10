'use client'

/**
 * El cartel de una novedad importante: aparece al entrar y hay que leerlo y cerrarlo.
 *
 * Es la única cosa de todo el monitor que **le aparece a todo el equipo en la cara**, así que está
 * hecho para usarse poco. Un badge lo mira el que quiere; esto lo ve el que entra, esté donde esté.
 *
 * # Las cuatro decisiones que lo hacen funcionar
 *
 * 1. **Se monta en el shell, no en Inicio.** Mucha gente entra directo a su sección y nunca pasa
 *    por Inicio: colgarlo de ahí sería no mostrárselo justo a quien menos mira. Es el mismo error
 *    que ya se corrigió con `useAvisosPoll`.
 * 2. **No cierra con Escape ni con clic afuera.** Apagar sólo el fondo no alcanzaba: el Escape
 *    seguía siendo una salida. Por eso el kit ganó `cerrarConEscape`.
 * 3. **"Entendido" espera al POST antes de cerrar**, a diferencia de casi todo el resto del monitor,
 *    que escribe optimista. Si la escritura falla y el cartel ya se cerró, vuelve en la próxima
 *    carga y se lee como un bug. Acá el error se muestra adentro y el cartel no se va.
 * 4. **Se pide una sola vez, sin intervalo.** Que aparezca de golpe en medio de un conteo es la
 *    peor forma posible de comunicar algo.
 */

import { useState } from 'react'
import { useSistema } from '@/store/useSistema'
import { marcarLeida } from '@/lib/novedades/cliente'
import { sinLeer } from '@/lib/novedades/tipos'
import { Button, Markdown, Modal, Notice, color, font, space } from '@/components/ui'

export function CartelNovedad() {
  const { novedades, leidas, cargado, cargar } = useSistema()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // De a una y la más vieja primero: si se acumularon tres, se leen en el orden en que pasaron.
  const pendientes = cargado ? sinLeer(novedades, leidas).filter((n) => n.importante) : []
  const n = pendientes[0]
  if (!n) return null

  const entendido = async () => {
    setGuardando(true)
    setError(null)
    try {
      await marcarLeida(n.id, n.version)
      await cargar() // el badge y la próxima del cartel salen de la misma lectura
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar que la leíste.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      // Sin ✕ y sin las dos salidas: la gracia es que no se pueda cerrar sin pasar por el botón.
      onCerrar={() => {}}
      cerrarConFondo={false}
      cerrarConEscape={false}
      titulo={n.titulo}
      pie={
        <>
          {pendientes.length > 1 && (
            <span style={{ marginRight: 'auto', fontSize: font.xs, color: color.mut2 }}>
              1 de {pendientes.length}
            </span>
          )}
          <Button onClick={() => void entendido()} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Entendido'}
          </Button>
        </>
      }
    >
      <Markdown texto={n.cuerpo} />
      {n.autor && (
        <div style={{ marginTop: space[4], fontSize: font.xs, color: color.mut2 }}>— {n.autor}</div>
      )}
      {error && (
        <div style={{ marginTop: space[3] }}>
          <Notice tone="danger">{error} Probá de nuevo: si no queda registrado, el cartel vuelve.</Notice>
        </div>
      )}
    </Modal>
  )
}
