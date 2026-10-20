// La dirección propia del ERP para el aviso de Ingresos (`/api/erp/ingreso`, Bruno 20-oct).
//
// 🔑 Es una reescritura de `vercel.json`, ⛔ un receptor nuevo: las dos direcciones (ésta y la vieja,
// que el emisor tiene cargada hoy) caen en el MISMO handler, sin código copiado. Lo que fija este
// test es que la reescritura apunte a un recurso que EXISTE: si alguien renombra `oc-webhook`, el
// emisor recibe 400 y nada de este lado falla.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
const datos = readFileSync('api/datos.js', 'utf8')

describe('la dirección propia del ERP para Ingresos', () => {
  const regla = (vercel.rewrites ?? []).find((r: { source: string }) => r.source === '/api/erp/ingreso')

  it('existe y va al receptor del aviso de Ingresos', () => {
    expect(regla?.destination).toBe('/api/datos?recurso=oc-webhook')
  })

  it('el recurso al que apunta está registrado en api/datos.js', () => {
    expect(datos).toMatch(/'oc-webhook':\s*ocWebhook/)
  })
})
