// CAMINATA EN VIVO de **D4 — «no aceptó» sobre un reclamo SIN decidir**, contra la base REAL de
// BDI, con `api/_reclamos.js` **en proceso**.
//
//   node scripts/caminar-rechazo-sin-decision.mjs
//
// 🔑 **En proceso y ⛔ no contra prod**, porque prod todavía corre el código viejo: pegarle a la
// API de producción mediría el deploy anterior y saldría verde por el motivo equivocado.
//
// Por qué existe: los tests fijan la regla (`camposAlContestarLaOferta`), el cable (el `select`) y
// la pantalla. Lo que ⛔ ningún test puede fijar es que **la base real acepte** el `estado` que el
// rechazo sin decisión escribe y que el evento quede en el `historial` con ese estado — que es
// justamente de donde `desdeQueEsta(fila,'en_revision')` saca la fecha del reloj. Contra un
// Supabase de mentira eso sale verde escriba lo que escriba.
//
// 🔴 SIEMBRA CONTRA PRODUCCIÓN Y BORRA. El oráculo viene **por otro camino que el hecho**: se
// escribe por el handler y se lee la fila cruda por PostgREST con la service key.
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
  }),
)
const URL = env.SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY
process.env.SUPABASE_URL = URL
process.env.SUPABASE_SERVICE_KEY = KEY
if (!URL || !KEY) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1) }

// 🔑 **Dos modos, y el segundo ⛔ no es opcional.** `--prod` le pega a la API deployada en vez de
// al handler local: el bundle y **la función serverless deployan por separado**, así que verificar
// el chunk ⛔ no dice nada del verbo. Sin `--prod`, el handler corre en proceso (que es lo que hay
// que usar ANTES de pushear, porque prod todavía tiene el código viejo).
const PROD = process.argv.includes('--prod')
const API = 'https://monitorareben.vercel.app/api/postventa?recurso=reclamos'

const { default: reclamos } = await import('../api/_reclamos.js')
const { authKv } = await import('./lib/kv-auth.mjs')
const { alertasDe } = await import('../lib/reclamos/tipos.ts')
const auth = authKv(env)
console.log(PROD ? '\n⚠️  Modo PROD: se le pega a la API deployada' : '\n   Modo local: el handler corre EN PROCESO')

const sb = (path, init = {}) => fetch(`${URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
})

const postear = async (body) => {
  if (PROD) {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify(body) })
    return { status: r.status, ...(await r.json().catch(() => ({}))) }
  }
  let status = 0, cuerpo = null
  const res = { setHeader: () => res, status: (n) => { status = n; return res }, json: (o) => { cuerpo = o; return res }, end: () => res }
  await reclamos({ method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, query: {}, body }, res)
  return { status, ...(cuerpo || {}) }
}

let ok = 0, mal = 0
const chequear = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`) }
  else { mal++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`) }
}

/** Una oferta viva sobre un reclamo SIN decisión: el estado exacto en que quedó R-0022. */
const sembrar = async (extra) => {
  const r = await sb('devoluciones', {
    method: 'POST',
    body: JSON.stringify({
      store: 'bdi', estado: 'en_revision', motivo: 'no_esperaba', escenario: null,
      cliente: 'CAMINATA D4 — BORRAR', orden_tn: '000000',
      items: [{ sku: 'CAM-1', producto: 'PRODUCTO DE PRUEBA', cantidad: 1, precio: '20000.00' }],
      compensacion: null,
      retencion_monto: 13491, retencion_forma: 'plata', retencion_at: new Date().toISOString(),
      reintegro_estado: 'no_aplica', stock_estado: 'no_aplica',
      ...extra,
    }),
  })
  const [fila] = await r.json()
  if (!fila) { console.error('no se pudo sembrar:', await r.text?.().catch(() => '')); process.exit(1) }
  return fila
}
const leer = async (id) => (await (await sb(`devoluciones?id=eq.${id}&select=*`)).json())[0]
const borrar = (id) => sb(`devoluciones?id=eq.${id}`, { method: 'DELETE' })

const antes = await (await sb('devoluciones?store=eq.bdi&select=id')).json()
console.log(`\nFilas reales de BDI antes: ${antes.length}\n`)

const sembradas = []
try {
  // ── 1 · El caso de D4: rechazo sobre un reclamo sin decisión ────────────────
  console.log('1. «No aceptó» sobre un reclamo SIN decidir (R-0022)')
  const a = await sembrar({}); sembradas.push(a.id)
  const r1 = await postear({ action: 'retencion-respuesta', store: 'bdi', id: a.id, respuesta: 'rechazo' })
  chequear('el POST contesta 200 — contestar ⛔ NO se frena', r1.status === 200, JSON.stringify(r1))
  const f1 = await leer(a.id)
  chequear('quedó registrado el rechazo', f1.retencion_respuesta === 'rechazo', String(f1.retencion_respuesta))
  chequear('⛔ NO se inventó ninguna decisión', f1.compensacion === null, String(f1.compensacion))
  chequear('la base ACEPTÓ el estado que sella el momento', f1.estado === 'en_revision', String(f1.estado))

  // 🔑 El sello: el evento tiene que quedar con `estado: 'en_revision'`, que es de donde
  // `desdeQueEsta` saca la fecha. Sin esto el reloj vuelve a contar desde `updated_at`.
  const eventos = Array.isArray(f1.historial) ? f1.historial : []
  const ultimo = eventos[eventos.length - 1]
  chequear('el historial guardó el evento con ese estado', ultimo?.estado === 'en_revision', JSON.stringify(ultimo))
  chequear('la nota ⛔ NO afirma que siga nada decidido', !/estaba decidido/.test(ultimo?.nota || ''), String(ultimo?.nota))
  chequear('la nota dice que hay que decidir', /hay que decidir/.test(ultimo?.nota || ''), String(ultimo?.nota))

  // El aviso, sobre la fila REAL que acaba de escribir el handler.
  const avisos = alertasDe(f1)
  chequear('la fila ⛔ NO quedó muda: avisa desde el día uno',
    avisos.some((x) => x.texto.includes('no aceptó la oferta')), JSON.stringify(avisos))

  // ── 2 · Contestar dos veces se sigue frenando ───────────────────────────────
  const r2 = await postear({ action: 'retencion-respuesta', store: 'bdi', id: a.id, respuesta: 'acepto' })
  chequear('contestar de nuevo da 409', r2.status === 409, `${r2.status} ${r2.error || ''}`)

  // ── 3 · La otra mitad: CON decisión, nada cambia ────────────────────────────
  console.log('\n2. «No aceptó» sobre un reclamo YA decidido (⛔ no cambia)')
  const b = await sembrar({ estado: 'en_transito', compensacion: 'plata_total', monto_total: 20000, retorno_decidido: true })
  sembradas.push(b.id)
  const r3 = await postear({ action: 'retencion-respuesta', store: 'bdi', id: b.id, respuesta: 'rechazo' })
  chequear('el POST contesta 200', r3.status === 200, JSON.stringify(r3))
  const f3 = await leer(b.id)
  chequear('⛔ NO movió el estado', f3.estado === 'en_transito', String(f3.estado))
  chequear('⛔ NO pisó la resolución', f3.compensacion === 'plata_total', String(f3.compensacion))
  const u3 = (f3.historial || []).slice(-1)[0]
  chequear('y la nota SÍ dice que sigue lo decidido', /estaba decidido/.test(u3?.nota || ''), String(u3?.nota))
  chequear('ese ⛔ NO enciende el aviso nuevo',
    !alertasDe(f3).some((x) => x.texto.includes('no aceptó la oferta')))

  // ── 4 · Aceptar sin decisión previa sigue cerrando la rama ──────────────────
  console.log('\n3. «Aceptó» sobre un reclamo sin decidir: cierra igual')
  const c = await sembrar({}); sembradas.push(c.id)
  const r4 = await postear({ action: 'retencion-respuesta', store: 'bdi', id: c.id, respuesta: 'acepto' })
  chequear('el POST contesta 200', r4.status === 200, JSON.stringify(r4))
  const f4 = await leer(c.id)
  chequear('la rama que se acepta trae su propia resolución', f4.compensacion === 'plata_parcial', String(f4.compensacion))
  chequear('y queda resuelto', f4.estado === 'resuelto', String(f4.estado))
} finally {
  for (const id of sembradas) await borrar(id)
  const despues = await (await sb('devoluciones?store=eq.bdi&select=id')).json()
  console.log(`\nFilas reales de BDI después: ${despues.length}`)
  chequear('las filas reales quedaron INTACTAS', despues.length === antes.length, `${antes.length} → ${despues.length}`)
  console.log(`\n${ok} de ${ok + mal}${mal ? '  ❌' : '  ✓'}`)
  process.exit(mal ? 1 : 0)
}
