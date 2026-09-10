import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 🔴 **Cotizar una dirección suelta rompe, a propósito, la única regla que protege el precio: acá la
 * dirección SÍ viene del body.**
 *
 * La regla que rompe está escrita en `zonas-sugerir` y sigue siendo cierta para las filas de la
 * bandeja: *«mandarla desde el cliente abriría un camino para pedir el precio de una dirección que
 * no es la del envío — y el número que vuelve tiene cara de oficial»*. Lo que hace aceptable la
 * excepción es una sola cosa, y es estructural: **esta acción no conoce ningún envío**. No recibe
 * `id`, no lee `envios_reparto`, y lo que devuelve no tiene dónde pegarse.
 *
 * ⇒ Todo lo que estos tests cuidan es que esa frase siga siendo verdad. El día que alguien le
 * agregue un `id` «para aplicarlo directamente», la excepción deja de tener defensa y esto se pone
 * rojo.
 *
 * Texto contra texto, del molde de `envios-sugerir-handler.test.ts` y `envios-cp-alta-a-mano.test.ts`:
 * el handler corre en Node sin pasar por el compilador, y acá no se prueba comportamiento —el motor
 * ya tiene sus tests de verdad en `envios-direccion` y `envios-zonas`— sino que las dos puntas sigan
 * de acuerdo. Esta funcionalidad **no agrega ni una línea de lógica de precio**: lo único que puede
 * estar mal es el cableado.
 */

const raiz = join(__dirname, '..')
const handler = readFileSync(join(raiz, 'api/_envios.js'), 'utf8')
const pantalla = readFileSync(join(raiz, 'components/envios/Envios.tsx'), 'utf8')

/** El bloque de la acción nueva, que va ANTES de `zonas-sugerir` (ver el test de orden de abajo). */
const bloque = handler.slice(
  handler.indexOf("b.action === 'zonas-cotizar'"),
  handler.indexOf("b.action === 'zonas-sugerir'"),
)

/** El helper donde vive el orden de las dos vueltas, compartido por las dos formas de cotizar. */
const helper = handler.slice(
  handler.indexOf('async function cotizarPuntos('),
  handler.indexOf('export default async function handler'),
)

/** El panel de la pantalla. */
const panel = pantalla.slice(
  pantalla.indexOf('function CotizarDireccion('),
  pantalla.indexOf('function PropuestaDelMapa('),
)

describe('🔴 el orden de las dos vueltas, ahora en un solo lugar', () => {
  it('el helper existe (si esto falla, el test se quedó mirando un archivo que se movió)', () => {
    expect(helper).not.toBe('')
  })

  it('🔴 la segunda vuelta la decide `pedidosDelReintento`, que sí se puede afirmar', () => {
    expect(helper).toContain('pedidosDelReintento(aPreguntar, puntos)')
  })

  it('🔴 y corre DESPUÉS de la primera: al revés, el CP le pisa el punto a las que ya resolvieron', () => {
    const primera = helper.indexOf('await geocodificarEnEscalera(aPreguntar)')
    const segunda = helper.indexOf('pedidosDelReintento')
    expect(primera).toBeGreaterThan(-1)
    expect(segunda).toBeGreaterThan(primera)
  })

  it('🔴 el reintento sólo LLENA huecos, nunca pisa un punto que ya salió bien', () => {
    expect(helper).toContain('if (r && r.resultado) puntos.set(p.clave, r)')
  })
})

describe('🔴 la acción `zonas-cotizar` del handler', () => {
  it('existe', () => {
    expect(bloque).not.toBe('')
  })

  it('🔴 va ANTES de `zonas-sugerir`, o el test de la otra acción se pone a hablar de ésta', () => {
    // `envios-sugerir-handler.test.ts` recorta su bloque desde `zonas-sugerir` hasta el `return` de
    // «Acción desconocida», que es el final del handler. Cualquier acción puesta después queda
    // adentro de ese recorte: no falla hoy, falla en falso mañana.
    expect(handler.indexOf("b.action === 'zonas-cotizar'")).toBeLessThan(
      handler.indexOf("b.action === 'zonas-sugerir'"),
    )
  })

  it('🔴 no recibe ningún envío: no hay `id` al que el precio pueda quedar pegado', () => {
    // Es la defensa entera de la excepción. Sin esto, la acción se convierte en «cotizame esta otra
    // dirección y aplicámelo a ese envío», que es exactamente lo que `zonas-sugerir` cierra.
    expect(bloque).not.toMatch(/\bb\.ids?\b/)
  })

  it('🔴 no toca la tabla de envíos, ni para leerla', () => {
    expect(bloque).not.toContain("from('envios_reparto')")
  })

  it('🔴 no escribe NADA: el único `select` es al mapa', () => {
    expect(bloque).not.toMatch(/\.(insert|update|upsert|delete)\(/)
    expect(bloque).toContain("from('envios_zonas')")
  })

  it('🔴 el código postal entra al candado: sin él afloja y no falla nada', () => {
    // Mismo modo de falla que la columna faltante en el `select` de `zonas-sugerir`, y que `cobrado`
    // antes: el candado lee `undefined` como «esta dirección no tiene CP» y vuelven los precios de la
    // zona de al lado, con 200 y con cara de buenos.
    expect(bloque).toMatch(/consultaDe\(\{[^}]*\bcp\b/)
  })

  it('🔴 delega las vueltas en `cotizarPuntos`: no hay una segunda copia del orden', () => {
    expect(bloque).toContain('cotizarPuntos(')
    expect(bloque).not.toContain('geocodificarEnEscalera(')
    expect(bloque).not.toContain('pedidosDelReintento(')
  })

  it('🔴 la provincia va escrita y clavada: la moto reparte en Santa Fe', () => {
    // `geocodificarEnEscalera` la exige. Si saliera del body, «Avellaneda 3200» resolvería en la
    // provincia que pida quien llama, y Georef contesta un punto plausible en vez de un error.
    expect(bloque).toContain("provincia: 'Santa Fe'")
  })

  it('🔴 sin localidad no pregunta, y lo dice: es lo que separa Funes de Rosario', () => {
    expect(bloque).toMatch(/if \(!localidad\)/)
  })

  it('🔴 el texto largo se RECHAZA, nunca se recorta', () => {
    // Truncar cotiza una dirección que no es la que se pidió, y contesta 200.
    expect(bloque).toMatch(/direccion\.length > \d+/)
    expect(bloque).not.toMatch(/direccion[^\n]*\.slice\(0,/)
  })

  it('🔴 sin zonas cargadas avisa, en vez de decir «fuera del mapa» a todo Rosario', () => {
    expect(bloque).toContain('Todavía no hay zonas cargadas')
  })

  it('🔴 el motivo se arma con los dos nombres puestos', () => {
    // «no coinciden» no se puede trabajar; «el CP dice VGG y la dirección dice Rosario» se resuelve
    // en diez segundos. Por eso `motivoDeSugerencia` va con la consulta entera, no con el estado solo.
    expect(bloque).toContain('motivoDeSugerencia(c.estado, c)')
    expect(bloque).not.toContain('MOTIVO_SUGERENCIA[c.estado]')
  })

  it('🔴 lo que devuelve NO tiene `id`: esa ausencia es la garantía, no un descuido', () => {
    expect(bloque).toMatch(/const \{ clave, \.\.\.cotizacion \}/)
    expect(bloque).toContain('{ ok: true, cotizacion }')
  })
})

describe('🔴 el panel de la pantalla', () => {
  it('existe y vive en `Envios`, no adentro de `Pendientes`', () => {
    expect(panel).not.toBe('')
    // `Pendientes` se reemplaza entero por el `EmptyState` cuando no hay filas, y la bandeja vacía
    // es justo cuando más se cotiza: la clienta que pregunta antes de que exista el pedido.
    const bandeja = pantalla.slice(pantalla.indexOf('function Pendientes('), pantalla.indexOf('function SugerirPrecios('))
    expect(bandeja).not.toContain('CotizarDireccion')
    expect(pantalla).toContain('<CotizarDireccion')
  })

  it('🔴 «cargar este envío» siembra la dirección, la localidad y el CP', () => {
    // Sin esto la ficha se abre vacía: se ve casi igual y obliga a retipear lo que está en pantalla,
    // que es el paso donde se pierde un dígito. Y el CP nulo apaga el candado de la fila nueva.
    expect(panel).toContain('envioNuevoAMano(')
    expect(panel).toMatch(/direccion,\s*localidad,\s*cp: cp \|\| null/)
    // 🔴 Y que el botón la LLAME. Afirmar que la función existe no alcanza: dejarla escrita y
    // colgar del botón otra cosa que abra la ficha vacía deja este archivo igual de lleno y la
    // pantalla igual de rota. Sobrevivió el mutante que hacía exactamente eso.
    expect(panel).toMatch(/onClick=\{cargar\}[\s\S]{0,80}cargar este envío/)
  })

  it('🔴 el precio se siembra SÓLO si el mapa lo propuso, y nunca como cero', () => {
    // `monto_envio: 0` no significa «no se cobra» en ningún lado de esta sección: sembrar un cero es
    // sembrar un envío bonificado que nadie decidió. Se mira el CUERPO de `cargar`, no el panel
    // entero: el comentario que explica esto nombra el cero, y un test que lea comentarios afirma
    // sobre la prosa en vez de sobre el código.
    const cargar = panel.slice(panel.indexOf('function cargar()'), panel.indexOf('if (!abierto)'))
    expect(cargar).not.toBe('')
    expect(cargar).toMatch(/estado === 'sugerido' && cotizacion\.precio != null/)
    expect(cargar).toMatch(/sugerido \? \{ monto_envio:/)
    expect(cargar).not.toMatch(/monto_envio: 0/)
  })

  it('🔴 sin precio muestra el motivo y NADA más: sin número a medias, sin «aproximado»', () => {
    const sinPrecio = panel.slice(panel.indexOf('el mapa no propone'))
    expect(panel).toContain('el mapa no propone')
    expect(sinPrecio).not.toContain('formatMoney')
  })

  it('🔴 muestra qué dirección entendió el mapa, y a la vista', () => {
    // En la bandeja `encontrado` vive en un `title` porque hay una fila por clienta y no entra. Acá
    // no hay ninguna fila de la base contra la cual contrastar el número, así que es lo único que
    // permite cazar que Georef entendió otra calle.
    expect(panel).toContain('cotizacion?.encontrado')
    expect(panel).toContain('El mapa entendió')
  })

  it('🔴 después de cargar salta a «Sin fecha», que es donde el envío realmente queda', () => {
    // Nace sin fecha: cargado desde la hoja del día, el guardado sale bien y parece que no pasó nada.
    const montaje = pantalla.slice(pantalla.indexOf('<CotizarDireccion'), pantalla.indexOf("{pestania === 'zonas' ?"))
    expect(montaje).toContain("setPestania('pendientes')")
  })

  it('no llama a la acción de la bandeja: son dos caminos distintos a propósito', () => {
    expect(panel).not.toContain('sugerirPrecios(')
    expect(panel).toContain('cotizarDireccion(')
  })
})
