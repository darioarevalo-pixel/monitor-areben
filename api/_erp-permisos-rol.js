/**
 * Los ROLES de cada permiso del ERP, por marca (motor sql/049; Bruno 25-oct: «la configuración de permisos se va a seguir trabajando»).
 * `api/_erp.js` los lee en cada pedido de quien no es Admin y se los pasa a `puedeErp` (pisan la tabla `ERP_PERMISOS`, sólo en los
 * `PERMISOS_EDITABLES`). Se cambian desde Configuración › Usuarios y roles (sólo Admin).
 *
 *   GET  ?recurso=erp&vista=roles                                    { roles, editables, defecto, guardados }
 *   POST {recurso:'erp', accion:'poner-roles', marca, permiso, roles: ['administracion', …]}   [] = nadie salvo Admin
 *   POST {recurso:'erp', accion:'restablecer-roles', marca, permiso}                           vuelve a la tabla del código
 *
 * 🔴 Si la base de una marca no responde, esa marca queda CERRADA (`{ __error: true }` ⇒ sólo Admin) y queda un `console.warn`:
 * volver al valor por defecto le devolvería el acceso a un rol que Admin le sacó.
 */
import { ERP_PERMISOS, ERP_ROLES, PERMISOS_EDITABLES, rolesDe } from '../lib/permisos.core.js'

const importar = () => import('../motor/stock/permisos-rol.mjs')
const MARCAS = ['bdi', 'zattia']

/** `{ bdi: { permiso: roles[] }, zattia: {…} }`; una marca que falla es `{ __error: true }` (cerrada). */
export async function rolesGuardadosDeMarcas(marcas, { conMotor }) {
  const { permisosRolDe } = await importar()
  const out = {}
  await Promise.all(marcas.map(async (marca) => {
    try {
      const r = await conMotor(marca, 'Los roles', (db) => permisosRolDe(db, { linea: marca }))
      if (r && r.status) { out[marca] = { __error: true }; console.warn(`[roles] ${marca}: ${r.error}`); return }
      out[marca] = r
    } catch (e) {
      out[marca] = { __error: true }
      console.warn(`[roles] ${marca}: ${e.message}`)
    }
  }))
  return out
}

/** Lo que muestra la pantalla: los roles, los permisos que se pueden repartir, el defecto del código y lo guardado, por marca. */
export async function vistaRoles({ conMotor }) {
  const guardados = await rolesGuardadosDeMarcas(MARCAS, { conMotor })
  const defecto = Object.fromEntries(MARCAS.map((m) => [m, Object.fromEntries(PERMISOS_EDITABLES.map((p) => [p, rolesDe(p, m)]))]))
  return { roles: ERP_ROLES, editables: PERMISOS_EDITABLES, defecto, guardados }
}

function entrada(body) {
  const marca = String(body?.marca || '')
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const permiso = String(body?.permiso || '')
  if (!PERMISOS_EDITABLES.includes(permiso) || !(permiso in ERP_PERMISOS)) return { status: 400, error: 'Ese permiso no se puede repartir entre roles' }
  return { marca, permiso }
}
const sinTabla = { status: 409, error: 'Los roles todavía no están en la base del motor (migración 049).' }

/** `body`: `{ marca, permiso, roles }`. Guarda los roles de UN permiso en la base de esa marca. */
export async function ponerRolesErp({ body, usuario }, { conMotor }) {
  const e = entrada(body)
  if (e.status) return e
  const { ponerRolesDePermiso } = await importar()
  let r
  try {
    r = await conMotor(e.marca, 'Los roles', (db) => ponerRolesDePermiso(db, { linea: e.marca, permiso: e.permiso, roles: body.roles, usuario }))
  } catch (err) {
    if (err?.code === '42P01') return sinTabla
    throw err
  }
  if (r && r.status) return r
  if (!r.ok) return { status: 400, error: r.error.mensaje }
  return { ok: true, marca: e.marca, guardados: r.permisos }
}

/** `body`: `{ marca, permiso }`. Vuelve ese permiso al valor de la tabla del código. */
export async function restablecerRolesErp({ body }, { conMotor }) {
  const e = entrada(body)
  if (e.status) return e
  const { restablecerPermiso } = await importar()
  let r
  try {
    r = await conMotor(e.marca, 'Los roles', (db) => restablecerPermiso(db, { linea: e.marca, permiso: e.permiso }))
  } catch (err) {
    if (err?.code === '42P01') return sinTabla
    throw err
  }
  if (r && r.status) return r
  if (!r.ok) return { status: 400, error: r.error.mensaje }
  return { ok: true, marca: e.marca, guardados: r.permisos }
}
