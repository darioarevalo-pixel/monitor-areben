'use client'

/**
 * **El botón que copia un mensaje al cliente y deja registrado que se lo copió.**
 *
 * # Por qué existe, y por qué es un componente y ⛔ no una línea en cada botón
 *
 * 🔴 La columna `mensajes` existía desde el día uno, estaba en el `select` del handler, y
 * ⛔ **no la escribía nadie** (D9 de la auditoría del 28-ago-2026). R-0022 —el primer reclamo real
 * de BDI— la traía `[]` después de que se le mandaron el link, la propuesta y la resolución: de la
 * resolución, que es donde se le promete la plata, ⛔ no quedaba rastro.
 *
 * 🔑 **Y el modo de falla del arreglo obvio es el que este módulo ya pagó cuatro veces**: pegarle
 * un `onCopiado` a mano a cada uno de los ocho `CopyButton` deja el noveno afuera, callado y en
 * verde. Acá el registro viaja **con el botón**, así que un mensaje nuevo lo trae puesto o ⛔ no es
 * un mensaje. El cable que lo ata a la lista cerrada del servidor está en
 * `tests/reclamos-registro-mensajes.test.ts`, y lee **este archivo y las pantallas**.
 *
 * 🔑 **Registra cuando el portapapeles ACEPTÓ**, ⛔ no cuando se apretó: de eso se ocupa el
 * `onCopiado` de `CopyButton`. Es *«el cartel dice lo que PASÓ, no lo que se intentó»* aplicado al
 * registro — anotar «se le mandó la resolución» sobre un `writeText` que falló afirma de más justo
 * donde más duele.
 *
 * ⚠️ **Y si el registro falla, se DICE.** No queda en un `catch {}` vacío: una lista incompleta que
 * nadie sabe que está incompleta se lee después como *«no se le dijo nada»*, que es el mismo «el
 * cero afirma» que este módulo viene tapando en todos lados. El mensaje **se copió igual** —eso ya
 * pasó—, así que el aviso dice las dos cosas.
 */

import { CopyButton, type CopyButtonProps } from '@/components/ui/CopyButton'
import { registrarMensaje } from '@/lib/reclamos/cliente'
import type { Marca } from '@/lib/nav.datos'
import type { MomentoDelMensaje } from '@/lib/reclamos/tipos'

// ⚠️ Se omite también el `id` nativo del `<button>`: acá `id` es **el reclamo**, y la
// intersección de los dos tipos deja `never` (un `string` y un `number` a la vez). Nadie le pone
// un id de HTML a estos botones.
export type BotonMensajeProps = Omit<CopyButtonProps, 'onCopiado' | 'id'> & {
  marca: Marca
  /** El reclamo. Es el `id` de la fila, ⛔ no el número `R-00NN`. */
  id: number
  /** Cuál de los momentos es. Lista cerrada: la valida el servidor (`MOMENTOS_DEL_MENSAJE`). */
  tipo: MomentoDelMensaje
  /** Qué decir si el mensaje salió pero ⛔ no quedó registrado. */
  onSinRegistrar?: (e: Error) => void
}

export function BotonMensaje({ marca, id, tipo, onSinRegistrar, ...rest }: BotonMensajeProps) {
  return (
    <CopyButton
      {...rest}
      /**
       * 🔑 **El marcador que dice QUÉ ES este botón**, y ⛔ no cómo se llama. Lo lee
       * `tests/reclamos-lista-mensajes.test.tsx`, que hasta el 30-ago-2026 juntaba **todos** los
       * botones de la pantalla cuyo rótulo empezara con `Copiar ` — así que el día que la pantalla
       * sumó un «Copiar el mensaje con el link» **que ⛔ no es un mensaje de una fila**, ese test
       * se puso rojo en ocho casos sin que nada de lo suyo hubiera cambiado. Un oráculo atado al
       * TEXTO se rompe cuando cambia el texto de al lado; el prefijo ya había cambiado una vez
       * (`Msj:` → `Copiar `) por la corrida de vocabulario.
       */
      data-mensaje={tipo}
      onCopiado={(texto) => {
        void registrarMensaje(marca, id, tipo, texto).catch((e) => onSinRegistrar?.(e as Error))
      }}
    />
  )
}
