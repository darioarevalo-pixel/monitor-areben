/**
 * Las automatizaciones de la pauta, del lado tipado.
 *
 * ⚠️ La lógica —qué detecta cada preset, qué umbral necesita, cómo se calibra— **no vive acá**: vive
 * en `lib/meta-ads/reglas.core.js`, en JS plano, porque la necesitan `api/_meta-reglas.js` y
 * `scripts/evaluar-reglas-meta.mjs` y ninguno de los dos puede importar TypeScript. Este archivo
 * aporta los tipos.
 */

import type { Decision, Silenciado } from './decisiones'
import type { LineaPauta } from './tipos'
import {
  agrupar as agruparJs,
  apagadoEn as apagadoEnJs,
  calibrar as calibrarJs,
  diasConEstado as diasConEstadoJs,
  CLAVES_PRESET as CLAVES_PRESET_JS,
  compararCtr as compararCtrJs,
  contextoUmbrales as contextoUmbralesJs,
  derivarUmbrales as derivarUmbralesJs,
  DIAS_SEGUIDOS_DEFECTO as DIAS_SEGUIDOS_DEFECTO_JS,
  diasSeguidosPorEncima as diasSeguidosPorEncimaJs,
  evaluarRegla as evaluarReglaJs,
  faltanUmbrales as faltanUmbralesJs,
  frecuenciaPico as frecuenciaPicoJs,
  hayRacha as hayRachaJs,
  motivoApagada as motivoApagadaJs,
  proximoDiario as proximoDiarioJs,
  NIVEL_TOTALES as NIVEL_TOTALES_JS,
  PASO_ESCALON as PASO_ESCALON_JS,
  permiteAccionarHallazgo as permiteAccionarHallazgoJs,
  PRESETS as PRESETS_JS,
  umbralesEfectivos as umbralesEfectivosJs,
  UMBRALES as UMBRALES_JS,
  VENTANA_DIAS as VENTANA_DIAS_JS,
  ventanaDe as ventanaDeJs,
} from './reglas.core.js'

export type ClavePreset =
  | 'sin-avisos'
  | 'atribucion-tardia'
  | 'freno-emergencia'
  | 'gastos-hormiga'
  | 'fatiga'
  | 'costo-alto'
  | 'ganador-escalar'

export type ClaveUmbral =
  | 'roas_objetivo'
  | 'cpa_maximo'
  | 'gasto_minimo'
  | 'frecuencia_maxima'
  | 'techo_diario_crudo'
  | 'dias_seguidos'

/** El nivel de la jerarquía de Meta sobre el que corre un preset. */
export type NivelRegla = 'campania' | 'conjunto' | 'aviso'

export type EstadoHallazgo = 'nuevo' | 'accionado' | 'ignorado' | 'caducado'

export type DefUmbral = {
  rotulo: string
  unidad: string
  /**
   * 🔑 Si el número es un HECHO que sale de medir (`true`) o una DECISIÓN de negocio (`false`).
   * Lo derivable se autocompleta; lo otro se sugiere con su contexto y la regla queda apagada
   * hasta que alguien lo confirme. Ver el comentario largo en `reglas.core.js`.
   */
  derivable: boolean
  /**
   * 🆕 Una decisión de negocio **que ya está tomada en otra pantalla**, y de la que se lee. Hoy sólo
   * el techo de costo por compra, que se firma en la ficha de rentabilidad. Sin ficha no hay número:
   * ⛔ no es una tercera forma de inventarlo, es no pedir dos veces el mismo.
   */
  desdeFicha?: string
  ayuda: string
}

export type DefPreset = {
  rotulo: string
  resumen: string
  porQue: string
  nivel: NivelRegla
  ventana: number
  /** Los umbrales sin los cuales el preset no corre. Vacío = se puede prender el día uno. */
  requiere: ClaveUmbral[]
  /**
   * Un grupo del que alcanza con **uno**: la vara con la que se juzga. Hoy sólo lo usa
   * `ganador-escalar`, que corta por costo si la marca tiene ficha y por ROAS si no.
   */
  requiereUno?: ClaveUmbral[]
  /** El sub-permiso que hace falta para ACCIONAR el hallazgo. No es uno propio: es el de la acción. */
  sub: string
  proponeAccion: boolean
  /**
   * 🔴 Detecta una TRANSICIÓN, así que necesita al menos dos días con estado escrito. El estado
   * sólo existe en la fila del día en que se sacó cada foto —Meta no expone la configuración hacia
   * atrás—, o sea que la serie la construye el cron hacia adelante. Sin esto, la regla mostraría
   * «0 saltos en 90 días», que se lee como «esto no pasa» en vez de «todavía no se puede saber».
   */
  requiereHistorialEstado?: boolean
}

export type Umbrales = Record<ClaveUmbral, number | null>

export type Regla = {
  id: number
  creada: string
  quien: string
  preset: ClavePreset
  linea: LineaPauta
  cuentaId: string | null
  parametros: Partial<Record<ClaveUmbral, number>>
  activa: boolean
  ultimaCorrida: string | null
  detalle: string | null
}

/** Lo que propone un hallazgo, listo para que el handler lo convierta en acción o en plan. */
export type Sugerencia =
  | { accion: 'estado'; objetoId: string; nivel: NivelRegla; status: 'ACTIVE' | 'PAUSED' }
  | { accion: 'presupuesto'; objetoId: string; nivel: NivelRegla; daily_budget: string; desdeCrudo: number }

/**
 * Lo que PRODUCE `evaluarRegla`: la fila tal cual va a la base, en snake.
 *
 * 🔑 **No es un descuido que esto sea snake y `Hallazgo` sea camel.** El consumidor primario de
 * `evaluarRegla` es `scripts/evaluar-reglas-meta.mjs`, que hace el upsert directo contra
 * `meta_ads_hallazgo`: si el core devolviera camel, el script tendría que mapear, y un campo que se
 * olvida de mapear no rompe nada ruidosamente — se guarda en `null` y el renglón queda sin nombre.
 * El mapeo a camel lo hace el handler, una sola vez, en el camino que sirve la pantalla.
 */
export type HallazgoNuevo = {
  fecha: string
  nivel: NivelRegla
  objeto_id: string
  objeto_nombre: string | null
  linea: string | null
  cuenta_id: string | null
  /** La frase que se LEE, con los números adentro. Se guarda armada: tiene que sobrevivir a que cambien los umbrales. */
  motivo: string
  evidencia: Record<string, unknown>
  sugerencia: Sugerencia | null
}

/** Lo que SIRVE el handler, ya con su fila de la base y en la grafía de la app. */
export type Hallazgo = {
  id: number
  reglaId: number
  preset: ClavePreset
  fecha: string
  nivel: NivelRegla
  objetoId: string
  objetoNombre: string | null
  linea: LineaPauta
  cuentaId: string
  motivo: string
  evidencia: Record<string, unknown>
  sugerencia: Sugerencia | null
  estado: EstadoHallazgo
  resueltoPor: string | null
  planId: number | null
}

/** Una fila de `meta_ads_snapshot_dia`, en lo que le importa a una regla. */
export type FilaRegla = {
  fecha: string
  nivel: string
  objeto_id: string
  cuenta_id: string | null
  nombre: string | null
  linea: string | null
  estado: string | null
  estado_efectivo: string | null
  estado_real: string | null
  diario_crudo: number | null
  spend: number | null
  impresiones: number | null
  frecuencia: number | null
  clicks: number | null
  compras: number | null
  revenue: number | null
}

export type Grupo = {
  objeto_id: string
  nivel: NivelRegla
  filas: FilaRegla[]
  /** La última fila **de la ventana**. Para preguntas sobre el período que se está mirando. */
  ultima: FilaRegla
  /**
   * 🔴 La última fila **con configuración escrita** del objeto, esté o no en la ventana. Para
   * preguntas sobre AHORA («¿está al aire?», «¿cuánto gasta por día?»). Ver `agrupar()`.
   */
  actual: FilaRegla
  nombre: string
  linea: string | null
  cuenta_id: string | null
  dias: number
  spend: number
  compras: number
  revenue: number
  impresiones: number
  clicks: number
  roas: number
  frecuenciaPico: number
}

export type Contexto = {
  filas: FilaRegla[]
  umbralLinea: Partial<Umbrales> | null
  hasta: string
  /**
   * El índice de decisiones humanas de `indexar()`, o `null` para no callar nada. Opcional a
   * propósito: quien no sabe de decisiones sigue obteniendo exactamente lo de antes.
   */
  decisiones?: Map<string, Decision[]> | null
  /**
   * El techo de costo por compra de la marca, de su ficha de rentabilidad. De acá sale
   * `cpa_maximo`. `null` o ausente = la marca no tiene ficha ⇒ las reglas que lo piden quedan
   * apagadas diciéndolo. ⛔ Nunca un default.
   */
  techo?: number | null
}

export type Evaluacion =
  | { ok: false; status: number; error: string }
  | {
    ok: true
    /** No es un error: es una regla que no puede correr, con el motivo escrito. */
    apagada: boolean
    faltan: ClaveUmbral[]
    /** Apagada por falta de HISTORIAL, no de umbrales: se destraba sola con los días de cron. */
    sinHistorial?: boolean
    umbrales: Umbrales
    detalle: string | null
    hallazgos: HallazgoNuevo[]
    /**
     * 🔑 Los que una decisión humana calló. **`hallazgos.length + silenciados.length` es lo que
     * detectó la regla**: nada desaparece en silencio, o una decisión vieja se comería una alarma
     * real y no habría forma de enterarse.
     */
    silenciados: Silenciado<HallazgoNuevo>[]
  }

export type Calibracion =
  | { ok: false; status: number; error: string }
  | {
    ok: true
    apagada: boolean
    faltan?: ClaveUmbral[]
    sinHistorial?: boolean
    detalle?: string | null
    dias: number
    /** Cuántas veces habría saltado en total: el ruido real que se leería en el Panel. */
    total: number
    /** Y a cuántas cosas DISTINTAS. 40 saltos sobre 3 objetos es repetición; sobre 40, un hallazgo. */
    objetos: number
    porFecha: Array<{ fecha: string; n: number }>
    ejemplos: Array<{ objeto_id: string; objeto_nombre: string | null; motivo: string; veces: number }>
  }

/** Los números MEDIDOS de una línea, para elegir un umbral mirando en vez de adivinando. */
export type ContextoLinea = {
  dias: number
  campanias: number
  gastoTotal: number
  roasMedio: number
  cpaMedio: number | null
  frecuenciaPico: number
  /** El techo de la ficha de rentabilidad, o `null` si la marca no tiene ficha cargada. */
  techo: number | null
  techoCargadoEl: string | null
}

/** Lo que contesta `?recurso=reglas`. Trae el catálogo con la respuesta para que la pantalla no se quede con una copia vieja. */
export type RespuestaReglas = {
  reglas: Regla[]
  umbrales: Record<string, Partial<Umbrales>>
  contexto: Record<string, ContextoLinea>
  presets: Array<DefPreset & { clave: ClavePreset }>
  definicionUmbrales: Record<ClaveUmbral, DefUmbral>
  /** Qué líneas puede EDITAR, que no es lo mismo que cuáles ve. */
  puedeEditar: string[]
  dias: number
}

export const PRESETS = PRESETS_JS as Record<ClavePreset, DefPreset>
export const CLAVES_PRESET = CLAVES_PRESET_JS as ClavePreset[]
export const UMBRALES = UMBRALES_JS as Record<ClaveUmbral, DefUmbral>
export const VENTANA_DIAS = VENTANA_DIAS_JS as number
export const DIAS_SEGUIDOS_DEFECTO = DIAS_SEGUIDOS_DEFECTO_JS as number
export const PASO_ESCALON = PASO_ESCALON_JS as number
export const NIVEL_TOTALES = NIVEL_TOTALES_JS as NivelRegla

export const permiteAccionarHallazgo = permiteAccionarHallazgoJs as (
  perfil: unknown,
  preset: string,
  linea: string,
) => { ok: true } | { ok: false; status: number; error: string }

export const derivarUmbrales = derivarUmbralesJs as (
  filas: FilaRegla[],
  opciones?: { techo?: number | null },
) => Partial<Umbrales>
export const contextoUmbrales = contextoUmbralesJs as (filas: FilaRegla[]) => {
  dias: number
  campanias: number
  gastoTotal: number
  roasMedio: number
  cpaMedio: number | null
  frecuenciaPico: number
}
export const umbralesEfectivos = umbralesEfectivosJs as (
  regla: Pick<Regla, 'parametros'> | null,
  umbralLinea: Partial<Umbrales> | null,
  derivados: Partial<Umbrales> | null,
) => Umbrales
export const faltanUmbrales = faltanUmbralesJs as (preset: string, efectivos: Umbrales) => ClaveUmbral[]
export const motivoApagada = motivoApagadaJs as (preset: string, faltan: ClaveUmbral[]) => string
export const frecuenciaPico = frecuenciaPicoJs as (filas: Array<{ frecuencia?: number | null }>) => number
export const ventanaDe = ventanaDeJs as (hastaIso: string, dias: number) => string[]
export const agrupar = agruparJs as (filas: FilaRegla[], nivel: NivelRegla, fechas: string[]) => Grupo[]
export const compararCtr = compararCtrJs as (
  filas: FilaRegla[],
) => { antes: number; despues: number; cae: boolean } | null
export const diasSeguidosPorEncima = diasSeguidosPorEncimaJs as (filas: FilaRegla[], objetivo: number) => number
/**
 * La racha, contada una sola vez para los dos que la miran: el detector que PROPONE escalar y el
 * guardarraíl que deja pasar el escalón horas después. Ver `hayRacha()` en el `.core.js`.
 */
export const hayRacha = hayRachaJs as (
  filas: FilaRegla[],
  u: Partial<Umbrales>,
) => {
  /** Contra qué se juzgó: el costo si la marca tiene techo, el ROAS si no. */
  vara: 'costo' | 'roas'
  objetivo: number
  seguidos: number
  piden: number
  /** El costo por compra de la ventana entera. `null` con la vara del ROAS, o sin compras. */
  cpa: number | null
  /** ¿Está debajo del `CON_AIRE`% del techo? `null` con la vara del ROAS. */
  conAire: boolean | null
  ok: boolean
}
/** El diario que sigue, cortado contra el techo. `null` cuando ya no hay adónde subir. */
export const proximoDiario = proximoDiarioJs as (actualCrudo: number, techoCrudo: number) => number | null
/** El índice del primer día apagado tras el último activo, o `null` si nunca estuvo activo acá. */
export const apagadoEn = apagadoEnJs as (filas: FilaRegla[]) => number | null
/** Cuántos días de la ventana tienen el estado escrito. La serie de estados la arma el cron. */
export const diasConEstado = diasConEstadoJs as (filas: FilaRegla[], fechas: string[]) => number

/**
 * Lo mínimo que hace falta para evaluar: no una `Regla` entera, porque la pantalla calibra reglas
 * que **todavía no existen** (se mueve el dial antes de guardar nada) y esas no tienen `id` ni
 * `creada`. Y la cuenta va en las dos grafías y las dos opcionales: la fila de la base trae
 * `cuenta_id` y el tipo de la app usa `cuentaId`.
 */
export type ReglaEvaluable = Pick<Regla, 'preset' | 'linea' | 'parametros'> & {
  cuentaId?: string | null
  cuenta_id?: string | null
}

export const evaluarRegla = evaluarReglaJs as (regla: ReglaEvaluable, ctx: Contexto) => Evaluacion
export const calibrar = calibrarJs as (regla: ReglaEvaluable, ctx: Contexto & { dias?: number }) => Calibracion
