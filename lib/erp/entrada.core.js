import { z } from 'zod'
import { TIENDAS } from './conciliacion.core.js'

/**
 * La puerta de ENTRADA de `api/_erp.js` (Bases, hito 5): antes de despachar, la forma del pedido.
 * 🔑 Sólo la FORMA (tipo, formato, largo); lo que una acción necesita adentro lo sigue leyendo su
 * `leer*()`. Una vista o acción que ⛔ está acá contesta 400: una nueva nace cerrada hasta nombrarla.
 * Los parámetros que ⛔ se nombran pasan (el ruteo agrega `recurso`), pero ⛔ como lista ni sin tope.
 */

const linea = z.enum(['bdi', 'zattia', 'stunned'])
const dia = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha va AAAA-MM-DD')])
const mes = z.string().regex(/^\d{4}-\d{2}$/, 'Mes inválido')
const texto = (max) => z.string().max(max, `Hasta ${max} caracteres`)
const id = texto(100)
const prueba = z.enum(['0', '1'])

const conMarca = { marca: linea.optional() }
const periodo = { ...conMarca, desde: dia.optional(), hasta: dia.optional() }

const VISTAS = {
  permisos: {},
  interruptores: {},
  pines: conMarca,
  encargadas: conMarca,
  roles: {},
  configuracion: {},
  facturas: {},
  facturacion: {},
  'pedidos-tn': conMarca,
  diferencias: { ...conMarca, fecha: dia.optional() },
  conciliacion: { tienda: z.enum(TIENDAS).optional(), fecha: dia.optional() },
  reglas: conMarca,
  ajustes: { linea: linea.optional() },
  rutas: conMarca,
  redondeo: conMarca,
  estructura: conMarca,
  proveedores: { ...conMarca, q: texto(200).optional() },
  precio: { ...conMarca, producto: id.optional() },
  stock: { ...conMarca, q: texto(200).optional(), producto: id.optional(), talle: id.optional() },
  movimientos: periodo,
  transferencias: conMarca,
  'transferencias-doc': { marca: linea.optional(), estado: texto(100).optional() },
  salidas: { marca: linea.optional(), estado: texto(100).optional(), ref: id.optional() },
  depositos: { marca: linea.optional() },
  'producto-historial': { ...conMarca, productId: id.optional() },
  comparacion: conMarca,
  'cargar-venta': conMarca,
  cobros: { ...periodo, prueba: prueba.optional() },
  gastos: { ...periodo, prueba: prueba.optional() },
  'empujes-stock': conMarca,
  'ventas-producto': periodo,
  'productos-lista': conMarca,
  'inicio-resultado': conMarca,
  'clientes-lista': conMarca,
  'cliente-ficha': { ...conMarca, clave: id.optional() },
  'cuentas-corrientes': { ...conMarca, prueba: prueba.optional() },
  'cuenta-cliente': { ...periodo, cliente: id.optional(), linea: linea.optional(), prueba: prueba.optional() },
  // La cuenta del cliente del chat en el panel de WhatsApp (BDI): por su id de GN o por el teléfono del chat.
  'cuenta-panel': { ...conMarca, gnId: z.string().regex(/^\d{0,12}$/).optional(), tel: z.string().regex(/^\d{0,20}$/).optional(), prueba: prueba.optional() },
  // El pedido mayorista en el panel (paso 3 del plan «BDI directo al ERP»).
  'pedidos-panel': { ...conMarca, cliente: id.optional(), tel: z.string().regex(/^\d{0,20}$/).optional() },
  'pedido-panel': { ...conMarca, id: id.optional() },
  'pedido-productos': { ...conMarca, id: id.optional(), q: texto(80).optional() },
  'clientes-panel': { ...conMarca, q: texto(80).optional() },
  // La situación crediticia del cliente (BCRA): el CUIT lo lee el servidor de la ficha.
  'bcra-panel': { ...conMarca, cliente: id.optional() },
  'preparados-sin-pagar': conMarca,
  'stock-lista': conMarca,
  'ventas-lista': periodo,
  'venta-extra': { ...conMarca, id: id.optional() },
  ventas: { ...periodo, q: texto(200).optional() },
  venta: { ...conMarca, id: id.optional() },
  // Reimprimir el ticket desde ERP › Ventas (29-oct).
  ticket: { ...conMarca, id: id.optional() },
  'venta-gn-cambio': { ...conMarca, id: id.optional() },
  clientas: { ...conMarca, q: texto(200).optional() },
  saldo: { ...conMarca, doc: texto(30).optional() },
}

export const ACCIONES = [
  'poner-interruptor', 'poner-roles', 'restablecer-roles', 'poner-pin', 'quitar-pin', 'verificar-pin', 'cerrar', 'facturar', 'nota-credito', 'nota-debito', 'soltar-precio', 'cargar-precio', 'cargar-costo', 'guardar-proveedor',
  'editar-venta', 'nota-venta', 'cobrar-venta', 'cobrar-cuenta', 'cargar-venta', 'anular', 'corregir-precio', 'corregir-medio', 'confirmar-vuelta', 'cambiar',
  'nota-credito-venta', 'facturar-cambio', 'facturar-venta', 'guardar-regla', 'sembrar-reglas', 'simular-reglas',
  'prender-caja-reglas', 'crear-ajuste', 'aprobar-ajuste', 'descartar-ajuste', 'poner-ruta', 'poner-redondeo', 'reintentar-entregas', 'poner-credito', 'poner-contacto', 'anotar-whatsapp', 'sacar-whatsapp', 'cliente-nuevo-panel', 'registrar-gasto', 'mandar-stock',
  'pedido-entrar', 'pedido-cambiar', 'pedido-a-preparar', 'pedido-anular',
  'transferencia-crear', 'transferencia-armar', 'transferencia-enviar', 'transferencia-recibir', 'transferencia-cancelar',
  'salida-crear', 'salida-devolver', 'salida-cerrar', 'salida-cancelar',
  'deposito-activar', 'deposito-desactivar',
  'producto-editar', 'variante-editar', 'variante-agregar',
]

/** El cuerpo de una acción: lo de arriba con forma; lo de adentro, con TOPE (largo, cantidad y hondura). */
// `linea` vacía o null es «la de la marca» (`lib/erp/rutas.core.js`).
const cuerpo = z.looseObject({ accion: z.enum(ACCIONES), marca: linea.optional(), linea: z.union([linea, z.literal(''), z.null()]).optional(), mes: mes.optional() })
const TOPE = { texto: 5000, lista: 1000, hondura: 8 }

function sinTope(v, camino = [], hondura = 0) {
  if (hondura > TOPE.hondura) return { camino, error: 'El pedido viene demasiado anidado' }
  if (typeof v === 'string') return v.length > TOPE.texto ? { camino, error: `Hasta ${TOPE.texto} caracteres` } : null
  if (Array.isArray(v)) {
    if (v.length > TOPE.lista) return { camino, error: `Hasta ${TOPE.lista} elementos` }
    for (let i = 0; i < v.length; i++) { const e = sinTope(v[i], [...camino, i], hondura + 1); if (e) return e }
    return null
  }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) { const e = sinTope(x, [...camino, k], hondura + 1); if (e) return e }
  }
  return null
}

const fallo = (camino, error) => ({ status: 400, error: `Pedido inválido${camino.length ? ` (${camino.join('.')})` : ''}: ${error}`, campo: camino.join('.') || null })
const primero = (r) => fallo(r.error.issues[0].path, r.error.issues[0].message)

/**
 * ¿El pedido tiene la forma que el handler sabe atender? `null` si pasa; si no, `{ status: 400, error, campo }`.
 * GET sin `vista` (o `vista=facturacion`) es la facturación del mes: sólo `mes`.
 * @param {{ method: string, query?: Record<string, unknown>, body?: unknown }} req
 */
export function entradaInvalida({ method, query = {}, body }) {
  const q = z.looseObject({ vista: z.string().optional(), mes: mes.optional() }).safeParse(query)
  if (!q.success) return primero(q)
  if (method === 'GET') {
    const forma = q.data.vista === undefined ? {} : VISTAS[q.data.vista]
    if (!forma) return fallo(['vista'], 'Vista desconocida')
    const r = z.looseObject(forma).safeParse(query)
    if (!r.success) return primero(r)
    // Los parámetros que ⛔ se nombran tampoco vienen repetidos (`?x=a&x=b` llega como lista) ni largos.
    for (const [k, v] of Object.entries(query)) {
      if (typeof v !== 'string') return fallo([k], 'Va un solo valor')
      if (v.length > 500) return fallo([k], 'Hasta 500 caracteres')
    }
    return null
  }
  const b = cuerpo.safeParse(body ?? {})
  if (!b.success) return primero(b)
  const t = sinTope(body)
  return t ? fallo(t.camino, t.error) : null
}
