import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 🔴 **El código postal del alta a mano está partido entre la pantalla y el handler, y las dos
 * mitades fallan calladas.**
 *
 * `consultaDe` ya tiene sus tests y son de verdad: con `localidad: 'rosario'` y `cp: '2124'` devuelve
 * `localidad_dudosa` y no propone nada. Pero esa regla sólo corre si la fila **tiene** CP, y hasta el
 * 17-ago-2026 el formulario de «Cargar uno a mano» no tenía dónde tipearlo: toda fila cargada por una
 * persona nacía con `cp` nulo, así que ni el aviso de «fuera de zona» ni la corroboración del precio
 * se prendían nunca — justo en las filas donde la localidad la escribe alguien de memoria.
 *
 * Las dos formas de volver a apagarlo no rompen nada visible:
 *
 * 1. **Sacar el campo de la ficha.** No hay dónde tipearlo y la fila vuelve a nacer sin CP.
 * 2. **Sacar `cp` de `filaDe`, en el handler.** Peor: el campo se sigue viendo, la persona lo tipea,
 *    el POST contesta **200** y la columna queda en `null`. Los campos que no están en esa lista se
 *    caen a propósito —es una lista blanca— así que perder la línea no es un error, es un descarte
 *    silencioso. Es el mismo modo de falla que ya pasó acá con `cobrado`, que la escribía el portal y
 *    faltaba en el `select` del handler.
 *
 * Texto contra texto a propósito, del molde de `envios-cobrado-handler.test.ts` y
 * `envios-sugerir-handler.test.ts`: el handler corre en Node sin pasar por el compilador, y acá no se
 * prueba comportamiento sino que las dos puntas sigan de acuerdo.
 */

const raiz = join(__dirname, '..')
const handler = readFileSync(join(raiz, 'api/_envios.js'), 'utf8')
const pantalla = readFileSync(join(raiz, 'components/envios/Envios.tsx'), 'utf8')

/** El armador de la fila que se escribe, del `function filaDe` hasta el `}` que lo cierra. */
const filaDe = handler.slice(handler.indexOf('function filaDe('), handler.indexOf('export default async function handler'))

/** La ficha de alta y edición a mano, que es el único formulario que escribe la fila entera. */
const ficha = pantalla.slice(pantalla.indexOf('function FichaEnvio('), pantalla.indexOf('function CierreDelDia('))

describe('🔴 el código postal del alta a mano', () => {
  it('los dos bloques existen (si esto falla, el test se quedó mirando un archivo que se movió)', () => {
    expect(filaDe).not.toBe('')
    expect(ficha).not.toBe('')
  })

  it('🔴 la ficha lo deja tipear: sin el campo, la fila nace con `cp` nulo y el candado no se prende', () => {
    expect(ficha).toContain("set('cp'")
  })

  // 🔑 Al lado de la localidad y no en su lugar: es la regla de toda la sección, y en el formulario
  // se sostiene con el orden de los dos campos.
  it('🔴 va DESPUÉS de la localidad: el CP corrobora, nunca reemplaza', () => {
    const local = ficha.indexOf("set('localidad'")
    const cp = ficha.indexOf("set('cp'")
    expect(local).toBeGreaterThan(-1)
    expect(cp).toBeGreaterThan(local)
  })

  // Un `type="number"` se come el CPA alfanumérico (`S2000ABC`) y deja el campo vacío sin decir nada.
  it('lo toma como texto, que es lo que es', () => {
    expect(ficha).not.toMatch(/type="number"[^>]*value=\{f\.cp/)
    expect(ficha).not.toMatch(/value=\{f\.cp[^}]*\}[^>]*type="number"/)
  })

  it('🔴 y el handler lo ESCRIBE: fuera de la lista blanca se descarta con 200 y nada falla', () => {
    expect(filaDe).toMatch(/^\s*cp:/m)
  })

  // 🔑 `''` y `null` son lo mismo acá: el campo vacío es "no lo cargaron", no un CP en blanco que
  // después `cpFueraDeZona` tenga que salir a limpiar.
  it('el campo vacío se guarda como `null`, no como string vacío', () => {
    expect(filaDe).toMatch(/cp:[^,]*===\s*''/)
  })
})
