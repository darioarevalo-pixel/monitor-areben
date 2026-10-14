#!/usr/bin/env node
/**
 * Probar la conexión con ARCA desde la Mac, con el certificado de la carpeta del ERP.
 *
 *   node scripts/arca-probar.mjs                     # homologación: servidores, permiso y último número
 *   node scripts/arca-probar.mjs --facturar 100      # + una Factura B de $100 a consumidor final
 *   node scripts/arca-probar.mjs --ptovta 12         # otro punto de venta (default 1)
 *
 * 🔴 `--produccion` emite una factura REAL, que ⛔ se borra: sólo con OK de Bruno.
 *
 * El certificado y la clave viven en `~/Documents/erp-monitor/arca-certificado/` (⛔ en el repo):
 * `monitor-<ambiente>.crt` y `.key`. El permiso (TA) se guarda al lado, para reusarlo 12 horas.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { crearClienteArca } from '../motor/arca/cliente.js'
import { CBTE, COND_IVA, CUIT_AREBEN, DOC, numeroVisible, problemasDe, urlQR } from '../motor/arca/arca.core.js'

const args = process.argv.slice(2)
const valor = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }
const ambiente = args.includes('--produccion') ? 'produccion' : 'homologacion'
const ptoVta = Number(valor('--ptovta') || 1)
const importe = valor('--facturar')

const dir = join(homedir(), 'Documents/erp-monitor/arca-certificado')
const crt = join(dir, `monitor-${ambiente}.crt`)
if (!existsSync(crt)) { console.error(`Falta el certificado: ${crt}`); process.exit(1) }
const archivoTA = join(dir, `ta-${ambiente}.json`)

const arca = crearClienteArca({
  ambiente,
  cuit: CUIT_AREBEN,
  cert: readFileSync(crt, 'utf8'),
  key: readFileSync(join(dir, `monitor-${ambiente}.key`), 'utf8'),
  almacenTA: {
    leer: async () => (existsSync(archivoTA) ? JSON.parse(readFileSync(archivoTA, 'utf8')) : null),
    guardar: async (ta) => writeFileSync(archivoTA, JSON.stringify(ta), { mode: 0o600 }),
  },
})

console.log(`ARCA ${ambiente} · CUIT ${CUIT_AREBEN} · punto de venta ${ptoVta}`)
console.log('Servidores:', await arca.dummy())
const ultimo = await arca.ultimo(ptoVta, CBTE.FACTURA_B)
console.log(`Última Factura B autorizada: ${numeroVisible(CBTE.FACTURA_B, ptoVta, ultimo)}`)

if (importe) {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const c = {
    tipo: CBTE.FACTURA_B, fecha: hoy, total: Number(importe),
    receptor: { docTipo: DOC.SIN_IDENTIFICAR, docNro: 0, condicionIva: COND_IVA.CONSUMIDOR_FINAL },
  }
  const problemas = problemasDe(c, { umbralIdentificar: 10_000_000, hoy })
  if (problemas.length) { console.error('No sale:', problemas); process.exit(1) }
  const r = await arca.facturarLote({ ptoVta, tipo: CBTE.FACTURA_B, comprobantes: [c] })
  for (const a of r.autorizados) {
    console.log(`✅ ${numeroVisible(a.tipo, ptoVta, a.numero)} · CAE ${a.cae} (vence ${a.caeVence})`)
    console.log('   QR:', urlQR({ ...a, ptoVta, cuit: CUIT_AREBEN }))
  }
  for (const x of r.rechazados) console.log('❌ rechazada:', JSON.stringify(x.observaciones), JSON.stringify(x.errores))
  if (r.cortado) console.log('⚠️ Se cortó: reconciliado contra ARCA.', { faltan: r.faltan.length, ajenos: r.ajenos.length })
}
