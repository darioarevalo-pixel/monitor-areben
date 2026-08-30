/**
 * Los tipos del PRM y de Recorridas. **Un modelo, dos secciones**: `prm` (área Proveedores) lee la
 * ficha y `recorridas` (área Compras) escribe lo que pasa en la calle.
 *
 * El por qué de cada campo vive en `sql/migrate-prm.sql`, que es la fuente de verdad del modelo.
 * Acá va sólo lo que el tipo no dice solo.
 */

/** 'por_visitar' nunca fui o quiero volver · 'visitado' fui y no compré · 'compro' proveedor vivo. */
export type EstadoLocal = 'por_visitar' | 'visitado' | 'compro' | 'descartado'
export type EstadoInteres = 'mirando' | 'pedido' | 'descartado'
export type EstadoRecorrida = 'armando' | 'en_curso' | 'cerrada'
export type DeQuien = 'yo' | 'ellos'

export type ProveedorLocal = {
  id: string
  nombre: string
  galeria: string | null
  direccion: string | null
  entre_calles: string | null
  localidad: string
  provincia: string
  /** Agrupa el viaje ('Flores', 'Once'). `null` = todavía no se clasificó ⇒ no entra a ninguna recorrida. */
  zona: string | null
  rubro: string | null
  lat: number | null
  lng: number | null
  /** Con qué forma de la dirección contestó el geocoder. Sin esto un punto raro no se puede revisar. */
  geo_usada: string | null
  geo_en: string | null
  instagram: string | null
  telefono: string | null
  contacto: string | null
  estado: EstadoLocal
  nota: string | null
  /** El id del sistema de Ingresos: el único id de proveedor estable del grupo. Se tilda a mano. */
  proveedor_id_ingresos: number | null
  /** El string `productos.proveedor` del espejo de GN. ⚠️ Existe SÓLO en Zattia. */
  proveedor_gn: string | null
  creado_por: string | null
  creado_en: string
  actualizado_en: string
}

export type Visita = {
  id: string
  local_id: string
  fecha: string
  quien: string | null
  opinion: string | null
  puntaje: number | null
  /** 🔴 Booleano a propósito: la plata y las unidades vuelven CONTADAS por la OC. Ver el .sql. */
  compre: boolean
  que_compre: string | null
  fotos: string[]
  creado_en: string
}

export type Interes = {
  id: string
  local_id: string
  visita_id: string | null
  descripcion: string
  foto: string | null
  /** El único número que ningún sistema tiene. Un precio nuevo es una FILA nueva, no un update. */
  precio_visto: number | null
  visto_en: string
  marca: 'bdi' | 'zattia' | null
  estado: EstadoInteres
  nota: string | null
  creado_en: string
}

export type Compromiso = {
  id: string
  local_id: string
  visita_id: string | null
  que: string
  de_quien: DeQuien
  para_cuando: string | null
  cumplido_en: string | null
  cumplido_nota: string | null
  /** 🔴 De acá sale "desde cuándo espera". ⛔ Nunca de `actualizado_en`. */
  creado_en: string
}

export type Recorrida = {
  id: string
  fecha: string
  zona: string | null
  estado: EstadoRecorrida
  nota: string | null
  creado_por: string | null
  creado_en: string
  cerrada_en: string | null
}

export type Parada = {
  id: string
  recorrida_id: string
  local_id: string
  orden: number
  visitado_en: string | null
  salteado: boolean
  visita_id: string | null
}

// ── Lo que se calcula, no se guarda ────────────────────────────────────────────────────────────

/** En qué anda un compromiso HOY. `sin_fecha` no es un error: hay promesas sin plazo. */
export type EstadoCompromiso = 'cumplido' | 'vencido' | 'hoy' | 'por_venir' | 'sin_fecha'

export type CompromisoConReloj = Compromiso & {
  situacion: EstadoCompromiso
  /** Días desde `creado_en`. Cuánto hace que esto está dando vueltas. */
  diasEsperando: number
  /** Días de atraso (`vencido`) o que faltan (`por_venir`). `null` en los otros tres. */
  dias: number | null
}

/** Una línea salida de pegar la nota. Todavía no es un local: falta que alguien la mire. */
export type Candidato = {
  nombre: string
  galeria: string | null
  direccion: string | null
  nota: string | null
  /** Sólo lo trae el CSV de Google Maps, que ya viene con el punto. Del texto pegado sale `null`. */
  lat: number | null
  lng: number | null
  /** La línea tal cual vino, para poder mostrarla al lado de lo que se entendió. */
  linea: string
}

export type LineaSinEntender = { linea: string; motivo: string }

/**
 * 🔑 **Toda línea no vacía cae en `candidatos` o en `sinEntender`, nunca en ninguna de las dos.**
 * Es la invariante del importador y está atada por test: lo que se descarta en silencio al pegar
 * una nota de 60 renglones no lo nota nadie hasta el viaje.
 */
export type Parseo = { candidatos: Candidato[]; sinEntender: LineaSinEntender[] }
