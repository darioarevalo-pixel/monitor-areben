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
 * El traslado de un feriado nacional trasladable, según el **art. 6 de la Ley 27.399**: martes y
 * miércoles se corren al lunes anterior, jueves y viernes al lunes siguiente.
 *
 * ⚠️ Son cuatro fechas y sólo cuatro: Güemes (17-jun), San Martín (17-ago), Diversidad Cultural
 * (12-oct) y Soberanía Nacional (20-nov). El resto de los feriados es inamovible y no pasa por acá.
 *
 * 🔴 **Hardcodear el día del almanaque es lo que hay que evitar.** El 20-nov-2026 cae viernes, así
 * que el feriado real es el lunes 23; escribir "20 de noviembre" da bien un año y mal los otros. Es
 * el mismo error que el tercer domingo de octubre.
 *
 * ⚠️ Sábado y domingo NO se resuelven acá: el decreto 614/2025 dice que **podrán** moverse al lunes
 * o viernes más cercano, y "podrán" no es una regla — la decide el Ejecutivo año por año. En esos
 * años la fecha sale marcada como estimada (ver `estimadaEn` en el catálogo) y se confirma a mano.
 */
export function trasladarFeriado(fecha) {
  const dow = diaDeSemanaDe(fecha)
  if (dow === 2 || dow === 3) return sumarDias(fecha, 1 - dow)  // martes/miércoles → lunes anterior
  if (dow === 4 || dow === 5) return sumarDias(fecha, 8 - dow)  // jueves/viernes → lunes siguiente
  return fecha                                                   // lunes queda; sáb/dom, ver arriba
}

/** ¿Este `YYYY-MM-DD` cae sábado o domingo? Es cuando el traslado deja de ser calculable. */
export function caeEnFinDeSemana(fecha) {
  const dow = diaDeSemanaDe(fecha)
  return dow === 0 || dow === 6
}

/**
 * El Domingo de Resurrección de un año, como `YYYY-MM-DD`. **Es exacto, no es una estimación.**
 *
 * De acá cuelgan cinco feriados del calendario argentino —los dos de Carnaval, Jueves Santo y
 * Viernes Santo— que se mueven hasta **35 días** entre un año y el otro: en 2024 Pascua fue el
 * 31-mar y en 2025 el 20-abr. Es la única fecha del catálogo que no se puede escribir a mano ni
 * derivar de un "n-ésimo domingo": depende de la luna llena posterior al equinoccio.
 *
 * Es el **cómputo gregoriano** (Meeus/Jones/Butcher), que es la Pascua occidental — la que sigue el
 * calendario oficial argentino. La ortodoxa cae otro día y no es la que rige acá.
 *
 * Sale de aritmética entera y no de `Date`: el algoritmo devuelve mes y día directamente, así que
 * no hay ningún instante intermedio que una zona horaria pueda correr un día para atrás. Vale para
 * cualquier año del calendario gregoriano; la Pascua siempre cae entre el 22-mar y el 25-abr.
 */
export function pascuaDe(anio) {
  const a = anio % 19
  const b = Math.floor(anio / 100)
  const c = anio % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const dias = h + l - 7 * m + 114
  return iso(anio, Math.floor(dias / 31), (dias % 31) + 1)
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
 *
 * # `tipo` y `clase` son preguntas distintas, y por eso son dos campos
 *
 * `clase` (fija / regla / anunciada) contesta **cuánto le creo a la fecha**. `tipo` contesta **qué
 * clase de cosa es**, que es otra cosa: un feriado puede ser fijo (25-dic), regla (el traslado del
 * 20-nov) o anunciado (los puentes turísticos, que salen por decreto y no tienen regla).
 *
 * `tipo` decide **con qué peldaño arranca la pregunta**: una comercial sugiere `fuerte`, un feriado
 * o una efeméride sugieren `institucional` — algo hay que subir, pero no es una campaña. Es una
 * sugerencia del primer clic, no un límite: el 9 de julio en año de Mundial se sube a `fuerte` y se
 * comporta como cualquier comercial. Ver `PRIORIDADES`.
 *
 * `estimadaEn(anio)` es la válvula para el año en que una regla deja de ser calculable — el caso
 * real es un feriado trasladable que cae sábado o domingo, donde el decreto 614/2025 dice que
 * *podrán* moverse y "podrán" no se puede computar. Ese año sale con chip ámbar y se confirma a mano.
 */
export const FECHAS_COMERCIALES = [
  {
    clave: 'anio-nuevo',
    titulo: 'Año Nuevo',
    clase: 'fija',
    tipo: 'feriado',
    anticipoDias: 5,
    resolver: (a) => iso(a, 1, 1),
    porQue: 'Inamovible. El local no abre y los envíos no se despachan: el corte real es el 30-dic.',
  },
  {
    clave: 'reyes',
    titulo: 'Reyes',
    clase: 'fija',
    tipo: 'comercial',
    anticipoDias: 21,
    resolver: (a) => iso(a, 1, 6),
    porQue: 'Última compra de regalo del verano y la que liquida lo que sobró de Navidad.',
  },
  {
    clave: 'san-valentin',
    titulo: 'San Valentín',
    clase: 'fija',
    tipo: 'comercial',
    anticipoDias: 14,
    resolver: (a) => iso(a, 2, 14),
    porQue: 'Regalo de precio medio: entra tanto una funda como una prenda.',
  },
  {
    clave: 'carnaval-lunes',
    titulo: 'Carnaval (lunes)',
    clase: 'regla',
    tipo: 'feriado',
    anticipoDias: 5,
    // Cuelga de Pascua: 48 días antes. No es "el lunes de febrero" — en 2024 cayó el 12-feb y en
    // 2025 el 3-mar. Ver `pascuaDe()`.
    resolver: (a) => sumarDias(pascuaDe(a), -48),
    porQue: 'Fin de semana largo de cuatro días y arranque de temporada: el local cierra dos.',
  },
  {
    clave: 'carnaval-martes',
    titulo: 'Carnaval (martes)',
    clase: 'regla',
    tipo: 'feriado',
    anticipoDias: 5,
    resolver: (a) => sumarDias(pascuaDe(a), -47),
    porQue: 'El segundo día del fin de semana largo. Inamovible: NO se traslada aunque caiga martes.',
  },
  {
    clave: 'dia-mujer',
    titulo: 'Día de la Mujer',
    clase: 'fija',
    tipo: 'comercial',
    anticipoDias: 10,
    resolver: (a) => iso(a, 3, 8),
    porQue: 'No es fecha de descuento sino de contenido: la que se resuelve mal se nota mucho.',
  },
  {
    clave: 'memoria',
    titulo: 'Día de la Memoria por la Verdad y la Justicia',
    clase: 'fija',
    tipo: 'feriado',
    anticipoDias: 5,
    resolver: (a) => iso(a, 3, 24),
    porQue: 'Inamovible. El local no abre y NO se comunica nada comercial: una promo ese día es un papelón.',
  },
  {
    clave: 'malvinas',
    titulo: 'Día del Veterano y de los Caídos en Malvinas',
    clase: 'fija',
    tipo: 'feriado',
    anticipoDias: 5,
    resolver: (a) => iso(a, 4, 2),
    porQue: 'Inamovible. El local no abre. Como el 24 de marzo, no es fecha para vender nada.',
  },
  {
    clave: 'jueves-santo',
    titulo: 'Jueves Santo',
    clase: 'regla',
    tipo: 'feriado',
    anticipoDias: 5,
    resolver: (a) => sumarDias(pascuaDe(a), -3),
    // ⚠️ Es día NO LABORABLE, no feriado: la ley deja que cada empleador decida si abre. Va igual
    // en la lista porque cambia el día del local y del correo, que es para lo que se mira.
    porQue: 'No laborable, no feriado: el local PUEDE abrir. Arranca el fin de semana largo más largo del año.',
  },
  {
    clave: 'viernes-santo',
    titulo: 'Viernes Santo',
    clase: 'regla',
    tipo: 'feriado',
    anticipoDias: 5,
    resolver: (a) => sumarDias(pascuaDe(a), -2),
    porQue: 'Inamovible y feriado de verdad. Semana Santa se lleva puesta una semana de despachos.',
  },
  {
    clave: 'trabajador',
    titulo: 'Día del Trabajador',
    clase: 'fija',
    tipo: 'feriado',
    anticipoDias: 5,
    resolver: (a) => iso(a, 5, 1),
    porQue: 'Inamovible. No abre nada, ni el correo: lo que se despacha el 30 llega después del 2.',
  },
  {
    clave: 'hot-sale',
    titulo: 'Hot Sale',
    clase: 'anunciada',
    tipo: 'comercial',
    anticipoDias: 21,
    // Estimación: segundo lunes de mayo. Le pegó a 2023 (8-may), 2024 (13-may) y 2025 (12-may),
    // pero la fecha real la anuncia la CACE y no hay regla: por eso sale marcada como estimada.
    resolver: (a) => iso(a, 5, nEsimoDiaDeSemana(a, 5, 1, 2)),
    porQue: 'El pico de venta online del primer semestre. Se compite con todo el mercado a la vez.',
    comoSeConfirma: 'La anuncia la CACE (cace.org.ar), normalmente con dos o tres meses de aviso.',
  },
  {
    clave: 'revolucion-mayo',
    titulo: 'Día de la Revolución de Mayo',
    clase: 'fija',
    tipo: 'feriado',
    anticipoDias: 5,
    resolver: (a) => iso(a, 5, 25),
    porQue: 'Inamovible. Cae pegado al Hot Sale casi todos los años y le parte la semana de envíos.',
  },
  {
    clave: 'dia-padre',
    titulo: 'Día del Padre',
    clase: 'regla',
    tipo: 'comercial',
    anticipoDias: 21,
    resolver: (a) => iso(a, 6, nEsimoDiaDeSemana(a, 6, 0, 3)),
    porQue: 'Tercer domingo de junio en Argentina — no coincide con el de varios otros países.',
  },
  {
    clave: 'guemes',
    titulo: 'Paso a la Inmortalidad de Güemes',
    clase: 'regla',
    tipo: 'feriado',
    anticipoDias: 5,
    // Trasladable (art. 6 de la Ley 27.399), igual que San Martín, Diversidad y Soberanía.
    resolver: (a) => trasladarFeriado(iso(a, 6, 17)),
    estimadaEn: (a) => caeEnFinDeSemana(iso(a, 6, 17)),
    porQue: 'Cae a días del Día del Padre: es el fin de semana largo en que se retira lo que se compró.',
  },
  {
    clave: 'belgrano',
    titulo: 'Paso a la Inmortalidad de Belgrano',
    clase: 'fija',
    tipo: 'feriado',
    anticipoDias: 5,
    // ⚠️ El 20 de junio es INAMOVIBLE y el 17 (Güemes) es trasladable, aunque caigan la misma
    // semana: dos feriados vecinos con reglas distintas es exactamente lo que se escribe mal a mano.
    resolver: (a) => iso(a, 6, 20),
    porQue: 'Inamovible. Con Güemes tres días antes, la semana del Día del Padre queda partida en dos.',
  },
  {
    clave: 'independencia',
    titulo: 'Día de la Independencia',
    clase: 'fija',
    tipo: 'feriado',
    anticipoDias: 5,
    resolver: (a) => iso(a, 7, 9),
    porQue: 'Inamovible y en plenas vacaciones de invierno: el local cierra con la calle llena.',
  },
  {
    clave: 'dia-amigo',
    titulo: 'Día del Amigo',
    clase: 'fija',
    tipo: 'comercial',
    anticipoDias: 10,
    resolver: (a) => iso(a, 7, 20),
    porQue: 'Regalo barato y de última hora: funciona el envío rápido más que el descuento.',
  },
  {
    clave: 'dia-nino',
    titulo: 'Día del Niño',
    clase: 'anunciada',
    tipo: 'comercial',
    anticipoDias: 21,
    // Estimación: tercer domingo de agosto. La define la CAIP y ya se movió más de una vez
    // (llegó a caer en el segundo domingo), así que va marcada como estimada.
    resolver: (a) => iso(a, 8, nEsimoDiaDeSemana(a, 8, 0, 3)),
    porQue: 'Pesa poco para estas dos marcas, pero mueve el tráfico general y encarece la pauta.',
    comoSeConfirma: 'La define la CAIP (Cámara Argentina de la Industria del Juguete).',
  },
  {
    clave: 'san-martin',
    titulo: 'Paso a la Inmortalidad de San Martín',
    clase: 'regla',
    tipo: 'feriado',
    anticipoDias: 5,
    // Trasladable (art. 6 de la Ley 27.399). En 2026 el 17 cae lunes y no se mueve.
    resolver: (a) => trasladarFeriado(iso(a, 8, 17)),
    // El único año en que la regla deja de alcanzar: si cae sábado o domingo, el decreto 614/2025
    // dice que *podrá* moverse, y "podrá" no se computa. Sale estimada y se confirma a mano.
    estimadaEn: (a) => caeEnFinDeSemana(iso(a, 8, 17)),
    porQue: 'Feriado largo y el local cerrado: la gente compra online. Alcanza con una pieza institucional.',
  },
  {
    clave: 'primavera',
    titulo: 'Primavera y Día del Estudiante',
    clase: 'fija',
    tipo: 'comercial',
    anticipoDias: 14,
    resolver: (a) => iso(a, 9, 21),
    porQue: 'Arranque del cambio de temporada: es la excusa para mostrar lo nuevo.',
  },
  {
    clave: 'diversidad-cultural',
    titulo: 'Respeto a la Diversidad Cultural',
    clase: 'regla',
    tipo: 'feriado',
    anticipoDias: 5,
    resolver: (a) => trasladarFeriado(iso(a, 10, 12)),
    // El único año en que la regla deja de alcanzar: si cae sábado o domingo, el decreto 614/2025
    // dice que *podrá* moverse, y "podrá" no se computa. Sale estimada y se confirma a mano.
    estimadaEn: (a) => caeEnFinDeSemana(iso(a, 10, 12)),
    porQue: 'Fin de semana largo pegado al Día de la Madre: mueve tráfico sin ser fecha de venta.',
  },
  {
    clave: 'dia-madre',
    titulo: 'Día de la Madre',
    clase: 'regla',
    tipo: 'comercial',
    anticipoDias: 30,
    resolver: (a) => iso(a, 10, nEsimoDiaDeSemana(a, 10, 0, 3)),
    porQue: 'La fecha más fuerte del segundo semestre después de Navidad. Pide sesión de fotos propia.',
  },
  {
    clave: 'cybermonday-ar',
    titulo: 'CyberMonday',
    clase: 'anunciada',
    tipo: 'comercial',
    anticipoDias: 21,
    // Estimación: primer lunes de noviembre. Le pegó a 2024 (4-nov) y 2025 (3-nov); en 2023 arrancó
    // el 30 de octubre. La anuncia la CACE.
    resolver: (a) => iso(a, 11, nEsimoDiaDeSemana(a, 11, 1, 1)),
    porQue: 'El Hot Sale del segundo semestre, y cae pegado a Black Friday: hay que decidir en cuál jugar.',
    comoSeConfirma: 'La anuncia la CACE (cace.org.ar). Ojo que puede arrancar el último lunes de octubre.',
  },
  {
    clave: 'soberania',
    titulo: 'Día de la Soberanía Nacional',
    clase: 'regla',
    tipo: 'feriado',
    anticipoDias: 5,
    // 🔴 En 2026 el 20 cae VIERNES, así que el feriado real es el lunes 23. Hardcodear
    // "20 de noviembre" da bien un año y mal los otros.
    resolver: (a) => trasladarFeriado(iso(a, 11, 20)),
    // El único año en que la regla deja de alcanzar: si cae sábado o domingo, el decreto 614/2025
    // dice que *podrá* moverse, y "podrá" no se computa. Sale estimada y se confirma a mano.
    estimadaEn: (a) => caeEnFinDeSemana(iso(a, 11, 20)),
    porQue: 'Cae entre el CyberMonday y Black Friday: es el fin de semana largo que parte la campaña en dos.',
  },
  {
    clave: 'black-friday',
    titulo: 'Black Friday',
    clase: 'regla',
    tipo: 'comercial',
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
    tipo: 'comercial',
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
    tipo: 'comercial',
    anticipoDias: 30,
    resolver: (a) => iso(a, 12, 25),
    porQue: 'La fecha más grande del año. El corte real es el envío, no el 25: se planifica para atrás.',
  },
  {
    clave: 'empleado-comercio',
    titulo: 'Día del Empleado de Comercio',
    clase: 'anunciada',
    tipo: 'comercial',
    anticipoDias: 7,
    // Estimación: el 26 de septiembre, la fecha del gremio. El asueto real lo fija el convenio y se
    // corre casi todos los años al lunes de esa semana, así que va marcado como estimado.
    resolver: (a) => iso(a, 9, 26),
    porQue: 'El local no abre: hay que avisarlo antes y el online se lleva el día entero.',
    comoSeConfirma: 'Lo fija el CCT de Comercio (FAECyS). Suele correrse al lunes de esa semana.',
  },
  {
    clave: 'halloween',
    titulo: 'Halloween',
    clase: 'fija',
    tipo: 'comercial',
    anticipoDias: 14,
    resolver: (a) => iso(a, 10, 31),
    porQue: 'Crece todos los años y es barata de surfear: no pide producto propio, pide contenido.',
  },
  {
    clave: 'puente-diciembre',
    titulo: 'Puente turístico de diciembre',
    clase: 'anunciada',
    tipo: 'feriado',
    anticipoDias: 5,
    // Los días no laborables con fines turísticos los decreta el Ejecutivo año por año y NO tienen
    // regla: por eso va estimado. Lo único predecible es la forma del puente — si el 8 cae martes
    // se pega el lunes, si cae jueves se pega el viernes. Los otros años no hay puente que estimar
    // y devuelve null, que `proximas()` ya sabe saltear.
    resolver: (a) => {
      const f = iso(a, 12, 8)
      const dow = diaDeSemanaDe(f)
      if (dow === 2) return sumarDias(f, -1)
      if (dow === 4) return sumarDias(f, 1)
      return null
    },
    porQue: 'Alarga el fin de semana de la Inmaculada y se lleva puesta una semana de producción.',
    comoSeConfirma: 'Lo decreta el Poder Ejecutivo, normalmente junto con el calendario del año.',
  },
  {
    clave: 'inmaculada',
    titulo: 'Inmaculada Concepción',
    clase: 'fija',
    tipo: 'feriado',
    anticipoDias: 5,
    resolver: (a) => iso(a, 12, 8),
    porQue: 'Inamovible. Arranque simbólico de la temporada navideña: es el día en que se arma el árbol.',
  },
  {
    clave: 'nochebuena',
    titulo: 'Nochebuena',
    clase: 'fija',
    tipo: 'comercial',
    anticipoDias: 21,
    resolver: (a) => iso(a, 12, 24),
    porQue: 'El corte real de Navidad es el envío, no el 25: es la fecha contra la que se planifica para atrás.',
  },
  {
    clave: 'fin-de-ano',
    titulo: 'Fin de año',
    clase: 'fija',
    tipo: 'comercial',
    anticipoDias: 14,
    resolver: (a) => iso(a, 12, 31),
    porQue: 'Cierre, saludo y el aviso de cuándo se retoman los envíos. Se olvida todos los años.',
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
 * Devuelve `{ fecha, estimada }`. `estimada` es `true` para las anunciadas —una regla como el tercer
 * domingo de octubre no es una estimación, es exacta— **y también para el año puntual en que una
 * regla deja de alcanzar**: un feriado trasladable que cae fin de semana se mueve por decisión del
 * Ejecutivo, no por regla, así que ese año la fecha es tan estimada como un Hot Sale.
 */
export function resolverComercial(clave, anio) {
  const f = fechaComercialDe(clave)
  if (!f) return null
  const fecha = f.resolver(anio)
  if (!fecha || fecha.includes('null')) return null
  return { fecha, estimada: f.clase === 'anunciada' || !!f.estimadaEn?.(anio) }
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
 * # Es UNA escalera, y el peldaño de abajo no exige nada
 *
 * Los cuatro peldaños van de más a menos trabajo. `institucional` existe porque un feriado no pide
 * campaña —pide que subamos algo y listo— pero **tampoco es "lo dejamos pasar"**: está decidido, se
 * ve, y no reclama nada.
 *
 * 🔑 **Subir de escalón es toda la mecánica de promoción que hace falta.** El 9 de julio en año de
 * Mundial no necesita un mecanismo aparte: se lo pasa a `fuerte` y se comporta como cualquier fecha
 * comercial. Y como la decisión es **por año**, al año siguiente vuelve a nacer institucional solo,
 * sin que nadie tenga que acordarse de bajarlo.
 *
 * Los dos flags NO son el mismo y por eso son dos:
 *
 *  - `arrastraProduccion` — pide fecha de arranque, dibuja el renglón "Etapas armadas" y entra en
 *    `laQueAprieta()`. Sólo `suave` y `fuerte`.
 *  - `apaga` — la fila se dibuja atenuada y deja de competir por la atención. Sólo `pasamos`.
 *
 * `institucional` tiene los dos en `false`, que es justamente lo que no se podía expresar con un
 * flag solo: decidida y visible, pero sin reclamar trabajo.
 */
export const PRIORIDADES = [
  {
    key: 'fuerte',
    label: 'Le vamos fuerte',
    corto: 'Fuerte',
    arrastraProduccion: true,
    apaga: false,
    ayuda: 'Campaña armada: piezas propias, pauta y las tres etapas cubiertas.',
  },
  {
    key: 'suave',
    label: 'Algo suave',
    corto: 'Suave',
    arrastraProduccion: true,
    apaga: false,
    ayuda: 'Estamos presentes sin producir de cero: una historia, un mail, un carrusel con lo que ya hay.',
  },
  {
    key: 'institucional',
    label: 'Algo institucional',
    corto: 'Institucional',
    arrastraProduccion: false,
    apaga: false,
    ayuda: 'Subimos una pieza y listo. No pide embudo ni fecha de arranque: se resuelve en el día.',
  },
  {
    key: 'pasamos',
    label: 'La dejamos pasar',
    corto: 'Pasamos',
    arrastraProduccion: false,
    apaga: true,
    ayuda: 'No hacemos nada para esta fecha. Queda en la lista para no volver a discutirla.',
  },
]

/**
 * Qué peldaño se ofrece primero según qué clase de cosa es la fecha.
 *
 * Es una **sugerencia del primer clic, no un techo**: los cuatro peldaños se ofrecen siempre. Lo
 * único que cambia es cuál viene marcado al abrir, porque el caso frecuente de un feriado es "algo
 * subimos" y el de una comercial es "esto lo trabajamos".
 */
export function prioridadSugerida(tipo) {
  return tipo === 'feriado' || tipo === 'efemeride' ? 'institucional' : 'fuerte'
}

export const CLAVES_PRIORIDAD = PRIORIDADES.map((p) => p.key)

/** Una prioridad por su clave, o `null`. */
export function prioridadDe(key) {
  return PRIORIDADES.find((p) => p.key === String(key)) || null
}

/** ¿Esta prioridad manda producir algo? `institucional`, `pasamos` y "sin decidir" no. */
export function juegaLaFecha(key) {
  return !!prioridadDe(key)?.arrastraProduccion
}

/** ¿La fila se dibuja atenuada? Sólo `pasamos`. `institucional` está decidida y se ve normal. */
export function apagaLaFila(key) {
  return !!prioridadDe(key)?.apaga
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

/**
 * La hora de un hito, normalizada a `HH:MM` de 24 horas, o `null`.
 *
 * 🔑 **La hora es opcional y `null` no es "medianoche": es "ese día".** Una sesión de fotos empieza
 * a las 9 y un mail sale 18:30, pero una llegada de mercadería es del día y nada más. Rellenar la
 * que falta con `00:00` haría que el calendario ordene por un momento que nadie eligió y muestre
 * "0:00" al lado de cosas que no tienen hora.
 *
 * Vive acá, en el core, porque `api/_calendario.js` la valida antes de guardar y no puede importar
 * TypeScript. El `<input type="time">` manda `HH:MM` (y `HH:MM:SS` si el navegador tiene segundos
 * puestos, que Safari hace): se corta a los cinco caracteres en vez de rechazarlo.
 */
export function normalizarHora(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}
