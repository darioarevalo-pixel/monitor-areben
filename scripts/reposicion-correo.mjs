// **El correo de las 10:00 de la reposición** (Darío, 11/12-oct-2026): cómo quedó la reposición del
// día cuando abre el local, con el aviso si no se cerró. Uno por marca: Zattia de lunes a sábado y
// BDI de lunes a viernes (desde el 12-oct-2026; BDI no repone los sábados).
//
//   node scripts/reposicion-correo.mjs               # manda el correo
//   node scripts/reposicion-correo.mjs --simulacro   # lo imprime y ⛔ NO lo manda
//   node scripts/reposicion-correo.mjs --html a.html # además guarda el HTML para mirarlo
//
// ⛔ SÓLO LEE `repo_armado` (una tabla en cada base). El cálculo está en `lib/reposicion/correo.core.js`.
// Una marca que falla (la tabla de BDI sin crear, una clave que falta) ⛔ no frena el correo de la otra.
// Lo dispara a las 10:00 un reloj de AFUERA (los crons de GitHub de este repo llegan horas tarde):
// ver `docs/secciones/reposicion.md`.
import { readFileSync, writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { fechaAR } from '../lib/reposicion/armado.core.js'
import { sumarDias } from '../lib/fechas/dia.core.js'
import { armarCorreo, DIAS_VECES } from '../lib/reposicion/correo.core.js'
import { mandarMail } from './lib/mail.mjs'

// En Actions las variables vienen del entorno; en la Mac, del `.env`, que ⛔ pisa lo ya puesto.
try {
  for (const l of readFileSync('.env', 'utf8').split('\n')) {
    if (!l.includes('=') || l.trim().startsWith('#')) continue
    const i = l.indexOf('=')
    const k = l.slice(0, i).trim()
    if (!process.env[k]) process.env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch {
  // Sin `.env` ⛔ pasa nada: es el caso normal en Actions.
}

const SIMULACRO = process.argv.includes('--simulacro') || process.env.ENTRADA_SIMULACRO === 'true'
const HTML_A = process.argv.includes('--html') ? process.argv[process.argv.indexOf('--html') + 1] : process.env.CORREO_HTML || null
const MAIL_A = (process.env.MAIL_REPOSICION_A || 'darioarevalo@arebensrl.com').split(',').map((s) => s.trim()).filter(Boolean)
const HOY = fechaAR()

const COLS = 'id, linea, sentido, fecha, persona, estado, pedido, escaneos, faltantes, transfer, error, creado_en, cerrado_en'

/** Cada marca: su base y los días que repone (0 = domingo). */
const MARCAS = {
  zattia: { url: 'ZATTIA_SUPABASE_URL', key: 'ZATTIA_SUPABASE_SERVICE_KEY', dias: [1, 2, 3, 4, 5, 6] },
  bdi: { url: 'SUPABASE_URL', key: 'SUPABASE_SERVICE_KEY', dias: [1, 2, 3, 4, 5] },
}

async function main() {
  // El día de la semana de HOY en Argentina (`fechaAR` ya está en hora de acá).
  const diaSemana = new Date(`${HOY}T12:00:00Z`).getUTCDay()
  let fallas = 0
  for (const [marca, m] of Object.entries(MARCAS)) {
    if (!m.dias.includes(diaSemana)) {
      console.log(`${marca}: hoy no repone, sin correo`)
      continue
    }
    try {
      await correoDe(marca, m)
    } catch (e) {
      fallas++
      console.error(`✗ ${marca}:`, e instanceof Error ? e.message : e)
    }
  }
  if (fallas) process.exitCode = 1
}

async function correoDe(marca, m) {
  const url = process.env[m.url]
  const key = process.env[m.key]
  if (!url || !key) throw new Error(`faltan ${m.url} / ${m.key}`)
  const sb = createClient(url, key)

  // Los de hoy + los que quedaron abiertos de otro día (tienen que verse) + los de los últimos días,
  // para «ya faltó N veces». Es una tabla chica (un par de filas por día): una sola lectura alcanza.
  const desde = sumarDias(HOY, -DIAS_VECES)
  const { data, error } = await sb
    .from('repo_armado')
    .select(COLS)
    .eq('store', marca)
    .neq('estado', 'cancelado')
    .or(`fecha.gte.${desde},estado.in.(en_curso,transfiriendo,revisar)`)
    .order('creado_en', { ascending: true })
    .limit(500)
  if (error) throw new Error(`repo_armado: ${error.message}`)
  const filas = data || []
  const armados = filas.filter((a) => a.fecha === HOY || ['en_curso', 'transfiriendo', 'revisar'].includes(a.estado))
  const anteriores = filas.filter((a) => a.fecha < HOY)
  // 🔑 Hasta que la marca use el armado no hay correo: si no, BDI mandaba «sin iniciar» todos los días
  // antes de que Karen lo estrenara. Con un armado en los últimos días, ya es rutina.
  if (!filas.length) {
    console.log(`${marca}: ningún armado en ${DIAS_VECES} días, sin correo`)
    return
  }

  const c = armarCorreo({ hoy: HOY, armados, anteriores, marca })
  console.log(`Reposición ${marca} · ${HOY} · ${armados.length} armado(s) hoy/abiertos · ${anteriores.length} anteriores${SIMULACRO ? ' · SIMULACRO' : ''}`)
  if (HTML_A) writeFileSync(marca === 'zattia' ? HTML_A : HTML_A.replace(/(\.html)?$/, `-${marca}.html`), c.html)

  if (SIMULACRO) {
    console.log(`\n[SIMULACRO, no se manda] → ${MAIL_A.join(', ')}\n  ${c.asunto}\n`)
    console.log(c.texto.split('\n').map((l) => `  | ${l}`).join('\n'))
    return
  }
  let fallas = 0
  for (const para of MAIL_A) {
    const r = await mandarMail({ para, asunto: c.asunto, texto: c.texto, html: c.html })
    if (r.ok) console.log(`Mandado a ${para}: «${c.asunto}» (${r.id})`)
    else if (!r.configurado) throw new Error('faltan AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY')
    else { fallas++; console.log(`✗ ${para}: ${r.motivo}`) }
  }
  if (fallas) throw new Error(`${fallas} correo(s) sin mandar`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
