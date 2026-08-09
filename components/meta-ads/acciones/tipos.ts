/**
 * Lo que viaja entre la tabla, los botones, los modales y la plomería que escribe en Meta.
 *
 * Vive en un archivo propio —y sin JSX— para que los cinco de esta carpeta puedan importarlo sin
 * quedar en ciclo: `useAccionMeta` abre los modales, los modales devuelven lo decidido a
 * `useAccionMeta`, y los botones necesitan los tipos de los dos.
 */

import type { ClaveAccion, NivelAccion } from '@/lib/meta-ads/acciones'
import type { LineaPauta } from '@/lib/meta-ads/tipos'

/** El objeto sobre el que se acciona, con lo que hace falta para poder contarlo en el cartel. */
export type ObjetoMeta = {
  nivel: NivelAccion
  id: string
  nombre: string
  /** La línea de la campaña de la que cuelga. `null` = todavía no tiene marca (el 409 del servidor). */
  linea: LineaPauta | null
  /** Moneda de la cuenta: define la unidad menor con la que Meta maneja los montos. */
  moneda: string
  /**
   * De qué cuenta publicitaria es. Sólo para MOSTRARLO en el cartel, y sólo cuando hace falta.
   *
   * 🔴 Hay campañas con el MISMO nombre en cuentas distintas —«STUNNED - Tráfico a Perfil» existe dos
   * veces y no son la misma: una está apagada con $436.937 encima y la otra es la que corre—. La
   * tabla ya las desempata, pero el cartel es la última pantalla antes de escribir, y ahí decía sólo
   * el nombre: quien lo abriera desde la fila equivocada no tenía cómo darse cuenta.
   */
  cuenta?: string
  /**
   * La campaña de la que cuelga (para una campaña, ella misma).
   *
   * La necesita el modal de duplicar: lo que dice si Meta va a aceptar la copia se pregunta **por
   * campaña** (`?recurso=mejoras`), porque así lo contesta Graph, y desde la fila de un conjunto el
   * id de su campaña no se puede deducir.
   */
  campania?: string
}

/**
 * Cómo se nombra cada nivel, **con su artículo**, para poder meterlo adentro de una frase.
 *
 * 🔴 `campaña` es femenino y `conjunto`/`aviso` masculinos: sin esto salió a producción «Esta
 * conjunto tiene 6 avisos… Duplicala».
 */
export const ROTULO_NIVEL: Record<NivelAccion, string> = {
  campania: 'la campaña',
  conjunto: 'el conjunto',
  aviso: 'el aviso',
}

/** El género de cada nivel, para concordar los rótulos de estado («Pausada» / «Pausado»). */
export const GENERO_NIVEL: Record<NivelAccion, 'f' | 'm'> = { campania: 'f', conjunto: 'm', aviso: 'm' }

/**
 * Lo que se decide en el modal de duplicar y se ejecuta después de que la copia existe.
 *
 * Los tres `idem` nacen **al abrir el modal**, no al apretar: si nacieran al apretar, un doble clic
 * serían dos claves y dos copias. Son tres y no uno porque son tres escrituras distintas, cada una
 * con su propia fila de auditoría y su propio candado.
 */
export type AjustesCopia = {
  /** El nombre para la copia, o `null` para dejarle el automático (original + « — copia dd/mm hh:mm»). */
  nombre: string | null
  /** El diario nuevo, en la unidad MENOR de la moneda, o `null` para dejar el del original. */
  diarioCrudo: number | null
  /**
   * Dónde va ese presupuesto. `copia` es la copia misma (un conjunto duplicado, o una campaña con
   * presupuesto propio); `conjunto-unico` es el único conjunto de una campaña copiada — que sólo se
   * puede resolver DESPUÉS de crearla, porque los ids son nuevos.
   */
  destino: 'copia' | 'conjunto-unico'
  idemDuplicar: string
  idemNombre: string
  idemPresupuesto: string
}

/**
 * Lo que una fila necesita para poder dibujar sus botones: qué puede esta persona **en esa línea**,
 * qué se está escribiendo ahora mismo, y a quién avisarle cuando se aprieta.
 *
 * `puede` recibe la línea y no un booleano ya resuelto porque las tres marcas se pautean desde la
 * misma cuenta: en una misma tabla puede haber una campaña de BDI que esta persona acciona y una de
 * Zattia que no. Un permiso resuelto una vez por pantalla sería el bug que esta carpeta evita.
 */
export type Acciones = {
  puede: (accion: ClaveAccion, linea: LineaPauta | null) => boolean
  /** El id del objeto que se está escribiendo, o `null`. Por objeto: en una tabla de doce filas, un
   *  spinner en todas no dice nada. */
  enCurso: string | null
  onEstado: (o: ObjetoMeta, estadoActual: string | null) => void
  onPresupuesto: (o: ObjetoMeta, diarioCrudo: number) => void
  onNombre: (o: ObjetoMeta) => void
  /** Abre «duplicar y ajustar». Necesita el presupuesto de la fila para poder ofrecer el campo. */
  onDuplicar: (o: ObjetoMeta, diarioCrudo: number, sinPresupuesto: boolean) => void
  /**
   * Abre «nueva campaña con esta segmentación». Sólo desde un CONJUNTO: es de donde se lee el
   * `targeting`, y desde una campaña habría que elegir cuál de sus conjuntos, que es una pregunta
   * que la fila no puede contestar.
   */
  onCrear: (o: ObjetoMeta, diarioCrudo: number) => void
  /**
   * Abre «escalar por escalones»: N subas del 20% separadas en el tiempo, que da el cron. Sólo donde
   * hay un diario propio que subir — con CBO el escalón habría que dárselo a la campaña.
   */
  onEscalar: (o: ObjetoMeta, diarioCrudo: number) => void
}
