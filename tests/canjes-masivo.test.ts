/**
 * Canjes — cargar varias personas al padrón de una sola vez.
 *
 * Lo que se cuida acá es lo que en el alta de a una es invisible y en un lote de cuarenta no:
 *
 *  - **el dedup**, que es lo único que separa un padrón de una lista con la misma creadora tres
 *    veces y el historial partido en tres;
 *  - **el espejo TS↔JS de `normalizarInstagram`** con lo que trae un pegado de verdad (links del
 *    celular con `?igsh=`, el punto de la oración, mayúsculas). Si las dos copias divergen, la
 *    pantalla promete 38 nuevas y entran 35, y nadie se entera cuáles.
 */
import { describe, it, expect } from 'vitest'
import {
  TOPE_ALTA_LOTE, filasAEnviar, filasDePegado, previsualizarAlta, resumenAlta,
  type FilaAlta,
} from '@/lib/canjes/alta-masiva'
import { normalizarInstagram } from '@/lib/canjes/instagram'
import {
  TOPE_CANJES_LOTE, cuantasPersonas, separarSeleccion, textoDelResultado,
} from '@/lib/canjes/propuesta-masiva'
// No es un espejo: es LA misma función que usa la pantalla, re-exportada por el handler para poder
// assertear con `toBe` que no vuelva a haber una copia.
import { normalizarInstagram as normalizarJS } from '../api/_canjes.js'

const fila = (p: Partial<FilaAlta> = {}): FilaAlta =>
  ({ instagram: '', nombre: '', telefono: '', ciudad: '', ...p })

const PADRON = [
  { id: 7, instagram: 'lucia.mkp', nombre: 'Lucía Méndez' },
  { id: 8, instagram: 'nandu', nombre: 'Ñandú Pérez' },
]

// ── La previsualización ──────────────────────────────────────────────────────────

describe('previsualizarAlta — qué va a pasar con cada fila', () => {
  it('marca la que ya está en el padrón, y dice de quién es', () => {
    // Sin el nombre, "ya está" obliga a ir a buscarla al padrón para saber si es la misma persona o
    // un @ parecido.
    const [p] = previsualizarAlta([fila({ instagram: '@Lucia.MKP' })], PADRON)
    expect(p.estado).toBe('ya-esta')
    expect(p.yaEs?.nombre).toBe('Lucía Méndez')
  })

  it('la reconoce aunque venga pegada como link del celular', () => {
    const [p] = previsualizarAlta([fila({ instagram: 'https://www.instagram.com/lucia.mkp/?igsh=abc123' })], PADRON)
    expect(p.estado).toBe('ya-esta')
  })

  it('el primero de dos repetidos gana', () => {
    // Quien tipeó dos veces la misma creadora quiso cargarla una. Quedarse con el último descartaría
    // en silencio lo que escribió primero, que puede tener el nombre cargado y el otro no.
    const previas = previsualizarAlta([
      fila({ instagram: 'nueva', nombre: 'Con nombre' }),
      fila({ instagram: '@nueva' }),
    ], PADRON)
    expect(previas.map((p) => p.estado)).toEqual(['ok', 'repetida'])
    expect(filasAEnviar(previas)).toHaveLength(1)
    expect(filasAEnviar(previas)[0].nombre).toBe('Con nombre')
  })

  it('una fila vacía no es un error', () => {
    // La grilla arranca con cinco filas: si las cuatro que sobran gritaran en rojo, la pantalla se
    // vería rota antes de que nadie escriba nada.
    const previas = previsualizarAlta([fila(), fila({ nombre: 'sin @' })], PADRON)
    expect(previas.map((p) => p.estado)).toEqual(['vacia', 'vacia'])
    expect(resumenAlta(previas).invalidas).toBe(0)
  })

  it('escribir algo de lo que no sale un @ sí lo es', () => {
    const [p] = previsualizarAlta([fila({ instagram: '¿?¿?' })], PADRON)
    expect(p.estado).toBe('invalida')
  })

  it('el resumen cuenta las cuatro cosas por separado', () => {
    const previas = previsualizarAlta([
      fila({ instagram: 'una' }),
      fila({ instagram: 'otra' }),
      fila({ instagram: 'lucia.mkp' }),
      fila({ instagram: '@una' }),
      fila({ instagram: '!!!' }),
      fila(),
    ], PADRON)
    expect(resumenAlta(previas)).toMatchObject({ nuevas: 2, yaEstan: 1, repetidas: 1, invalidas: 1, sobran: 0 })
  })

  it('avisa cuánto sobra del tope en vez de recortar callado', () => {
    const muchas = Array.from({ length: TOPE_ALTA_LOTE + 3 }, (_, i) => fila({ instagram: `creadora${i}` }))
    const previas = previsualizarAlta(muchas, PADRON)
    expect(resumenAlta(previas).sobran).toBe(3)
    expect(filasAEnviar(previas)).toHaveLength(TOPE_ALTA_LOTE)
  })
})

describe('filasAEnviar — lo que sale para el servidor', () => {
  it('sólo van las nuevas, con el @ normalizado y lo tipeado aparte', () => {
    // `instagram_raw` es lo que después se muestra en pantalla: ella se escribe `@Lucia.MKP` y verlo
    // en minúsculas se lee como que el sistema le cambió el nombre.
    const previas = previsualizarAlta([fila({ instagram: '@Nueva.Creadora', nombre: '  Ana  ' })], PADRON)
    expect(filasAEnviar(previas)).toEqual([
      { instagram: 'nueva.creadora', instagram_raw: 'Nueva.Creadora', nombre: 'Ana', telefono: undefined, ciudad: undefined },
    ])
  })

  it('los campos en blanco no viajan como cadena vacía', () => {
    const previas = previsualizarAlta([fila({ instagram: 'x', ciudad: '   ' })], PADRON)
    expect(filasAEnviar(previas)[0].ciudad).toBeUndefined()
  })
})

// ── El pegado ────────────────────────────────────────────────────────────────────

describe('filasDePegado — copiar y pegar sin salir de la grilla', () => {
  it('una columna de arrobas cae una por renglón', () => {
    expect(filasDePegado('@una\n@dos\n@tres').map((f) => f.instagram)).toEqual(['@una', '@dos', '@tres'])
  })

  it('con tabs reparte en las columnas de la grilla', () => {
    expect(filasDePegado('@ana\tAna Ruiz\t1156781234\tCórdoba')).toEqual([
      { instagram: '@ana', nombre: 'Ana Ruiz', telefono: '1156781234', ciudad: 'Córdoba' },
    ])
  })

  it('también con comas y punto y coma, que es como se escribe a mano', () => {
    expect(filasDePegado('@ana, Ana Ruiz')[0]).toMatchObject({ instagram: '@ana', nombre: 'Ana Ruiz' })
    expect(filasDePegado('@ana; Ana Ruiz')[0]).toMatchObject({ instagram: '@ana', nombre: 'Ana Ruiz' })
  })

  it('los renglones en blanco no ocupan una fila', () => {
    expect(filasDePegado('@una\n\n\n@dos\n')).toHaveLength(2)
  })
})

// ── El espejo, con lo que trae un pegado de verdad ───────────────────────────────

describe('normalizarInstagram — con lo que se pega de verdad', () => {
  it('el handler usa LA función, y normalizar dos veces no mueve el @', () => {
    // 📌 Esto era «el espejo TS↔JS»: comparaba la copia del handler contra la de la app, caso por
    // caso. Ya no hay dos copias —las dos importan `lib/canjes/instagram.core.js`—, así que la
    // comparación se volvió una identidad, que es más fuerte: ningún caso de prueba puede detectar
    // una copia nueva que se escriba mañana, y `toBe` sí.
    //
    // Los 13 casos de abajo pasan a ejercer la propiedad que el `unique` del padrón necesita de
    // verdad: **normalizar es idempotente**. Si `f(f(x)) !== f(x)`, el @ guardado no vuelve a dar
    // el mismo valor al releerlo y el alta crea una ficha duplicada sin ningún error visible —que
    // es el modo de falla caro del módulo, no que las dos copias difieran.
    expect(normalizarJS).toBe(normalizarInstagram)

    const casos = [
      '@lucia.mkp',
      'Lucia.MKP',
      '  @@lucia.mkp  ',
      'https://www.instagram.com/lucia.mkp/?igsh=MzRlODBiNWFlZA==',
      'instagram.com/lucia.mkp/reel/xyz',
      'http://instagr.am/lucia.mkp',
      'lucia.mkp.', // el punto de la oración pegado
      'lucia.mkp#hola',
      'lucía.mkp', // la tilde no es parte de un @ de Instagram
      '@ana_ruiz99',
      '',
      '   ',
      '¿?¿?',
      'https://instagram.com/',
    ]
    for (const c of casos) {
      const una = normalizarInstagram(c)
      expect(normalizarInstagram(una), JSON.stringify(c)).toBe(una)
    }
  })

  it('las tres formas de pegar el mismo perfil dan el mismo @', () => {
    const esperado = 'lucia.mkp'
    expect(normalizarInstagram('@Lucia.MKP')).toBe(esperado)
    expect(normalizarInstagram('https://www.instagram.com/lucia.mkp/?igsh=abc')).toBe(esperado)
    expect(normalizarInstagram('  lucia.mkp.  ')).toBe(esperado)
  })
})

// ── El mismo canje para varias ───────────────────────────────────────────────────

describe('separarSeleccion — a quiénes se les puede proponer', () => {
  const gente = [
    { id: 1, vetada: false },
    { id: 2, vetada: true },
    { id: 3, vetada: false },
  ]

  it('las vetadas quedan afuera, pero no se pierden', () => {
    // No se descartan en silencio: la pantalla las muestra y pide confirmación, porque quien las
    // marcó tiene que enterarse de por qué de veinte salieron dieciocho.
    const { aptas, vetadas } = separarSeleccion(gente)
    expect(aptas.map((p) => p.id)).toEqual([1, 3])
    expect(vetadas.map((p) => p.id)).toEqual([2])
  })

  it('con todas vetadas no queda ninguna apta', () => {
    expect(separarSeleccion([{ id: 2, vetada: true }]).aptas).toHaveLength(0)
  })
})

describe('el resultado del lote, en criollo', () => {
  it('un canje va en singular', () => {
    expect(textoDelResultado({ creados: 1, rechazadas: 0, errores: 0 })).toBe('Se armó 1 canje.')
  })

  it('el caso normal', () => {
    expect(textoDelResultado({ creados: 18, rechazadas: 2, errores: 0 }))
      .toBe('Se armaron 18 canjes · 2 quedaron afuera.')
  })

  it('lo que falló se dice aparte de lo que se rechazó', () => {
    // No son lo mismo: una rechazada es una decisión (está vetada, debe entregables) y un error es
    // un problema nuestro. Juntarlas haría que un bug se lea como una regla de negocio.
    expect(textoDelResultado({ creados: 0, rechazadas: 1, errores: 1 }))
      .toBe('Se armaron 0 canjes · 1 quedó afuera · 1 falló.')
  })

  it('cuántas personas, con el plural puesto', () => {
    expect(cuantasPersonas(1)).toBe('1 persona')
    expect(cuantasPersonas(20)).toBe('20 personas')
  })
})

describe('TOPE_CANJES_LOTE — el espejo del tope', () => {
  it('es mucho más bajo que el de la vitrina, y a propósito', () => {
    // La vitrina son 120 en UN insert; esto son dos idas a la base POR canje. Si alguien sube este
    // número "porque el otro es 120", el lote se muere por timeout habiendo escrito la mitad.
    expect(TOPE_CANJES_LOTE).toBeLessThanOrEqual(25)
  })
})
