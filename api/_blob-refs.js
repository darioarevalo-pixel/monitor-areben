// Quién usa cada archivo del Blob. Es la mitad que hace que el inventario sirva para BORRAR y no
// sólo para mirar: sin esto, «tenés 545 MB» no dice cuáles se pueden tocar.
//
// 🔴 **LA REGLA DE ESTE ARCHIVO: lo que NO SE PUDO LEER no es «sin dueño».** Si una consulta falla,
// la carpeta que dependía de ella sale marcada como *no verificada* y la pantalla ⛔ no ofrece
// borrarla en lote. Un detector de huérfanos que ante un error contesta «no lo usa nadie» borra
// exactamente lo que estaba vivo, y el archivo no vuelve.
//
// 🔑 **Se buscan las URLs con una expresión regular sobre la fila entera, ⛔ no columna por
// columna.** Hoy viven en `canje_evidencias.archivo_url`, en el `datos` de un diseño, en el
// `pedido` de un paso de Meta y en el `fotos` de una devolución — cuatro formas distintas, tres de
// ellas adentro de un jsonb. Mirar columnas nombradas obligaría a acordarse de agregar la columna
// nueva el día que alguien guarde una URL en otro lado, y el precio de olvidarse es borrar un
// archivo vivo. Sobre la fila entera, una URL guardada en cualquier campo cuenta igual.
//
// ⚠️ **La galería de Ingresos NO ESTÁ ACÁ y no es un olvido**: sus URLs viven en el KV de
// bdi-catalogo (ver `lib/kv/cliente.ts`), no en esta base. La cruza la pantalla, que ya sabe leer
// ese KV con la sesión de quien mira. Por eso `CARPETAS_CUBIERTAS` no la incluye: desde el
// servidor, `ingresos/` es territorio sobre el que este archivo ⛔ no puede afirmar nada.
import { clienteBdi } from './_meta-lineas.js';
import { claveDeUrl } from '../lib/blob/inventario.core.js';

/**
 * Las tablas donde hoy vive una URL del Blob, con la carpeta que cada una explica.
 *
 * El `select` es `*` a propósito: lo que se busca es la URL en cualquier campo (ver arriba), y
 * pedir columnas sueltas volvería a atarlo a la forma de hoy.
 */
const FUENTES = [
  { tabla: 'canje_evidencias', carpeta: 'canjes' },
  { tabla: 'disenos', carpeta: 'disenos' },
  { tabla: 'disenos_rondas', carpeta: 'disenos' },
  { tabla: 'devoluciones', carpeta: 'reclamos' },
  // ⚠️ Esta se lee dos veces: acá para saber quién la nombra, y en `piezasYaEnMeta` para saber
  // cuáles de esas ya tienen su copia arriba. Ver el docblock de allá.
  { tabla: 'meta_ads_plan_paso', carpeta: 'piezas' },
];

/** Las carpetas sobre las que este archivo SÍ puede afirmar «no la usa nadie». */
export const CARPETAS_CUBIERTAS = [...new Set(FUENTES.map((f) => f.carpeta))];

/** Cuántas filas se leen por tabla. Ninguna de las cinco pasa hoy de 100; el tope es un freno. */
const TOPE_FILAS = 5000;

const RE_BLOB = /https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/[^"'\\\s)]+/gi;

/**
 * Qué archivos del Blob nombra la base, y qué carpetas quedaron sin verificar.
 *
 * @returns {{ usadas: Map<string, string>, sinVerificar: string[] }} `usadas` va del `pathname` al
 *   rótulo de quién lo usa («canjes», «diseños», …); `sinVerificar` son las carpetas cuya fuente
 *   falló y sobre las que ⛔ no se puede decir que algo sobre.
 */
export async function referenciasDeLaBase() {
  const supabase = clienteBdi();
  if (!supabase) return { usadas: new Map(), sinVerificar: [...CARPETAS_CUBIERTAS] };

  const usadas = new Map();
  const sinVerificar = new Set();

  await Promise.all(FUENTES.map(async ({ tabla, carpeta }) => {
    try {
      const { data, error } = await supabase.from(tabla).select('*').limit(TOPE_FILAS);
      if (error) throw new Error(error.message);
      const crudo = JSON.stringify(data || []);
      for (const url of crudo.match(RE_BLOB) || []) {
        const clave = claveDeUrl(url.replace(/[",]+$/, ''));
        if (clave) usadas.set(clave, tabla);
      }
      // 🔴 Una tabla que devuelve el tope entero puede tener más filas atrás, y las URLs de esas
      // filas NO se vieron. Se marca sin verificar por la misma razón que un error.
      if ((data || []).length >= TOPE_FILAS) sinVerificar.add(carpeta);
    } catch {
      sinVerificar.add(carpeta);
    }
  }));

  return { usadas, sinVerificar: [...sinVerificar] };
}

/**
 * ⭐ **Las piezas que Meta ya tiene, y que por eso acá sobran.**
 *
 * Cuando un paso `subir-pieza` queda en `hecho` con su `resultado_id`, **el video ya vive adentro de
 * Meta**: el aviso usa la copia de ellos y el archivo del Blob no lo abre nadie más. Son los que más
 * pesan de todo el store —el 7-sep-2026 eran 232 MB en siete archivos, contra 545 MB en total— y sin
 * esta función quedan «en uso» para siempre, porque la fila del plan los nombra.
 *
 * 🔴 **Alcanza con que UN paso que todavía no corrió la nombre para que NO entre.** El caso real
 * estaba en la base ese mismo día: `UNBOXING INFLUENCER 25-8.mov` colgaba de dos planes, uno hecho y
 * otro sin ejecutar. Si el archivo se fuera por el plan que ya corrió, el otro se quedaría sin nada
 * que subir. Por eso se junta primero lo que la nombra sin haber corrido, y recién después se
 * ofrece lo que queda.
 *
 * ⚠️ Un paso `cancelado` ⛔ no protege ni habilita: el que decide es el que todavía puede correr.
 */
export async function piezasYaEnMeta() {
  const supabase = clienteBdi();
  if (!supabase) return { enMeta: new Map(), ok: false };

  try {
    const { data, error } = await supabase.from('meta_ads_plan_paso').select('*').limit(TOPE_FILAS);
    if (error) throw new Error(error.message);

    const pendientes = new Set();
    const subidas = new Map();
    for (const paso of data || []) {
      const url = paso && paso.pedido && paso.pedido.url;
      const clave = url ? claveDeUrl(url) : null;
      if (!clave) continue;
      const estado = String(paso.estado || 'pendiente');
      if (estado === 'hecho' && paso.resultado_id) subidas.set(clave, String(paso.resultado_id));
      else if (estado !== 'cancelado') pendientes.add(clave);
    }
    for (const clave of pendientes) subidas.delete(clave);
    return { enMeta: subidas, ok: true };
  } catch {
    return { enMeta: new Map(), ok: false };
  }
}
