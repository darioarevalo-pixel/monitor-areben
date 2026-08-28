// Siembra el catálogo de Insumos con lo que el equipo pide de verdad.
//
// # Por qué existe este script
//
// 📊 **Medido**: en este repo `meta_ads_regla` estuvo en 0 filas durante semanas con el módulo
// entero construido, y el problema no era el módulo — era que **una pantalla vacía no se vuelve a
// abrir**. Los nombres de acá no son inventados: salen de contar los chats del grupo de 2026
// (*«bolsas chicas»* ×22, *«bolsas medianas»* ×11, *«el último rollo de etiquetas zebra»*,
// *«no hay más bolsas de despachos de zattia»*, *«gomitas para armar pedidos no tenemos más»*).
//
// # 🔴 Lo que este script NO siembra
//
// **El stock.** Nadie contó nada todavía, y sembrarlo en 0 afirmaría «se miró y no hay ninguna».
// Cada insumo nace sin movimientos, la pantalla dice «sin contar» y ⛔ no avisa hasta el primer
// recuento. Tampoco siembra `dias_reposicion` —cuánto tarda cada proveedor no lo sabemos— ni un
// precio: los dos se cargan usando la pantalla.
//
// # La única suposición, y está marcada
//
// A las bolsas se les deja `por-venta` con **1 por compra**: cada pedido se lleva una bolsa, que es
// lo que una bolsa es. Todo lo demás nace en `manual`, porque cuánto se gasta de un rollo por venta
// ⛔ no lo sabe nadie y un número inventado ahí haría que los días de vida mientan.
//
// Uso: node scripts/sembrar-insumos.mjs [--simulacro]
// Idempotente por NOMBRE: re-correrlo no duplica ni pisa lo que alguien ya editó.
import { readFileSync } from 'fs'
import pg from 'pg'

const SIMULACRO = process.argv.includes('--simulacro')

/** `marcas: []` = las dos. Sólo lleva marca lo que en los chats aparece con la marca puesta. */
const CATALOGO = [
  { nombre: 'Bolsas chicas', tipo: 'comercial', unidad: 'unidad', bulto: 'paquete', consumo: { modo: 'por-venta', canal: 'local', porVenta: 1 }, minimo: 200 },
  { nombre: 'Bolsas medianas', tipo: 'comercial', unidad: 'unidad', bulto: 'paquete', minimo: 100 },
  { nombre: 'Bolsas grandes', tipo: 'comercial', unidad: 'unidad', bulto: 'paquete', minimo: 100 },
  { nombre: 'Bolsas de despacho', tipo: 'comercial', unidad: 'unidad', bulto: 'paquete', consumo: { modo: 'por-venta', canal: 'online', porVenta: 1 }, minimo: 100 },
  { nombre: 'Bolsas e-commerce', tipo: 'comercial', unidad: 'unidad', bulto: 'paquete', minimo: 100 },
  { nombre: 'Cajas de cartón', tipo: 'comercial', unidad: 'unidad', minimo: 10 },
  { nombre: 'Rollo de etiquetas térmicas blancas 50x25', tipo: 'comercial', unidad: 'rollo', minimo: 2 },
  { nombre: 'Rollo de etiquetas anchas (correo)', tipo: 'comercial', unidad: 'rollo', minimo: 2 },
  { nombre: 'Ribbon', tipo: 'comercial', unidad: 'rollo', minimo: 2 },
  { nombre: 'Gomitas para armar pedidos', tipo: 'comercial', unidad: 'paquete', minimo: 2 },
  { nombre: 'Papel higiénico', tipo: 'limpieza', unidad: 'paquete', minimo: 2 },
  { nombre: 'Desodorante de ambiente', tipo: 'limpieza', unidad: 'unidad', minimo: 2 },
  { nombre: 'Perfume para la ropa', tipo: 'limpieza', unidad: 'unidad', minimo: 2 },
  { nombre: 'Yerba', tipo: 'comestible', unidad: 'kg', minimo: 2 },
  { nombre: 'Azúcar', tipo: 'comestible', unidad: 'kg', minimo: 2 },
  { nombre: 'Café', tipo: 'comestible', unidad: 'kg', minimo: 1 },
]

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

function parse(raw) {
  const afterProto = raw.slice(raw.indexOf('://') + 3)
  const at = afterProto.lastIndexOf('@')
  const userpass = afterProto.slice(0, at)
  const hostpart = afterProto.slice(at + 1)
  const ci = userpass.indexOf(':')
  const slash = hostpart.indexOf('/')
  const [host, port] = hostpart.slice(0, slash).split(':')
  return {
    user: userpass.slice(0, ci),
    password: userpass.slice(ci + 1),
    host,
    port: Number(port) || 5432,
    database: hostpart.slice(slash + 1).split('?')[0],
  }
}

if (SIMULACRO) {
  for (const i of CATALOGO) console.log(`· ${i.nombre} — ${i.tipo}, se cuenta por ${i.unidad}, avisa con ${i.minimo}`)
  console.log(`\n${CATALOGO.length} insumos. Simulacro: no se escribió nada.`)
  process.exit(0)
}

const url = env.DATABASE_URL_BDI
if (!url) {
  console.error('Falta DATABASE_URL_BDI en .env')
  process.exit(1)
}

const client = new pg.Client({ ...parse(url), ssl: { rejectUnauthorized: false } })
try {
  await client.connect()
  const yaHay = await client.query('select nombre from insumo')
  const existentes = new Set(yaHay.rows.map((r) => r.nombre))
  let nuevos = 0
  for (const i of CATALOGO) {
    if (existentes.has(i.nombre)) continue
    await client.query(
      `insert into insumo (id, nombre, tipo, unidad, bulto, marcas, minimo, consumo, autor)
       values ($1,$2,$3,$4,$5,'[]'::jsonb,$6,$7::jsonb,'semilla')`,
      [
        `in${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        i.nombre,
        i.tipo,
        i.unidad,
        i.bulto ?? null,
        i.minimo,
        JSON.stringify(i.consumo ?? {}),
      ],
    )
    nuevos += 1
  }
  const n = await client.query('select count(*)::int as n from insumo')
  const m = await client.query('select count(*)::int as n from insumo_movimiento')
  console.log(`✓ ${nuevos} insumos nuevos · ${n.rows[0].n} en total · ${m.rows[0].n} movimientos (el stock se carga contando)`)
} catch (e) {
  console.log(`✗ ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
