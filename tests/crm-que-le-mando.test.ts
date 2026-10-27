import { describe, expect, it } from 'vitest'
import {
  conNovedad,
  conPregunta,
  diasDesdeContacto,
  M,
  novedadDelBanco,
  resultado,
  siguientePregunta,
  GRUPO_NOVEDAD,
  type LoQueSabe,
  type Respuestas,
} from '@/lib/crm/que-le-mando'
import { setPerfil } from '@/lib/crm/seguimiento'
import { setPerfilLead, type Lead } from '@/lib/crm/leads'

/**
 * «Qué le mando» (Darío, 27-oct-2026). Las reglas salen de la guía de recontactos
 * (https://claude.ai/artifact/FgX8oBCpvQY3u58zqqrTwE): estos casos fijan lo que Darío decidió.
 */

const base: LoQueSabe = { esCliente: false, enComunidad: false, perfil: null, diasDesdeContacto: null, novedad: 'Nos entraron relojes!' }

/** Contesta las preguntas en orden hasta que no queden; devuelve los campos que se preguntaron. */
function recorrer(sabe: LoQueSabe, respuestas: Respuestas) {
  const r: Respuestas = {}
  const preguntadas: string[] = []
  for (let i = 0; i < 6; i++) {
    const p = siguientePregunta(sabe, r)
    if (!p) break
    preguntadas.push(p.campo)
    const v = respuestas[p.campo]
    if (!v) throw new Error(`falta la respuesta de ${p.campo}`)
    ;(r as Record<string, string>)[p.campo] = v
  }
  return { preguntadas, res: resultado(sabe, r) }
}

describe('qué se pregunta', () => {
  it('a un cliente no se le pregunta si es cliente ni si dijo que compraba', () => {
    const { preguntadas } = recorrer({ ...base, esCliente: true }, { tiempo: 'corto', ultimo: 'compra' })
    expect(preguntadas).toEqual(['tiempo', 'ultimo'])
  })

  it('si le escribió hace menos de 2 meses, no pregunta el tiempo', () => {
    const { preguntadas } = recorrer({ ...base, esCliente: true, diasDesdeContacto: 12 }, { ultimo: 'compra' })
    expect(preguntadas).toEqual(['ultimo'])
  })

  it('una fecha anotada vieja no alcanza: pregunta igual', () => {
    const { preguntadas } = recorrer({ ...base, esCliente: true, diasDesdeContacto: 90 }, { tiempo: 'corto', ultimo: 'compra' })
    expect(preguntadas).toEqual(['tiempo', 'ultimo'])
  })

  it('el perfil guardado no se vuelve a preguntar', () => {
    const sin = recorrer(base, { dijo: 'no', perfil: 'local', tiempo: 'corto', ultimo: 'tienda0' })
    expect(sin.preguntadas).toEqual(['dijo', 'perfil', 'tiempo', 'ultimo'])
    const con = recorrer({ ...base, perfil: 'local' }, { dijo: 'no', tiempo: 'corto', ultimo: 'tienda0' })
    expect(con.preguntadas).toEqual(['dijo', 'tiempo', 'ultimo'])
  })

  it('⛔ nunca pregunta si contestó ni nombra «1º/2º» en las opciones', () => {
    const p = siguientePregunta({ ...base, esCliente: true, diasDesdeContacto: 3 }, {})!
    expect(p.texto).not.toMatch(/contest/i)
    expect(p.opciones.map((o) => o.texto).join(' ')).not.toMatch(/\d\s*º|recontacto/i)
  })
})

describe('qué le mando', () => {
  it('C: después de la compra, cómo se vendió; después, la novedad con la pregunta de cliente', () => {
    const c = { ...base, esCliente: true, diasDesdeContacto: 5 }
    expect(recorrer(c, { ultimo: 'compra' }).res!.mensajes[0].texto).toBe(M.vendio)
    expect(recorrer(c, { ultimo: 'r1' }).res!.mensajes[0].texto).toBe('Nos entraron relojes! Pudiste ver algo en particular?')
    const cierre = recorrer(c, { ultimo: 'r2' }).res!
    expect(cierre.mensajes[0].texto).toBe(M.descuento)
    expect(cierre.agendar.map((a) => a.dias)).toEqual([30])
  })

  it('A: la novedad pregunta por el local, con videos de repuesto', () => {
    const { res } = recorrer({ ...base, perfil: 'local', diasDesdeContacto: 4 }, { dijo: 'no', ultimo: 'chusmear' })
    expect(res!.mensajes.map((m) => m.texto)).toEqual(['Nos entraron relojes! Pudiste ver algo en particular para el local?', M.videos])
  })

  it('el cierre lo elige la comunidad: si no está, se le ofrece; si está, videos', () => {
    const a = { ...base, perfil: 'local' as const, diasDesdeContacto: 4 }
    expect(recorrer({ ...a, enComunidad: false }, { dijo: 'no', ultimo: 'novedad' }).res!.mensajes.map((m) => m.texto)).toEqual([M.cierreComunidad])
    expect(recorrer({ ...a, enComunidad: true }, { dijo: 'no', ultimo: 'novedad' }).res!.mensajes.map((m) => m.texto)).toEqual([M.cierreVideos])
    expect(recorrer({ ...a, enComunidad: null }, { dijo: 'no', ultimo: 'novedad' }).res!.mensajes).toHaveLength(2)
  })

  it('la vuelta de un local: 15 días si tiene más de uno, 30 si tiene uno', () => {
    const { res } = recorrer({ ...base, perfil: 'local', diasDesdeContacto: 4 }, { dijo: 'no', ultimo: 'cierre' })
    expect(res!.mensajes).toEqual([])
    expect(res!.agendar.map((a) => a.dias)).toEqual([15, 30])
  })

  it('más de 2 meses = Recaptar, sin preguntar lo último', () => {
    const { preguntadas, res } = recorrer({ ...base, perfil: 'local' }, { dijo: 'no', tiempo: 'largo' })
    expect(preguntadas).toEqual(['dijo', 'tiempo'])
    expect(res!.situacion).toBe('Local · Recaptar')
    expect(res!.mensajes[0].texto).toBe(M.tepaso)
  })

  it('B: el 2º según el perfil guardado; sin perfil, los dos', () => {
    const b = { ...base, diasDesdeContacto: 4 }
    expect(recorrer({ ...b, perfil: 'emprendedor' }, { dijo: 'si', ultimo: 'r1' }).res!.mensajes.map((m) => m.texto)).toEqual([M.minimo])
    expect(recorrer(b, { dijo: 'si', ultimo: 'r1' }).res!.mensajes).toHaveLength(2)
  })

  it('emprendedor: un solo recontacto y sin fecha', () => {
    const { preguntadas, res } = recorrer(base, { dijo: 'no', perfil: 'emprendedor', ultimo: 'tienda1' })
    expect(preguntadas).toEqual(['dijo', 'perfil', 'ultimo'])
    expect(res!.mensajes[0].texto).toBe(M.emprendedor)
    expect(res!.agendar).toEqual([])
  })

  it('los mensajes van sin tildes de pregunta ni ¿, como escribe Darío', () => {
    for (const t of Object.values(M)) expect(t).not.toMatch(/¿/)
  })
})

describe('la novedad de la semana', () => {
  it('sin cargar, la pregunta va sobre la de la guía', () => {
    expect(conPregunta('', false)).toBe('Nos entraron diseños nuevos de fundas, ya estan en la tienda! Pudiste ver algo en particular?')
  })

  it('vive en su grupo del banco y no toca los otros', () => {
    const banco = [{ grupo: 'Dormido', mensajes: ['hola'] }]
    const con = conNovedad(banco, '  Entraron fundas  ')
    expect(con).toEqual([...banco, { grupo: GRUPO_NOVEDAD, mensajes: ['Entraron fundas'] }])
    expect(novedadDelBanco(con)).toBe('Entraron fundas')
    expect(novedadDelBanco(conNovedad(con, 'Otra'))).toBe('Otra')
    expect(conNovedad(con, 'Otra')).toHaveLength(2)
    expect(novedadDelBanco(banco)).toBe('')
  })
})

describe('el perfil se guarda en la ficha', () => {
  it('cliente: aditivo, y sacarlo no deja la clave', () => {
    const m = setPerfil({ '7': { notas: [], ultimo_contacto: '2026-10-20' } }, 7, 'local')
    expect(m['7'].perfil).toBe('local')
    expect(m['7'].ultimo_contacto).toBe('2026-10-20')
    expect('perfil' in setPerfil(m, 7, null)['7']).toBe(false)
  })

  it('prospecto: lo mismo, en crm:leads', () => {
    const lead = { id: 'l1', nombre: 'Anto', notas: [] } as unknown as Lead
    const m = setPerfilLead({ l1: lead }, 'l1', 'emprendedor')
    expect(m.l1.perfil).toBe('emprendedor')
    expect('perfil' in setPerfilLead(m, 'l1', null).l1).toBe(false)
  })
})

describe('días desde el último contacto', () => {
  it('cuenta días de calendario y no se corre por la hora', () => {
    expect(diasDesdeContacto('2026-10-20', '2026-10-27')).toBe(7)
    expect(diasDesdeContacto('2026-10-27T23:00:00', '2026-10-27')).toBe(0)
    expect(diasDesdeContacto(null, '2026-10-27')).toBeNull()
  })
})
