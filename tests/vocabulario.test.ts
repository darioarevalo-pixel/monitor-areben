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
 * 🔴 **`Borrar` y `Quitar` a secas están acá y eso es una DEBILIDAD conocida**: son a la vez un
 * símbolo posible y una palabra de pantalla, así que un `<button>Borrar</button>` nuevo pasaría.
 * Lo tapa el segundo bloque, que exige la palabra correcta en cada pantalla que hace desaparecer
 * algo. 📌 En MAKETA esto se resolvió renombrando el componente (`Borrar` → `EliminarLaCampania`);
 * acá todavía no, y por eso queda escrito como deuda y no como que está cubierto.
 */
const SIMBOLOS = new Set([
  'Borrador',
  'Borradores',
  'Borrar',
  'MOTIVOS_QUITAR_ITEM',
  'Quitados',
  'Quitar',
  'alBorrar',
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
  'borrarNota',
  'borrarNotaCanje',
  'borrarNovedad',
  'borrarPedido',
  'borrarPersona',
  'borrarPromo',
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
  'components/agenda/Agenda.tsx',
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

describe('el glosario es el MISMO archivo en los dos repos', () => {
  it('VOCABULARIO.md existe y declara su versión', () => {
    // 🔴 Es una COPIA de la de `areben-marketing`: si allá cambia y acá no, las dos se creen la
    // fuente de verdad. La línea de versión es lo que hace visible que quedó vieja.
    const doc = readFileSync('VOCABULARIO.md', 'utf8')
    expect(doc).toMatch(/^Versión: \d{4}-\d{2}-\d{2}$/m)
    // Las cuatro palabras de la familia, para que nadie vacíe el archivo y lo deje pasar.
    for (const p of ['Eliminar', 'Sacar', 'Archivar', 'Descartar']) expect(doc).toContain(`**${p}**`)
  })
})
