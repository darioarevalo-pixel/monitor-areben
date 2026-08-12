/**
 * Los tipos de la Agenda operativa.
 *
 * ⚠️ El motor de recurrencia no vive acá: vive en `lib/agenda/reglas.core.js`, en JS plano, porque
 * `api/_agenda.js` lo necesita para validar antes de guardar y no puede importar TypeScript. Este
 * archivo es sólo la forma de los datos; `lib/agenda/index.ts` es la cara tipada del motor.
 */

import type { Marca } from '@/lib/nav.datos'

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

/** Lo que devuelve `GET /api/datos?recurso=agenda`. */
export type DatosAgenda = {
  promos: Promo[]
  puede: { cargar: boolean }
}

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
