'use client'

/**
 * Los botones de una fila. Los usan la tabla de campañas y la de conjuntos, con las mismas reglas.
 *
 * # 🔴 Por qué son UNO afuera y el resto adentro del «⋯» (30-ago-2026)
 *
 * Hasta acá dibujaba **hasta seis botones idénticos** en cada fila —Pausar · Presupuesto · Escalar ·
 * Duplicar · Nueva campaña · Renombrar—, todos `ghost`, todos del mismo tamaño, todos del mismo
 * color. Bruno, caminando la sección: *«una celda tiene el tamaño de la cantidad de botones que
 * tenga la acción, es una locura»*. Y en Campañas pesa más todavía: son cientos de filas.
 *
 * 🔑 **El problema no era el ancho, era la falta de jerarquía.** Seis botones iguales obligan a leer
 * los seis cada vez, incluso para el gesto que se hace todos los días. Ahora:
 *
 *  - **Pausar / Reactivar** queda afuera, **con ícono y color** —ámbar para frenar, verde para
 *    prender—: es el único que se aprieta a diario y el único donde el color dice qué va a pasar.
 *  - **El resto** entra al `MenuAcciones`, **con el nombre escrito**. ⛔ Adentro ⛔ no van sólo con
 *    ícono: la regla del ícono solo (`VOCABULARIO.md` §3.3) es para el gesto que se repite una vez
 *    por fila, ⛔ no para una lista de seis.
 *
 * ⚠️ **El `aria-label` NOMBRA la cosa**, no el verbo suelto: diez «Pausar» apilados son diez botones
 * idénticos para quien no ve la pantalla. Va «Pausar «GIRLHOOD FRIO»», igual que la pregunta del
 * diálogo que abre.
 *
 * # Qué se dibuja y qué no — esto ⛔ no cambió
 *
 *  - **Reactivar** aparece en lo que está pausado; **Pausar**, en lo que está entregando.
 *  - **Presupuesto** sólo donde hay un diario propio que tocar. Si el presupuesto está a nivel
 *    campaña (CBO) o es un total (lifetime), no se dibuja: sería un botón que Meta rechaza.
 *  - **Escalar** donde va Presupuesto, y por lo mismo: son N pasos de presupuesto separados en el
 *    tiempo. Va aparte y no adentro del modal de presupuesto porque son dos cosas distintas —una
 *    pone un número hoy, la otra arma un plan de varios días que corre solo.
 *  - `inerte` es el caso de las publicaciones de Instagram promocionadas: figuran ACTIVE para
 *    siempre y no entregan nada hace meses. Son cientos, y llenarlas de botones taparía las cinco
 *    campañas que se llevan la plata. Se dice por qué en el `title` en vez de esconderlo.
 */

import { Icono, MenuAcciones, color, space, type AccionMenu } from '@/components/ui'
import type { Acciones, ObjetoMeta } from '@/components/meta-ads/acciones/tipos'

export function BotonesAccion({ objeto, estado, diarioCrudo, sinPresupuesto, inerte, acciones }: {
  objeto: ObjetoMeta
  estado: string | null
  diarioCrudo: number
  /** El presupuesto no vive en este objeto (CBO en la campaña, o presupuesto total). */
  sinPresupuesto?: boolean
  /** Por qué este objeto no ofrece acciones aunque figure activo. */
  inerte?: string | null
  acciones: Acciones
}) {
  const activo = estado === 'ACTIVE'
  const puedeEstado = acciones.puede('estado', objeto.linea)
  const puedePresupuesto = acciones.puede('presupuesto', objeto.linea)
  const puedeNombre = acciones.puede('nombre', objeto.linea)
  // Un aviso no se duplica: la copia de un aviso suelto no tiene dónde entregar. Lo dice la tabla de
  // acciones (`niveles`) y acá se respeta en vez de repetir el criterio.
  const puedeDuplicar = objeto.nivel !== 'aviso' && acciones.puede('duplicar', objeto.linea)
  // Sólo desde un conjunto: es de donde se lee la segmentación. Pide el mismo permiso que duplicar,
  // porque hace lo mismo —crear objetos en Meta— y un sub propio sería una tilde más que dar.
  const puedeCrear = objeto.nivel === 'conjunto' && acciones.puede('duplicar', objeto.linea)
  // Escalar es N pasos de presupuesto: pide el mismo permiso y aparece donde aparece «Presupuesto».
  // Sobre un aviso no existe —no tiene diario propio— y con CBO el escalón iría a la campaña.
  const puedeEscalar = objeto.nivel !== 'aviso' && puedePresupuesto
  const trabajando = acciones.enCurso === objeto.id
  const conPlata = !sinPresupuesto && diarioCrudo > 0

  if (!puedeEstado && !puedePresupuesto && !puedeNombre && !puedeDuplicar && !puedeCrear) return <span style={{ color: color.mut2 }}>—</span>
  if (activo && inerte) return <span style={{ color: color.mut2 }} title={inerte}>—</span>

  const mas: AccionMenu[] = [
    puedePresupuesto && conPlata ? {
      key: 'presupuesto', label: 'Cambiar el presupuesto', icono: 'presupuesto' as const,
      hint: 'Pone otro diario ahora mismo. Meta lo prorratea sobre lo que queda del día',
      onClick: () => acciones.onPresupuesto(objeto, diarioCrudo),
    } : null,
    puedeEscalar && conPlata ? {
      key: 'escalar', label: 'Escalar de a 20%', icono: 'escalar' as const,
      hint: 'Sube el presupuesto de a 20%, un escalón por día, y se frena solo si deja de rendir o llega al techo de la marca. Los escalones se dan aunque nadie entre al monitor',
      onClick: () => acciones.onEscalar(objeto, diarioCrudo),
    } : null,
    puedeDuplicar ? {
      key: 'duplicar', label: 'Duplicar', icono: 'duplicar' as const,
      hint: 'Crea una copia pausada, con sus conjuntos y avisos, y le pone el nombre y el presupuesto que le digas',
      onClick: () => acciones.onDuplicar(objeto, diarioCrudo, !!sinPresupuesto),
    } : null,
    puedeCrear ? {
      key: 'crear', label: 'Crear una campaña', icono: 'mas' as const,
      hint: 'Crea una campaña NUEVA, pausada, con esta misma segmentación y estos mismos avisos. Duplicar, en cambio, deja la copia adentro de la campaña actual',
      onClick: () => acciones.onCrear(objeto, diarioCrudo),
    } : null,
    // Renombrar va último: es lo único de esta lista que no cambia lo que Meta hace.
    puedeNombre ? {
      key: 'nombre', label: 'Renombrar', icono: 'lapiz' as const,
      hint: 'Cambia sólo el nombre. No toca la entrega ni el presupuesto',
      onClick: () => acciones.onNombre(objeto),
    } : null,
  ].filter(Boolean) as AccionMenu[]

  return (
    <div style={{ display: 'flex', gap: space[1], alignItems: 'center' }}>
      {puedeEstado && (
        <button
          type="button"
          disabled={trabajando}
          // 🔑 El rótulo lleva la COSA adentro: diez «Pausar» apilados son diez botones idénticos
          // para quien no ve la pantalla. Es la misma frase que después pregunta el diálogo.
          aria-label={`${activo ? 'Pausar' : 'Reactivar'} «${objeto.nombre}»`}
          title={activo ? 'Deja de mostrarse y de gastar en el acto. Es reversible' : 'Vuelve a entregar. El aprendizaje del conjunto sigue donde quedó'}
          onClick={() => acciones.onEstado(objeto, estado)}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            // 🔴 `height` y `width` explícitas: `.shell-content button` del bloque legacy le fija a
            // todo `<button>` crudo la altura de un control y 14px de padding lateral, así que sin
            // esto el ícono sale con forma de botón de texto. `tests/boton-crudo-altura.test.ts`.
            height: 28, width: 28, padding: 0,
            border: `1px solid ${activo ? color.warningBorder : color.successBorder}`,
            borderRadius: 6,
            background: activo ? color.warningBg : color.successBg,
            color: activo ? color.warningInk : color.successInk,
            cursor: trabajando ? 'default' : 'pointer',
            opacity: trabajando ? 0.5 : 1,
          }}
        >
          <Icono nombre={activo ? 'pausa' : 'play'} size={15} />
        </button>
      )}
      <MenuAcciones acciones={mas} etiqueta={`Más acciones de «${objeto.nombre}»`} disabled={trabajando} />
    </div>
  )
}
