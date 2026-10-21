import { describe, expect, it } from 'vitest'
import { configPg, SUPABASE_CA } from '../lib/pg.core.js'

describe('configPg: la conexión de los handlers verifica el TLS contra Supabase', () => {
  it('fuera de localhost: CA de Supabase, rejectUnauthorized y SNI del host', () => {
    const c = configPg('postgresql://motor.abc:pa$s@w/rd#?@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require')
    expect(c).toMatchObject({ user: 'motor.abc', password: 'pa$s@w/rd#?', host: 'aws-0-sa-east-1.pooler.supabase.com', port: 6543, database: 'postgres' })
    expect(c.ssl).toEqual({ ca: SUPABASE_CA, rejectUnauthorized: true, servername: 'aws-0-sa-east-1.pooler.supabase.com' })
    // 🔴 El `sslmode` de la URL ⛔ viaja: si pg lo recibiera, pisaría el `ssl` de acá.
    expect(JSON.stringify(c)).not.toMatch(/sslmode|connectionString/)
  })

  it('las dos raíces (2021 y 2025)', () => {
    expect(SUPABASE_CA.match(/BEGIN CERTIFICATE/g)).toHaveLength(2)
  })

  it('localhost va sin TLS; sin puerto ni base, los de siempre', () => {
    expect(configPg('postgres://postgres:x@127.0.0.1:54341/test').ssl).toBe(false)
    expect(configPg('postgres://u:p@localhost')).toMatchObject({ port: 5432, database: 'postgres', ssl: false })
  })
})
