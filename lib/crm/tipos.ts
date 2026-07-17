/**
 * Tipos del CRM. Escritos contra los `select=` reales de cargarCRM
 * (index.html:13200, 13250, 13814) y contra la forma que tienen los 4 mapas del
 * KV, medida con `scripts/crm-kv.mjs --dump` el 17-jul-2026.
 */

// ── Filas crudas de Supabase ──────────────────────────────────────────────────

/** select=id,date_sale,total_price,client_id,channel_id,sale_state */
export type FilaVenta = {
  id: number
  date_sale: string | null
  /** PostgREST devuelve `numeric` como string. */
  total_price: number | string | null
  client_id: number | null
  channel_id: number | null
  sale_state: string | null
}

/** select=id,name,email,phone,city,province */
export type FilaCliente = {
  id: number
  name: string | null
  email: string | null
  phone: string | null
  city: string | null
  province: string | null
}

/** select=sale_id,product_name,size,quantity,unit_price,total */
export type FilaDetalle = {
  sale_id: number
  product_name: string | null
  size: string | null
  quantity: number | null
  unit_price: number | string | null
  total: number | string | null
}

// ── Lo que vive en el KV ──────────────────────────────────────────────────────

export type Nota = {
  fecha: string
  texto: string
}

/**
 * Una entrada de `crm:seg:<marca>`. **`es_mayorista` no es cosmético**: arma los
 * ids de la consulta de ventas (index.html:13220-13233). Medido: 274 de 305.
 */
export type Seguimiento = {
  cadencia?: string
  ultimo_contacto?: string | null
  proximo_manual?: string | null
  notas?: Nota[]
  es_mayorista?: boolean
  descartado?: boolean
}

/** `crm:seg:<marca>`: id de cliente → seguimiento. */
export type MapaSeguimiento = Record<string, Seguimiento>

/** `crm:tel:<marca>`: id de cliente → teléfono. Es el único mapa sin otra copia. */
export type MapaTelefonos = Record<string, string>

// ── Salida ────────────────────────────────────────────────────────────────────

export type EstadoSeg = 'none' | 'pendiente' | 'vencido' | 'semana' | 'aldia'

export type Seg = {
  cadencia: string
  ultimo: string | null
  proximo: string | null
  estado: EstadoSeg
  dias: number | null
  notas: Nota[]
}

export type Segmento = 'nuevos' | 'dormidos' | 'riesgo' | 'activos' | 'otros'

/** Un cliente agregado, tal como lo arma calcularAgregadoCRM (index.html:13576). */
export type ClienteCRM = {
  id: number
  name: string
  email: string
  phone: string
  city: string
  province: string
  first_sale: string | null
  last_sale: string | null
  dias_ultimo: number | null
  dias_primero: number | null
  total_sales: number
  total_amount: number
  avg_ticket: number
  ventas: FilaVenta[]
  cadencia: string
  ultimo_contacto: string | null
  proximo_contacto: string | null
  seg_estado: EstadoSeg
  dias_proximo: number | null
  notas: Nota[]
}

/**
 * calcularAgregado devuelve las dos listas.
 *
 * El legacy escribía el global `crmDescartados` y devolvía solo los activos
 * (index.html:13631-13633). Devolver las dos NO es "purificar sacando": los
 * descartados se siguen necesitando para la vista "Ver descartados". Si el port
 * los tirara, esa vista quedaría vacía para siempre — es la trampa que marcó el
 * mapa del workflow.
 */
export type Agregado = {
  activos: ClienteCRM[]
  descartados: ClienteCRM[]
}

export type Kpis = {
  top: number
  activos: number
  riesgo: number
  dormidos: number
  nuevos: number
  sinTel: number
  contactar: number
}

/** Lo que renderResumenCompras (13826) computa antes de escupir HTML. */
export type ResumenCompras = {
  ultima: { fecha: string; items: FilaDetalle[] } | null
  top: { name: string; unidades: number; veces: number; ultPrecio: number }[]
}
