/**
 * ¿El contacto agendado en WhatsApp es este cliente? Comparación por NOMBRE.
 *
 * ⚠️ **Sólo sirve para SUGERIR, nunca para decidir solo.** El número es la llave; el nombre se
 * repite (hay varias "Micaela", "Matias", "Candela" entre los clientes) y si el sistema eligiera,
 * un error anotaría notas y fechas en la ficha de otra persona sin que nadie lo note. Por eso lo
 * que sale de acá siempre termina en un botón que Darío confirma.
 *
 * Por qué existe: medido el 28-sep-2026, de 28 clientes recientes cuyo número de Gestión Nube no
 * estaba agendado, ~8 SÍ estaban agendados, con otro número. Darío agenda con el mismo nombre con
 * el que compran, así que el nombre es la pista que une los dos números.
 *
 * JS plano (como `telefono.core.js`) para que lo usen igual el panel y los scripts de node.
 */

// Lo que Darío le agrega al nombre al agendar y que no es parte del nombre de la persona.
const RELLENO = new Set(['mayorista', 'mayor', 'bdi', 'cliente', 'clienta', 'local', 'tienda', 'accesorios', 'de', 'del', 'la', 'el', 'y'])

const MARCA_ENIE = String.fromCharCode(1)
const RE_MARCAS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g')

/**
 * Minúscula y sin acentos, pero la ñ se queda: "Carreño" y "Carreno" no son lo mismo para la
 * búsqueda del servidor, que sólo comodinea las vocales.
 */
function sinAcentos(texto) {
  return String(texto || '')
    .toLowerCase()
    .split('ñ')
    .join(MARCA_ENIE)
    .normalize('NFD')
    .replace(RE_MARCAS, '')
    .split(MARCA_ENIE)
    .join('ñ')
}

/** "Martina Macri - Los Polvorines" → ['martina', 'macri']. Sin acentos, en minúscula. */
export function palabrasDelNombre(nombre) {
  // Lo que va después de un guion, una barra o un paréntesis suele ser la ciudad o el local.
  const s = sinAcentos(nombre).split(/\s[-–|/]\s|\(/)[0]
  return s
    .replace(/[^a-zñ\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length >= 3 && !RELLENO.has(p))
    .slice(0, 3)
}

/**
 * ¿Todas las palabras del nombre agendado están en el nombre del cliente? En cualquier orden
 * ("Macri Martina" también vale). Pide al menos DOS palabras: con un nombre solo ("Martina") hay
 * demasiadas coincidencias para sugerir nada.
 */
export function coincideNombre(palabrasAgendado, nombreCliente) {
  if (!palabrasAgendado || palabrasAgendado.length < 2) return false
  const delCliente = new Set(sinAcentos(nombreCliente).split(/[^a-zñ]+/))
  return palabrasAgendado.every((p) => delCliente.has(p))
}

/** La palabra con la que conviene buscar en el servidor: la más larga (suele ser el apellido). */
export function palabraParaBuscar(palabras) {
  return (palabras || []).slice().sort((a, b) => b.length - a.length)[0] || ''
}
