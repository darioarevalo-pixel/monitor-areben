import { describe, expect, it } from 'vitest'
import {
  campaniasDe, cuentasDeLinea, lineasDeCuenta, ordenarCuentas, resolverCuenta, resolverLinea,
  sinAsignarDe,
} from '@/lib/meta-ads/cuentas'
import { lineasQuePuede, lineasQueVe } from '@/lib/meta-ads/acciones'
import type { CuentaMeta } from '@/lib/meta-ads/tipos'
import type { Perfil } from '@/lib/permisos'

/**
 * El eje de Meta Ads: **cuenta publicitaria × línea de pauta**.
 *
 * Lo que ordena estos casos es que los dos ejes están CRUZADOS: BDI y Zattia comparten la cuenta
 * `…0149`, Stunned tiene la suya y hay una cuenta vacía. Ninguno de los dos selectores alcanza solo,
 * y angostarlos mal esconde justo lo que hay que arreglar.
 */

const cuenta = (o: Partial<CuentaMeta>): CuentaMeta => ({
  id: '1', nombre: 'Cuenta', moneda: 'ARS', zona: 'America/Argentina/Buenos_Aires',
  campanias: 0, asignadas: 0, lineas: [], administra: true, minDiarioCrudo: null, ...o,
})

// Las cuatro cuentas reales, medidas contra Meta el 6-ago-2026.
const COMPARTIDA = cuenta({ id: '1145878766790149', nombre: 'Cuenta 0149', campanias: 173, asignadas: 6, lineas: ['bdi', 'zattia', 'stunned'] })
const STUNNED = cuenta({ id: '4366752500136303', nombre: 'Stunned', campanias: 3, asignadas: 2, lineas: ['stunned'] })
const ACCESORIOS = cuenta({ id: '307068563918043', nombre: 'BDI ACCESORIOS', campanias: 3, asignadas: 0, lineas: [] })
const VACIA = cuenta({ id: '1766605934148471', nombre: 'Areben Comercial SRL', campanias: 0, asignadas: 0, lineas: [] })
const TODAS = [VACIA, ACCESORIOS, STUNNED, COMPARTIDA]
// Una cuenta con TODO asignado: es la única forma de probar el angostamiento puro, porque una
// campaña sin línea alcanza para que la cuenta se banque cualquier filtro (y así tiene que ser).
const LIMPIA = cuenta({ id: '555', nombre: 'Sólo Zattia', campanias: 4, asignadas: 4, lineas: ['zattia'] })

describe('el orden del selector', () => {
  it('la cuenta vacía se hunde al fondo', () => {
    // No es un error que exista —Areben Comercial no pautea—, pero en el medio de la lista invita a
    // elegirla y a concluir que Meta no devolvió nada.
    const orden = ordenarCuentas(TODAS).map((c) => c.id)
    expect(orden[0]).toBe(COMPARTIDA.id)
    expect(orden[orden.length - 1]).toBe(VACIA.id)
  })

  it('con el mismo peso, alfabético: el orden no puede depender de cómo vino la respuesta', () => {
    const a = cuenta({ id: 'a', nombre: 'Zeta', campanias: 5 })
    const b = cuenta({ id: 'b', nombre: 'Alfa', campanias: 5 })
    expect(ordenarCuentas([a, b]).map((c) => c.nombre)).toEqual(['Alfa', 'Zeta'])
  })
})

describe('angostar las cuentas por línea', () => {
  it('«todas» no filtra nada', () => {
    expect(cuentasDeLinea(TODAS, 'todas')).toHaveLength(4)
  })

  it('una línea deja las cuentas donde esa línea pautea', () => {
    expect(cuentasDeLinea(TODAS, 'stunned').map((c) => c.id)).toContain(STUNNED.id)
    expect(cuentasDeLinea(TODAS, 'stunned').map((c) => c.id)).toContain(COMPARTIDA.id)
  })

  it('🔴 la cuenta con campañas SIN ASIGNAR nunca desaparece al filtrar', () => {
    // Es la trampa que estas funciones existen para evitar: «BDI ACCESORIOS» tiene 3 campañas y
    // ninguna asignada, así que no pertenece a ninguna línea. Filtrando a secas se esconde justo la
    // cuenta donde hay trabajo — y sus campañas son las únicas que no cuenta ningún diagnóstico.
    expect(cuentasDeLinea(TODAS, 'bdi').map((c) => c.id)).toContain(ACCESORIOS.id)
    expect(sinAsignarDe(ACCESORIOS)).toBe(3)
  })

  it('la cuenta vacía SÍ se va: no tiene ni campañas ni línea', () => {
    expect(cuentasDeLinea(TODAS, 'bdi').map((c) => c.id)).not.toContain(VACIA.id)
  })

  it('más asignaciones que campañas no da un negativo', () => {
    // Pasa de verdad: una campaña borrada en Ads Manager deja su fila en la tabla de líneas.
    expect(sinAsignarDe(cuenta({ campanias: 2, asignadas: 5 }))).toBe(0)
  })
})

describe('resolver el cruce', () => {
  it('una cuenta que no existe vuelve a «todas», no deja la pantalla vacía', () => {
    // El link viejo o la cuenta que se sacó del token no pueden pintar una pantalla en cero que
    // parece un problema de Meta y es un filtro.
    expect(resolverCuenta(TODAS, 'todas', '999')).toBe('todas')
  })

  it('la cuenta que sí está con esa línea se respeta', () => {
    expect(resolverCuenta(TODAS, 'stunned', STUNNED.id)).toBe(STUNNED.id)
  })

  it('una cuenta que no tiene la línea elegida vuelve a «todas»', () => {
    // Con TODO asignado no queda nada que arreglar ahí, así que la excepción no aplica y el cruce
    // imposible se deshace. (`STUNNED` no sirve para este caso: tiene 1 campaña sin asignar.)
    expect(resolverCuenta([...TODAS, LIMPIA], 'bdi', LIMPIA.id)).toBe('todas')
  })

  it('una línea que este perfil NO puede ver no queda elegida ni viniendo de la URL', () => {
    expect(resolverLinea(['bdi'], TODAS, 'todas', 'stunned')).toBe('todas')
    expect(resolverLinea(['bdi'], TODAS, 'todas', 'bdi')).toBe('bdi')
  })

  it('con una cuenta abierta, la línea tiene que existir adentro', () => {
    const cuentas = [...TODAS, LIMPIA]
    expect(resolverLinea(['bdi', 'zattia', 'stunned'], cuentas, LIMPIA.id, 'bdi')).toBe('todas')
    expect(resolverLinea(['bdi', 'zattia', 'stunned'], cuentas, COMPARTIDA.id, 'bdi')).toBe('bdi')
  })

  it('salvo que la cuenta tenga campañas sin asignar: ahí cualquier línea vale', () => {
    // Misma razón que arriba: es la cuenta donde se va a arreglar el estado. Vale para las dos
    // reales que hoy tienen huérfanas — la de Stunned (1) y la de accesorios (3).
    expect(resolverLinea(['bdi'], TODAS, ACCESORIOS.id, 'bdi')).toBe('bdi')
    expect(resolverLinea(['bdi'], TODAS, STUNNED.id, 'bdi')).toBe('bdi')
  })
})

describe('lo que el selector muestra', () => {
  it('las líneas de una cuenta salen de lo asignado, nunca del nombre', () => {
    // «BDI ACCESORIOS» se llama BDI y no tiene ni una campaña asignada: el nombre no es fuente.
    expect(lineasDeCuenta(TODAS, ACCESORIOS.id)).toEqual([])
    expect(lineasDeCuenta(TODAS, COMPARTIDA.id).sort()).toEqual(['bdi', 'stunned', 'zattia'])
  })

  it('con «todas» es la unión, sin repetir', () => {
    expect(lineasDeCuenta(TODAS, 'todas').sort()).toEqual(['bdi', 'stunned', 'zattia'])
  })

  it('cuenta las campañas de lo elegido', () => {
    expect(campaniasDe(TODAS, 'todas')).toBe(179)
    expect(campaniasDe(TODAS, STUNNED.id)).toBe(3)
  })
})

describe('qué líneas ve un perfil', () => {
  const perfil = (o: Partial<Perfil>): Perfil => ({ name: 'Alguien', admin: false, cuenta: null, acceso: {}, ...o } as Perfil)

  it('Stunned viene de la mano de Zattia, que es de donde cuelga', () => {
    const soloZattia = perfil({ acceso: { zattia: { 'meta-ads': true } } })
    expect(lineasQueVe(soloZattia).sort()).toEqual(['stunned', 'zattia'])
  })

  it('quien no ve la sección no ve ninguna línea', () => {
    expect(lineasQueVe(perfil({}))).toEqual([])
  })

  it('🔑 ver NO es poder: mirar la línea y accionarla son dos permisos', () => {
    // Es la razón por la que son dos funciones y no una: el selector dibuja `lineasQueVe`, y los
    // botones `lineasQuePuede`. Si fueran la misma, ver la pauta habilitaría a mover plata.
    const mira = perfil({ acceso: { bdi: { 'meta-ads': true } } })
    expect(lineasQueVe(mira)).toEqual(['bdi'])
    expect(lineasQuePuede(mira, 'presupuesto')).toEqual([])
  })
})
