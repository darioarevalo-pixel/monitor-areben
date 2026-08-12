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
 *
 * # «Después» no es una quinta salida, es la primera honesta
 *
 * Las dos salidas siguen siendo botones, y siguen siendo las únicas: no hay ✕, ni Escape, ni clic
 * afuera. Lo que se agrega es que una de ellas **no miente**. Antes, quien lo recibía en medio de un
 * conteo apretaba «Entendido» sin leer, y eso queda escrito como que lo leyó. Ahora lo posterga
 * `MINUTOS_POSTERGAR` minutos, no se registra nada, y el cartel vuelve solo —sin recargar y sin
 * volver a pedirle nada al servidor: sale de un `setTimeout` al vencimiento, no de un intervalo—.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSistema } from '@/store/useSistema'
import { useSesion } from '@/components/SesionProvider'
import { marcarLeida } from '@/lib/novedades/cliente'
import { sinLeer } from '@/lib/novedades/tipos'
import { faltaParaElPrimero, postergadas, postergar, MINUTOS_POSTERGAR } from '@/lib/novedades/postergar'
import { Button, Markdown, Modal, Notice, color, font, space } from '@/components/ui'

export function CartelNovedad() {
  const { perfil } = useSesion()
  const { novedades, leidas, cargado, cargar } = useSistema()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const usuario = perfil?.name || null
  // El `nonce` es lo que fuerza a volver a leer localStorage —al postergar y cuando vence—, igual que
  // el snooze del panel Gerencial. No hay riesgo de que el cartel parpadee en la hidratación: en el
  // primer render `cargado` todavía es `false` y esto devuelve `null` de todos modos.
  const [nonce, setNonce] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `nonce` fuerza re-leer localStorage
  const dormidas = useMemo(() => postergadas(usuario), [usuario, nonce])

  // Un solo timer, al vencimiento del «después» más próximo. Al despertarse sube el nonce, se
  // recalculan las dormidas y el cartel vuelve a aparecer sin tocar nada.
  useEffect(() => {
    if (dormidas.size === 0) return
    const falta = faltaParaElPrimero(usuario)
    if (falta === null) return
    const t = setTimeout(() => setNonce((k) => k + 1), falta + 500)
    return () => clearTimeout(t)
  }, [dormidas, usuario])

  // De a una y la más vieja primero: si se acumularon tres, se leen en el orden en que pasaron.
  const pendientes = cargado
    ? sinLeer(novedades, leidas).filter((n) => n.importante && !dormidas.has(`${n.id}|${n.version}`))
    : []
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

  const despues = () => {
    postergar(usuario, n.id, n.version)
    setNonce((k) => k + 1)
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
          <Button
            variant="ghost"
            onClick={despues}
            disabled={guardando}
            title={`Se va ahora y vuelve en ${MINUTOS_POSTERGAR} minutos. No queda registrado que la leíste.`}
          >
            Después
          </Button>
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
      <div style={{ marginTop: space[3], fontSize: font.xs, color: color.mut2 }}>
        Si estás en medio de algo, «Después» lo saca de la pantalla y lo trae de vuelta en{' '}
        {MINUTOS_POSTERGAR} minutos.
      </div>
      {error && (
        <div style={{ marginTop: space[3] }}>
          <Notice tone="danger">{error} Probá de nuevo: si no queda registrado, el cartel vuelve.</Notice>
        </div>
      )}
    </Modal>
  )
}
