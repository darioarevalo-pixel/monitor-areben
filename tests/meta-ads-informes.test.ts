import { describe, expect, it } from 'vitest'
import { COLS_LISTA, LIMITE_HTML, aVistaInforme } from '../lib/meta-ads/informes.core.js'
// Lo que la app consume entra por el módulo TIPADO: si el `as` de `informes.ts` se despega de lo que
// devuelve el `.core.js`, es acá donde tiene que doler.
import { avisosDelHtml, nombreArchivo, validarInforme } from '../lib/meta-ads/informes'

const LINEAS = ['bdi', 'zattia', 'stunned']
const ok = (extra: Record<string, unknown> = {}) => ({
  fecha: '2026-08-11', linea: 'bdi', titulo: 'Informe 02 · BDI', html: '<html><body>hola</body></html>', ...extra,
})

describe('validarInforme', () => {
  it('acepta uno bien formado y normaliza la línea', () => {
    const r = validarInforme(ok({ linea: 'BDI' }), { lineasValidas: LINEAS })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.informe.linea).toBe('bdi')
  })

  it('rechaza una fecha que no es AAAA-MM-DD', () => {
    // La fecha es media clave de la tabla: si entra "11/08/2026" el unique deja de agrupar y se
    // cargan dos informes del mismo día sin que nada avise.
    const r = validarInforme(ok({ fecha: '11/08/2026' }), { lineasValidas: LINEAS })
    expect(r.ok).toBe(false)
  })

  it('rechaza una línea que no es de pauta, y lo dice con las que sí', () => {
    const r = validarInforme(ok({ linea: 'girlhood' }), { lineasValidas: LINEAS })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('bdi')
  })

  it('rechaza el informe vacío', () => {
    expect(validarInforme(ok({ html: '   ' }), { lineasValidas: LINEAS }).ok).toBe(false)
  })

  it('rechaza el que se pasa del tope, diciendo cuánto pesa', () => {
    const r = validarInforme(ok({ html: 'x'.repeat(LIMITE_HTML + 1) }), { lineasValidas: LINEAS })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/KB/)
  })

  it('un resumen vacío entra como null, no como cadena vacía', () => {
    const r = validarInforme(ok({ resumen: '  ' }), { lineasValidas: LINEAS })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.informe.resumen).toBeNull()
  })
})

describe('avisosDelHtml', () => {
  it('avisa del script, porque adentro del iframe no va a correr', () => {
    const avisos = avisosDelHtml('<html><script>var a=1</script></html>')
    expect(avisos.some((a) => a.includes('script'))).toBe(true)
  })

  it('avisa de los recursos externos: un informe tiene que leerse dentro de diez años', () => {
    const avisos = avisosDelHtml('<html><img src="https://cdn.ejemplo.com/f.png"></html>')
    expect(avisos.some((a) => a.includes('externos'))).toBe(true)
  })

  it('un informe autocontenido no tiene nada que avisar', () => {
    expect(avisosDelHtml('<html><head><style>body{color:#123}</style></head><body>x</body></html>')).toEqual([])
  })
})

describe('la lista no manda el cuerpo', () => {
  /**
   * 🔑 La lista se pide con `COLS_LISTA` justamente para no arrastrar ~40 KB por fila. Si alguien
   * suma `html` ahí, la pantalla sigue andando igual y nadie se entera hasta que hay 40 informes.
   */
  it('COLS_LISTA no incluye html', () => {
    expect(COLS_LISTA).not.toContain('html')
  })

  it('aVistaInforme omite html cuando la fila no lo trae', () => {
    const v = aVistaInforme({ id: 1, fecha: '2026-08-11', linea: 'bdi', titulo: 't', publicado: false })
    expect('html' in v).toBe(false)
  })

  it('y lo pasa cuando sí lo trae', () => {
    const v = aVistaInforme({ id: 1, fecha: '2026-08-11', linea: 'bdi', titulo: 't', publicado: true, html: '<html></html>' })
    expect((v as { html?: string }).html).toBe('<html></html>')
    expect(v.publicado).toBe(true)
  })

  it('la fecha sale como AAAA-MM-DD aunque la base la devuelva con hora', () => {
    const v = aVistaInforme({ id: 1, fecha: '2026-08-11T00:00:00.000Z', linea: 'bdi', titulo: 't', publicado: true })
    expect(v.fecha).toBe('2026-08-11')
  })
})

describe('nombreArchivo', () => {
  it('es el mismo nombre que tenía en la carpeta del analista', () => {
    // Para que bajar uno y el que ya está en disco sean el mismo archivo y no dos con nombres
    // distintos. La convención es `informes/AAAA-MM-DD-<marca>.html`.
    expect(nombreArchivo({ fecha: '2026-08-11', linea: 'bdi' })).toBe('2026-08-11-bdi.html')
  })
})
