/**
 * Importa el `decisiones.csv` del analista de pauta a `meta_ads_decision`.
 *
 * Uso:
 *   node scripts/importar-decisiones-meta.mjs                          # SIMULA: dice qué haría
 *   node scripts/importar-decisiones-meta.mjs --aplicar                # escribe
 *   node scripts/importar-decisiones-meta.mjs --archivo <ruta.csv>
 *
 * # Por qué un script y no diez `insert` tipeados
 *
 * El CSV trae **nombres, no ids** («TEST BROAD BDI - 06/05 :: AD 04 - REEL TIKTOK FUNDAS VARIAS»), y
 * el silenciamiento se resuelve contra `meta_ads_snapshot_dia.objeto_id`. Resolver nueve nombres
 * largos a ojo contra 2.700 filas es exactamente donde entra el error que después nadie encuentra:
 * una decisión atada al id equivocado calla la alarma de otra cosa.
 *
 * 🔴 **Falla ruidosamente antes que adivinar.** Un nombre que no matchea o que matchea dos objetos
 * NO se inserta: se lista y se sale con código 1. Un import que "casi" funciona deja la mitad de las
 * decisiones mudas y todo el resto se lee como si estuviera completo.
 *
 * # Lo que no se puede resolver entra como NOTA
 *
 * Tres filas del CSV no son objetos de Meta —«borradores Revisar y publicar» no tiene id, y el
 * nombre del duplicado lleva un paréntesis que es prosa—. Van con `clase='nota'`: quedan escritas y
 * legibles, y no callan nada. Inventarles un objeto sería peor que no tenerlas.
 *
 * # Arranca en simulación
 *
 * Misma convención que `scripts/purga-historica.js`. Se lee lo que va a hacer y recién después se
 * pasa `--aplicar`.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { COLS_REGLA, leerSnapshot, TABLA_DECISION } from '../lib/meta-ads/leer-snapshot.core.js'
import { PRESETS } from '../lib/meta-ads/reglas.core.js'

const problemas = []
const anotar = (que, detalle) => { problemas.push(`${que}: ${detalle}`); console.log(`  ⚠️  ${que}: ${detalle}`) }

// ── Argumentos ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(n)
const valor = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }

const APLICAR = flag('--aplicar')
const ARCHIVO = valor('--archivo') || resolve(process.env.HOME || '', 'Projects/analista-meta/datos/decisiones.csv')

// ── Entorno ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY (la base de BDI).')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── El CSV ───────────────────────────────────────────────────────────────────

/**
 * Un CSV chico con comas adentro de los campos citados.
 *
 * No se usa una librería porque son diez filas y una dependencia nueva para esto sería más código
 * del que evita. Soporta comillas dobles y comas adentro, que es lo único que el archivo tiene.
 */
function parsearCsv(texto) {
  const filas = []
  let campo = ''
  let fila = []
  let enComillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (enComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; continue }
      if (c === '"') { enComillas = false; continue }
      campo += c
      continue
    }
    if (c === '"') { enComillas = true; continue }
    if (c === ',') { fila.push(campo); campo = ''; continue }
    if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; continue }
    if (c === '\r') continue
    campo += c
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila) }
  const cabecera = filas.shift() || []
  return filas
    .filter((f) => f.some((v) => String(v).trim()))
    .map((f) => Object.fromEntries(cabecera.map((k, i) => [k.trim(), (f[i] ?? '').trim()])))
}

/**
 * Normaliza un nombre para comparar: sin tildes, sin dobles espacios, en minúscula.
 *
 * Los nombres del CSV se tipearon a mano leyendo Ads Manager y no son byte a byte los de la API —hay
 * espacios de más y algún guion distinto—. Comparar crudo dejaría todo sin matchear.
 */
const normalizar = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

/**
 * La comparación floja: sólo letras y números.
 *
 * 🔴 Existe por un caso medido, no por prolijidad: el CSV dice `AD02 - FUNDAS DESDE $5000` y Meta lo
 * tiene como `AD02- FUNDAS DESDE $5000`, sin el espacio. Es un nombre tipeado a mano leyendo la
 * pantalla contra uno que salió de la API.
 *
 * Se usa **sólo si la comparación exacta no encontró nada**, y **sólo si devuelve un único
 * candidato**. Dos candidatos flojos son una ambigüedad y se reportan: adivinar cuál era es
 * exactamente el error que este script existe para no cometer.
 */
const aflojar = (s) => normalizar(s).replace(/[^a-z0-9]/g, '')

/**
 * A qué presets calla cada decisión del CSV.
 *
 * 🔑 Se eligen EXPLÍCITAMENTE en vez de dejar `preset: null` (que callaría todo). Es más ruido de
 * carga y es a propósito: un silencio ancho sobre un aviso apagado por falta de stock también taparía
 * el freno de emergencia el día que alguien lo prenda y empiece a quemar plata.
 *
 * `apagado`/`pausado` → las dos reglas que proponen volver a prenderlo o que gritan porque está
 * apagado. `presupuesto` → la que propone escalar.
 */
function presetsDe(accion) {
  if (accion === 'apagado' || accion === 'pausado') return ['atribucion-tardia', 'sin-avisos']
  if (String(accion).startsWith('presupuesto')) return ['ganador-escalar']
  return []
}

/** El nivel del CSV, tal cual, salvo que no sea uno de los que la tabla conoce. */
const NIVELES = new Set(['campania', 'conjunto', 'aviso', 'cuenta'])

// ── El trabajo ───────────────────────────────────────────────────────────────

async function main() {
  console.log(`Importando decisiones desde ${ARCHIVO}${APLICAR ? '' : '   [SIMULACRO: no escribe nada]'}\n`)

  let texto
  try {
    texto = readFileSync(ARCHIVO, 'utf8')
  } catch (e) {
    console.error(`No se pudo leer el CSV: ${e.message}`)
    process.exit(1)
  }

  const filas = parsearCsv(texto)
  console.log(`${filas.length} fila${filas.length === 1 ? '' : 's'} en el CSV.`)

  // La foto entera: los nombres del CSV pueden ser de objetos que ya no aparecen en los últimos días.
  const { filas: snap, error } = await leerSnapshot(supabase, { cols: COLS_REGLA })
  if (error) { console.error(`No se pudo leer la foto diaria: ${error}`); process.exit(1) }
  console.log(`${snap.length} filas de snapshot para resolver los nombres.\n`)

  /**
   * Nombre normalizado → los objetos distintos que lo llevan.
   *
   * Se junta por (nombre, nivel) y se guarda el SET de ids: si un mismo nombre corresponde a dos ids
   * distintos, eso es la ambigüedad que hay que reportar, no resolver por orden de aparición.
   */
  const porNombre = new Map()
  const porNombreFlojo = new Map()
  for (const f of snap) {
    if (!f.objeto_id || !f.nombre) continue
    const meta = { linea: f.linea, cuentaId: f.cuenta_id, nombre: f.nombre }
    for (const [mapa, clave] of [[porNombre, normalizar(f.nombre)], [porNombreFlojo, aflojar(f.nombre)]]) {
      const k = `${clave}|${f.nivel}`
      let e = mapa.get(k)
      if (!e) { e = { ids: new Map(), nivel: f.nivel }; mapa.set(k, e) }
      // La última pasada gana para los metadatos: `leerSnapshot` viene ordenado por fecha ascendente,
      // así que se queda con la línea y la cuenta más recientes de ese objeto.
      e.ids.set(String(f.objeto_id), meta)
    }
  }

  const aInsertar = []
  const notas = []
  const sinResolver = []

  for (const f of filas) {
    const accion = f.accion || 'otra'
    const nivel = NIVELES.has(f.nivel) ? f.nivel : 'aviso'
    const motivoBase = f.motivo || ''
    // El CSV distingue `confirmado` de `a-confirmar` y la tabla no tiene ese estado. Se dobla en
    // `vigente` y la salvedad viaja DENTRO del motivo: inventar un tercer estado para nueve filas
    // sería una columna que después hay que sostener en el motor y en la pantalla.
    const motivo = f.estado && f.estado !== 'confirmado'
      ? `${motivoBase} (del registro viejo, estado «${f.estado}»)`
      : motivoBase

    if (!motivoBase) { sinResolver.push({ f, por: 'no trae motivo, y el motivo es lo único que no se puede reponer' }); continue }

    /**
     * 🔴 **Sólo el nivel `cuenta` puede no tener objeto.**
     *
     * Una decisión sobre la cuenta —«los 6 borradores quedaron limpiados»— no es un objeto de Meta y
     * no tiene id: va como nota y está bien. Pero un aviso o un conjunto que no matchea **no** se
     * degrada a nota: eso convertiría un silencio que no se pudo resolver en una fila que se lee
     * igual pero no calla nada, y nadie se enteraría. Se reporta y se sale con código 1.
     */
    if (nivel === 'cuenta') {
      notas.push({
        quien: f.quien || 'bruno',
        clase: 'nota',
        fecha: f.fecha,
        linea: f.marca || 'bdi',
        nivel,
        objeto_id: null,
        objeto_nombre: f.objeto || null,
        cuenta_id: null,
        accion,
        motivo,
        preset: null,
        vence: null,
        origen: 'csv',
      })
      continue
    }

    let candidatos = porNombre.get(`${normalizar(f.objeto)}|${nivel}`)
    let flojo = false
    if (!candidatos) {
      candidatos = porNombreFlojo.get(`${aflojar(f.objeto)}|${nivel}`)
      flojo = !!candidatos
    }
    if (!candidatos) {
      sinResolver.push({ f, por: `no hay ningún ${nivel} con ese nombre en la foto (¿gastó $0 y por eso Meta nunca lo devolvió?)` })
      continue
    }

    if (candidatos.ids.size > 1) {
      sinResolver.push({ f, por: `el nombre corresponde a ${candidatos.ids.size} objetos distintos` })
      continue
    }

    const [objetoId, meta] = [...candidatos.ids.entries()][0]
    // Un match flojo se dice: el nombre del CSV y el de Meta no eran iguales, y quien lo lea tiene
    // que poder confirmar a ojo que es el mismo objeto.
    if (flojo) console.log(`  ≈ «${f.objeto}» se resolvió como «${meta.nombre}» (los nombres difieren en espacios o signos)`)
    const presets = presetsDe(accion)
    if (!presets.length) {
      // Sin preset conocido no se inventa un silencio ancho: queda como nota, legible.
      notas.push({
        quien: f.quien || 'bruno',
        clase: 'nota',
        fecha: f.fecha,
        linea: meta.linea || f.marca || 'bdi',
        nivel,
        objeto_id: objetoId,
        objeto_nombre: meta.nombre,
        cuenta_id: meta.cuentaId || null,
        accion,
        motivo,
        preset: null,
        vence: null,
        origen: 'csv',
      })
      continue
    }

    /**
     * 🔑 «Control al 14-ago» del CSV es literalmente un vencimiento.
     *
     * Es el único caso donde el texto trae una fecha de caducidad explícita, y perderla convertiría
     * una decisión con control puesto en un silencio permanente — justo lo contrario de lo que dice.
     */
    const control = /control al (\d{1,2})-([a-z]{3})/i.exec(motivoBase)
    const vence = control ? venceDe(control, f.fecha) : null

    for (const preset of presets) {
      if (!PRESETS[preset]) { anotar('preset', `«${preset}» no existe`); continue }
      aInsertar.push({
        quien: f.quien || 'bruno',
        clase: 'silencio',
        fecha: f.fecha,
        linea: meta.linea || f.marca || 'bdi',
        nivel,
        objeto_id: objetoId,
        objeto_nombre: meta.nombre,
        cuenta_id: meta.cuentaId || null,
        accion,
        motivo,
        preset,
        vence,
        origen: 'csv',
      })
    }
  }

  // ── Lo que se va a hacer ───────────────────────────────────────────────────

  console.log(`${aInsertar.length} silencio${aInsertar.length === 1 ? '' : 's'} (una fila por preset callado):`)
  for (const d of aInsertar) {
    console.log(`  ● ${(d.objeto_nombre || d.objeto_id).slice(0, 58)}`)
    console.log(`    ${d.fecha} · calla «${PRESETS[d.preset].rotulo}»${d.vence ? ` hasta el ${d.vence}` : ' · sin vencimiento'}`)
  }

  console.log(`\n${notas.length} nota${notas.length === 1 ? '' : 's'} (quedan escritas, no callan nada):`)
  for (const d of notas) console.log(`  ○ ${(d.objeto_nombre || '(sin objeto)').slice(0, 58)} — ${d.motivo.slice(0, 70)}`)

  if (sinResolver.length) {
    console.log(`\n🔴 ${sinResolver.length} fila${sinResolver.length === 1 ? '' : 's'} sin resolver — NO se importan:`)
    for (const s of sinResolver) {
      console.log(`  ✗ ${String(s.f.objeto).slice(0, 58)}`)
      console.log(`    ${s.por}`)
    }
    anotar('sin resolver', `${sinResolver.length} filas quedaron afuera`)
  }

  if (!APLICAR) {
    console.log('\nSimulacro: no se escribió nada. Con `--aplicar` se guarda.')
  } else {
    const todas = [...aInsertar, ...notas]
    // De a una para poder decir CUÁL chocó contra el índice único: un insert masivo que falla por una
    // fila deja las diez sin entrar y sin decir por cuál.
    let ok = 0
    for (const d of todas) {
      const { error: e } = await supabase.from(TABLA_DECISION).insert(d)
      if (e) {
        if (String(e.message || '').includes('uq_meta_decision_viva')) {
          console.log(`  ⊙ Ya estaba: ${(d.objeto_nombre || '').slice(0, 50)} · ${d.preset || 'todas'}`)
          continue
        }
        anotar(`insertar ${(d.objeto_nombre || '').slice(0, 40)}`, e.message)
        continue
      }
      ok++
    }
    // «decisión» pierde la tilde en plural: va la palabra entera, no el sufijo.
    console.log(`\n${ok === 1 ? '1 decisión guardada' : `${ok} decisiones guardadas`}.`)
  }

  if (problemas.length) {
    console.log(`\n${problemas.length} problema${problemas.length === 1 ? '' : 's'}:`)
    for (const p of problemas) console.log(`  - ${p}`)
    process.exitCode = 1
  }
}

/** «control al 14-ago» + el año de la fecha de la decisión → una fecha ISO. */
function venceDe(m, fechaDecision) {
  const MESES = { ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06', jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12' }
  const mes = MESES[String(m[2]).toLowerCase()]
  if (!mes) return null
  const anio = String(fechaDecision || '').slice(0, 4) || String(new Date().getUTCFullYear())
  return `${anio}-${mes}-${String(m[1]).padStart(2, '0')}`
}

await main()
