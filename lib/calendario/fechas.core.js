/**
 * Las fechas comerciales que le importan a BDI y a Zattia: LA implementación, una sola.
 *
 * # Por qué este archivo es `.js` y no `.ts`
 *
 * Mismo motivo que `lib/permisos.core.js` y `lib/meta-ads/etapas.core.js`: `api/_calendario.js`
 * corre en Node sin pasar por el compilador de Next y **no puede importar TypeScript**. El handler
 * necesita las claves para validar qué fecha se está fijando (si no, cualquiera guarda una fila con
 * una clave inventada que después no se muestra en ningún lado), así que el catálogo vive acá y
 * `lib/calendario/index.ts` es el re-export tipado.
 *
 * # Qué problema resuelve
 *
 * Hoy no hay ningún lugar donde vivan las fechas. El Día de la Madre se recuerda quince días antes,
 * cuando ya no hay tiempo de producir nada, y los lanzamientos propios viven en la cabeza de cada
 * uno. Esto es la mitad "cuándo lo necesitás" del problema; la otra mitad —"qué falta"— la contesta
 * `lib/meta-ads/etapas.core.js`.
 *
 * # ⚠️ La mitad de estas fechas NO son fijas, y ahí está todo el riesgo
 *
 * Hardcodear "Día de la Madre: 18 de octubre" funciona un año y miente los otros. Peor todavía son
 * las **anunciadas** (Hot Sale, CyberMonday AR, Día del Niño): no las decide el calendario sino una
 * cámara, la fecha cambia todos los años y no hay regla que la prediga.
 *
 * Por eso hay tres clases de fecha y se distinguen en pantalla:
 *
 *  - **fija** — día y mes, siempre igual. Navidad, San Valentín.
 *  - **regla** — se calcula (tercer domingo de octubre). Es exacta, no es una estimación.
 *  - **anunciada** — la estimación es lo mejor que se puede hacer sola, y se muestra **marcada como
 *    estimada** hasta que una persona confirme la fecha real. Una fecha estimada presentada como
 *    firme es peor que no tener la fecha: el equipo planifica contra un dato inventado.
 */

const pad = (n) => String(n).padStart(2, '0')

/** `YYYY-MM-DD` a partir de año, mes (1-12) y día. El formato que se guarda y se compara. */
export function iso(anio, mes, dia) {
  return `${anio}-${pad(mes)}-${pad(dia)}`
}

/**
 * Cuántos días tiene un mes (1-12). Vía `Date.UTC` con día 0 del mes siguiente, que es el truco
 * estándar y encima resuelve febrero bisiesto sin ninguna tabla.
 */
export function diasDelMes(anio, mes) {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

/**
 * El día del mes del n-ésimo día de semana. `nEsimoDiaDeSemana(2026, 10, 0, 3)` es el tercer
 * domingo de octubre de 2026.
 *
 * `diaSemana` va 0=domingo … 6=sábado. `n` negativo cuenta desde el final (-1 es el último).
 * Devuelve `null` si ese día no existe (no todos los meses tienen un quinto lunes).
 *
 * ⚠️ Todo el cálculo va en **UTC**. Con `new Date(2026, 9, 1)` la fecha sale en la zona de quien
 * mire, y en Argentina (UTC-3) eso corre el día para atrás: el mismo domingo puede dar sábado
 * dependiendo de la máquina. Acá no se representa un instante, se representa un día del almanaque.
 */
export function nEsimoDiaDeSemana(anio, mes, diaSemana, n) {
  const ultimo = diasDelMes(anio, mes)
  if (n > 0) {
    const dowDelPrimero = new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay()
    const dia = 1 + ((diaSemana - dowDelPrimero + 7) % 7) + (n - 1) * 7
    return dia > ultimo ? null : dia
  }
  if (n < 0) {
    const dowDelUltimo = new Date(Date.UTC(anio, mes - 1, ultimo)).getUTCDay()
    const dia = ultimo - ((dowDelUltimo - diaSemana + 7) % 7) + (n + 1) * 7
    return dia < 1 ? null : dia
  }
  return null
}

/** Suma (o resta) días a un `YYYY-MM-DD` y devuelve otro `YYYY-MM-DD`. Cruza meses y años solo. */
export function sumarDias(fecha, n) {
  const [a, m, d] = String(fecha).split('-').map(Number)
  const t = new Date(Date.UTC(a, m - 1, d + n))
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

/**
 * Días entre dos `YYYY-MM-DD` (`hasta - desde`). Entero exacto: al ir las dos por UTC a medianoche
 * no hay horario de verano que meta un 23 o un 25 en el medio.
 */
export function diasEntre(desde, hasta) {
  const ms = (f) => {
    const [a, m, d] = String(f).split('-').map(Number)
    return Date.UTC(a, m - 1, d)
  }
  return Math.round((ms(hasta) - ms(desde)) / 86400000)
}

/** Día de la semana de un `YYYY-MM-DD` (0=domingo). */
export function diaDeSemanaDe(fecha) {
  const [a, m, d] = String(fecha).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay()
}

/**
 * El catálogo.
 *
 * `anticipoDias` es **cuántos días antes conviene estar craneando el creativo**. ⚠️ Es una
 * **sugerencia, no una alarma**: prellena la fecha de arranque cuando alguien decide que la marca
 * se suma, y ahí termina su trabajo. Antes decidía solo —la pantalla anunciaba "ya habría que estar
 * produciendo" para cualquier fecha del catálogo— y eso era falso: una fecha aprieta cuando el
 * equipo eligió jugarla, no cuando venció una resta. Ver `PRIORIDADES` acá abajo.
 *
 * Los números salen de cuánto tarda una pieza: una campaña de Día de la Madre necesita sesión de
 * fotos, así que son 30; un Día del Amigo se resuelve con un carrusel y son 10.
 *
 * `porQue` es para el equipo nuevo: explica en un renglón por qué esa fecha está en la lista de
 * estas dos marcas y no es una efeméride más.
 */
export const FECHAS_COMERCIALES = [
  {
    clave: 'reyes',
    titulo: 'Reyes',
    clase: 'fija',
    anticipoDias: 21,
    resolver: (a) => iso(a, 1, 6),
    porQue: 'Última compra de regalo del verano y la que liquida lo que sobró de Navidad.',
  },
  {
    clave: 'san-valentin',
    titulo: 'San Valentín',
    clase: 'fija',
    anticipoDias: 14,
    resolver: (a) => iso(a, 2, 14),
    porQue: 'Regalo de precio medio: entra tanto una funda como una prenda.',
  },
  {
    clave: 'dia-mujer',
    titulo: 'Día de la Mujer',
    clase: 'fija',
    anticipoDias: 10,
    resolver: (a) => iso(a, 3, 8),
    porQue: 'No es fecha de descuento sino de contenido: la que se resuelve mal se nota mucho.',
  },
  {
    clave: 'hot-sale',
    titulo: 'Hot Sale',
    clase: 'anunciada',
    anticipoDias: 21,
    // Estimación: segundo lunes de mayo. Le pegó a 2023 (8-may), 2024 (13-may) y 2025 (12-may),
    // pero la fecha real la anuncia la CACE y no hay regla: por eso sale marcada como estimada.
    resolver: (a) => iso(a, 5, nEsimoDiaDeSemana(a, 5, 1, 2)),
    porQue: 'El pico de venta online del primer semestre. Se compite con todo el mercado a la vez.',
    comoSeConfirma: 'La anuncia la CACE (cace.org.ar), normalmente con dos o tres meses de aviso.',
  },
  {
    clave: 'dia-padre',
    titulo: 'Día del Padre',
    clase: 'regla',
    anticipoDias: 21,
    resolver: (a) => iso(a, 6, nEsimoDiaDeSemana(a, 6, 0, 3)),
    porQue: 'Tercer domingo de junio en Argentina — no coincide con el de varios otros países.',
  },
  {
    clave: 'dia-amigo',
    titulo: 'Día del Amigo',
    clase: 'fija',
    anticipoDias: 10,
    resolver: (a) => iso(a, 7, 20),
    porQue: 'Regalo barato y de última hora: funciona el envío rápido más que el descuento.',
  },
  {
    clave: 'dia-nino',
    titulo: 'Día del Niño',
    clase: 'anunciada',
    anticipoDias: 21,
    // Estimación: tercer domingo de agosto. La define la CAIP y ya se movió más de una vez
    // (llegó a caer en el segundo domingo), así que va marcada como estimada.
    resolver: (a) => iso(a, 8, nEsimoDiaDeSemana(a, 8, 0, 3)),
    porQue: 'Pesa poco para estas dos marcas, pero mueve el tráfico general y encarece la pauta.',
    comoSeConfirma: 'La define la CAIP (Cámara Argentina de la Industria del Juguete).',
  },
  {
    clave: 'primavera',
    titulo: 'Primavera y Día del Estudiante',
    clase: 'fija',
    anticipoDias: 14,
    resolver: (a) => iso(a, 9, 21),
    porQue: 'Arranque del cambio de temporada: es la excusa para mostrar lo nuevo.',
  },
  {
    clave: 'dia-madre',
    titulo: 'Día de la Madre',
    clase: 'regla',
    anticipoDias: 30,
    resolver: (a) => iso(a, 10, nEsimoDiaDeSemana(a, 10, 0, 3)),
    porQue: 'La fecha más fuerte del segundo semestre después de Navidad. Pide sesión de fotos propia.',
  },
  {
    clave: 'cybermonday-ar',
    titulo: 'CyberMonday',
    clase: 'anunciada',
    anticipoDias: 21,
    // Estimación: primer lunes de noviembre. Le pegó a 2024 (4-nov) y 2025 (3-nov); en 2023 arrancó
    // el 30 de octubre. La anuncia la CACE.
    resolver: (a) => iso(a, 11, nEsimoDiaDeSemana(a, 11, 1, 1)),
    porQue: 'El Hot Sale del segundo semestre, y cae pegado a Black Friday: hay que decidir en cuál jugar.',
    comoSeConfirma: 'La anuncia la CACE (cace.org.ar). Ojo que puede arrancar el último lunes de octubre.',
  },
  {
    clave: 'black-friday',
    titulo: 'Black Friday',
    clase: 'regla',
    anticipoDias: 21,
    // El viernes siguiente al cuarto jueves de noviembre. La regla es de Estados Unidos, pero acá se
    // adoptó tal cual, así que se calcula igual.
    resolver: (a) => sumarDias(iso(a, 11, nEsimoDiaDeSemana(a, 11, 4, 4)), 1),
    porQue: 'Ya no es una fecha importada: el consumidor la espera y compara precios contra el CyberMonday.',
  },
  {
    clave: 'cyber-monday-us',
    titulo: 'Cyber Monday (internacional)',
    clase: 'regla',
    anticipoDias: 14,
    // El lunes después de Black Friday. Puede caer en diciembre y por eso se calcula sumando días
    // sobre la fecha ya resuelta, no buscando un lunes de noviembre.
    resolver: (a) => sumarDias(iso(a, 11, nEsimoDiaDeSemana(a, 11, 4, 4)), 4),
    porQue: 'No es fecha local, pero marca el precio de la pauta y el tono de la competencia esa semana.',
  },
  {
    clave: 'navidad',
    titulo: 'Navidad',
    clase: 'fija',
    anticipoDias: 30,
    resolver: (a) => iso(a, 12, 25),
    porQue: 'La fecha más grande del año. El corte real es el envío, no el 25: se planifica para atrás.',
  },
]

/** Las claves válidas, para que el servidor no guarde una fecha fijada que no existe. */
export const CLAVES_COMERCIALES = FECHAS_COMERCIALES.map((f) => f.clave)

/** Una fecha comercial por su clave, o `null`. */
export function fechaComercialDe(clave) {
  return FECHAS_COMERCIALES.find((f) => f.clave === String(clave)) || null
}

/**
 * La fecha de una comercial en un año dado, sin considerar confirmaciones.
 *
 * Devuelve `{ fecha, estimada }`. `estimada` es `true` solo para las anunciadas: una regla como el
 * tercer domingo de octubre no es una estimación, es exacta.
 */
export function resolverComercial(clave, anio) {
  const f = fechaComercialDe(clave)
  if (!f) return null
  const fecha = f.resolver(anio)
  if (!fecha || fecha.includes('null')) return null
  return { fecha, estimada: f.clase === 'anunciada' }
}

/**
 * # Con qué fuerza jugamos cada fecha — la decisión que el calendario NO puede tomar solo
 *
 * El catálogo sabe **cuándo** es el Día del Niño. No sabe, y no puede saber, si estas dos marcas se
 * suman: eso depende de si hay stock, de si la fecha le habla al público y de si el equipo tiene
 * manos esa semana. Mientras la pantalla lo dedujo de `anticipoDias`, avisaba "ya habría que estar
 * produciendo" para fechas que nadie pensaba trabajar — y un aviso que se ignora doce veces enseña
 * a ignorar el aviso número trece, que sí importaba.
 *
 * Por eso la prioridad la pone una persona, y **la ausencia de decisión es un estado de primera
 * clase**: no hay fila en la base y la pantalla lo muestra como la pregunta abierta que es. El
 * default no es "la jugamos" ni "la dejamos pasar": es "todavía no lo decidimos", que es la verdad.
 *
 * `arrastraProduccion` es lo que separa una prioridad de una etiqueta de color: dice si esa fecha
 * merece que le pidamos una fecha de arranque y que aparezca en el veredicto de Etapas de la pauta.
 */
export const PRIORIDADES = [
  {
    key: 'fuerte',
    label: 'Le vamos fuerte',
    corto: 'Fuerte',
    arrastraProduccion: true,
    ayuda: 'Campaña armada: piezas propias, pauta y las tres etapas cubiertas.',
  },
  {
    key: 'suave',
    label: 'Algo suave',
    corto: 'Suave',
    arrastraProduccion: true,
    ayuda: 'Estamos presentes sin producir de cero: una historia, un mail, un carrusel con lo que ya hay.',
  },
  {
    key: 'pasamos',
    label: 'La dejamos pasar',
    corto: 'Pasamos',
    arrastraProduccion: false,
    ayuda: 'No hacemos nada para esta fecha. Queda en la lista para no volver a discutirla.',
  },
]

export const CLAVES_PRIORIDAD = PRIORIDADES.map((p) => p.key)

/** Una prioridad por su clave, o `null`. */
export function prioridadDe(key) {
  return PRIORIDADES.find((p) => p.key === String(key)) || null
}

/** ¿Esta prioridad manda producir algo? `pasamos` y "sin decidir" no. */
export function juegaLaFecha(key) {
  return !!prioridadDe(key)?.arrastraProduccion
}

/**
 * El id de una comercial en un año: `comercial:dia-nino:2026`.
 *
 * Vive acá y no en el `index.ts` porque el servidor **valida contra este formato** antes de guardar
 * una decisión, y armar la cadena en dos lados es la clase de duplicado que se desincroniza en
 * silencio: el día que cambie el separador, la mitad de las decisiones guardadas dejan de encontrar
 * su fecha y no falla nada, simplemente no se muestran.
 */
export function idComercial(clave, anio) {
  return `comercial:${clave}:${anio}`
}

/**
 * Parte un id de comercial y lo valida contra el catálogo. `null` si no es uno.
 *
 * Se valida la clave —no alcanza con que el formato dé— porque una clave inventada guardaría una
 * fila que después no se muestra en ningún lado y nadie entendería por qué la decisión no tomó.
 */
export function partirIdComercial(id) {
  const p = String(id || '').split(':')
  if (p.length !== 3 || p[0] !== 'comercial') return null
  const anio = Number(p[2])
  if (!CLAVES_COMERCIALES.includes(p[1])) return null
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return null
  return { clave: p[1], anio }
}

/** Los tipos de hito propio que carga el equipo. La lista es corta a propósito: elegir cuesta. */
export const TIPOS_HITO = [
  { key: 'lanzamiento', label: 'Lanzamiento de colección' },
  { key: 'sesion-fotos', label: 'Sesión de fotos' },
  { key: 'mercaderia', label: 'Llegada de mercadería' },
  { key: 'mail', label: 'Envío de mail' },
  { key: 'evento', label: 'Evento' },
  { key: 'otro', label: 'Otro' },
]

export const CLAVES_TIPO_HITO = TIPOS_HITO.map((t) => t.key)
