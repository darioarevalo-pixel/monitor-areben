/**
 * La traducción de un archivo de Drive al nombre con el que entra a la cañería de piezas.
 *
 * Es la parte pura de Drive: lo que decide **si un archivo elegido sirve** y **cómo se va a llamar**
 * el conjunto que sale de él. Lo otro —el popup, el token, la bajada— no se prueba acá porque es
 * conversación con Google; esto es la única lógica que se puede cazar mutando.
 */

import { describe, expect, it } from 'vitest'
import { EXT_POR_MIME, nombreDeDrive, tamanioDeDrive } from '@/lib/drive/archivos'
import { CLASE_POR_EXTENSION, MIME_POR_EXTENSION, TIPOS_PIEZA, claseDePieza, extensionDe, mimeDePieza } from '@/lib/meta-ads/pieza'

describe('la tabla única de formatos', () => {
  it('la clase sale del MIME y no de una lista aparte', () => {
    expect(CLASE_POR_EXTENSION.mp4).toBe('video')
    expect(CLASE_POR_EXTENSION.mov).toBe('video')
    expect(CLASE_POR_EXTENSION.png).toBe('imagen')
    expect(CLASE_POR_EXTENSION.webp).toBe('imagen')
    // El espejo: toda extensión con MIME tiene clase, y no hay clases de más.
    expect(Object.keys(CLASE_POR_EXTENSION).sort()).toEqual(Object.keys(MIME_POR_EXTENSION).sort())
  })

  it('los tipos que el Blob deja pasar son los de la tabla, sin repetidos', () => {
    // jpg y jpeg son el mismo MIME: si esto se rompe, `allowedContentTypes` lleva duplicados.
    expect(TIPOS_PIEZA).toEqual([...new Set(TIPOS_PIEZA)])
    expect(TIPOS_PIEZA).toContain('video/quicktime')
    expect(TIPOS_PIEZA).toContain('image/jpeg')
    expect(TIPOS_PIEZA).not.toContain('application/octet-stream')
    for (const mime of Object.values(MIME_POR_EXTENSION)) expect(TIPOS_PIEZA).toContain(mime)
  })

  it('un nombre sin punto no tiene extensión (y no la inventa con el nombre entero)', () => {
    expect(extensionDe('sin-extension')).toBe('')
    expect(extensionDe('reel FINAL.MP4')).toBe('mp4')
    expect(extensionDe('')).toBe('')
    expect(claseDePieza('sin-extension')).toBeNull()
  })

  it('el contentType sale de la extensión', () => {
    expect(mimeDePieza('reel.MOV')).toBe('video/quicktime')
    expect(mimeDePieza('foto.jpeg')).toBe('image/jpeg')
    expect(mimeDePieza('catalogo.pdf')).toBeNull()
  })
})

describe('EXT_POR_MIME — la tabla invertida', () => {
  it('image/jpeg sale como jpg, no como jpeg', () => {
    // Gana la PRIMERA extensión de cada MIME. Con «la última gana», los archivos de Drive sin
    // extensión se llamarían `.jpeg`, que no es como los nombra nadie.
    expect(EXT_POR_MIME['image/jpeg']).toBe('jpg')
  })

  it('cubre todos los tipos que el servidor acepta', () => {
    for (const mime of TIPOS_PIEZA) expect(EXT_POR_MIME[mime]).toBeTruthy()
  })

  it('la vuelta cierra: la extensión que devuelve tiene ese mismo MIME', () => {
    for (const [mime, ext] of Object.entries(EXT_POR_MIME)) expect(MIME_POR_EXTENSION[ext]).toBe(mime)
  })
})

describe('nombreDeDrive — qué entra y con qué nombre', () => {
  it('la extensión que ya trae el nombre manda sobre el mime de Drive', () => {
    // Drive puede informar octet-stream sobre un mp4 perfecto: la extensión la puso quien exportó.
    expect(nombreDeDrive('Reel agosto.mp4', 'application/octet-stream')).toEqual({
      ok: true, nombre: 'Reel agosto.mp4',
    })
    expect(nombreDeDrive('Portada.PNG', 'image/png')).toEqual({ ok: true, nombre: 'Portada.PNG' })
  })

  it('sin extensión, la completa con el mime', () => {
    expect(nombreDeDrive('Reel agosto final', 'video/mp4')).toEqual({ ok: true, nombre: 'Reel agosto final.mp4' })
    expect(nombreDeDrive('Portada', 'image/jpeg')).toEqual({ ok: true, nombre: 'Portada.jpg' })
  })

  it('una extensión desconocida con mime conocido se completa igual', () => {
    // `clip.mpeg` no está en la tabla; la cañería lee la ÚLTIMA extensión, así que queda `.mp4`.
    expect(nombreDeDrive('clip.mpeg', 'video/mp4')).toEqual({ ok: true, nombre: 'clip.mpeg.mp4' })
  })

  it('un archivo propio de Google se rechaza nombrándolo', () => {
    const r = nombreDeDrive('Guion del reel', 'application/vnd.google-apps.document')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.motivo).toContain('Guion del reel')
      expect(r.motivo).toContain('propio de Google')
    }
  })

  it('una carpeta tampoco entra', () => {
    expect(nombreDeDrive('Campañas agosto', 'application/vnd.google-apps.folder').ok).toBe(false)
  })

  it('un formato que Meta no acepta se rechaza diciendo cuál era y cuáles van', () => {
    const r = nombreDeDrive('catalogo.pdf', 'application/pdf')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.motivo).toContain('catalogo.pdf')
      expect(r.motivo).toContain('application/pdf')
      expect(r.motivo).toContain('mp4')
    }
  })

  it('sin nombre no se sigue', () => {
    expect(nombreDeDrive('   ', 'video/mp4').ok).toBe(false)
    expect(nombreDeDrive('', 'video/mp4').ok).toBe(false)
  })

  it('el mime se lee sin importar mayúsculas ni espacios', () => {
    expect(nombreDeDrive('Reel', ' VIDEO/MP4 ')).toEqual({ ok: true, nombre: 'Reel.mp4' })
  })
})

describe('tamanioDeDrive', () => {
  it('Drive manda el tamaño como texto', () => {
    expect(tamanioDeDrive({ sizeBytes: '28311552' })).toBe(28311552)
  })

  it('cuando no lo manda, es 0 y no NaN', () => {
    // Un NaN acá se propaga a la fila y la pantalla muestra «NaN MB».
    expect(tamanioDeDrive({})).toBe(0)
    expect(tamanioDeDrive({ sizeBytes: undefined })).toBe(0)
    expect(tamanioDeDrive({ sizeBytes: 'ninguno' })).toBe(0)
  })
})
