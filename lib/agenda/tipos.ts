/**
 * Los tipos de la Agenda operativa.
 *
 * ⚠️ El motor de recurrencia no vive acá: vive en `lib/agenda/reglas.core.js`, en JS plano, porque
 * `api/_agenda.js` lo necesita para validar antes de guardar y no puede importar TypeScript. Este
 * archivo es sólo la forma de los datos; `lib/agenda/index.ts` es la cara tipada del motor.
 */

import type { Marca } from '@/lib/nav.datos'
// El origen de una sesión de fotos es el MISMO eje que ya usa el historial de Solicitudes: se
// importa, ⛔ no se reescribe. Ver `lib/solicitudes/disparador.ts`.
import type { Disparador } from '@/lib/solicitudes/disparador'
import {
  clavesDestino, type Destino, rotuloDeClave, rotuloDestino, rotuloDestinoCorto,
} from '@/lib/novedades/tipos'

export type { Destino }
// Cómo se lee un destino vive con el destino (`lib/novedades/tipos.ts`), no acá: lo comparten
// Novedades y la Agenda. Se re-exporta para que las pantallas de la Agenda no tengan que saberlo.
export { clavesDestino, rotuloDeClave, rotuloDestino, rotuloDestinoCorto }

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
  /**
   * Cuántos días después de la ocurrencia sigue apareciendo, si arrastra. `null` = **sin tope**.
   *
   * 🔑 **No todo lo que arrastra arrastra igual.** Una reunión que no se hizo es la misma reunión
   * dentro de tres semanas: tiene que quedar hasta que alguien la tilde, y `null` dice eso. Una
   * pasada rutinaria no — Bruno, 24-ago, cargando las rutinas de Administración: *«Tienda Nube sí
   * tiene arrastre, pero hasta 2 días; ya el tercero no arrastra.»* Sin tope, el renglón de la
   * pasada del lunes que nadie tildó se queda para siempre, y **un contador que no baja se deja de
   * mirar en una semana** — el mismo argumento por el que los avisos no encienden el badge.
   *
   * ⚠️ Se cuenta desde la ocurrencia, en días corridos: `2` puesto en algo que cae lunes y jueves
   * quiere decir que el lunes se debe lunes, martes y miércoles, y el jueves ya no.
   *
   * Se resuelve en `ocurrenciaAbierta()` y **tiene que cortar igual en `fechasDeRachas()`**, o
   * Cumplimiento contaría como una sola racha lo que en Hoy ya son dos renglones distintos. Es el
   * mismo par de siempre: los dos lados o ninguno. Ignorado si `arrastra` es `false`.
   */
  arrastraDias?: number | null
  /**
   * Si este ítem no es una rutina sino **el molde de una**: `'ingreso'` o `'sesion-fotos'`.
   *
   * 🔑 **Un molde no corre.** No sale en Hoy, no enciende el badge, no entra en el Mes ni en
   * Cumplimiento: existe para que el disparador lo clone con la fecha del ingreso. Vive en la
   * pestaña «Cargar», que es donde se lo edita — y ahí sí se ve, con su chapita.
   *
   * 🔑 **Por qué un molde y no seis renglones escritos en el código**: la dueña de cada paso cambia
   * (la gente entra y sale), y con el molde cambiarla es editar un ítem con el formulario que ya
   * existe. Escritos en el repo, cada cambio de dueña sería un deploy.
   */
  plantilla?: string | null
  /**
   * A cuántos días del hecho cae este paso. Sólo para los moldes.
   *
   * El nombre y el precio van el día 0 —traban todo lo demás—, la publicación a los dos días. Es la
   * columna «cuándo» del manual, escrita en un número para que el disparador pueda ponerle fecha.
   *
   * 🔑 **Puede ser NEGATIVO en la sesión de fotos**: el manual busca la modelo 48 h antes y las
   * referencias el día anterior. En el ingreso ⛔ no, y el rango de cada plantilla lo fija
   * `plantillas.core.js` — fuera de rango el handler contesta 400, ⛔ no recorta.
   */
  offsetDias?: number | null
  /**
   * En qué **puertas de entrada** corre este paso. Sólo para los moldes.
   *
   * 🔑 **Vacío es TODAS**, igual que `marcas` — y es lo que hace que los cuatro pasos que no cambian
   * con la puerta (precio, foto, publicar, pantallas) se carguen una sola vez y no cuatro.
   *
   * Existe porque el nombre y la descripción **cambian de dueña según por dónde entró el producto**
   * (manual 06). El catálogo y la regla viven en `puertas.core.js`.
   */
  puertas?: Puerta[]
  /**
   * De qué **origen** sale la sesión. Es el eje de la plantilla `sesion-fotos`, y se lee igual que
   * `puertas`: **vacío es TODOS**.
   *
   * Existe porque de quién es la sesión —el primer renglón y el último— cambia con el origen:
   * un faltante de catálogo lo arma Cande, una campaña y un ingreso los arma Sofi. El catálogo vive
   * en `lib/solicitudes/disparador.core.js`, que es el mismo que el historial de Solicitudes.
   */
  disparadores?: Disparador[]
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
 * Por dónde entró el producto. Son cuatro y salen del manual 06.
 *
 * ⚠️ **El catálogo de verdad —con rótulos y ayuda— vive en `puertas.core.js`**, porque el handler lo
 * necesita y no puede importar TypeScript. Esto es sólo la unión, para que el editor ayude. El test
 * `puertas del ingreso` fija que las dos listas digan lo mismo: si alguien agrega una puerta en el
 * core y se olvida de acá, el test lo dice.
 */
export type Puerta = 'produccion' | 'nacional' | 'importacion' | 'accesorios'

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
  /**
   * El acuse, en **dos tramos**: los últimos `DIAS_CUMPLIMIENTO` días de todos los ítems —lo que
   * mira Cumplimiento— más la cola vieja, hasta `DIAS_ARRASTRE`, **sólo de los que arrastran**.
   * Los dos vienen mezclados en una lista: quien la lee no tiene que saber de dónde salió cada uno.
   */
  hechos: Hecho[]
  puede: { cargar: boolean }
}

/**
 * Cuántos días hacia atrás viaja el acuse **de todos los ítems** en el GET.
 *
 * No es un límite de producto: es que la pregunta real de gerencia es "¿esta semana se hizo?", y
 * traerse la historia entera para contestarla crecería sin techo. Un mes cubre la ventana en que
 * todavía se puede hacer algo con la respuesta.
 */
export const DIAS_CUMPLIMIENTO = 30

/**
 * Cuántos días hacia atrás puede mirar el arrastre — el techo de lo que un pendiente puede deber.
 *
 * 🔑 **Es más grande que `DIAS_CUMPLIMIENTO` y por eso son dos constantes y no una.** Estuvieron
 * pegadas hasta el 25-ago y el empate no era una decisión: el arrastre miraba treinta días porque
 * era lo que el GET mandaba. Eso alcanza para una reunión semanal y **no** alcanza para un ingreso
 * de mercadería, que —Bruno, 24-ago— *«a veces más rápido, a veces más lento, no podemos decir la
 * cantidad de días»*: un paso que quede sin tildar más de un mes se evaporaba **callado**, que es
 * exactamente lo que el disparador vino a evitar.
 *
 * 🔴 **Sigue siendo el techo del dato, no una preferencia**: más atrás de lo que el GET manda, el
 * navegador no puede saber si la ocurrencia se tildó, y un rojo sobre una ausencia de datos es un
 * rojo que no se puede apagar. Por eso subirlo acá **obliga** a subir el tramo profundo del GET
 * (`api/_agenda.js`), y por eso ese tramo se acota a los ítems que arrastran: medido el 25-ago, el
 * acuse entero de los últimos 30 días eran 6 filas (0,8 KB de un GET de 28,5 KB), pero con la
 * agenda cargada como está —32 pendientes vivos, 6 ocurrencias por día— traerse 120 días de
 * **todos** serían ~97 KB, y eso antes del primer clon de ingreso. Acotado a los que arrastran, la
 * cola crece con la cantidad de ítems que arrastran, no con el uso diario.
 *
 * Cuatro meses: es lo más largo que alguien puede mirar un renglón viejo y todavía reconocerlo.
 */
export const DIAS_ARRASTRE = 120

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
