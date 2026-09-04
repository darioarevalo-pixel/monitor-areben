import { describe, it, expect } from 'vitest'
import {
  alturaNormalizada,
  conModelo,
  desdeFicha,
  fraseDeModelo,
  hayModelo,
  resumenDeModelo,
  modeloDeProducto,
  talleDeModeloPorSku,
  talleNormalizado,
} from '@/lib/sesionfotos/modelo'
import { conRespuestaFoto } from '@/lib/sesionfotos/fotografiado'
import type { ItemSolicitud, Solicitud } from '@/lib/sesionfotos/tipos'

const item = (over: Partial<ItemSolicitud> = {}): ItemSolicitud => ({
  vid: 'p1_s1',
  pid: 'p1',
  sid: 's1',
  nombre: 'TOP SKYLER',
  variante: 'M',
  sku: 'Z-1000-M',
  qty: 1,
  origen: 'deposito',
  ...over,
})

/**
 * ⚠️ `fotografiables()` es «lo que SALIÓ», no «lo que se pidió»: sin `verif` la solicitud no tiene
 * ninguna prenda que pueda haber usado la modelo, y el índice sale vacío aunque la ficha esté
 * cargada. Por eso cada solicitud de estos tests nace con su conteo de preparado puesto.
 */
const sol = (over: Partial<Solicitud> = {}): Solicitud => {
  const items = over.items ?? [item()]
  return {
    id: 's1',
    fecha: '2026-09-03',
    creado: 1,
    creadoPor: 'yo',
    descripcion: 'sesión',
    estado: 'cargada',
    items,
    verif: Object.fromEntries(items.map((i) => [i.vid, i.qty])),
    ventas: { deposito: { id: 1 } },
    ...over,
  }
}

const meta = { por: 'Cami', ts: 1_756_000_000_000 }

describe('sesionfotos/modelo — normalizar lo que se tipea', () => {
  it('el talle se guarda en MAYÚSCULAS y sin el «talle» de adelante', () => {
    expect(talleNormalizado(' m ')).toBe('M')
    expect(talleNormalizado('Talle M')).toBe('M')
    expect(talleNormalizado('talles 38')).toBe('38')
    // ⛔ La lista NO es cerrada: el día que entre un talle nuevo, el campo lo tiene que aceptar.
    expect(talleNormalizado('único')).toBe('ÚNICO')
    expect(talleNormalizado('')).toBe('')
  })

  it('las cuatro formas de escribir una altura dan la misma', () => {
    for (const escrito of ['170', '1.70', '1,70', '1,70 m', ' 1,70 M. ']) {
      expect(alturaNormalizada(escrito)).toBe('1,70 m')
    }
  })

  /**
   * 🔴 Lo que no es una altura se DESCARTA, no se guarda crudo: este texto sale tal cual a la ficha
   * de un producto que lee una clienta.
   */
  it('lo que no es una altura no se guarda', () => {
    for (const basura of ['', 'alta', '0', '-1,70', '3,10 m', '95']) expect(alturaNormalizada(basura)).toBe('')
  })
})

describe('sesionfotos/modelo — cargar y borrar la ficha', () => {
  it('con talle se guarda, ya normalizado y con quién lo anotó', () => {
    const s = conModelo(sol(), { nombre: '  Sofi   P. ', talle: 'talle s', altura: '170' }, meta)
    expect(s.modelo).toEqual({ talle: 'S', nombre: 'Sofi P.', altura: '1,70 m', por: 'Cami', ts: meta.ts })
    expect(hayModelo(s.modelo)).toBe(true)
  })

  it('el nombre NO es obligatorio: sin él el talle igual se guarda', () => {
    const s = conModelo(sol(), { talle: 'M' }, meta)
    expect(s.modelo?.talle).toBe('M')
    expect(s.modelo?.nombre).toBeUndefined()
  })

  /** Un nombre sin talle no contesta nada, y el mismo gesto sirve para deshacer una carga mala. */
  it('sin talle no se guarda nada, y borra lo que hubiera', () => {
    expect(conModelo(sol(), { nombre: 'Sofi' }, meta).modelo).toBeUndefined()
    const cargada = conModelo(sol(), { talle: 'S' }, meta)
    expect('modelo' in conModelo(cargada, { nombre: 'Sofi', talle: '  ' }, meta)).toBe(false)
  })

  it('la frase que sale a la tienda ⛔ no nombra a la modelo; la del monitor sí', () => {
    const con = conModelo(sol(), { nombre: 'Sofi', talle: 's', altura: '1,70' }, meta).modelo
    expect(fraseDeModelo(con)).toBe('La modelo mide 1,70 m y usa talle S.')
    expect(fraseDeModelo(con)).not.toContain('Sofi')
    expect(resumenDeModelo(con)).toBe('Sofi · talle S · 1,70 m')

    const sinAltura = conModelo(sol(), { talle: 'M' }, meta).modelo
    expect(fraseDeModelo(sinAltura)).toBe('La modelo usa talle M.')
    expect(resumenDeModelo(sinAltura)).toBe('Sin nombre · talle M')
    expect(fraseDeModelo(undefined)).toBe('')
  })
})

describe('sesionfotos/modelo — el puente con la descripción, por SKU', () => {
  it('indexa por SKU las prendas que salieron con una sesión que tiene modelo', () => {
    const s = conModelo(sol(), { nombre: 'Sofi', talle: 'S' }, meta)
    const idx = talleDeModeloPorSku([s])
    expect(idx.get('Z-1000-M')?.modelo.talle).toBe('S')
    expect(idx.get('Z-1000-M')?.solicitudId).toBe('s1')
    expect(idx.get('Z-1000-M')?.fecha).toBe('2026-09-03')
  })

  it('una sesión SIN modelo no aporta nada', () => {
    expect(talleDeModeloPorSku([sol()]).size).toBe(0)
  })

  /**
   * 🔴 La diferencia que sostiene el índice: `no` es una respuesta explícita —la modelo no se la
   * puso— y `sin-contestar` es que nadie la anotó. La primera saca la prenda; la segunda no.
   */
  it('la prenda contestada «no se fotografió» queda AFUERA; la que nadie contestó entra', () => {
    const dos = [item(), item({ vid: 'p2_s1', pid: 'p2', sku: 'Z-2000-M', nombre: 'JEAN MOM' })]
    let s = conModelo(sol({ items: dos }), { talle: 'S' }, meta)
    s = conRespuestaFoto(s, 'p2_s1', false, { por: 'Cami', motivo: 'No entró en el look', ts: meta.ts })
    const idx = talleDeModeloPorSku([s])
    expect(idx.has('Z-1000-M')).toBe(true) // sin contestar: salió con la sesión
    expect(idx.has('Z-2000-M')).toBe(false) // contestada que no
  })

  it('si la prenda se fotografió dos veces, vale la sesión más NUEVA', () => {
    const vieja = conModelo(sol({ id: 'vieja', fecha: '2026-08-01' }), { nombre: 'Cami', talle: 'M' }, meta)
    const nueva = conModelo(sol({ id: 'nueva', fecha: '2026-09-03' }), { nombre: 'Sofi', talle: 'S' }, meta)
    for (const orden of [[vieja, nueva], [nueva, vieja]]) {
      const idx = talleDeModeloPorSku(orden)
      expect(idx.get('Z-1000-M')?.modelo.talle).toBe('S')
      expect(idx.get('Z-1000-M')?.solicitudId).toBe('nueva')
    }
  })

  it('un ítem sin SKU no entra: sin SKU no hay con qué cruzarlo', () => {
    const s = conModelo(sol({ items: [item({ sku: '' })] }), { talle: 'S' }, meta)
    expect(talleDeModeloPorSku([s]).size).toBe(0)
  })
})

describe('sesionfotos/modelo — buscar por los SKU de un producto de TiendaNube', () => {
  const idx = () =>
    talleDeModeloPorSku([
      conModelo(sol({ id: 'vieja', fecha: '2026-08-01', items: [item({ sku: 'Z-1000-S', vid: 'v1' })] }), { talle: 'M' }, meta),
      conModelo(sol({ id: 'nueva', fecha: '2026-09-03', items: [item({ sku: 'Z-1000-M', vid: 'v2' })] }), { talle: 'S' }, meta),
    ])

  /**
   * El producto de TiendaNube tiene sus tres talles; la sesión se llevó UNO. Alcanza: el dato es de
   * la sesión, no de la variante.
   */
  it('alcanza con que UNA variante del producto haya salido en una sesión', () => {
    expect(modeloDeProducto(['Z-1000-S', 'Z-1000-M', 'Z-1000-L'], idx())?.modelo.talle).toBe('S')
  })

  it('si dos sesiones tocaron dos variantes del mismo producto, gana la más nueva', () => {
    // El orden en que vienen los SKU del producto ⛔ no puede decidirlo: lo decide la fecha.
    expect(modeloDeProducto(['Z-1000-S', 'Z-1000-M'], idx())?.solicitudId).toBe('nueva')
    expect(modeloDeProducto(['Z-1000-M', 'Z-1000-S'], idx())?.solicitudId).toBe('nueva')
  })

  it('un producto que ninguna sesión tocó no inventa nada', () => {
    expect(modeloDeProducto(['OTRO-1'], idx())).toBeNull()
    expect(modeloDeProducto([], idx())).toBeNull()
  })
})

/**
 * Elegir la modelo del PADRÓN (3-sep-2026). Lo que este bloque defiende ⛔ no es la comodidad de no
 * tipear: es el `id` — lo único que después deja contar cuántas sesiones hizo cada modelo. Una
 * sesión con el nombre bien escrito y sin `id` ⛔ no cuenta para nada.
 */
describe('sesionfotos/modelo — elegir del padrón', () => {
  const sofi = { id: 'mo1', nombre: 'Sofi', talle: 'm', altura: '170' }

  it('elegir una ficha trae su talle y su altura, ya normalizados', () => {
    expect(desdeFicha(sofi, {})).toEqual({ id: 'mo1', nombre: 'Sofi', talle: 'M', altura: '1,70 m' })
  })

  it('la ficha PISA lo que estaba tipeado: para eso se la elige', () => {
    expect(desdeFicha(sofi, { nombre: 'sofia?', talle: 'L' })).toEqual({
      id: 'mo1',
      nombre: 'Sofi',
      talle: 'M',
      altura: '1,70 m',
    })
  })

  /** 🔑 El caso que importa: la ficha existe pero todavía no dice qué talle usa. */
  it('un dato que la ficha NO tiene no pisa el que ya estaba escrito', () => {
    const nueva = { id: 'mo2', nombre: 'Juana', talle: null, altura: null }
    expect(desdeFicha(nueva, { talle: 'S', altura: '1,60 m' })).toEqual({
      id: 'mo2',
      nombre: 'Juana',
      talle: 'S',
      altura: '1,60 m',
    })
  })

  it('sacar la ficha se lleva el id y deja lo tipeado', () => {
    expect(desdeFicha(null, { id: 'mo1', nombre: 'Sofi', talle: 'M' })).toEqual({ nombre: 'Sofi', talle: 'M' })
  })

  it('el id queda guardado en la sesión, y sin talle no queda nada', () => {
    const conFicha = conModelo(sol(), { id: 'mo1', nombre: 'Sofi', talle: 'M' }, meta)
    expect(conFicha.modelo).toMatchObject({ id: 'mo1', nombre: 'Sofi', talle: 'M' })
    // Borrar el talle borra la ficha ENTERA, id incluido: no queda un enganche sin dato.
    expect(conModelo(conFicha, { id: 'mo1', nombre: 'Sofi', talle: '' }, meta).modelo).toBeUndefined()
  })

  /** ⚠️ Las sesiones de antes del padrón ⛔ no tienen id, y eso ⛔ no las rompe. */
  it('la modelo tipeada a mano se sigue guardando, sin id', () => {
    const m = conModelo(sol(), { nombre: 'La de la agencia', talle: 's' }, meta).modelo
    expect(m).toMatchObject({ nombre: 'La de la agencia', talle: 'S' })
    expect(m && 'id' in m).toBe(false)
  })
})
