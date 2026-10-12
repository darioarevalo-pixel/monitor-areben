// SOLO LECTURA — la Caja en una base del monitor (V4, 12-oct): sus tablas (con cuántas columnas), triggers,
// índices, RLS y la configuración de cada marca. Es el oráculo de `aplicar-sql.mjs`: lee el esquema, ⛔ el log.
//   node scripts/caja-esquema.mjs BDI   (o ZATTIA)
import { readFileSync } from 'fs'
import pg from 'pg'
const env = Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const raw = env['DATABASE_URL_' + process.argv[2]]
const a = raw.slice(raw.indexOf('://')+3), at = a.lastIndexOf('@'), up = a.slice(0,at), hp = a.slice(at+1), ci = up.indexOf(':'), sl = hp.indexOf('/')
const [host, port] = hp.slice(0,sl).split(':')
const c = new pg.Client({ user: up.slice(0,ci), password: up.slice(ci+1), host, port: Number(port)||5432, database: hp.slice(sl+1).split('?')[0], ssl: { rejectUnauthorized: false } })
await c.connect()
const cols = await c.query(`select table_name, count(*)::int n, string_agg(column_name, ',' order by column_name) cs from information_schema.columns where table_schema='public' and table_name like 'caja\\_%' group by 1 order by 1`)
for (const r of cols.rows) console.log(r.table_name, r.n)
const t = await c.query(`select tgname from pg_trigger where tgname like 'caja%' and not tgisinternal order by 1`)
console.log('triggers:', t.rows.map(r=>r.tgname).join(', '))
const ix = await c.query(`select indexname from pg_indexes where schemaname='public' and tablename like 'caja\\_%' order by 1`)
console.log('indices:', ix.rows.length)
const rls = await c.query(`select relname, relrowsecurity from pg_class where relname like 'caja\\_%' and relkind='r' order by 1`)
console.log('rls:', rls.rows.map(r=>`${r.relname}=${r.relrowsecurity}`).join(' '))
const cfg = await c.query(`select store, reglas #> '{medios,tarjetaOferta}' t, reglas -> 'titulares' ti, reglas -> 'verificarTransferencia' v from caja_config order by 1`)
console.log('config:', JSON.stringify(cfg.rows))
const cnt = await c.query(`select (select count(*) from caja_venta)::int ventas, (select count(*) from caja_turno)::int turnos`)
console.log('filas:', JSON.stringify(cnt.rows[0]))
await c.end()
