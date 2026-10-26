/**
 * LOS ROLES DE CADA PERMISO DEL ERP, por marca (paso 7, sesión B; Bruno 25-oct: «que sea configurable»). Tabla: sql/049.
 * Los lee el monitor (`api/_erp.js`) y se los pasa a `puedeErp`; los cambia sólo Admin desde Configuración › Usuarios y roles.
 * Sin tabla o sin fila = el valor por defecto del monitor (`ERP_PERMISOS`): ⛔ rompe si la migración todavía no corrió.
 * Qué permisos existen y cuáles NO se pueden abrir (costos, configurar) lo valida el monitor, que es dueño de la lista.
 */
export const ROLES = ['local', 'mayorista', 'deposito', 'administracion', 'consulta']
const FORMA_PERMISO = /^[a-z][a-z-]*$/

const invalida = (mensaje, campo) => ({ ok: false, error: { codigo: 'ENTRADA_INVALIDA', mensaje, campo } })

/** `{ permiso: [roles] }` con lo que se guardó para esa línea. Sin tabla ⇒ `{}` (todo por defecto). */
export async function permisosRolDe(db, { linea }) {
  const [{ hay }] = (await db.query(`select to_regclass('public.erp_permisos_rol') is not null as hay`)).rows
  if (!hay) return {}
  const { rows } = await db.query('select permiso, roles from erp_permisos_rol where linea = $1', [linea])
  return Object.fromEntries(rows.map((r) => [r.permiso, r.roles]))
}

/** Guarda los roles de UN permiso en una línea. `{ ok, permisos }` o `{ ok: false, error }`. Quién lo cambió queda en la fila. */
export async function ponerRolesDePermiso(db, { linea, permiso, roles, usuario }) {
  if (!String(linea ?? '').trim()) return invalida('Falta la línea', 'linea')
  if (!FORMA_PERMISO.test(String(permiso ?? ''))) return invalida(`Permiso inválido: ${permiso}`, 'permiso')
  if (!Array.isArray(roles) || roles.some((r) => !ROLES.includes(r))) return invalida('Los roles son una lista de roles conocidos', 'roles')
  const quien = String(usuario ?? '').trim()
  if (!quien) return invalida('Falta quién lo cambia', 'usuario')
  await db.query(
    `insert into erp_permisos_rol (linea, permiso, roles, cambiado_por) values ($1, $2, $3, $4)
     on conflict (linea, permiso) do update set roles = excluded.roles, cambiado_por = excluded.cambiado_por, cambiado_en = now()`,
    [linea, permiso, [...new Set(roles)], quien],
  )
  return { ok: true, permisos: await permisosRolDe(db, { linea }) }
}

/** Vuelve UN permiso al valor por defecto del código (borra la fila). */
export async function restablecerPermiso(db, { linea, permiso }) {
  if (!String(linea ?? '').trim()) return invalida('Falta la línea', 'linea')
  if (!FORMA_PERMISO.test(String(permiso ?? ''))) return invalida(`Permiso inválido: ${permiso}`, 'permiso')
  await db.query('delete from erp_permisos_rol where linea = $1 and permiso = $2', [linea, permiso])
  return { ok: true, permisos: await permisosRolDe(db, { linea }) }
}
