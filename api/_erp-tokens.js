/**
 * Los tokens de la API externa del ERP (`erp.arebensrl.com/api/ext/v1`; estándar de Ger B.13): ERP › Configuración › Tokens de la API. Sólo Admin:
 * ninguna de estas vistas o acciones se reparte (`configurar`, `lib/permisos.core.js`). Viven en la base de BDI, también los de Zattia.
 *
 *   GET  ?recurso=erp&vista=tokens                  la lista y el catálogo de permisos · ⛔ nunca el hash
 *   GET  ?recurso=erp&vista=token-actividad&id=N    sus últimas consultas (⛔ guardan el token ni el cuerpo)
 *   POST {accion:'token-crear', negocio, app, dueno, email?, permisos, vence}
 *   POST {accion:'token-editar', id, permisos, vence}     sin cambiar el secreto
 *   POST {accion:'token-regenerar', id}                   el anterior deja de funcionar en el acto
 *   POST {accion:'token-revocar', id}
 *   POST {accion:'token-probar', token}                   ¿funciona? con la misma regla que la API
 *
 * 🔴 El token sale UNA vez, en la respuesta de crear o regenerar: ⛔ se guarda ni se loguea. `token-probar` lo recibe y ⛔ lo devuelve.
 */
import { errorDeAlta, errorDeEdicion, idDeToken, resultadoDePrueba } from '../lib/erp/tokens.core.js'

const importar = () => import('../motor/ext/tokens.mjs')
const catalogo = () => import('../motor/ext/contrato.mjs')
const QUE = 'Los tokens'
const sinTabla = { status: 409, error: 'Los tokens todavía no están en la base del motor (migración 071).' }

async function conTabla(conMotor, fn) {
  try {
    return await conMotor('bdi', QUE, fn)
  } catch (err) {
    if (err?.code === '42P01') return sinTabla
    throw err
  }
}

export async function tokensErp(_, { conMotor }) {
  const [{ listarTokens }, { PERMISOS, NUNCA, NEGOCIOS }] = await Promise.all([importar(), catalogo()])
  const r = await conTabla(conMotor, (db) => listarTokens(db))
  if (r?.status) return r
  return { tokens: r, permisos: PERMISOS, nunca: NUNCA, negocios: Object.fromEntries(Object.values(NEGOCIOS).map((n) => [n.slug, n.name])) }
}

export async function actividadTokenErp({ id }, { conMotor }) {
  const n = idDeToken(id)
  if (!n) return { status: 400, error: 'Falta el token' }
  const r = await conTabla(conMotor, async (db) => (await db.query(
    `select en, metodo, molde, status, code, ms, cantidad, ip from ext_consulta where token_id = $1 order by en desc limit 50`, [n])).rows)
  return r?.status ? r : { consultas: r }
}

export async function crearTokenErp({ body, usuario }, { conMotor }) {
  const [{ crearToken }, { PERMISOS, NEGOCIOS }] = await Promise.all([importar(), catalogo()])
  const error = errorDeAlta(body, { catalogo: PERMISOS, negocios: NEGOCIOS })
  if (error) return { status: 400, error }
  const r = await conTabla(conMotor, (db) => crearToken(db, {
    negocio: body.negocio, app: body.app, dueno: body.dueno, email: body.email || null, permisos: body.permisos, vence: body.vence, creado_por: usuario || 'monitor',
  }))
  return r?.status ? r : { ok: true, id: Number(r.id), key_prefix: r.key_prefix, token: r.token }
}

export async function editarTokenErp({ body }, { conMotor }) {
  const [{ editarToken }, { PERMISOS }] = await Promise.all([importar(), catalogo()])
  const id = idDeToken(body?.id)
  if (!id) return { status: 400, error: 'Falta el token' }
  const error = errorDeEdicion(body, { catalogo: PERMISOS })
  if (error) return { status: 400, error }
  const r = await conTabla(conMotor, async (db) => {
    const [t] = (await db.query('select revocado_en from ext_token where id = $1', [id])).rows
    if (!t) return { status: 404, error: 'No está ese token.' }
    if (t.revocado_en) return { status: 409, error: 'Ese token está revocado: hay que crear uno nuevo.' }
    return editarToken(db, { id, permisos: body.permisos, vence: body.vence })
  })
  return r?.status ? r : { ok: true }
}

export async function regenerarTokenErp({ body }, { conMotor }) {
  const { regenerarToken } = await importar()
  const id = idDeToken(body?.id)
  if (!id) return { status: 400, error: 'Falta el token' }
  const r = await conTabla(conMotor, (db) => regenerarToken(db, { id }))
  if (r?.status) return r
  if (!r) return { status: 409, error: 'No está ese token, o está revocado.' }
  return { ok: true, id: Number(r.id), key_prefix: r.key_prefix, token: r.token }
}

export async function revocarTokenErp({ body }, { conMotor }) {
  const { revocarToken } = await importar()
  const id = idDeToken(body?.id)
  if (!id) return { status: 400, error: 'Falta el token' }
  const r = await conTabla(conMotor, (db) => revocarToken(db, { id }))
  if (r?.status) return r
  return r ? { ok: true } : { status: 404, error: 'No está ese token.' }
}

export async function probarTokenErp({ body }, { conMotor }) {
  const { autenticar } = await importar()
  if (typeof body?.token !== 'string' || !body.token.trim()) return { status: 400, error: 'Pegá el token.' }
  const r = await conTabla(conMotor, (db) => autenticar(db, `Bearer ${body.token.trim()}`))
  return r?.status && r.error ? r : resultadoDePrueba(r)
}
