import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 🔴 **`VOCABULARIO.md` es el glosario compartido con MAKETA, y este test es lo único que impide
 * que «Borrar» y «Quitar» vuelvan solas.** (28-ago-2026, pasada de Bruno.)
 *
 * 🔑 **Lo que se clava es la REGLA y ⛔ no la lista de botones.** Un `grep` a mano encuentra el
 * renglón de hoy; lo que hace falta es que el renglón de dentro de tres semanas —escrito por alguien
 * que no leyó el glosario— caiga acá solo. Nada más lo mira: un botón que dice «Borrar» compila
 * perfecto, pasa el lint y no rompe ningún otro test.
 *
 * 🔑 **Cómo distingue el texto del código, sin una lista de excepciones que se llena de renglones**:
 * se sacan los comentarios y después se juntan **todos los identificadores** que llevan la raíz
 * prohibida. Un símbolo de código es un identificador; una frase de pantalla también parte en
 * identificadores (`Borrar`, `borrarla`, `quitan`), y por eso **cualquiera de las dos cosas nuevas
 * rompe esto**: un texto nuevo, porque no está en la lista; una función nueva `borrarX`, porque
 * tampoco — y ahí quien la escribe agrega el nombre a mano, que es deliberado y de una línea.
 *
 * ⛔ **Los comentarios quedan afuera a propósito**: cuentan la historia («decía Borrar y estaba
 * mal») y esa historia no se puede reescribir sin perderla.
 *
 * ⚠️ **Lo que este test NO puede ver**: que la palabra elegida sea la CORRECTA. `Eliminar` y `Sacar`
 * se deciden con *¿la cosa sigue existiendo después?*, y eso se lee en la acción, no en el texto.
 */

/** Las carpetas donde vive lo que una persona lee: las pantallas y los núcleos que ARMAN texto. */
const DONDE = ['app', 'components', 'lib']

/** Las raíces que ⛔ no pueden aparecer en una frase de pantalla. */
const RAICES = ['borr', 'quit', 'remov']

/**
 * **Los símbolos del código que llevan una raíz prohibida, y ninguno es texto.**
 * ⚠️ Si agregás uno, agregalo acá; si lo que agregaste es una palabra de pantalla, la palabra es
 * **Eliminar** (deja de existir) o **Sacar** (sigue existiendo en otro lado).
 *
 * 🏁 **29-ago: `Borrar` y `Quitar` a secas SALIERON de esta lista, y era la deuda escrita acá.**
 * Eran a la vez un símbolo posible y una palabra de pantalla, así que un `<button>Borrar</button>`
 * nuevo pasaba de largo. Se cerró sin renombrar nada: los dos últimos usos vivos eran **texto** —
 * «Borrar … de esta computadora» y «Quitar el elegido» de Diseños—, y con ellos arreglados la
 * lista quedó **sólo con nombres que ninguna pantalla podría decir**, que es la condición para que
 * defienda algo.
 * 🔑 **Y lo cazó el test de al lado, no una revisión**: una lista de excepciones sólo defiende si se
 * vacía sola cuando lo que excusaba se fue.
 */
const SIMBOLOS = new Set([
  'Borrador',
  'Borradores',
  'MOTIVOS_QUITAR_ITEM',
  'Quitados',
  'alBorrar',
  // Los tres helpers del borrador de una parada del PRM (`components/recorridas/Parada.tsx`).
  // Ninguna pantalla podría decirlos: son camelCase y nombran el acceso a `localStorage`.
  'borrarBorrador',
  'guardarBorrador',
  'leerBorrador',
  'bloqueoBorrado',
  'bloqueoQuitarItem',
  'borr',
  'borra',
  'borrado',
  'borrador',
  'borradores',
  'borrados',
  'borramos',
  'borrando',
  'borrar',
  'borrarArchivo',
  'borrarCampania',
  'borrarCanje',
  'borrarCondiciones',
  'borrarContenido',
  'borrarDeBlob',
  'borrarDiseno',
  'borrarEnvio',
  'borrarEvidencia',
  'borrarGrupo',
  'borrarHito',
  'borrarIdea',
  'borrarInforme',
  'borrarInsumo',
  'borrarItem',
  'borrarLocales',
  'borrarManual',
  'borrarMensaje',
  'borrarMeta',
  'borrarMovimiento',
  'borrarNodo',
  'borrarNota',
  'borrarNotaCanje',
  'borrarNovedad',
  'borrarPedido',
  'borrarPersona',
  'borrarPromo',
  'borrarResp',
  'borrarRonda',
  'borrarSesion',
  'borrarSolicitud',
  'borrarVitrina',
  'borrarZona',
  'borrarlas',
  'esBorrador',
  'guardarBorrador',
  'okBorrar',
  'onBorrada',
  'onBorrar',
  'onBorrarItem',
  'onQuitar',
  'onQuitarItem',
  'pedirBorrar',
  'pedirBorrarGrupo',
  'pedirBorrarMensaje',
  'puedeBorrar',
  'puedeQuitar',
  'quitado',
  'quitados',
  'quitar',
  'quitarBloque',
  'quitarDiseno',
  'quitarElegidos',
  'quitarEntregable',
  'quitarError',
  'quitarFoto',
  'quitarGaleria',
  'quitarGrupo',
  'quitarHallazgo',
  'quitarIngreso',
  'quitarItem',
  'quitarLinea',
  'quitarLote',
  'quitarManual',
  'quitarModelo',
  'quitarNota',
  'quitarPendiente',
  'quitarProd',
  'quitarSale',
  'remove',
  'removeAttribute',
  'removeEventListener',
  'removeForma',
  'removeItem',
  'setBorrador',
  'setBorrando',
  'total_quitados',
  'useBorrarPersona',
])

/**
 * **Las pantallas donde algo deja de existir**, y por lo tanto tienen que decir la palabra.
 *
 * 🔴 🔑 **Sin esto el test de arriba se cumple perfecto en una app SIN NINGÚN BOTÓN**: «cero borrar»
 * es lo que contesta una pantalla vacía. El cero afirma, así que hay que decir contra qué.
 * ⚠️ **Y es una lista de archivos y no un total.** Un piso de «treinta en todo `components`» deja que
 * una pantalla entera se quede sin la palabra sin que nada falle.
 */
const QUE_ELIMINAN = [
  // ⚠️ La Agenda se partió en seis pantallas el 29-ago-2026: el gesto de eliminar se fue de
  // `Agenda.tsx` —que hoy sólo elige cuál montar— a las dos que administran algo.
  'components/agenda/Eventos.tsx',
  'components/agenda/Rutinas.tsx',
  'components/atencion/Atencion.tsx',
  'components/buzon/Buzon.tsx',
  'components/canjes/BloqueEntregables.tsx',
  'components/canjes/ContenidoDeElla.tsx',
  'components/canjes/FichaCanje.tsx',
  'components/canjes/FichaPersona.tsx',
  'components/canjes/NotasCanje.tsx',
  'components/comisiones/Comisiones.tsx',
  'components/conteo-deposito/ConteoDeposito.tsx',
  'components/conteo-estandar/ConteoEstandar.tsx',
  'components/crm/Leads.tsx',
  'components/cupones/ListaCupones.tsx',
  'components/disenos/Disenos.tsx',
  'components/disenos/VotacionPanel.tsx',
  'components/envios/Envios.tsx',
  'components/envios/ZonasDeReparto.tsx',
  'components/etiquetas/Etiquetas.tsx',
  'components/exhib/Exhib.tsx',
  'components/ingresos/Ingresos.tsx',
  'components/insumos/FichaInsumo.tsx',
  'components/liquidacion/DefinirPrecio.tsx',
  'components/liquidacion/Liquidacion.tsx',
  'components/liquidacion/Resultado.tsx',
  'components/manuales/Manuales.tsx',
  'components/meta-ads/TableroIdeas.tsx',
  'components/meta-ads/informes/Informes.tsx',
  'components/novedades/Novedades.tsx',
  'components/pedidos-clientes/PedidosClientes.tsx',
  'components/postventa/Postventa.tsx',
  'components/reclamos/ArmarCambio.tsx',
  'components/reclamos/Reclamos.tsx',
  'components/sesionfotos/SesionFotos.tsx',
  'components/ubicaciones/Ubicaciones.tsx',
  'components/usuarios/Usuarios.tsx',
] as const

/**
 * Saca los comentarios de bloque y de línea.
 * ⚠️ Es un barrido y no un parser: no entiende que `'//'` adentro de un string es un string. Alcanza
 * porque lo único que se le pregunta después es qué identificadores quedaron.
 */
function sinComentarios(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    if (src.startsWith('/*', i)) {
      const j = src.indexOf('*/', i + 2)
      i = j === -1 ? src.length : j + 2
    } else if (src.startsWith('//', i)) {
      const j = src.indexOf('\n', i)
      i = j === -1 ? src.length : j
    } else {
      out += src[i]
      i += 1
    }
  }
  return out
}

function archivos(dir: string): string[] {
  const salida: string[] = []
  for (const entrada of readdirSync(dir)) {
    const p = join(dir, entrada)
    if (statSync(p).isDirectory()) salida.push(...archivos(p))
    else if (p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js')) salida.push(p)
  }
  return salida
}

/** Cada identificador con una raíz prohibida, con el archivo y el renglón donde apareció. */
function conRaizProhibida(): { token: string; donde: string }[] {
  const encontrados: { token: string; donde: string }[] = []
  for (const raiz of DONDE) {
    for (const p of archivos(raiz)) {
      const limpio = sinComentarios(readFileSync(p, 'utf8'))
      limpio.split('\n').forEach((linea, k) => {
        for (const t of linea.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []) {
          const l = t.toLowerCase()
          if (RAICES.some((r) => l.includes(r))) encontrados.push({ token: t, donde: `${p}:${k + 1}` })
        }
      })
    }
  }
  return encontrados
}

describe('«Borrar» y «Quitar» no vuelven solas a la pantalla — VOCABULARIO.md', () => {
  it('todo lo que lleva una raíz prohibida fuera de un comentario es un símbolo del código', () => {
    const intrusos = conRaizProhibida().filter((x) => !SIMBOLOS.has(x.token))
    // El mensaje nombra el renglón: quien lo rompa tiene que arreglarlo sin leer este archivo.
    expect(intrusos.map((x) => `${x.donde} → ${x.token}`)).toEqual([])
  })

  it('y la lista de símbolos no tiene nombres de más, que se leerían como permiso', () => {
    // 🔑 Al revés que el de arriba: un símbolo que ya no existe deja la puerta abierta para que
    // mañana alguien escriba **ese texto** y pase. Una lista de excepciones sólo defiende si se
    // vacía sola cuando lo que excusaba se fue.
    const vivos = new Set(conRaizProhibida().map((x) => x.token))
    expect([...SIMBOLOS].filter((s) => !vivos.has(s))).toEqual([])
  })

  it('las pantallas que hacen desaparecer algo dicen «Eliminar»', () => {
    const sinLaPalabra = [...QUE_ELIMINAN].filter(
      (p) => !/[Ee]limina/.test(sinComentarios(readFileSync(p, 'utf8'))),
    )
    expect(sinLaPalabra).toEqual([])
  })
})

/**
 * 🔴 **Las SEIS familias de `VOCABULARIO.md`, y no sólo la de eliminar.** Hasta el 29-ago acá se
 * miraban las tres raíces de §1.1 y nada más; las otras cinco familias estaban escritas en el
 * glosario y ⛔ nada las frenaba. 📌 [[feedback_areben_invariante_escrito_no_frena]].
 * 🔑 **Es el MISMO bloque que `areben-marketing`, byte a byte salvo los números medidos.** Se puede
 * porque ⛔ no parsea etiquetas: acá los botones son `<Button>` y las cabeceras `<Th>`, allá
 * `<Boton>` y `<th>`, y al extractor le da igual. Lo único distinto es el piso y la lista de
 * pantallas que tienen que aportar rótulos.
 *
 * 🔑 **Lo que se mira es el NOMBRE DEL GESTO, ⛔ no toda la prosa, y ésa es la lección cara del
 * monitor**: allá la regla de `Mandar` prohibía la palabra y hubo que corregirla porque de 99
 * apariciones **sólo 17 nombraban un gesto** —«Te mandamos la etiqueta» es castellano, y «el corte
 * que manda» es *gobernar*—. Lo mismo pasa acá con `poner` («Ponele un título», que es pedirle un
 * valor a un campo y ⛔ no meter algo en una lista) y con `sumar` («el alcance no se puede sumar»,
 * que es aritmética). ⇒ se leen **los envoltorios donde vive un rótulo** (`<button>`, `<Boton>`,
 * `<summary>`, `<label>`, `<option>`, `<th>`, los títulos) y **los atributos que son texto**
 * (`aria-label`, `title`, `placeholder`, `titulo`, `etiqueta`, `rotulo`). Ahí una palabra ⛔ no
 * tiene otro sentido posible.
 *
 * ⚠️ **Lo que esto NO puede ver**: que la palabra elegida sea la CORRECTA. `Crear` y `Agregar` se
 * deciden con *¿de dónde viene la cosa?*, y eso se lee en la acción, no en el rótulo.
 */
/**
 * 🔑 **El extractor de rótulos vive acá arriba porque lo usan DOS bloques** —las seis familias y
 * el infinitivo de §3—, y dos copias de un helper es exactamente el defecto que este repo ya pagó:
 * cada test mirando la suya, los dos en verde.
 */
const TEXTO_JSX = />([^<>{}]*[A-Za-zÁÉÍÓÚÑáéíóúñ][^<>{}]*)</g
const ATRIBUTOS =
  /\b(aria-label|title|placeholder|titulo|etiqueta|rotulo|ok|label)\s*=\s*(?:(["'])((?:\\.|(?!\2)[^\\])*?)\2|\{`([^`]*)`\})/g

/** Hasta cinco palabras: «Agregar un intento de entrega» son cinco, y es el rótulo más largo que hay. */
const TOPE_PALABRAS = 5

function esRotulo(t: string): boolean {
  return (
    t !== '' &&
    /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(t) &&
    t.split(' ').length <= TOPE_PALABRAS &&
    // ⛔ Y lo que huele a código no es un rótulo: `borrar(clave: string): Promise` vive entre un
    // `>` y un `<` porque el `<` es el de `Promise<…>`.
    !/[():;=]/.test(t)
  )
}

function rotulos(src: string): string[] {
  const salida: string[] = []
  for (const m of src.matchAll(TEXTO_JSX)) {
    const t = m[1].replace(/\s+/g, ' ').trim()
    if (esRotulo(t)) salida.push(t)
  }
  for (const m of src.matchAll(ATRIBUTOS)) {
    const t = (m[3] ?? m[4] ?? '').replace(/\$\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim()
    if (esRotulo(t)) salida.push(t)
  }
  return salida
}

describe('las seis familias, en el nombre de cada gesto — VOCABULARIO.md', () => {
  /**
   * 🔴 **Un rótulo es UN TEXTO CORTO, y ésa es toda la definición.** La primera versión de esto
   * parseaba las etiquetas —`<button>`, `<Button>`, `<label>`…— contando llaves a mano para saltarse
   * el `>` que vive adentro de `onClick={() => x()}`, y **tenía un punto ciego que dejó vivo a un
   * mutante**: un `<Button>` con `onClick={async () => { try { … } catch { … } }}` pasa de tres
   * niveles de llaves y el regex ⛔ no lo matchea, así que su rótulo desaparecía. 📌 Medido el 29-ago
   * en el monitor: devolver un «Sumar» a `components/canjes/BloqueEntregables.tsx` **no puso nada en
   * rojo** — y ésos son justo los botones que escriben.
   *
   * ⇒ **No se parsea nada.** Se toma **todo el texto JSX** (lo que hay entre un `>` y un `<`, sin
   * llaves ni ángulos adentro) más **los atributos que son texto**, y de ahí se queda **sólo lo que
   * puede ser un rótulo**: hasta cinco palabras y sin `(`, `:`, `;` ni `=`.
   *
   * 🔑 **El tope de palabras es lo que separa el ROTULO de la PROSA, y por eso la regla puede ser de
   * la palabra.** Es la lección de `Mandar` —de 99 apariciones sólo 17 nombraban un gesto— resuelta
   * con una medida en vez de una lista de excepciones: *«el alcance no se puede sumar entre piezas»*
   * y *«Te mandamos la etiqueta»* son prosa y ⛔ no entran; «Agregar otra línea» y «Enviar a Drive»
   * sí. ⚠️ **Una frase corta de prosa se va a colar de vez en cuando**: se arregla escribiéndola
   * mejor, que es lo que pasó las cuatro veces que apareció.
   */
  /** Las palabras que ⛔ no nombran un gesto, familia por familia. Cada una con su reemplazo. */
  const FAMILIAS: readonly { familia: string; prohibidas: RegExp; enSuLugar: string }[] = [
    {
      familia: '§1.3 lo que entra a una lista',
      // 🔴 `traer` entró el 30-ago-2026, y con la medición delante: **20 rótulos en 11 secciones y
      // los 20 eran el mismo gesto** —el stock de GN, las ventas de TN, un producto, los archivos
      // de Drive—. Por eso entra como PALABRA y sin carve-out, que es lo contrario de lo que pasó
      // con `Mandar` y con `Poner`, donde la regla nombraba una palabra que casi nunca era el gesto.
      prohibidas: /\b(sumar|sumá|sumal[oa]|sumarl[oa]|añadir|añadí|anotar|anotá|traer|traé|traelo|traela|trayendo|dar de alta|darl[oa] de alta)\b/i,
      enSuLugar: 'Agregar (ya existía) · Crear (nace ahora) · Cargar (viene de afuera)',
    },
    {
      familia: '§1.4 lo que guarda',
      // ⚠️ `aplicar EN <sistema>` se queda: es un gesto que ESCRIBE AFUERA, ⛔ no que guarda acá, y
      // ahí el rótulo tiene que nombrar dónde. El lookahead es la regla: `Aplicar` a secas ⛔ no pasa.
      prohibidas: /\b(grabar|grabá|aplicá|aplicar(?! en ))\b/i,
      enSuLugar: 'Guardar · Confirmar (o «Aplicar en <el sistema>», si escribe afuera)',
    },
    { familia: '§1.5 lo que cambia', prohibidas: /\b(modificar|modificá|retocar|retocá)\b/i, enSuLugar: 'Editar · Cambiar' },
    { familia: '§1.6 lo que sale', prohibidas: /\b(postear|posteá|mandar|mandá|mandale)\b/i, enSuLugar: 'Publicar (al público) · Enviar (a una persona)' },
    {
      familia: '§1.1 lo que saca algo',
      // ⚠️ Mismo carve-out: «Dar de baja en GN» es la palabra del sistema de destino, y traducirla
      // manda a buscar un botón que allá no existe.
      prohibidas: /\b(borrar|borrá|quitar|quitá|remover|dar de baja(?! en ))\b/i,
      enSuLugar: 'Eliminar · Sacar · Archivar · Descartar',
    },
    {
      familia: '§1.2 lo que está por hacerse',
      // ⚠️ **La lista es la del glosario, palabra por palabra, y `qué falta` a secas ⛔ NO está.**
      // §1.2 deja `falta` como verbo adentro de una ayuda, y un encabezado como «Por qué falta»
      // es exactamente eso. Prohibir el pedazo prohíbe la frase que la regla permite.
      prohibidas: /(qué falta ahora|lo que falta|todo lo que falta|sin terminar|sin hacer)/i,
      enSuLugar: 'Pendiente / Pendientes',
    },
  ]

  function todosLosRotulos(): { texto: string; donde: string }[] {
    const salida: { texto: string; donde: string }[] = []
    for (const raiz of DONDE) {
      for (const p of archivos(raiz)) {
        const limpio = sinComentarios(readFileSync(p, 'utf8'))
        for (const t of rotulos(limpio)) salida.push({ texto: t, donde: p })
      }
    }
    return salida
  }

  for (const { familia, prohibidas, enSuLugar } of FAMILIAS) {
    it(`${familia} → ${enSuLugar}`, () => {
      const intrusos = todosLosRotulos()
        .filter((r) => prohibidas.test(r.texto))
        .map((r) => `${r.donde} → «${r.texto.slice(0, 70)}»`)
      expect([...new Set(intrusos)]).toEqual([])
    })
  }

  /**
   * 🔴 🔑 **El cero afirma, y acá el cero es del EXTRACTOR, no del vocabulario.** Los seis tests de
   * arriba se cumplen perfecto si `rotulos()` deja de encontrar nada —una etiqueta nueva que el
   * regex no matchea, un refactor a otro componente de botón— y ⛔ nada chillaría.
   * ⚠️ Por eso van las dos cosas: un piso de cuántos vio en total **y una lista de archivos**, que
   * es lo que impide que una pantalla entera se quede afuera sin que falle nada.
   */
  it('el extractor sigue viendo rótulos, y en las pantallas donde los hay', () => {
    const todos = todosLosRotulos()
    // Medido el 29-ago: 3.781. El piso es holgado a propósito: lo que caza es el derrumbe.
    expect(todos.length).toBeGreaterThan(3000)
    const CON_ROTULOS = [
      'components/canjes/FichaCanje.tsx',
      'components/disenos/Tablero.tsx',
      'components/envios/Envios.tsx',
      'components/insumos/FichaInsumo.tsx',
      'components/meta-ads/TableroIdeas.tsx',
      'components/pedidos-clientes/PedidosClientes.tsx',
    ]
    const mudas = CON_ROTULOS.filter((p) => rotulos(sinComentarios(readFileSync(p, 'utf8'))).length === 0)
    expect(mudas).toEqual([])
  })
})

describe('§3 · los botones de post-venta están en infinitivo — VOCABULARIO.md', () => {
  const PANTALLAS = [
    'components/reclamos/Reclamos.tsx',
    'components/reclamos/ArmarCambio.tsx',
    'components/reclamos/DecidirReclamo.tsx',
    'components/retornos/Retornos.tsx',
    'components/postventa/Postventa.tsx',
  ]

  /**
   * 🔑 **Acá SÍ hay que mirar la etiqueta, y ⛔ no alcanza el extractor de rótulos de arriba.** La
   * diferencia con las seis familias es que aquellas prohíben **palabras** —`sumar`, `grabar`,
   * `postear`—, que casi nunca significan otra cosa; ésta prohíbe un **tiempo verbal**, y el pasado
   * es medio castellano: «lo que pagó», «¿Qué recibió realmente?» o «el envío que pagó» son prosa
   * perfecta. 📌 Medido el 29-ago: sobre todos los rótulos daba **diez** intrusos y **uno solo era
   * un botón**. ⇒ se leen los botones y nada más.
   *
   * ⚠️ Es un barrido y ⛔ no un parser: se toma el texto pelado que está pegado al `</Button>` y el
   * `label` de los dos botones que lo llevan por prop. Un botón cuyo rótulo se arma con una
   * expresión ⛔ no se ve — por eso abajo va el piso.
   */
  const TEXTO_DE_BOTON = />([^<>{}]+)<\/Button>/g
  // ⚠️ **⛔ No se corta en el primer `>`**: adentro de un `<CopyButton getText={() => …}` hay uno, y
  // con `[^>]*?` el `label` de al lado desaparecía — el mismo punto ciego que ya dejó vivo a un
  // mutante en el extractor de arriba. Se busca dentro de una ventana acotada y listo.
  const LABEL_DE_BOTON = /<(?:BotonMensaje|CopyButton)\b[\s\S]{0,400}?\blabel="([^"]+)"/g

  function botonesDe(p: string): string[] {
    const src = sinComentarios(readFileSync(p, 'utf8'))
    const salida: string[] = []
    for (const m of src.matchAll(TEXTO_DE_BOTON)) {
      const t = m[1].replace(/\s+/g, ' ').trim()
      if (t) salida.push(t)
    }
    for (const m of src.matchAll(LABEL_DE_BOTON)) salida.push(m[1].trim())
    return salida
  }

  /**
   * 🔑 **La regla es del PRIMER verbo, ⛔ no de que no haya ningún pasado en el rótulo.** §3 dice
   * *«Botón = verbo en infinitivo»*: lo que tiene que estar en infinitivo es **el gesto**. Por eso
   * «Registrar que aceptó» está bien —el gesto es *registrar*, y lo que el cliente hizo se nombra
   * como lo que es—, y «Aceptó» a secas ⛔ no: ahí el botón dice un hecho en vez de pedir una acción.
   */
  const empiezaEnInfinitivo = (t: string) => {
    const primera = t.trim().split(/[\s,.!?¿¡«»"'—·:]+/).filter(Boolean)[0] || ''
    // Un botón de puro ícono (`⋯`, `↩`) ⛔ no tiene verbo que mirar: su palabra vive en el `aria-label`.
    if (!/[a-záéíóúñ]/i.test(primera)) return true
    return /^[a-záéíóúñ]+(ar|er|ir)$/i.test(primera)
  }

  /**
   * 🔴 **Botones que ⛔ NO son un gesto: son una opción de un grupo excluyente.** Contestan una
   * pregunta que está arriba —*«¿qué contestó?»*, *«¿qué se hace con el producto?»*— y la respuesta
   * ⛔ no es un verbo: es un hecho. Pedirles infinitivo empeora la pantalla.
   *
   * ⚠️ **Están dibujados con `Button` sólo porque el kit ⛔ no tiene un segmentado con `disabled` y
   * `title` por opción** (`Chips`, en `FilterBar.tsx`, ⛔ no los acepta) — y acá los dos hacen falta:
   * sin monto cargado ⛔ no se puede contestar, y «aceptó quedárselo» apaga «que vuelva». El día que
   * `Chips` los acepte, éstos se mudan y **esta lista se vacía sola**, que es la condición para que
   * una excepción defienda algo.
   */
  const SELECTORES = new Set([
    'Se la mandé: esperando',
    'Aceptó: se lo queda',
    'No aceptó: sigue el reclamo',
    'Se lo queda',
    'Que vuelva',
  ])

  it('🔴 todo BOTÓN de post-venta empieza con un verbo en infinitivo', () => {
    const intrusos: string[] = []
    for (const p of PANTALLAS) {
      for (const t of botonesDe(p)) {
        if (SELECTORES.has(t) || empiezaEnInfinitivo(t)) continue
        intrusos.push(`${p} → «${t}»`)
      }
    }
    expect([...new Set(intrusos)]).toEqual([])
  })

  /** 🔑 Y la excusa se vacía sola: un selector que ya no existe se lee mañana como permiso. */
  it('y la lista de selectores ⛔ no tiene rótulos de más', () => {
    const vivos = new Set(PANTALLAS.flatMap(botonesDe))
    expect([...SELECTORES].filter((t) => !vivos.has(t))).toEqual([])
  })

  /**
   * 🔴 🔑 **El cero afirma, y acá el cero es del extractor.** El test de arriba se cumple perfecto
   * si `botonesDe` deja de encontrar nada —un refactor a otro componente, un rótulo armado con una
   * expresión— y ⛔ nada chillaría. Va un piso **por pantalla**, ⛔ no un total: un total deja que
   * una se quede sin botones sin que falle nada.
   */
  it('el extractor sigue viendo botones en las cinco', () => {
    // Medidos el 29-ago-2026: 20 · 14 · 12 · 8 · 8.
    const flacas = PANTALLAS.filter((p) => botonesDe(p).length < 5)
    expect(flacas).toEqual([])
  })

  /**
   * 🔴 🔑 **La mitad positiva, y es la que se pierde primero.** §3.1 tiene una **cuarta voz**
   * legítima —primera persona en pasado— para el **OK de un diálogo** que confirma un hecho que
   * pasó **afuera** de la app: *«Sí, ya lo despaché»*. Si alguien la "corrige" a infinitivo, el
   * cartel pasa a prometer que la app va a despachar el pedido.
   *
   * ⇒ La distinción que el módulo ⛔ no tenía escrita: **el botón pide la acción, el OK confirma el
   * hecho.** Por eso los dos tests van juntos y ninguno vale solo.
   */
  it('🔑 y la cuarta voz sigue viva en los OK de los diálogos', () => {
    const oks = PANTALLAS.flatMap((p) => [...sinComentarios(readFileSync(p, 'utf8')).matchAll(/\bok:\s*'([^']+)'/g)].map((m) => m[1]))
    // Medidos el 29-ago-2026: ocho «Sí, ya …» entre las cinco pantallas.
    expect(oks.filter((t) => /^sí,/i.test(t)).length).toBeGreaterThanOrEqual(6)
  })
})

describe('el glosario es el MISMO archivo en los dos repos', () => {
  it('VOCABULARIO.md existe y declara su versión', () => {
    // 🔴 Es una COPIA de la de `areben-marketing`: si allá cambia y acá no, las dos se creen la
    // fuente de verdad. La línea de versión es lo que hace visible que quedó vieja.
    const doc = readFileSync('VOCABULARIO.md', 'utf8')
    expect(doc).toMatch(/^Versión: \d{4}-\d{2}-\d{2}[a-z]?$/m)
    // Las cuatro palabras de la familia, para que nadie vacíe el archivo y lo deje pasar.
    for (const p of ['Eliminar', 'Sacar', 'Archivar', 'Descartar']) expect(doc).toContain(`**${p}**`)
  })

  it('🔑 y las seis familias siguen estando: el bloque de arriba se lee del documento', () => {
    // Sin esto, alguien que borra una familia entera del glosario deja seis tests vigilando una
    // regla que ya no está escrita en ningún lado — o al revés, la escribe y nadie la clava.
    const doc = readFileSync('VOCABULARIO.md', 'utf8')
    for (const x of ['1.1 ·', '1.2 ·', '1.3 ·', '1.4 ·', '1.5 ·', '1.6 ·']) expect(doc).toContain(x)
  })
})

/**
 * 🔴 **La jerga de §3: palabras de adentro que la pantalla usa como si el que lee las supiera.**
 * Estaba escrita en el glosario desde el 28-ago y ⛔ no la frenaba nada.
 *
 * 🔑 **El oráculo de que una palabra es jerga es que alguien no la entienda**, y el 29-ago pasó:
 * Bruno leyendo el `PENDIENTES` — *«no sé lo que es corrida de un reloj»*. ⇒ ⛔ no se le busca un
 * sinónimo («pasada», «vuelta» dejan la frase sin información): **se dice qué pasa**. «No hay
 * ninguna corrida exitosa reciente» pasó a **«hace rato que no termina bien»**.
 *
 * 🔑 **De las tres que quedaban para preguntarle a Bruno, dos NO eran una decisión: eran un resto.**
 * `Sembrar` ya no era el nombre de ningún botón —el de la Agenda dice **«Cargar los pendientes»**—
 * y sólo sobrevivía en el mensaje de error, que decía otra cosa que el botón. Y `Bitácora`, el
 * rótulo de una pestaña de Liquidación, es la MISMA palabra que el menú de MAKETA ya había resuelto
 * como **Actividad**. ⇒ **antes de mandar a decidir, mirar si el gesto ya se llama de otra manera en
 * su propio botón.**
 *
 * ⚠️ **`padrón` ⛔ NO entra, y no es un olvido**: sus 13 apariciones son todas de **Canjes**, que
 * Bruno dejó afuera de la corrida. Es una decisión suya ya tomada, ⛔ no una pendiente.
 */
describe('la jerga de §3 no entra en pantalla — VOCABULARIO.md', () => {
  const JERGA = /\b(corrida|corridas|copy|moodboard|moodboards|bitácora|bitácoras|sembrar|sembrá)\b/i

  /**
   * ⛔ **Canjes queda afuera por decisión de Bruno**, ⛔ no porque la regla no aplique. Se escribe
   * como una lista de archivos y no como una palabra excusada, para que el día que se levante la
   * decisión se vea exactamente qué entra.
   */
  const AFUERA_POR_DECISION = 'components/canjes/'

  /**
   * ⛔ **Lo que imprime un SCRIPT no es una pantalla**, y en este repo eso son las rutas de cron y
   * los scripts: escriben en el log del job, y lo lee quien va a arreglar el reloj. Misma categoría
   * que un comentario.
   */
  const NO_ES_PANTALLA = ['scripts/', 'app/api/']

  const PROSA = /(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g
  const TEXTO_JSX = /(?<=>)([^<>{}]*[A-Za-zÁÉÍÓÚÑáéíóúñ][^<>{}]*)(?=<)/g

  function loQueSeLee(linea: string): string[] {
    const salida: string[] = []
    for (const m of linea.matchAll(PROSA)) {
      const t = m[2].replace(/\$\{[^}]*\}/g, ' ')
      const esProsa =
        /[A-Za-zÁÉÍÓÚÑáéíóúñ]\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(t) || /[áéíóúñ¿¡«»]/i.test(t)
      const esCodigo = /[(){}=]|:\/\/|^\s*[/.]/.test(t)
      if (esProsa && !esCodigo) salida.push(t)
    }
    for (const m of linea.matchAll(TEXTO_JSX)) salida.push(m[1])
    return salida
  }

  it('ninguna aparece en el texto que lee una persona', () => {
    const intrusos: string[] = []
    for (const raiz of DONDE) {
      for (const p of archivos(raiz)) {
        if (NO_ES_PANTALLA.some((x) => p.startsWith(x))) continue
        if (p.startsWith(AFUERA_POR_DECISION)) continue
        sinComentarios(readFileSync(p, 'utf8'))
          .split('\n')
          .forEach((linea, k) => {
            for (const t of loQueSeLee(linea)) {
              const m = t.match(JERGA)
              if (m) intrusos.push(`${p}:${k + 1} → ${m[0]} — «${t.slice(0, 60)}»`)
            }
          })
      }
    }
    expect(intrusos).toEqual([])
  })

  it('🔴 y Canjes sigue teniendo la palabra: la excepción excusa algo o se saca', () => {
    // 🔑 Misma regla que la allowlist de símbolos. El día que Canjes no diga `padrón` en ningún
    // lado, esta línea deja de excusar nada y queda como permiso para escribir jerga ahí.
    const conJerga = archivos('components').filter(
      (p) => p.startsWith(AFUERA_POR_DECISION) && /\bpadrón\b/i.test(sinComentarios(readFileSync(p, 'utf8'))),
    )
    expect(conJerga.length).toBeGreaterThan(0)
  })
})
