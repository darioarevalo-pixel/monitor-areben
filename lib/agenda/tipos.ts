/**
 * Los tipos de la Agenda operativa.
 *
 * ⚠️ El motor de recurrencia no vive acá: vive en `lib/agenda/reglas.core.js`, en JS plano, porque
 * `api/_agenda.js` lo necesita para validar antes de guardar y no puede importar TypeScript. Este
 * archivo es sólo la forma de los datos; `lib/agenda/index.ts` es la cara tipada del motor.
 */

import type { Marca } from '@/lib/nav.datos'
import type { Destino } from '@/lib/novedades/tipos'

export type { Destino }

/** `YYYY-MM-DD`. El formato en que se guarda y se compara todo día del almanaque. */
export type FechaIso = string

export type TipoRegla = 'unica' | 'rango' | 'diaria' | 'semanal' | 'mensual'

/**
 * Cuándo cae una cosa.
 *
 * `dias` va **0 = domingo**, como `getDay()`. `dia` es 1..28 o `'ultimo'`: del 29 en adelante no
 * existe en todos los meses y qué hacer en febrero es una decisión de la persona, no del motor.
 */
export type Regla =
  | { tipo: 'unica'; fecha: FechaIso }
  | { tipo: 'rango'; desde: FechaIso; hasta: FechaIso }
  | { tipo: 'diaria' }
  | { tipo: 'semanal'; dias: number[] }
  | { tipo: 'mensual'; dia: number | 'ultimo' }

/** Con qué se paga. Es el eje que la persona del mostrador reconoce antes que el banco. */
export type MedioPago = 'credito' | 'debito' | 'app' | 'qr' | 'transferencia'

/**
 * Qué le dan al cliente.
 *
 * Van separados y no como un `pct` suelto porque **se cobran distinto**: un descuento sale en el
 * ticket, un reintegro no (lo devuelve el banco después, y por eso tiene tope), y las cuotas no son
 * un porcentaje. Aplanarlos obligaría a la pantalla a adivinar cuál de los tres está mirando.
 */
export type Beneficio =
  | { tipo: 'descuento'; pct: number }
  | { tipo: 'reintegro'; pct: number; tope: number | null }
  | { tipo: 'cuotas'; n: number; sinInteres: boolean }

/** Dónde corre la promo. Una del posnet no vale en la web, y al revés. */
export type Canal = 'mostrador' | 'web'

/**
 * Una promoción bancaria.
 *
 * 🔑 **La vigencia va en dos ejes**: `desde`/`hasta` es la ventana en que la promo existe, `regla`
 * es qué días de esa ventana aplica. "Los martes de agosto" son las dos cosas y no una.
 *
 * `marcas` vacío quiere decir **las dos**, no ninguna: la promo la define el banco y lo normal es
 * que valga para todo lo que se cobre en ese mostrador.
 */
export type Promo = {
  id: string
  banco: string
  medio: MedioPago
  beneficio: Beneficio
  regla: Regla
  desde: FechaIso
  hasta: FechaIso | null
  /** Los renglones de la letra chica, tal cual los publica el banco. Cortos, uno por condición. */
  condiciones: string[]
  /** Cómo se cobra, en markdown. Es lo que se lee con el cliente delante. */
  pasos: string | null
  canales: Canal[]
  marcas: Marca[]
  activa: boolean
  autor: string | null
  creado: string | null
}

/**
 * Un pendiente rutinario o un aviso fechado.
 *
 * 🔑 **Es la misma pregunta que la promo bancaria** —"¿esto va hoy?"— y por eso `regla` es
 * exactamente la misma forma y la contesta el mismo motor. Lo que cambia es que la promo se lee y el
 * pendiente **se tilda**, y por eso el acuse es una fila aparte (`Hecho`) y no un campo de acá.
 *
 * ⚠️ A diferencia de la promo, **no tiene ventana de vigencia**: una rutina no vence, se apaga. Por
 * eso `activo` y no `desde`/`hasta`. Lo que corre entre dos fechas se dice con `{tipo:'rango'}`.
 */
export type ItemAgenda = {
  id: string
  /** `pendiente` pide tilde; `aviso` sólo informa —no se tilda, no cuenta para el badge. */
  clase: ClaseItem
  titulo: string
  /** El detalle, en markdown. Vacío es lo normal: el título suele alcanzar. */
  cuerpo: string | null
  regla: Regla
  /** A quién le llega. El MISMO de las novedades, filtrado en el servidor. */
  destino: Destino
  marcas: Marca[]
  /** El manual que explica cómo se hace, si lo hay. Es el `id` de la tabla `manuales`. */
  manualId: string | null
  activo: boolean
  /**
   * ¿Sigue apareciendo hasta que alguien lo tilda?
   *
   * 🔑 **No es una regla, es una bandera del ítem** — y eso no es un detalle de implementación: la
   * regla contesta "¿esto cae este día?" y tiene que seguir siendo **pura y ciega a los tildes**,
   * porque es lo único que garantiza que la grilla de Mes y lo que el local ve ese día no puedan
   * discrepar. El arrastre se resuelve una capa más arriba, en `pendientesDe()`, que ya recibe los
   * hechos.
   *
   * Existe porque las reuniones **no ocupan un día fijo: aparecen y quedan**. Si la del lunes no se
   * hizo, el lunes siguiente no la reemplaza — es la misma reunión, no dos. Cargarlas como
   * `semanal` a secas da lo contrario: aparecen el lunes y se evaporan el martes, que es
   * exactamente lo que enseña a ignorarlas.
   */
  arrastra: boolean
  autor: string | null
  creado: string | null
  /**
   * ¿Es para mí?
   *
   * ⚠️ **No es lo mismo que "la puedo ver"**: quien carga ve todos los ítems en la pestaña de carga,
   * porque los administra. Esto contesta la otra pregunta —¿me sale en Hoy, me enciende el badge,
   * lo tildo yo?— y para el que los administra la respuesta puede ser que no.
   */
  paraMi: boolean
}

export type ClaseItem = 'pendiente' | 'aviso'

/**
 * El tilde: este pendiente se hizo este día.
 *
 * ⚠️ `usuario` es `perfil.name`, no el mail. En los puestos compartidos (`Local`, `Depósito`) eso
 * quiere decir **"el puesto lo marcó"**, no "esta persona lo hizo": la pantalla lo dice así.
 */
export type Hecho = {
  itemId: string
  fecha: FechaIso
  usuario: string
  nota: string | null
  hechoAt: string | null
}

/** Lo que devuelve `GET /api/datos?recurso=agenda`. */
export type DatosAgenda = {
  promos: Promo[]
  items: ItemAgenda[]
  /** Sólo los últimos días: es lo que mira Cumplimiento. Ver `DIAS_CUMPLIMIENTO`. */
  hechos: Hecho[]
  puede: { cargar: boolean }
}

/**
 * Cuántos días hacia atrás viaja el acuse en el GET.
 *
 * No es un límite de producto: es que la pregunta real de gerencia es "¿esta semana se hizo?", y
 * traerse la historia entera para contestarla crecería sin techo. Un mes cubre la ventana en que
 * todavía se puede hacer algo con la respuesta.
 */
export const DIAS_CUMPLIMIENTO = 30

export const CLASES: { key: ClaseItem; label: string }[] = [
  { key: 'pendiente', label: 'Pide que lo tilden' },
  { key: 'aviso', label: 'Sólo avisa' },
]

export const CLAVES_CLASE = CLASES.map((c) => c.key)

export const MEDIOS: { key: MedioPago; label: string }[] = [
  { key: 'credito', label: 'Tarjeta de crédito' },
  { key: 'debito', label: 'Tarjeta de débito' },
  { key: 'app', label: 'App del banco' },
  { key: 'qr', label: 'QR' },
  { key: 'transferencia', label: 'Transferencia' },
]

export const CLAVES_MEDIO = MEDIOS.map((m) => m.key)

export const CANALES: { key: Canal; label: string }[] = [
  { key: 'mostrador', label: 'Mostrador' },
  { key: 'web', label: 'Web' },
]

export const CLAVES_CANAL = CANALES.map((c) => c.key)

export const TIPOS_BENEFICIO: { key: Beneficio['tipo']; label: string }[] = [
  { key: 'descuento', label: 'Descuento' },
  { key: 'reintegro', label: 'Reintegro' },
  { key: 'cuotas', label: 'Cuotas' },
]

export const CLAVES_BENEFICIO = TIPOS_BENEFICIO.map((b) => b.key)
