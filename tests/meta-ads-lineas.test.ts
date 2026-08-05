import { describe, it, expect } from 'vitest'
import { baseDeLinea, esLinea, ETIQUETA_LINEA, LINEAS, lineasDeMarca, sugerirLinea } from '@/lib/meta-ads/lineas'

describe('las tres líneas de pauta', () => {
  it('son bdi, zattia y stunned, y todas tienen etiqueta', () => {
    expect(LINEAS).toEqual(['bdi', 'zattia', 'stunned'])
    for (const l of LINEAS) expect(ETIQUETA_LINEA[l]).toBeTruthy()
  })

  it('esLinea rechaza cualquier otra cosa', () => {
    expect(esLinea('bdi')).toBe(true)
    expect(esLinea('STUNNED')).toBe(true)
    expect(esLinea('otra')).toBe(false)
    expect(esLinea('')).toBe(false)
    expect(esLinea(null)).toBe(false)
  })
})

describe('a qué base y a qué permiso cuelga cada línea', () => {
  it('stunned cuelga de zattia', () => {
    // Es EL punto del helper: Stunned no es una `Marca` del monitor (no tiene base ni permisos
    // propios). Sin esto, preguntarle a `puedeVer` por 'stunned' da false y la pantalla contesta un
    // 403 que nadie entiende; y la fila se intentaría guardar en una base que no existe.
    expect(baseDeLinea('stunned')).toBe('zattia')
    expect(baseDeLinea('zattia')).toBe('zattia')
    expect(baseDeLinea('bdi')).toBe('bdi')
  })

  it('una línea inventada NO cae en ninguna marca', () => {
    expect(baseDeLinea('otra')).toBeNull()
    expect(baseDeLinea('')).toBeNull()
  })

  it('zattia arrastra a stunned y bdi va sola', () => {
    expect(lineasDeMarca('zattia')).toEqual(['zattia', 'stunned'])
    expect(lineasDeMarca('bdi')).toEqual(['bdi'])
  })

  it('toda línea cuelga de una marca real: no queda ninguna huérfana', () => {
    // Si mañana se suma una cuarta línea sin decidir de qué base sale, sus campañas se guardarían en
    // el limbo y su plata no la contaría nadie sin que nada falle.
    for (const l of LINEAS) expect(['bdi', 'zattia']).toContain(baseDeLinea(l))
  })
})

describe('la sugerencia por el nombre de la campaña', () => {
  it('reconoce cada marca cuando el nombre la nombra', () => {
    expect(sugerirLinea('BDI - Remarketing carrito')).toBe('bdi')
    expect(sugerirLinea('Zattia | invierno 26')).toBe('zattia')
    expect(sugerirLinea('STUNNED remeras verano')).toBe('stunned')
  })

  it('NO sugiere nada cuando el nombre no dice nada', () => {
    // Es la regla entera de este archivo: la versión anterior era una regex que caía a `bdi` en
    // silencio, y así una marca cargaba con la pauta de otra mostrando un número muy creíble.
    // «Sin asignar» es un estado real, no una falla que haya que tapar con un default.
    expect(sugerirLinea('Campaña 3 - conversiones')).toBeNull()
    expect(sugerirLinea('')).toBeNull()
    expect(sugerirLinea(null)).toBeNull()
    expect(sugerirLinea('   ')).toBeNull()
  })

  it('NO sugiere nada cuando el nombre nombra a DOS marcas', () => {
    // El empate es justo el caso en que una persona tiene que mirar la campaña. Elegir la primera
    // que matchea sería inventar una decisión con cara de dato.
    expect(sugerirLinea('Zattia x Stunned - colab')).toBeNull()
    expect(sugerirLinea('BDI y Zattia institucional')).toBeNull()
  })

  it('no se come una marca adentro de otra palabra', () => {
    // `stu` suelto es Stunned; `estudio` no. Un prefijo suelto matcheando cualquier palabra larga
    // convertiría la sugerencia en ruido y la gente dejaría de mirarla.
    expect(sugerirLinea('Estudio de audiencias')).toBeNull()
    expect(sugerirLinea('Abdicar el presupuesto')).toBeNull()
    expect(sugerirLinea('STU - cápsula')).toBe('stunned')
  })
})
