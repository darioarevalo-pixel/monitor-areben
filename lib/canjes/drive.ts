/**
 * Cómo se llama en Drive lo que archivamos de un canje. **Es puro**: acá no se habla ni con Google
 * ni con el Blob (eso vive en `lib/drive/subir.ts`), sólo se arman nombres.
 *
 * # Por qué el nombre importa más de lo que parece
 *
 * Cuando el archivo se manda a Drive **se borra del buzón**, así que lo que quede en Drive es todo
 * lo que va a haber. Un `IMG_4821.jpg` suelto en una carpeta no dice de quién es ni de qué canje, y
 * el material de una creadora termina mezclado con el de otra a la primera vez que alguien arrastra
 * algo de lugar.
 *
 * Lo decidió Bruno el 21-ago-2026, mirando los nombres puestos al lado, y lo corrigió el 24-ago:
 *
 *  - **La carpeta arranca por el nombre** —la cuenta de Instagram—, después la fecha y después el
 *    número del canje. ⚠️ Antes la fecha iba adelante, para que Drive las ordenara solas por orden
 *    de llegada; se cambió a sabiendas de que eso se pierde: la carpeta se busca **por quién es**,
 *    y ordenar por fecha es una columna de Drive, mientras que buscar a alguien entre cuarenta
 *    carpetas que empiezan todas con `2026-` no lo es.
 *  - **Los archivos van numerados y conservan el nombre que les puso el teléfono de ella.** El
 *    número es lo que les da orden; el nombre original es lo que permite rastrear el que ella
 *    todavía tiene en su galería cuando pregunta por uno.
 */

/**
 * Drive parte los nombres por `/`, así que una barra crea una carpeta fantasma. Los saltos de línea
 * pasan igual y dejan un nombre que no se puede leer en la lista.
 */
function limpio(t: string): string {
  return String(t || '').replace(/[/\\\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * La subcarpeta del canje: `@lucia.mendez · 2026-08-21 · C-0064`.
 *
 * La fecha es la del **primer archivo que dejó ella**, no la de hoy: la carpeta cuenta cuándo llegó
 * el material, y archivarlo dos semanas después no cambia ese hecho. Sin fecha (un caso que no
 * debería pasar) queda igual armado, con lo que sí se sabe — y sin Instagram también, que es el
 * caso en que el nombre nuevo se parece al viejo.
 *
 * ⚠️ **Las carpetas ya creadas no se renombran**: la subcarpeta se guarda en `canjes.drive_carpeta_id`
 * la primera vez y lo que se archive después entra en ésa. Este cambio vale para las nuevas.
 */
export function nombreCarpetaCanje(fechaISO: string | null | undefined, instagram: string, numero: string): string {
  const partes = [
    instagram ? `@${limpio(instagram).replace(/^@+/, '')}` : '',
    limpio(fechaISO || ''),
    limpio(numero),
  ].filter(Boolean)
  return partes.join(' · ')
}

/**
 * El nombre original, sacándole lo que le agregó el buzón.
 *
 * 🔑 **Vercel Blob le pega un sufijo de 30 caracteres al azar antes de la extensión** —medido
 * contra la galería de Ingresos: `foto-01C9Y95YVuIyutw6CcOLf6NeTTqHQr.jpg`—. Es lo que hace que dos
 * personas puedan subir `IMG_0001.jpg` sin pisarse, pero pegado en Drive queda un nombre ilegible.
 *
 * ⚠️ Se saca **sólo si calza exacto**: 30 caracteres del alfabeto del sufijo, pegados con un guion
 * justo antes de la extensión. Un nombre propio que termine parecido se deja tal cual — es mejor un
 * nombre largo que uno recortado a mitad de palabra.
 */
export function nombreOriginal(url: string): string {
  let ultimo = ''
  try {
    ultimo = decodeURIComponent(new URL(url).pathname).split('/').pop() || ''
  } catch {
    ultimo = String(url || '').split('/').pop() || ''
  }
  return ultimo.replace(/-[A-Za-z0-9]{30}(\.[A-Za-z0-9]+)$/, '$1') || 'archivo'
}

/** `01-IMG_4821.jpg`. El número ordena; el resto es lo que mandó el teléfono de ella. */
export function nombreArchivoDrive(indice: number, url: string): string {
  const n = String(Math.max(1, indice)).padStart(2, '0')
  return `${n}-${limpio(nombreOriginal(url))}`
}
