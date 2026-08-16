// El cliente HTTP de Gestión Nube: UNA implementación para los diez scripts que le pegan.
//
// POR QUÉ EXISTE
// -------------
// Había **diez copias** de `gnFetch`, y no eran copias: habían divergido. Medido el 16-ago-2026,
// cinco de las diez **no reintentaban los errores de red** —`fetch failed`, `ECONNRESET`, un
// timeout de DNS— porque su `fetch` estaba pelado, sin `try/catch`. En esas cinco, un corte de red
// de un segundo mata el job entero:
//
//     sync-diario-zattia · sync-inicial · sync-inicial-zattia · sync-inventario-solo ·
//     sync-productos-zattia
//
// 🔑 **Cuatro de las cinco son de Zattia, y la quinta es la que más corre**
// (`sync-inventario-solo`, 91 corridas en 30 días). O sea que la marca chica y el sync más
// frecuente eran justamente los menos protegidos, y nadie lo sabía porque el arreglo bueno estaba
// en el archivo de al lado. Es la misma factura que ya está en el git log: `54c314a` "Los otros 7
// scripts también morían cuando GN cortaba" — el mismo arreglo, siete veces, y aun así incompleto.
//
// LOS TRES PRESUPUESTOS, QUE SON DISTINTOS
// ----------------------------------------
// 🔴 **El corte por límite de solicitudes NO gasta reintentos.** Esperar un minuto porque GN te
// frenó no es "un intento fallido más": si sale del mismo presupuesto, el sync se queda sin
// reintentos reales para los 5xx justo cuando más los necesita. Por eso `cortes` lleva su propia
// cuenta contra `MAX_RATE_LIMIT` y el `attempt--` devuelve el intento.
//
// La `pausaPagina` es el tercero y es de cada script, no de acá: los que barren catálogos enteros
// van a 1100 ms y los incrementales a 400. Cambiarla es cambiar cuánto se le apoya a GN, así que
// cada llamador pasa la suya y no hay un default silencioso que uniforme eso sin querer.
import { esRateLimit, esperaRateLimit, MAX_RATE_LIMIT } from './gn-rate-limit.mjs';

export const GN_BASE = 'https://www.gestionnube.com/api/v1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Cada cuántas páginas descarga `fetchAllPagesStreaming`. Si el job se cae a mitad, lo que ya bajó
 * quedó persistido y re-correr es idempotente.
 */
const FLUSH_EVERY = 50;

/**
 * Arma el cliente de una marca.
 *
 * @param {object} opciones
 * @param {string} opciones.token       el `GN_TOKEN` de esa marca — uno por marca, nunca compartido
 * @param {number} [opciones.retries]   intentos para errores de red y 5xx (el corte va aparte)
 * @param {number} [opciones.pausaPagina] ms entre páginas en `fetchAllPages`
 * @param {string} [opciones.base]
 */
export function crearClienteGN({ token, retries = 5, pausaPagina = 400, base = GN_BASE }) {
  if (!token) throw new Error('crearClienteGN: falta el token de Gestión Nube');

  async function gnFetch(path, intentos = retries) {
    let cortes = 0;
    for (let attempt = 1; attempt <= intentos; attempt++) {
      let res, text;
      try {
        res = await fetch(`${base}/${path}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        text = await res.text();
      } catch (e) {
        // 🔴 Éste es el `catch` que faltaba en cinco de las diez copias. Sin él, `fetch failed`
        // sale disparado y se lleva el job puesto, aunque el siguiente intento hubiera andado.
        if (attempt < intentos) {
          const wait = 2000 * attempt;
          console.warn(`  ⚠️  red ${e.message} en ${path}, reintentando en ${wait}ms (${attempt}/${intentos})...`);
          await sleep(wait);
          continue;
        }
        throw e;
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        // GN contesta HTML cuando está caído o cuando corta: un 502 de su proxy no es JSON.
        if ((res.status >= 500 || esRateLimit(res, null)) && attempt < intentos) {
          console.warn(`  ⚠️  ${res.status} en ${path}, reintentando (${attempt}/${intentos})...`);
          await sleep(2000 * attempt);
          continue;
        }
        throw new Error(`Respuesta no-JSON de GN [${res.status}] en ${path}: ${text.substring(0, 200)}`);
      }
      if (!res.ok) {
        if (esRateLimit(res, data) && cortes < MAX_RATE_LIMIT) {
          cortes++;
          const wait = esperaRateLimit(res, cortes);
          console.warn(
            `  ⏳ GN cortó por límite de solicitudes en ${path}. Esperando ${Math.round(wait / 1000)}s (${cortes}/${MAX_RATE_LIMIT})...`,
          );
          await sleep(wait);
          attempt--; // el corte no gasta el presupuesto de reintentos de arriba
          continue;
        }
        if (res.status >= 500 && attempt < intentos) {
          console.warn(`  ⚠️  ${res.status} en ${path}, reintentando (${attempt}/${intentos})...`);
          await sleep(2000 * attempt);
          continue;
        }
        throw new Error(data.message || data.error || `Error ${res.status} en ${path}`);
      }
      return data;
    }
  }

  async function fetchAllPages(basePath, pausa = pausaPagina) {
    const results = [];
    let page = 1;
    for (;;) {
      const sep = basePath.includes('?') ? '&' : '?';
      process.stdout.write(`  página ${page}...`);
      const data = await gnFetch(`${basePath}${sep}page=${page}`);
      const items = data.data || [];
      results.push(...items);
      process.stdout.write(` ${items.length} registros\n`);
      if (!data.meta?.has_more_pages || items.length === 0) break;
      page++;
      await sleep(pausa);
    }
    return results;
  }

  /** Igual que `fetchAllPages`, pero llama a `onBatch(rows, page)` cada `FLUSH_EVERY` páginas. */
  async function fetchAllPagesStreaming(basePath, onBatch, pausa = 1100) {
    let buffer = [];
    let page = 1;
    for (;;) {
      const sep = basePath.includes('?') ? '&' : '?';
      process.stdout.write(`  página ${page}...`);
      const data = await gnFetch(`${basePath}${sep}page=${page}`);
      const items = data.data || [];
      buffer.push(...items);
      process.stdout.write(` ${items.length} registros\n`);
      const noMore = !data.meta?.has_more_pages || items.length === 0;
      if (buffer.length && (page % FLUSH_EVERY === 0 || noMore)) {
        console.log(`  → flush parcial (página ${page}, ${buffer.length} registros)...`);
        await onBatch(buffer, page);
        buffer = [];
      }
      if (noMore) break;
      page++;
      await sleep(pausa);
    }
  }

  return { gnFetch, fetchAllPages, fetchAllPagesStreaming };
}
