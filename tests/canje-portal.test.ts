import { describe, it, expect } from 'vitest'
// Handler JS de api/: se importan sólo las funciones puras, sin tocar Supabase.
import { paraLaPersona, camposDeLaPersona } from '@/api/_canje-portal.js'

/**
 * El portal de la creadora es **lo único de Canjes abierto a internet**: se entra con un token, sin
 * sesión, desde un celular.
 *
 * `paraLaPersona` es la última barrera antes de que algo salga, y acá lo que hay del otro lado es
 * peor que en un reclamo: el canje sabe cuánto costó, con qué firma se aprobó, cuánto se le pagó y
 * —en la ficha— si está vetada y por qué. Que nada de eso viaje es el punto de este archivo, porque
 * un campo de más no rompe ninguna pantalla: simplemente se filtra, en silencio, hacia afuera.
 *
 * `camposDeLaPersona` es la barrera del otro sentido: lo único que ella puede escribir.
 */

/** Un canje como sale de la base, con todo lo que NO puede salir. */
const CANJE = {
  id: 42,
  store: 'zattia',
  estado: 'acuerdo',
  persona_id: 7,
  token: 'a'.repeat(64),
  token_vence: '2026-09-10T00:00:00Z',
  datos_confirmados_at: null,
  envio_estado: 'pendiente',
  entregado_at: null,
  // Nada de esto puede llegarle:
  monto_plata: 150000,
  tope_pvp: 80000,
  aprobacion_nivel: 'aprobar-plata',
  aprobado_por: 'Bruno',
  balance_costo_total: 34210,
  balance_cpm: 812,
  balance_puntaje_manual: 4,
  balance_nota: 'floja de interacción',
  envio_costo: 9500,
  gn_venta_number: '998877',
  tn_orden: '20700',
}

/** Su ficha, con los juicios internos adentro. */
const PERSONA = {
  id: 7,
  nombre: 'Lucía',
  apellido: 'Méndez',
  telefono: '1155550000',
  email: 'lu@mail.com',
  dni: '38111222',
  calle: 'Av. Siempreviva',
  numero: '742',
  piso: '3',
  depto: 'B',
  cp: '1425',
  localidad: 'Palermo',
  provincia: 'CABA',
  direccion_nota: 'portero eléctrico',
  talles: { remera: 'M', pantalon: '38', calzado: '39' },
  modelo_celular: 'iPhone 13',
  // Nada de esto puede llegarle:
  vetada: true,
  vetada_motivo: 'no cumplió dos veces seguidas',
  destacada_nota: 'la mejor conversión del año',
  seguidores_ig: 41200,
  cadencia_dias: 90,
  notas: [{ texto: 'pidió plata de más', at: '2026-07-01T00:00:00Z' }],
  historial: [{ at: '2026-07-01T00:00:00Z', usuario: 'Bruno' }],
}

describe('lo que ve la creadora en el link público', () => {
  const salida = paraLaPersona(CANJE, PERSONA, { drive_url: 'https://drive.google.com/x' })
  const json = JSON.stringify(salida)

  it('trae sus propios datos, prellenados', () => {
    expect(salida.numero).toBe('C-0042') // derivado del id 42
    expect(salida.marca).toBe('Zattia')
    expect(salida.datos.calle).toBe('Av. Siempreviva')
    expect(salida.datos.dni).toBe('38111222')
    // 🔴 La carpeta de Drive de la marca **no viaja** (21-ago-2026). Es el archivo interno del
    // equipo y esto es un portal abierto a internet: el `json` de abajo lo vuelve a chequear.
    expect(json).not.toContain('drive.google.com')
  })

  // El corazón del test: la plata y el juicio interno no salen a internet.
  it.each([
    ['lo que se le paga', '150000'],
    ['el tope acordado', '80000'],
    ['el costo del canje', '34210'],
    ['el CPM', '812'],
    ['el puntaje que le pusimos', 'floja de interacción'],
    ['el costo del envío', '9500'],
    ['con qué firma se aprobó', 'aprobar-plata'],
    ['quién lo aprobó', 'Bruno'],
    ['el id de la venta en GN', '998877'],
    ['el número de orden de TN', '20700'],
    ['el propio token', 'aaaaaaaa'],
  ])('no filtra %s', (_que, valor) => {
    expect(json).not.toContain(valor)
  })

  it('tampoco filtra que está vetada, ni las notas internas, ni los seguidores', () => {
    expect(json).not.toContain('vetada')
    expect(json).not.toContain('no cumplió')
    expect(json).not.toContain('la mejor conversión')
    expect(json).not.toContain('41200')
    expect(json).not.toContain('pidió plata de más')
  })

  it('pide talles en Zattia y en Stunned, y el modelo del celular en BDI', () => {
    expect(salida.pide).toBe('talles')
    expect(salida.datos.talles).toEqual({ remera: 'M', pantalon: '38', calzado: '39' })
    // El modelo existe en la ficha, pero un canje de Zattia no se lo muestra: pedirle datos que no
    // le sirven a nadie es la forma más barata de que abandone el formulario.
    expect(salida.datos.modelo_celular).toBeUndefined()

    const stunned = paraLaPersona({ ...CANJE, store: 'stunned' }, PERSONA, null)
    expect(stunned.pide).toBe('talles')
    expect(stunned.marca).toBe('Stunned')

    const bdi = paraLaPersona({ ...CANJE, store: 'bdi' }, PERSONA, null)
    expect(bdi.pide).toBe('modelo_celular')
    expect(bdi.datos.modelo_celular).toBe('iPhone 13')
    expect(bdi.datos.talles).toBeUndefined()
  })

  it('avisa que ya salió el pedido por cualquiera de los tres caminos', () => {
    expect(salida.despachado).toBe(false)
    expect(paraLaPersona({ ...CANJE, envio_estado: 'hecho' }, PERSONA, null).despachado).toBe(true)
    expect(paraLaPersona({ ...CANJE, entregado_at: '2026-08-01T00:00:00Z' }, PERSONA, null).despachado).toBe(true)
    expect(paraLaPersona({ ...CANJE, estado: 'en_curso' }, PERSONA, null).despachado).toBe(true)
  })

  it('mientras no salió, no manda ningún envío', () => {
    // Un bloque de envío vacío en su pantalla se lee como un error del sistema, no como "todavía
    // no salió".
    expect(salida.envio).toBeNull()
  })

  it('una vez despachado le dice por dónde va, con el link al correo', () => {
    const e = paraLaPersona(
      { ...CANJE, envio_estado: 'hecho', envio_via: 'correo', envio_seguimiento: '1234' },
      PERSONA, null,
    ).envio!
    expect(e.via).toBe('Correo Argentino')
    expect(e.seguimiento).toBe('1234')
    // El link se arma en el SERVIDOR: el portal es público y no puede arrastrar
    // `lib/reclamos/tipos.ts` al bundle que se descarga un teléfono.
    expect(e.trackingUrl).toContain('correoargentino')
    expect(e.trackingUrl).toContain('1234')
  })

  it('de los intentos de entrega sale la fecha y NADA más', () => {
    // La nota es un juicio interno sobre lo que pasó ("no había nadie") y en su pantalla se leería
    // como un reproche. Y el usuario es alguien del equipo, que no es asunto suyo.
    const e = paraLaPersona(
      {
        ...CANJE,
        envio_estado: 'hecho',
        envio_via: 'cadete',
        intentos: [{ at: '2026-08-01T10:00:00Z', nota: 'no había nadie', usuario: 'Bruno' }],
      },
      PERSONA, null,
    ).envio!
    expect(e.intentos).toEqual([{ at: '2026-08-01T10:00:00Z' }])
    expect(JSON.stringify(e)).not.toContain('no había nadie')
    expect(JSON.stringify(e)).not.toContain('Bruno')
    // Sin código no hay link: mandarle uno que no funciona es peor que no mandarlo.
    expect(e.trackingUrl).toBeNull()
  })

  it('sin ficha ni config no rompe: abre el formulario vacío', () => {
    const vacio = paraLaPersona({ id: 1, store: 'bdi', estado: 'acuerdo' }, null, null)
    expect(vacio.datos.calle).toBeNull()
    expect(vacio.datos.modelo_celular).toBeNull()
    expect(JSON.stringify(vacio)).not.toContain('drive')
  })
})

describe('lo que la creadora puede escribir', () => {
  const COMPLETO = {
    nombre: 'Lucía', apellido: 'Méndez', telefono: '1155550000', email: 'lu@mail.com',
    dni: '38111222', calle: 'Av. Siempreviva', numero: '742', piso: '3', depto: 'B',
    cp: '1425', localidad: 'Palermo', provincia: 'CABA', direccion_nota: 'portero',
    talles: { remera: 'M', pantalon: '', calzado: '' },
  }

  it('acepta el formulario completo', () => {
    const { campos = {}, error } = camposDeLaPersona(COMPLETO, 'zattia')
    expect(error).toBeUndefined()
    expect(campos.calle).toBe('Av. Siempreviva')
    expect(campos.talles).toEqual({ remera: 'M', pantalon: null, calzado: null })
  })

  // Lo importante no es que valide, es que NO pueda tocar nada más. Un campo de más acá sería que
  // ella se desvete sola.
  it('ignora todo lo que no sea suyo', () => {
    const { campos = {} } = camposDeLaPersona(
      { ...COMPLETO, vetada: false, vetada_motivo: null, seguidores_ig: 999999, destacada: true, id: 1, instagram: 'otra' },
      'zattia',
    )
    expect(campos).not.toHaveProperty('vetada')
    expect(campos).not.toHaveProperty('vetada_motivo')
    expect(campos).not.toHaveProperty('seguidores_ig')
    expect(campos).not.toHaveProperty('destacada')
    expect(campos).not.toHaveProperty('id')
    expect(campos).not.toHaveProperty('instagram')
  })

  it('no deja mandar el dato de la otra marca', () => {
    // Un canje de Zattia no puede escribirle el modelo de celular, ni uno de BDI los talles: el
    // formulario ni siquiera se lo mostró.
    expect(camposDeLaPersona({ ...COMPLETO, modelo_celular: 'iPhone 15' }, 'zattia').campos ?? {})
      .not.toHaveProperty('modelo_celular')
    expect(camposDeLaPersona({ nombre: 'Lu', modelo_celular: 'iPhone 15', talles: { remera: 'XL' } }, 'bdi').campos ?? {})
      .not.toHaveProperty('talles')
  })

  it.each([
    ['el nombre', { nombre: '' }, 'tu nombre'],
    // Los dos que salen impresos en la etiqueta. El apellido pasó a obligatorio cuando el
    // formulario dejó de prellenarlos: lo que había en la ficha lo tipeó el equipo al darla de
    // alta, y un error de ahí volvía el paquete.
    ['el apellido', { apellido: '' }, 'tu apellido'],
    ['el teléfono', { telefono: '  ' }, 'tu teléfono'],
    // El email no va a la orden de Tienda Nube (esa lleva el de la marca): queda en el padrón y es
    // con lo que se la vuelve a contactar. Por eso pasó a obligatorio.
    ['el email', { email: '' }, 'tu email'],
    ['el DNI', { dni: '' }, 'tu DNI'],
    ['la altura', { numero: '' }, 'la altura'],
    ['el código postal', { cp: '' }, 'el código postal'],
    ['la provincia', { provincia: '' }, 'la provincia'],
  ])('avisa en criollo si falta %s', (_que, parche, esperado) => {
    const { error } = camposDeLaPersona({ ...COMPLETO, ...parche }, 'zattia')
    expect(error).toContain(esperado)
  })

  // La presencia sola no alcanza: un `lumail.com` pasa el "no está vacío" y deja el único dato de
  // contacto tan inservible como si no lo hubiera cargado, pero sin que nadie se entere.
  it.each(['lumail.com', 'lu@mail', 'lu @mail.com', '@mail.com'])(
    'rebota el email mal escrito (%s)',
    (email) => {
      expect(camposDeLaPersona({ ...COMPLETO, email }, 'zattia').error).toContain('Revisá el email')
    },
  )

  // El chequeo es a propósito mínimo: validar direcciones de verdad es imposible y lo único que se
  // lograría es rebotar a alguien con un mail raro pero perfectamente válido.
  it.each(['lu+canjes@mail.com.ar', 'lu.mendez@sub.dominio.io', "o'hara@mail.com"])(
    'deja pasar el email raro pero válido (%s)',
    (email) => {
      expect(camposDeLaPersona({ ...COMPLETO, email }, 'zattia').error).toBeUndefined()
    },
  )

  it('junta los faltantes en una sola frase, bien conjugada', () => {
    const { error } = camposDeLaPersona({ ...COMPLETO, cp: '', localidad: '' }, 'zattia')
    expect(error).toBe('Nos falta el código postal y la localidad.')
  })

  // Con vitrina, el formulario NO dibuja "Tu celular" ni "Tus talles" —ya lo dijo eligiendo la
  // variante— y por eso la clave no viaja. El servidor tiene que dejarla guardar igual: exige el
  // dato sólo si la clave vino.
  it('con vitrina, guardar sin el dato de la ficha no da error', () => {
    const { apellido, nombre, telefono, dni, calle, numero, cp, localidad, provincia } = COMPLETO
    const sinFicha = { apellido, nombre, telefono, dni, calle, numero, cp, localidad, provincia }
    expect(camposDeLaPersona(sinFicha, 'bdi').error).toBeUndefined()
    expect(camposDeLaPersona(sinFicha, 'zattia').error).toBeUndefined()
  })

  it('exige al menos un talle, y el modelo del celular en BDI', () => {
    expect(camposDeLaPersona({ ...COMPLETO, talles: { remera: '', pantalon: '', calzado: '' } }, 'zattia').error)
      .toContain('al menos un talle')
    expect(camposDeLaPersona({ nombre: 'Lu', modelo_celular: '' }, 'bdi').error)
      .toContain('modelo de tu celular')
  })

  // Una clave ausente no borra lo que el equipo ya había cargado.
  it('sólo escribe lo que vino: lo ausente no se pisa', () => {
    const { campos = {}, error } = camposDeLaPersona({ telefono: '1122334455' }, 'zattia')
    expect(error).toBeUndefined()
    expect(Object.keys(campos)).toEqual(['telefono'])
  })

  it('recorta lo largo y normaliza el vacío a null', () => {
    const { campos = {} } = camposDeLaPersona({ direccion_nota: 'x'.repeat(500), piso: '   ' }, 'zattia')
    expect(campos.direccion_nota).toHaveLength(300)
    expect(campos.piso).toBeNull()
  })

  it('un body vacío o basura no escribe nada', () => {
    expect(camposDeLaPersona({}, 'zattia').error).toBe('No llegó ningún dato.')
    expect(camposDeLaPersona(null, 'zattia').error).toBe('No llegó ningún dato.')
  })
})
