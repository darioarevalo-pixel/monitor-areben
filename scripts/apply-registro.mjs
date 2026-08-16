// Crea el registro de migraciones en LAS DOS bases y lo siembra con lo que ya está aplicado.
//
// Arranca en SIMULACIÓN. Sin `--aplicar` sólo muestra, base por base, qué migraciones parecen
// aplicadas y cuáles no — que es la foto que hoy no existe en ningún lado.
//
//   node scripts/apply-registro.mjs             # ver el estado de las dos
//   node scripts/apply-registro.mjs --aplicar   # crear la tabla y sembrarla
//
// 📌 La siembra deduce mirando si la tabla que crea cada `.sql` existe. Es lo más cerca de la
// verdad al que se llega desde afuera, y **no es exacto**: una migración que sólo agregó una
// columna no se detecta así. Por eso el `origen` de esas filas dice `sembrada` y no `apply`.
import { readFileSync, readdirSync } from 'fs'
import pg from 'pg'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

// El `.env` se lee DENTRO del guard de "¿me ejecutaron directo?" del final: este archivo es
// importable (`tests/apply-registro.test.ts` lee `POR_EFECTO`) y en el CI no hay `.env`, así que
// leerlo al importar rompía la suite sin que nadie tocara nada. Mismo patrón que fixture-etl.mjs.
function leerEnv() {
  return Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      }),
  )
}

function parse(raw) {
  const a = raw.slice(raw.indexOf('://') + 3)
  const at = a.lastIndexOf('@')
  const up = a.slice(0, at)
  const hp = a.slice(at + 1)
  const ci = up.indexOf(':')
  const s = hp.indexOf('/')
  const [host, port] = hp.slice(0, s).split(':')
  return { user: up.slice(0, ci), password: up.slice(ci + 1), host, port: Number(port) || 5432, database: hp.slice(s + 1).split('?')[0] }
}

/**
 * Migraciones que se detectan por su EFECTO, no por la tabla que crean.
 *
 * 🔑 **Esto es lo que le faltaba al detector y lo hacía mentir.** La siembra de abajo deduce "está
 * aplicada" de que existan las tablas que el `.sql` crea — y **una migración que revoca no crea
 * ninguna**. Los cinco escalones de la Fase S son exactamente eso: sacan permisos. Con el detector
 * viejo figuraban las siete acá abajo como "sin rastro" en las DOS bases, **estando aplicadas y
 * verificadas**, y un registro que da una lista de pendientes falsa es peor que no tenerlo: alguien
 * va y corre migraciones que ya estaban.
 *
 * La regla para agregar una fila acá: la sonda tiene que mirar **lo que la migración dejó**, no lo
 * que uno se acuerda. Todas éstas se verificaron contra las dos bases el 16-ago-2026.
 *
 * ⚠️ `migrate-columnas-pii.sql` (escalón 1) **no tiene sonda y no la puede tener**: daba permisos
 * por COLUMNA sobre `ventas`, y el escalón 5 revocó la tabla entera — que se lleva los grants por
 * columna. Su efecto ya no es observable, así que queda "sin rastro" a propósito. Está aplicada
 * (`974d0fb`, verificada el 14-ago con 17 pruebas desde afuera), y anotarla pide un `origen:
 * 'manual'` a mano. Es el límite honesto de este mecanismo.
 */
export const POR_EFECTO = [
  { archivo: 'migrate-rls.sql', que: 'hay políticas de RLS en public',
    prueba: `(select count(*) from pg_policies where schemaname='public') > 0` },
  { archivo: 'vistas-materializadas.sql', que: 'existen las vistas materializadas',
    prueba: `(select count(*) from pg_matviews where schemaname='public') > 0` },
  { archivo: 'migrate-facturacion-servidor.sql', que: 'anon ya no lee ventas (escalón 5)',
    prueba: `not has_table_privilege('anon','public.ventas','select')` },
  { archivo: 'migrate-espejo-servidor.sql', que: 'anon ya no lee inventario (escalón 4)',
    prueba: `not has_table_privilege('anon','public.inventario','select')` },
  { archivo: 'migrate-productos-servidor.sql', que: 'anon ya no lee productos',
    prueba: `not has_table_privilege('anon','public.productos','select')` },
  { archivo: 'migrate-venta-detalles-servidor.sql', que: 'anon ya no lee venta_detalles',
    prueba: `not has_table_privilege('anon','public.venta_detalles','select')` },
  // Sólo BDI: en Zattia la tabla `clientes` no existe, así que la migración no le aplica.
  { archivo: 'migrate-clientes-servidor.sql', soloEn: 'bdi', que: 'anon ya no lee clientes (escalón 2)',
    prueba: `to_regclass('public.clientes') is not null and not has_table_privilege('anon','public.clientes','select')` },
]

/**
 * Qué tablas crea cada .sql, leyendo los `create table` del propio archivo.
 *
 * 🔑 **Se sacan los comentarios primero, y no es cosmético.** Varios de estos archivos EXPLICAN en
 * su encabezado que son idempotentes escribiendo `` `create table if not exists` `` entre
 * backticks. El regex enganchaba ahí, no encontraba espacio después de "exists" —viene un
 * backtick— y se llevaba **`if`** como nombre de tabla. Como `if` no existe en ninguna base,
 * `migrate-canjes.sql` figuraba "sin rastro" **con sus nueve tablas creadas**. Un detector que se
 * equivoca así es peor que no tenerlo: entrega una lista de pendientes falsa y alguien va a correr
 * migraciones que ya estaban.
 */
function tablasDe(archivo) {
  const t = readFileSync(`sql/${archivo}`, 'utf8').replace(/--[^\n]*/g, '')
  return [...t.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)]
    .map((m) => m[1].toLowerCase())
}

// ¿Nos ejecutaron directo, o nos importó un test? Sin este guard, importar el archivo se
// conectaba a las DOS bases de producción.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = leerEnv()
  const aplicar = process.argv.includes('--aplicar')
  const ARCHIVOS = readdirSync('sql').filter((f) => f.endsWith('.sql')).sort()

  for (const [marca, key] of [['BDI', 'DATABASE_URL_BDI'], ['ZATTIA', 'DATABASE_URL_ZATTIA']]) {
    if (!env[key]) { console.log(`\n${marca}: falta ${key} en .env — salteada`); continue }
    const cfg = parse(env[key])
    const c = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false } })
    try {
      await c.connect()
      const existentes = new Set(
        (await c.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                        where n.nspname = 'public' and c.relkind = 'r'`)).rows.map((r) => r.relname),
      )

      const porEfecto = []
      for (const { archivo, prueba, soloEn } of POR_EFECTO) {
        if (soloEn && soloEn !== marca.toLowerCase()) continue
        const { rows } = await c.query(`select (${prueba}) as ok`)
        if (rows[0]?.ok) porEfecto.push(archivo)
      }
      const detectadas = new Set(porEfecto)

      const aplicadas = []
      const sinRastro = []
      for (const f of ARCHIVOS) {
        if (detectadas.has(f)) { aplicadas.push(f); continue }
        const tablas = tablasDe(f)
        // Sin `create table` no hay nada que deducir (p.ej. `migrate-refresco-vistas.sql`, que crea
        // funciones). Van a "sin rastro" y hay que anotarlas a mano si corresponde: es honesto.
        if (!tablas.length) { sinRastro.push(f); continue }
        ;(tablas.every((t) => existentes.has(t)) ? aplicadas : sinRastro).push(f)
      }

      console.log(`\n═══ ${marca} (${cfg.host})`)
      console.log(`  parecen aplicadas : ${aplicadas.length}/${ARCHIVOS.length}`)
      console.log(`  sin rastro        : ${sinRastro.length} → ${sinRastro.join(', ') || '—'}`)

      if (!aplicar) continue

      await c.query('BEGIN')
      await c.query(readFileSync('sql/migrate-registro.sql', 'utf8'))
      for (const f of aplicadas) {
        const efecto = POR_EFECTO.find((p) => p.archivo === f)
        await c.query(
          `insert into migraciones_aplicadas (archivo, origen, nota) values ($1, 'sembrada', $2)
           on conflict (archivo) do nothing`,
          [f, efecto ? `deducida de su EFECTO: ${efecto.que}` : 'deducida el 13-ago-2026 de que sus tablas existen'],
        )
      }
      await c.query('COMMIT')
      const n = (await c.query('select count(*)::int n from migraciones_aplicadas')).rows[0].n
      console.log(`  ✓ registro creado con ${n} filas sembradas`)
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {})
      console.log(`  ✗ ${marca}: ${e.message}`)
      process.exitCode = 1
    } finally {
      await c.end().catch(() => {})
    }
  }

  if (!aplicar) console.log(`\n(simulación — no se tocó nada). Para crear el registro: --aplicar\n`)
}
