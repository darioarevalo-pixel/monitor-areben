/**
 * Las reglas de Faltantes que necesitan **los dos lados**: el handler y la pantalla.
 *
 * ⛔ Es `.js` plano a propósito, igual que `lib/buzon/reglas.core.js` y `lib/permisos.core.js`: los
 * handlers de `api/*.js` corren en Node sin pasar por el compilador de Next y **no pueden importar
 * TypeScript**. Si esto viviera en `core.ts`, el handler tendría que copiarse la validación adentro
 * — y una copia de una regla de validación es la forma de que la pantalla y la base no coincidan.
 */

/** Las columnas que el cliente puede escribir. Lo que no está en la lista se cae. */
export const CAMPOS = ['id', 'store', 'texto', 'tipo', 'canal', 'cliente', 'estado', 'nota']

/**
 * Las dos cosas que la palabra «faltante» quiere decir, y que son **dos decisiones distintas**.
 *
 * 🔴 El pedido original era sólo `no_trabajamos` («qué nos piden que no tenemos, para mejorar la
 * variedad»). `sin_stock` entra porque el rótulo de la sección es «Faltantes» y con ese rótulo la
 * clienta que pide un talle 2 de algo que SÍ vendemos se carga igual — no cargarlo sería perder el
 * dato, y cargarlo en el mismo montón haría que el ranking mezcle «comprar variedad nueva» con
 * «reponer», que las decide gente distinta con plata distinta.
 */
export const TIPOS = ['no_trabajamos', 'sin_stock']

export const CANALES = ['local', 'whatsapp', 'instagram', 'mail', 'tienda']

/**
 * `descartado` no es «me equivoqué al cargar»: es «lo miramos y no lo vamos a traer». Para el error
 * de carga está borrar. La diferencia importa porque un descartado **sigue contando en el ranking**
 * (ver `rankear` en `core.ts`): que se haya decidido no traerlo no borra que lo pidieron.
 */
export const ESTADOS = ['pedido', 'conseguido', 'descartado']

/** Palabras que no distinguen un producto de otro. Sacarlas es lo que junta «funda para iphone» con «funda iphone». */
const VACIAS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'para', 'con', 'sin', 'y', 'o', 'en', 'por', 'al', 'a',
])

/**
 * **La regla que decide qué cuenta como el mismo producto.** Es lo único que hace que el agregado
 * signifique algo: sin esto, «fundas iphone 15», «Funda iPhone15» y «funda para iphone 15» son tres
 * renglones de 1 y el ranking dice que nadie pide nada.
 *
 * Los cinco pasos, y por qué cada uno:
 *
 *   1. **Minúsculas y sin tildes** — se escribe rápido, en el mostrador, con el cliente adelante.
 *   2. **Se parte letra/número** (`iphone15` → `iphone 15`), que es la forma en que más se escribe
 *      un modelo y la que no junta ningún otro paso.
 *   3. **Se tiran las palabras vacías** (`para`, `de`, `la`…).
 *   4. **Singular a lo bruto: se saca una `s` final de más de 3 letras.** ⚠️ Es a propósito que NO
 *      sea la regla del español (`colores` → `color`, que pide mirar la consonante anterior): con
 *      esa regla `iphones` sale `iphon`, y acá la mitad de lo que se pide son palabras en inglés.
 *      Lo que se elige es **el modo de falla**: sacar sólo la `s` deja `colores` y `color` en dos
 *      grupos —se ve, se lee, alguien lo junta a ojo— mientras que una regla más agresiva junta dos
 *      productos distintos en **un número que está mal y que nadie puede ver**. Sub-agrupar se nota;
 *      sobre-agrupar, no.
 *   5. **Se ordenan las palabras**, así «funda iphone 15» y «iphone 15 funda» son el mismo grupo.
 *      Dos textos con las mismas palabras son el mismo producto; el orden es cómo salió la frase.
 *
 * Devuelve `''` cuando no queda nada — el llamador decide, y en `core.ts` esas filas se cuentan
 * aparte en vez de caer en un grupo fantasma con clave vacía.
 */
export function claveDeTexto(v) {
  const base = String(v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  if (!base) return ''
  const palabras = base
    .split(' ')
    .filter((p) => p && !VACIAS.has(p))
    .map((p) => (p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p))
  return palabras.sort().join(' ')
}

/**
 * Valida lo que llega del cliente. Devuelve el motivo, o `null` si está bien.
 *
 * **Sólo `texto` es obligatorio.** El resto tiene default y se completa después: pedirle el canal y
 * el nombre del cliente a alguien que está atendiendo es exactamente la fricción que hace que no se
 * cargue nunca, y una fila sin canal sigue contando en el ranking, que es para lo que existe.
 */
export function validarPedido(p) {
  if (!p || typeof p !== 'object') return 'falta el pedido'
  if (!['bdi', 'zattia'].includes(String(p.store || '').toLowerCase())) return 'store inválido (usá bdi o zattia)'
  if (!String(p.texto || '').trim()) return 'contá qué te pidieron'
  if (p.tipo != null && !TIPOS.includes(String(p.tipo))) return `tipo inválido (usá ${TIPOS.join(' o ')})`
  if (p.canal != null && !CANALES.includes(String(p.canal))) return `canal inválido (usá ${CANALES.join(', ')})`
  if (p.estado != null && !ESTADOS.includes(String(p.estado))) return `estado inválido (usá ${ESTADOS.join(', ')})`
  // 🔑 Un texto que normaliza a vacío es un texto de puro ruido («...», «???»). Se guarda bien, se
  // ve bien en la lista, y **no entra en ningún grupo del ranking**: la fila que existe y no cuenta.
  if (!claveDeTexto(p.texto)) return 'ese texto no tiene ninguna palabra: escribí qué producto te pidieron'
  return null
}

/**
 * La fila lista para la base.
 *
 * `creado_por` sale del perfil y **nunca del body**: es lo único que después permite volver a
 * preguntarle a quien lo anotó qué era exactamente. Mismo criterio que `api/_buzon.js`.
 *
 * ⛔ `texto` se guarda **tal cual lo escribieron** (sólo recortado). La versión normalizada es para
 * agrupar y se calcula al leer: guardar el texto masticado tira la única evidencia de cómo nombra
 * la gente lo que pide, que es la mitad de lo que hay que leer para decidir qué comprar.
 */
export function filaDe(p, yo, ahora) {
  return {
    id: p.id ? String(p.id) : `pc${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    store: String(p.store).toLowerCase(),
    texto: String(p.texto).trim().slice(0, 300),
    tipo: TIPOS.includes(String(p.tipo)) ? String(p.tipo) : 'no_trabajamos',
    canal: CANALES.includes(String(p.canal)) ? String(p.canal) : 'local',
    cliente: p.cliente ? String(p.cliente).trim().slice(0, 200) : null,
    estado: ESTADOS.includes(String(p.estado)) ? String(p.estado) : 'pedido',
    nota: p.nota ? String(p.nota).trim().slice(0, 500) : null,
    creado_por: yo || null,
    actualizado_en: ahora,
    actualizado_por: yo || null,
  }
}
