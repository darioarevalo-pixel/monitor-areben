/**
 * Accionar sobre la pauta de Meta, del lado tipado.
 *
 * ⚠️ La tabla de acciones —qué existe, quién la puede hacer, qué campos acepta— **no vive acá**:
 * vive en `lib/meta-ads/acciones.core.js`, en JS plano, porque `api/_meta-acciones.js` la necesita
 * para validar y no puede importar TypeScript. Este archivo aporta los tipos.
 *
 * Los botones que dibuja `Etapas.tsx` salen de `accionesQuePuede()`, que es la misma función con la
 * que el servidor contesta 403. La UI igual **no es el control de acceso**: el que manda es el guard.
 */

import type { Perfil } from '@/lib/permisos'
import type { LineaPauta } from './tipos'
import {
  ACCIONES as ACCIONES_JS,
  aCrudo as aCrudoJs,
  accionesQuePuede as accionesQuePuedeJs,
  aMonto as aMontoJs,
  CAMPOS_LECTURA as CAMPOS_LECTURA_JS,
  CLAVES_ACCION as CLAVES_ACCION_JS,
  ETIQUETA_NIVEL as ETIQUETA_NIVEL_JS,
  factorMoneda as factorMonedaJs,
  fotoDe as fotoDeJs,
  LARGO_NOMBRE as LARGO_NOMBRE_JS,
  lineasQuePuede as lineasQuePuedeJs,
  MARCAS_META as MARCAS_META_JS,
  NIVELES as NIVELES_JS,
  nivelReal as nivelRealJs,
  permiteAccion as permiteAccionJs,
  quedoPuesto as quedoPuestoJs,
  revisarPresupuesto as revisarPresupuestoJs,
  SIN_LINEA as SIN_LINEA_JS,
  TOPE_ADS_SINCRONO as TOPE_ADS_SINCRONO_JS,
  validarPedido as validarPedidoJs,
  validarValores as validarValoresJs,
} from './acciones.core.js'

/** Los tres niveles de la jerarquía de Meta. */
export type NivelAccion = 'campania' | 'conjunto' | 'aviso'

/** Las acciones que existen. Crear desde cero sumaría `crear` a la misma tabla. */
export type ClaveAccion = 'estado' | 'presupuesto' | 'nombre' | 'duplicar'

export type DefAccion = {
  /** El sub-permiso que la habilita (`meta-ads.<sub>`). */
  sub: string
  rotulo: string
  rotuloPermiso: string
  niveles: NivelAccion[]
  /** Whitelist cerrada: un campo fuera de la lista es 400, no un campo ignorado. */
  campos: string[]
  /** Si se puede repetir sin consecuencia. Duplicar y crear van a entrar en `false`. */
  reintentable: boolean
}

/** Lo que viaja en el POST. `idem` lo genera la pantalla al apretar, y es lo que mata el doble clic. */
export type PedidoAccion = {
  accion: ClaveAccion
  nivel: NivelAccion
  objetoId: string
  campos: Record<string, string | number>
  idem: string
}

/** Un veredicto de los validadores del core: pasa, o no pasa con su código HTTP y su motivo. */
export type Veredicto = { ok: true } | { ok: false; status: number; error: string }

/** Lo que contesta `/api/meta-ads` cuando la acción salió (o cuando Meta la rechazó). */
export type ResultadoAccion = {
  /** El objeto tal como quedó DESPUÉS de releerlo en Meta. Nunca lo pedido. */
  quedo: Record<string, unknown>
  nivel: NivelAccion
  objetoId: string
  objetoNombre: string
  campaignId: string | null
  linea: LineaPauta
  /** `true` cuando el log de auditoría falló pero Meta ya aplicó el cambio. La plata ya se movió. */
  sinRegistro?: boolean
  /** Cuando el `idem` ya se había usado: es la respuesta guardada, no una escritura nueva. */
  repetida?: boolean
  /**
   * Sólo al duplicar: el objeto NUEVO que quedó en Meta. Va aparte de `quedo` porque no es «cómo
   * quedó lo que toqué» sino «qué apareció»: son dos objetos distintos y confundirlos haría que la
   * pantalla mostrara el original como si hubiera cambiado.
   */
  copia?: {
    id: string
    nombre: string
    /**
     * Siempre `PAUSED`. Es el `status` releído de Meta, no asumido: es la garantía de que no gasta.
     *
     * 🔴 **Es el `status` y no el `effective_status`, medido el 8-ago-2026.** Una copia recién creada
     * viene con `effective_status: 'IN_PROCESS'` —Meta la está armando— y `status: 'PAUSED'`. Cuando
     * acá llegaba el efectivo, el cartel gritaba en rojo «figura IN_PROCESS, no pausada, pausala ya»
     * sobre una copia que había nacido perfecta.
     */
    estado: string
    /** El `effective_status`, sólo si dice algo distinto (`IN_PROCESS`). Es contexto, no un problema. */
    efectivo?: string | null
    /**
     * `false` si la copia quedó **sin marca**: existe en Meta pero nadie la puede accionar desde el
     * monitor hasta asignarla en Etapas. Se avisa en vez de dejarla escondida.
     */
    conLinea: boolean
  }
}

export const ACCIONES = ACCIONES_JS as Record<ClaveAccion, DefAccion>
export const CLAVES_ACCION = CLAVES_ACCION_JS as ClaveAccion[]
export const NIVELES = NIVELES_JS as NivelAccion[]
export const ETIQUETA_NIVEL = ETIQUETA_NIVEL_JS as Record<NivelAccion, string>
export const CAMPOS_LECTURA = CAMPOS_LECTURA_JS as Record<NivelAccion, string>
export const MARCAS_META = MARCAS_META_JS as string[]
export const SIN_LINEA = SIN_LINEA_JS as string
/** El tope de largo de un nombre. Es nuestro, no de Meta: ver el comentario en el core. */
export const LARGO_NOMBRE = LARGO_NOMBRE_JS as number
/** Cuántos avisos copia Meta en una llamada síncrona. La pantalla lo nombra y el servidor lo hace cumplir. */
export const TOPE_ADS_SINCRONO = TOPE_ADS_SINCRONO_JS as number

export const lineasQuePuede = lineasQuePuedeJs as (perfil: Perfil | null, sub: string) => LineaPauta[]
export const permiteAccion = permiteAccionJs as (perfil: Perfil | null, accion: string, linea: LineaPauta) => Veredicto
export const accionesQuePuede = accionesQuePuedeJs as (perfil: Perfil | null, linea: LineaPauta) => ClaveAccion[]
export const validarPedido = validarPedidoJs as (p: unknown) =>
  | { ok: true; def: DefAccion; accion: ClaveAccion; nivel: NivelAccion; objetoId: string; campos: Record<string, string | number>; idem: string }
  | { ok: false; status: number; error: string }
export const validarValores = validarValoresJs as (accion: string, campos: Record<string, unknown>) => Veredicto
export const nivelReal = nivelRealJs as (obj: Record<string, unknown> | null) => NivelAccion | null
export const revisarPresupuesto = revisarPresupuestoJs as (
  nivel: NivelAccion,
  objeto: Record<string, unknown>,
  padre: Record<string, unknown> | null,
  minDiarioCrudo: number | null,
  pedido: number,
) => Veredicto
export const quedoPuesto = quedoPuestoJs as (
  campos: Record<string, unknown>,
  releido: Record<string, unknown> | null,
) => { ok: boolean; faltan: string[] }
export const fotoDe = fotoDeJs as (campos: Record<string, unknown>, obj: Record<string, unknown> | null) => Record<string, unknown>

export const factorMoneda = factorMonedaJs as (moneda: string) => number
/** De lo que se tipea ($ 18.000) a lo que entiende Meta (1800000 en ARS). */
export const aCrudo = aCrudoJs as (monto: number, moneda: string) => number
/** De lo que devuelve Meta a lo que se muestra. */
export const aMonto = aMontoJs as (crudo: number | null | undefined, moneda: string) => number

/**
 * La clave de idempotencia. Se genera **al apretar el botón**, no al mandar: si se generara al
 * mandar, un doble clic haría dos claves distintas y dos escrituras, que es justo lo que evita.
 */
export function nuevoIdem(): string {
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}
