/**
 * ALERTAS a una persona (sql/022): quién abre, quién cierra, qué mail toca y cómo se lee.
 *
 * 🔑 Una alerta es un HECHO ABIERTO (`motor_alerta`), ⛔ un mail. La abre quien ve la falla, la cierra quien la ve sana, y
 * el ÚNICO que manda es el vigía (`api/vigia.js`, cada 15 min): ⇒ una falla que se repite cada corrida ⛔ manda un mail por
 * corrida, y un 503 que TN reintenta y sale ⛔ manda ninguno (la espera).
 * 🔑 La frescura se mide sobre lo que las corridas DEJARON en la base, ⛔ sobre lo que dicen: un cron que GitHub ⛔ largó
 * ⛔ escribe «⛔ corrí».
 * Todas viven en la base de BDI (la del motor), también las de Zattia y Stunned.
 */
import { sinSecretosTexto } from './arca/sin-secretos.core.js'

export const EMPRESA = 'areben'
const HORA = 3600_000

/**
 * Cuánto puede tener un dato antes de ser una falla, en horas. MEDIDO (18-oct, 30 corridas desde el 13-oct): el cron de TN
 * «cada 2 h» corre cada 4,8 h de mediana y llegó a 9,2 h sin correr ⇒ 12 · el libro (una vez por día) cayó entre las 17 y
 * las 21 UTC ⇒ 30.
 */
export const LIMITE_H = { tn: 12, catalogo: 12, ml: 12, libro: 30, cuentas: 30, cola: 0.25 }

/** Las tiendas de TN que lee cada base (Stunned vive en la de Zattia). */
export const TIENDAS_DE_BASE = { bdi: ['bdi'], zattia: ['zattia', 'stunned'] }

const NOMBRE = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }

/** «hace 3 h», «hace 2 d» — para el mail. */
export function hace(desde, ahora) {
  const h = (ahora - new Date(desde)) / HORA
  if (h < 1) return `hace ${Math.max(0, Math.round(h * 60))} min`
  if (h < 48) return `hace ${Math.round(h)} h`
  return `hace ${Math.round(h / 24)} d`
}

/**
 * Las reglas de frescura de una base sobre sus hechos (`leerHechos`). Un hecho `undefined` = la tabla ⛔ está (antes de
 * migrar, o ML apagado) ⇒ la regla ⛔ se evalúa; `null` = la tabla está pero VACÍA ⇒ falla (⛔ corrió nunca).
 * @returns {{ clave, falla: boolean, titulo, detalle }[]}
 */
export function reglasDeFrescura(base, hechos, ahora) {
  const out = []
  const regla = (clave, cuando, limiteH, titulo, que) => {
    if (cuando === undefined) return
    const falla = cuando === null || ahora - new Date(cuando) > limiteH * HORA
    const detalle = cuando === null ? `${que}: ⛔ corrió nunca` : `${que}: la última, ${hace(cuando, ahora)} (límite ${limiteH} h)`
    out.push({ clave, falla, titulo, detalle })
  }
  if (hechos.tn !== undefined) {
    for (const t of TIENDAS_DE_BASE[base]) {
      regla(`tn-lectura:${t}`, hechos.tn[t] ?? null, LIMITE_H.tn, `Tienda Nube de ${NOMBRE[t]}: los pedidos ⛔ se están leyendo`, `Lectura de pedidos de ${NOMBRE[t]}`)
    }
  }
  if (hechos.catalogo !== undefined) {
    for (const t of TIENDAS_DE_BASE[base]) {
      regla(`tn-catalogo:${t}`, hechos.catalogo[t] ?? null, LIMITE_H.catalogo, `Tienda Nube de ${NOMBRE[t]}: el catálogo ⛔ se está leyendo`, `Lectura del catálogo de ${NOMBRE[t]}`)
    }
  }
  regla(`libro:${base}`, hechos.libro, LIMITE_H.libro, `El libro de stock de ${NOMBRE[base]} ⛔ corrió`, `Libro de stock de ${NOMBRE[base]}`)
  regla(`cuentas:${base}`, hechos.cuentas, LIMITE_H.cuentas, `Las cuentas de ${NOMBRE[base]} ⛔ se copian del dashboard`, `Copia de cuentas de ${NOMBRE[base]}`)
  if (base === 'bdi') regla('ml-lectura', hechos.ml, LIMITE_H.ml, 'Mercado Libre: los pedidos ⛔ se están leyendo', 'Lectura de pedidos de Mercado Libre')
  // La cola de eventos (sql/023): `cola` = desde cuándo espera el pendiente LISTO más viejo; `null` = nada esperando (⛔ es
  // una falla, al revés que las otras). Si espera más de 15 min, el trabajador (Vercel Cron cada minuto) ⛔ está corriendo.
  if (base === 'bdi' && hechos.cola !== undefined) {
    const falla = hechos.cola != null && ahora - new Date(hechos.cola) > LIMITE_H.cola * HORA
    const detalle = hechos.cola == null ? 'Cola de eventos: nada esperando' : `Cola de eventos: un trabajo listo desde ${hace(hechos.cola, ahora)} (límite 15 min)`
    out.push({ clave: 'cola', falla, titulo: 'La cola de eventos del motor ⛔ avanza', detalle })
  }
  return out
}

/**
 * Lo que toca mandar ahora. `alertas` = las abiertas + las cerradas ya avisadas cuyo cierre ⛔ se avisó.
 * Nuevas: abiertas, sin avisar, pasada la espera · Siguen: avisadas hace ≥ 24 h · Resueltas: cerradas que se habían avisado
 * (una cerrada que ⛔ se avisó —el reintento que salió— ⛔ manda nada).
 */
export function queMandar(alertas, ahora) {
  const nuevas = [], siguen = [], resueltas = []
  for (const a of alertas) {
    if (a.cerrada_en) { if (a.avisada_en && !a.cierre_avisado_en) resueltas.push(a); continue }
    if (!a.avisada_en) { if (new Date(a.avisar_desde) <= ahora) nuevas.push(a); continue }
    if (ahora - new Date(a.avisada_en) >= 24 * HORA) siguen.push(a)
  }
  return { nuevas, siguen, resueltas }
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const fila = (a, ahora) => ({
  texto: `• ${a.titulo}${a.detalle ? ` — ${a.detalle}` : ''} (abierta ${hace(a.abierta_en, ahora)})${a.enlace ? `\n  ${a.enlace}` : ''}`,
  html: `<li><b>${esc(a.titulo)}</b>${a.detalle ? ` — ${esc(a.detalle)}` : ''} <span style="color:#666">(abierta ${hace(a.abierta_en, ahora)})</span>${a.enlace ? ` · <a href="${esc(a.enlace)}">ver</a>` : ''}</li>`,
})
const bloque = (titulo, lista, ahora) => lista.length
  ? { texto: `${titulo}\n${lista.map((a) => fila(a, ahora).texto).join('\n')}`, html: `<p><b>${esc(titulo)}</b></p><ul>${lista.map((a) => fila(a, ahora).html).join('')}</ul>` }
  : null

/** El mail de las alertas. `null` si ⛔ hay nada que mandar. */
export function armarMail({ nuevas, siguen, resueltas }, ahora) {
  const n = nuevas.length + siguen.length
  if (!n && !resueltas.length) return null
  const primera = nuevas[0] ?? siguen[0] ?? resueltas[0]
  const asunto = n
    ? `🔴 Motor: ${n === 1 ? primera.titulo : `${n} alertas — ${primera.titulo}`}`
    : `✅ Motor: ${resueltas.length === 1 ? `se resolvió — ${primera.titulo}` : `se resolvieron ${resueltas.length} alertas`}`
  const partes = [bloque('Nuevas', nuevas, ahora), bloque('Siguen abiertas (recordatorio diario)', siguen, ahora), bloque('Se resolvieron', resueltas, ahora)].filter(Boolean)
  return {
    asunto: sinSecretosTexto(asunto).slice(0, 200),
    texto: sinSecretosTexto(partes.map((p) => p.texto).join('\n\n')),
    html: sinSecretosTexto(`<div style="font-family:sans-serif;font-size:14px">${partes.map((p) => p.html).join('')}<p style="color:#666">Lo manda el vigía del motor (erp.arebensrl.com) cada 15 min.</p></div>`),
  }
}

/**
 * El parte del día: «todo en orden» o lo abierto, con cómo está cada dato. Si un día ⛔ llega, el que murió es el vigía.
 */
export function armarParte({ abiertas, reglas, fecha }, ahora) {
  const asunto = abiertas.length ? `Motor ${fecha}: ${abiertas.length} ${abiertas.length === 1 ? 'alerta abierta' : 'alertas abiertas'}` : `Motor ${fecha}: todo en orden`
  const estado = reglas.map((r) => `${r.falla ? '🔴' : '✅'} ${r.detalle}`)
  const ab = bloque('Abiertas', abiertas, ahora)
  return {
    asunto,
    texto: sinSecretosTexto([ab?.texto, `Cómo está cada dato:\n${estado.join('\n')}`].filter(Boolean).join('\n\n')),
    html: sinSecretosTexto(`<div style="font-family:sans-serif;font-size:14px">${ab?.html ?? '<p>Ninguna alerta abierta.</p>'}<p><b>Cómo está cada dato</b></p><ul>${estado.map((e) => `<li>${esc(e)}</li>`).join('')}</ul><p style="color:#666">Parte diario del vigía del motor. Si un día ⛔ llega, el vigía ⛔ está corriendo.</p></div>`),
  }
}

/** El día de Argentina (UTC−3, sin horario de verano) y su hora. */
export function diaAR(ahora) {
  const ar = new Date(ahora.getTime() - 3 * HORA)
  return { fecha: ar.toISOString().slice(0, 10), hora: ar.getUTCHours() }
}

// ———————————————————————————— la base (un pg.Client conectado a la de BDI) ————————————————————————————

/**
 * `ahora` (opcional, todas): la hora del vigía, para que la base y la cuenta de qué mandar usen el MISMO reloj.
 * Abre la alerta, o la refresca si ya está abierta (⛔ la duplica: índice único parcial). `esperaMin`: antes de eso el
 * vigía ⛔ la manda (sólo cuenta al ABRIR: una que sigue fallando ⛔ corre la espera).
 * @returns {Promise<{ nueva: boolean }>}
 */
export async function abrirAlerta(c, { clave, titulo, detalle = null, enlace = null, esperaMin = 0 }, ahora = null) {
  const { rows: [r] } = await c.query(
    `insert into motor_alerta (empresa_id, clave, titulo, detalle, enlace, abierta_en, vista_en, avisar_desde)
       values ($1, $2, $3, $4, $5, coalesce($7::timestamptz, now()), coalesce($7::timestamptz, now()), coalesce($7::timestamptz, now()) + make_interval(mins => $6))
     on conflict (empresa_id, clave) where cerrada_en is null do update
       set vista_en = excluded.vista_en, titulo = excluded.titulo, detalle = excluded.detalle, enlace = coalesce(excluded.enlace, motor_alerta.enlace)
     returning (xmax = 0) as nueva`,
    [EMPRESA, clave, titulo, detalle && sinSecretosTexto(detalle).slice(0, 1000), enlace, esperaMin, ahora],
  )
  return { nueva: r.nueva }
}

/** Cierra la alerta abierta de esa clave (si hay). @returns {Promise<{ cerrada: boolean }>} */
export async function cerrarAlerta(c, { clave }, ahora = null) {
  const { rowCount } = await c.query(`update motor_alerta set cerrada_en = coalesce($3::timestamptz, now()) where empresa_id = $1 and clave = $2 and cerrada_en is null`, [EMPRESA, clave, ahora])
  return { cerrada: rowCount > 0 }
}

/** Las abiertas y las cerradas con el cierre por avisar. */
export async function alertasVivas(c) {
  const { rows } = await c.query(
    `select * from motor_alerta where empresa_id = $1 and (cerrada_en is null or (avisada_en is not null and cierre_avisado_en is null)) order by abierta_en`,
    [EMPRESA],
  )
  return rows
}

/** Después de que el mail SALIÓ (⛔ antes: si el mailer falla, se reintenta en la próxima vuelta). */
export async function marcarAvisadas(c, { avisadas, resueltas }, ahora = null) {
  if (avisadas.length) await c.query(`update motor_alerta set avisada_en = coalesce($2::timestamptz, now()), avisos = avisos + 1 where id = any($1::uuid[])`, [avisadas.map((a) => a.id), ahora])
  if (resueltas.length) await c.query(`update motor_alerta set cierre_avisado_en = coalesce($2::timestamptz, now()) where id = any($1::uuid[])`, [resueltas.map((a) => a.id), ahora])
}

const hay = async (c, tabla) => (await c.query('select to_regclass($1) is not null as hay', [`public.${tabla}`])).rows[0].hay

/** Los hechos de frescura de una base (cada uno `undefined` si la tabla ⛔ está). */
export async function leerHechos(c, base) {
  const h = {}
  const porTienda = async (tabla) => Object.fromEntries((await c.query(`select tienda, leida_en from ${tabla}`)).rows.map((r) => [r.tienda, r.leida_en]))
  if (await hay(c, 'tn_lectura')) h.tn = await porTienda('tn_lectura')
  if (await hay(c, 'tn_catalogo_lectura')) h.catalogo = await porTienda('tn_catalogo_lectura')
  if (await hay(c, 'stock_libro_dia')) h.libro = (await c.query('select max(calculado_en) m from stock_libro_dia')).rows[0].m
  // Las cuentas reales: sin filas = la copia todavía ⛔ corrió nunca en esta base ⇒ falla, igual que el libro.
  if (await hay(c, 'cuenta_real')) h.cuentas = (await c.query('select max(copiada_en) m from cuenta_real')).rows[0].m
  // ML: apagado hasta la app de Darío ⇒ sin credencial ⛔ se evalúa (⛔ es una falla que nadie puede arreglar hoy).
  if (base === 'bdi' && (await hay(c, 'ml_credencial')) && (await c.query('select count(*)::int n from ml_credencial')).rows[0].n) {
    h.ml = (await hay(c, 'ml_lectura')) ? (await c.query('select max(leida_en) m from ml_lectura')).rows[0].m : null
  }
  // La cola de eventos: el pendiente listo más viejo (null = nada esperando).
  if (base === 'bdi' && (await hay(c, 'motor_evento'))) h.cola = (await c.query(`select min(proximo_en) m from motor_evento where estado = 'pendiente' and proximo_en <= now()`)).rows[0].m
  return h
}

/**
 * Para las PUERTAS (webhook de TN, pedido mayorista): abre o cierra con su propia conexión a BDI y ⛔ tira nunca — la
 * respuesta de la puerta ⛔ depende de esto. Si ⛔ puede anotar, lo dice el log (y el dato viejo lo ve el vigía).
 */
export async function anotarAlerta(abrirConexion, { falla, clave, titulo, detalle = null, esperaMin = 0 }) {
  let c
  try {
    c = await abrirConexion('bdi')
    if (falla) await abrirAlerta(c, { clave, titulo, detalle, esperaMin })
    else await cerrarAlerta(c, { clave })
  } catch (e) {
    console.warn(`[erp] alerta ${clave}: ⛔ se pudo anotar (${sinSecretosTexto(e.message)})`)
  } finally {
    if (c) await c.end().catch(() => {})
  }
}
