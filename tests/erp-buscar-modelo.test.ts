import { describe, expect, it } from 'vitest'
import { filtrarPorModelo, separarModelo } from '../lib/erp/buscar-modelo.core.js'

const TALLES = ['iPhone 16', 'iPhone 16 Pro', 'iPhone 16 Pro Max', 'iPhone 16 Plus', 'iPhone 16E', 'iPhone 13 mini', 'iPhone Air',
  'iPhone X/ Xs/ 11 Pro', 'iPhone XR/ 11', 'iPhone 12/ 12 Pro']
const prod = (nombre: string) => ({ product_id: 1, nombre, variantes: TALLES.map((talle, i) => ({ size_id: i, talle })) })
const talles = (q: string) => {
  const { modelo } = separarModelo(q)
  return filtrarPorModelo([prod('TEMPLADO 9D PREMIUM')], modelo).flatMap((p) => p.variantes.map((v) => v.talle))
}

describe('separarModelo (Darío 24-nov)', () => {
  it('separa producto y modelo', () => {
    expect(separarModelo('templado 9d premium 16 pro max')).toEqual({ producto: 'templado 9d premium', modelo: ['16', 'pro', 'max'] })
    expect(separarModelo('Templado premium iPhone 15 Pro')).toEqual({ producto: 'templado premium', modelo: ['15', 'pro'] })
    expect(separarModelo('templado 16pm')).toEqual({ producto: 'templado', modelo: ['16', 'pro', 'max'] })
  })
  it('sin número no hay modelo («airpods pro», «9d»)', () => {
    expect(separarModelo('airpods pro')).toEqual({ producto: 'airpods pro', modelo: [] })
    expect(separarModelo('templado 9d')).toEqual({ producto: 'templado 9d', modelo: [] })
  })
  it('sólo modelo: se busca como antes', () => {
    expect(separarModelo('16 pro')).toEqual({ producto: '16 pro', modelo: [] })
  })
})

describe('filtrarPorModelo', () => {
  it('exacto primero: «16 pro» ⛔ trae el Pro Max', () => {
    expect(talles('templado 16 pro')).toEqual(['iPhone 16 Pro'])
    expect(talles('templado 16')).toEqual(['iPhone 16'])
    expect(talles('templado 16e')).toEqual(['iPhone 16E'])
    expect(talles('templado 13 mini')).toEqual(['iPhone 13 mini'])
    expect(talles('templado air')).toEqual(['iPhone Air'])
  })
  it('los talles compartidos', () => {
    expect(talles('templado 11')).toEqual(['iPhone XR/ 11'])
    expect(talles('templado 11 pro')).toEqual(['iPhone X/ Xs/ 11 Pro'])
    expect(talles('templado 12 pro')).toEqual(['iPhone 12/ 12 Pro'])
  })
  it('sin exacto, los que empiezan así; sin nada, todo', () => {
    const p = [{ product_id: 1, nombre: 'X', variantes: [{ size_id: 1, talle: 'iPhone 17 Pro' }, { size_id: 2, talle: 'iPhone 17 Pro Max' }] }]
    expect(filtrarPorModelo(p, ['17']).flatMap((x) => x.variantes.map((v) => v.talle))).toEqual(['iPhone 17 Pro', 'iPhone 17 Pro Max'])
    expect(filtrarPorModelo(p, ['8'])).toBe(p)
  })
  it('saca el producto que no tiene el modelo', () => {
    const p = [prod('A'), { product_id: 2, nombre: 'B', variantes: [{ size_id: 9, talle: 'Única' }] }]
    expect(filtrarPorModelo(p, ['16']).map((x) => x.nombre)).toEqual(['A'])
  })
})
