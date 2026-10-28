/**
 * EL MOTOR POR EVENTOS (sql/023, paso 7 — Bruno 17-oct): la cola, el reintento y el trabajador.
 *
 * 🔑 Quien ve el hecho AVISA (`avisar`): deja un `motor_evento` pendiente; los avisos del mismo trabajo se juntan en UNO
 * (diez ventas seguidas = un recálculo del libro, que lee todo lo que cambió). El trabajador (`drenar`) los corre: al
 * instante cuando el que avisa lo llama, y cada minuto por Vercel Cron (`api/eventos.js`) para los reintentos. El cron de
 * Actions (`libro.yml`, `tn.yml`) sigue de RED: si todo esto se cae, el libro igual corre una vez por día.
 * 🔑 Un trabajo que falla vuelve a la cola con espera creciente (`ESPERAS_MIN`) y abre su ALERTA (`evento:<tipo>:<clave>`,
 * sql/022) con espera: si un reintento sale, la cierra y ⛔ se entera nadie; agotados los intentos queda `fallado` y el
 * vigía manda el mail.
 * 🔑 De a uno por trabajo: ⛔ se toma un evento mientras otro del mismo (tipo, clave) corre. La toma se serializa con un
 * candado de la transacción (es una fila: barato).
 * Todo vive en la base de BDI.
 */
import { abrirAlerta, cerrarAlerta, EMPRESA } from './alerta.mjs'
import { sinSecretosTexto } from './arca/sin-secretos.core.js'

/** La espera antes de cada reintento, en minutos: tras el 1er fallo 1, tras el 2º 5… Agotada la lista, `fallado`. */
export const ESPERAS_MIN = [1, 5, 15, 60, 180]
export const MAX_INTENTOS = ESPERAS_MIN.length + 1
/** Un evento `corriendo` hace más que esto murió con la función (Vercel corta a los 60 s): vuelve a la cola. */
export const VENCE_MIN = 10
/** La alerta de un fallo espera esto antes del mail: los reintentos de 1 + 5 + 15 min ya pasaron. */
export const ESPERA_ALERTA_MIN = 25
/** Los terminados se guardan este tiempo (historia para medir), después se borran. */
export const GUARDAR_DIAS = 30

const MIN = 60_000

/** Qué hacer tras un fallo: `{ estado, proximo }` (puro). `intentos` = los que ya se hicieron, contando éste. */
export function trasFallo(intentos, ahora) {
  if (intentos >= MAX_INTENTOS) return { estado: 'fallado', proximo: null }
  return { estado: 'pendiente', proximo: new Date(ahora.getTime() + ESPERAS_MIN[intentos - 1] * MIN) }
}

export const claveAlerta = (tipo, clave) => `evento:${tipo}:${clave}`

/**
 * Deja (o suma a) el pendiente de ese trabajo. Lo que ya espera un reintento ⛔ se adelanta: el aviso nuevo va en esa vuelta.
 * @param {import('pg').Client} c la base de BDI
 * @returns {{ id: number, nuevo: boolean }}
 */
export async function avisar(c, { tipo, clave, origen = null }) {
  const { rows: [r] } = await c.query(
    `insert into motor_evento (empresa_id, tipo, clave, origen) values ($1, $2, $3, $4)
     on conflict (empresa_id, tipo, clave) where estado = 'pendiente' do update set avisos = motor_evento.avisos + 1
     returning id, (xmax = 0) as nuevo`,
    [EMPRESA, tipo, clave, origen],
  )
  return { id: Number(r.id), nuevo: r.nuevo }
}

/**
 * Toma el próximo evento listo, o `null`. Antes devuelve a la cola los `corriendo` vencidos (la función murió): si ya hay
 * otro pendiente del mismo trabajo, el vencido queda `abandonado` (el pendiente lo cubre).
 */
export async function tomar(c, ahora = new Date()) {
  await c.query('begin')
  try {
    await c.query(`select pg_advisory_xact_lock(hashtext('motor_evento'))`)
    const vence = new Date(ahora.getTime() - VENCE_MIN * MIN)
    await c.query(
      `update motor_evento v set estado = 'abandonado', terminado_en = $3, error = 'la función murió corriéndolo'
        where v.empresa_id = $1 and v.estado = 'corriendo' and v.tomado_en < $2
          and exists (select 1 from motor_evento p where p.empresa_id = v.empresa_id and p.tipo = v.tipo and p.clave = v.clave and p.estado = 'pendiente')`,
      [EMPRESA, vence, ahora],
    )
    await c.query(
      `update motor_evento set estado = 'pendiente', proximo_en = $3, error = 'la función murió corriéndolo'
        where empresa_id = $1 and estado = 'corriendo' and tomado_en < $2`,
      [EMPRESA, vence, ahora],
    )
    const { rows: [e] } = await c.query(
      `update motor_evento set estado = 'corriendo', tomado_en = $2, intentos = intentos + 1
        where id = (
          select p.id from motor_evento p
           where p.empresa_id = $1 and p.estado = 'pendiente' and p.proximo_en <= $2
             and not exists (select 1 from motor_evento q where q.empresa_id = p.empresa_id and q.tipo = p.tipo and q.clave = p.clave and q.estado = 'corriendo')
           order by p.proximo_en, p.id limit 1)
        returning id, tipo, clave, origen, avisos, intentos, creado_en`,
      [EMPRESA, ahora],
    )
    await c.query('commit')
    return e ? { ...e, id: Number(e.id) } : null
  } catch (err) {
    await c.query('rollback').catch(() => {})
    throw err
  }
}

/** Salió: `hecho` y cierra su alerta. */
export async function terminar(c, e, resultado, ahora = new Date()) {
  await c.query(`update motor_evento set estado = 'hecho', terminado_en = $2, resultado = $3, error = null where id = $1`, [e.id, ahora, JSON.stringify(resultado ?? null)])
  await cerrarAlerta(c, { clave: claveAlerta(e.tipo, e.clave) }, ahora)
}

/**
 * Falló: vuelve a la cola con espera, o `fallado` si se agotaron los intentos; y abre (o refresca) su alerta. Si mientras
 * corría llegó otro aviso del mismo trabajo, ese pendiente HEREDA los intentos y la espera, y éste queda `abandonado`.
 */
export async function fallar(c, e, error, { titulo }, ahora = new Date()) {
  const texto = sinSecretosTexto(String(error?.message ?? error)).slice(0, 1000)
  const { estado, proximo } = trasFallo(e.intentos, ahora)
  if (estado === 'pendiente') {
    const { rowCount } = await c.query(
      `update motor_evento p set intentos = greatest(p.intentos, $5), proximo_en = greatest(p.proximo_en, $4), error = $6
        where p.empresa_id = $1 and p.tipo = $2 and p.clave = $3 and p.estado = 'pendiente'`,
      [EMPRESA, e.tipo, e.clave, proximo, e.intentos, texto],
    )
    if (rowCount) await c.query(`update motor_evento set estado = 'abandonado', terminado_en = $2, error = $3 where id = $1`, [e.id, ahora, texto])
    else await c.query(`update motor_evento set estado = 'pendiente', proximo_en = $2, error = $3 where id = $1`, [e.id, proximo, texto])
  } else {
    await c.query(`update motor_evento set estado = 'fallado', terminado_en = $2, error = $3 where id = $1`, [e.id, ahora, texto])
  }
  const detalle = `${texto} — intento ${e.intentos} de ${MAX_INTENTOS}${estado === 'fallado' ? ': se AGOTARON los reintentos (queda la red del cron diario)' : ''}`
  await abrirAlerta(c, { clave: claveAlerta(e.tipo, e.clave), titulo, detalle, esperaMin: ESPERA_ALERTA_MIN }, ahora)
  return { estado, proximo }
}

/**
 * Corre la cola hasta vaciarla o hasta `hasta` (ms de reloj). `trabajos[tipo]` = `{ titulo(clave), correr(clave, ctx) }`;
 * `correr` devuelve `{ resultado, siguientes?: [{ tipo, clave }] }` — los siguientes se avisan al terminar (el libro avisa
 * al empuje de stock). Un tipo sin trabajo FALLA (⛔ se descarta callado).
 * @param {{ c: import('pg').Client, trabajos: object, ctx?: object, hasta?: number, reloj?: () => Date }} p
 */
export async function drenar({ c, trabajos, ctx = {}, hasta = Infinity, reloj = () => new Date() }) {
  const r = { hechos: 0, fallados: 0, reintentos: 0, corridos: [] }
  while (Date.now() < hasta) {
    const e = await tomar(c, reloj())
    if (!e) break
    const t = trabajos[e.tipo]
    const t0 = Date.now()
    try {
      if (!t) throw new Error(`tipo de evento desconocido: ${e.tipo}`)
      const out = (await t.correr(e.clave, { ...ctx, evento: e })) ?? {}
      await terminar(c, e, out.resultado, reloj())
      for (const s of out.siguientes ?? []) await avisar(c, { ...s, origen: `${e.tipo}:${e.clave}` })
      r.hechos++
      r.corridos.push({ id: e.id, tipo: e.tipo, clave: e.clave, ok: true, ms: Date.now() - t0 })
    } catch (err) {
      const f = await fallar(c, e, err, { titulo: t?.titulo(e.clave) ?? `Evento ${e.tipo}:${e.clave}` }, reloj())
      if (f.estado === 'fallado') r.fallados++
      else r.reintentos++
      r.corridos.push({ id: e.id, tipo: e.tipo, clave: e.clave, ok: false, ms: Date.now() - t0, error: sinSecretosTexto(String(err?.message ?? err)).slice(0, 200) })
    }
  }
  return r
}

/** Borra la historia vieja (los terminados de hace más de `GUARDAR_DIAS`). */
export async function limpiar(c, ahora = new Date()) {
  const { rowCount } = await c.query(
    `delete from motor_evento where empresa_id = $1 and estado in ('hecho', 'abandonado', 'fallado') and creado_en < $2`,
    [EMPRESA, new Date(ahora.getTime() - GUARDAR_DIAS * 24 * 60 * MIN)],
  )
  return rowCount
}

/**
 * Para las puertas (TN, el pedido mayorista): avisa con SU conexión a la base de BDI y ⛔ tira — un aviso perdido lo cubre
 * la red (el recálculo de cada hora y el cron diario), y la puerta ⛔ debe fallar por eso.
 */
export async function anotarEventos(abrirConexion, eventos) {
  if (!eventos.length) return
  let c
  try {
    c = await abrirConexion('bdi')
    for (const e of eventos) await avisar(c, e)
  } catch (e) {
    console.warn(`[erp] eventos ${eventos.map((x) => `${x.tipo}:${x.clave}`).join(', ')}: ⛔ se pudieron anotar (${sinSecretosTexto(e.message)})`)
  } finally {
    if (c) await c.end().catch(() => {})
  }
}

/** La red: un recálculo del libro de cada base si el último aviso es de hace más de `cadaMin` (⛔ dependen del monitor). */
export async function avisarRed(c, { bases, cadaMin = 60, ahora = new Date() }) {
  const avisados = []
  for (const base of bases) {
    const { rows: [r] } = await c.query(`select max(creado_en) m from motor_evento where empresa_id = $1 and tipo = 'libro' and clave = $2`, [EMPRESA, base])
    if (r.m && ahora - new Date(r.m) < cadaMin * MIN) continue
    await avisar(c, { tipo: 'libro', clave: base, origen: 'red' })
    avisados.push(base)
  }
  return avisados
}
