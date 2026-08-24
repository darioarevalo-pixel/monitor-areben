/**
 * El puente: los diseños confirmados del tablero → las columnas de una importación de Ingresos.
 *
 * # Por qué existe
 *
 * `DisenoColumna` y el `Diseno` del tablero son **la misma cosa escrita dos veces a mano**: alguien
 * elige una funda en Diseños y después re-tipea su nombre y vuelve a subir su foto en Ingresos. La
 * cadena entera es `disenos` (elegir) → `ingresos` (modelos + cantidades + proveedor = la orden) →
 * Gestión Nube (el nombre comercial) → Norte (qué se vendió de esa compra), y estaba cortada en el
 * primer eslabón. El costo de esa desconexión está medido: **352 de 2.873 unidades** que Norte no
 * pudo contar porque los diseños no estaban cargados (`lib/norte/core.ts`).
 *
 * # Qué defiende este archivo
 *
 *   1. **Sin nombre no viaja.** `normalizar('')` no matchea nunca contra GN, así que una columna
 *      sin nombre fabrica exactamente el agujero que el puente viene a cerrar.
 *   2. **`img` nunca empieza con `data:`.** El KV se reescribe entero en cada guardado de Ingresos
 *      y lo lee además Norte: una foto en base64 ahí se paga en las dos secciones, para siempre.
 *      Quien llame convierte antes (subiendo al Blob); acá se hace cumplir.
 *   3. **Idempotencia por `disenoId`**, mirando TODOS los bloques de la importación destino:
 *      mandarlo a otro bloque de la misma compra sigue siendo duplicar.
 *
 * El tipo de entrada es **estructural** y no `Diseno`: `lib/ingresos/` no importa `lib/disenos/`, y
 * la dependencia queda en una sola dirección.
 */

import { esDeMarca } from '@/lib/nav'
import { esAdmin, puedeSub, puedeVer, type Perfil } from '@/lib/permisos'
import type { Marca } from '@/lib/nav.datos'
import { mapBloque, mapIngreso } from './core'
import type { Bloque, DisenoColumna, Ingreso } from './tipos'

/** Lo que el puente necesita saber de un diseño del tablero. */
export type DisenoDeTablero = { id: string; name: string; url: string }

export type Preparado = {
  columnas: DisenoColumna[]
  /** Los que no viajan porque no tienen nombre: no cruzarían con nada en Gestión Nube. */
  sinNombre: DisenoDeTablero[]
  /** Nombres que normalizan igual entre los elegidos: en GN serían el mismo producto. */
  repetidos: string[]
}

/** Igual que el `norm` con el que Norte y el ✓ de GN comparan: sin acentos, sin dobles espacios. */
export function normNombre(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Arma las columnas a partir de los diseños elegidos.
 *
 * `nombreDe` e `imgDe` entran por parámetro para que esto sea puro y testeable: el nombre lo edita
 * el modal (los del tablero salen del nombre del archivo) y la `img` la resuelve la subida al Blob.
 */
export function columnasDesdeDisenos(
  ds: readonly DisenoDeTablero[],
  opts: { nid: () => string; nombreDe: (d: DisenoDeTablero) => string; imgDe: (d: DisenoDeTablero) => string },
): Preparado {
  const columnas: DisenoColumna[] = []
  const sinNombre: DisenoDeTablero[] = []
  const vistos = new Map<string, number>()

  for (const d of ds) {
    const nombre = (opts.nombreDe(d) || '').trim()
    if (!nombre) {
      sinNombre.push(d)
      continue
    }
    const img = opts.imgDe(d) || ''
    vistos.set(normNombre(nombre), (vistos.get(normNombre(nombre)) || 0) + 1)
    columnas.push({
      id: opts.nid(),
      nombre,
      // 🔴 El base64 no entra al KV ni de paso. Sin foto es recuperable —se pega desde Ingresos—;
      // una clave del KV engordada con fotos la pagan Ingresos y Norte en cada lectura.
      img: img.startsWith('data:') ? '' : img,
      disenoId: d.id,
    })
  }

  return {
    columnas,
    sinNombre,
    repetidos: [...vistos.entries()].filter(([, n]) => n > 1).map(([n]) => n),
  }
}

/**
 * Cuáles de estos diseños ya están en esta importación.
 *
 * Mira **todos los bloques**, no sólo el destino: la misma funda en otro bloque de la misma compra
 * sigue siendo la misma funda pedida dos veces.
 */
export function yaEnLaImportacion(g: Ingreso, disenoIds: readonly string[]): Set<string> {
  const quiero = new Set(disenoIds)
  const out = new Set<string>()
  for (const b of g.bloques || []) {
    for (const d of b.disenos || []) {
      if (d.disenoId && quiero.has(d.disenoId)) out.add(d.disenoId)
    }
  }
  return out
}

/** Agrega las columnas al final del bloque. No toca `celdas` ni los otros bloques. */
export function pasarADestino(list: Ingreso[], id: string, bid: string, columnas: DisenoColumna[]): Ingreso[] {
  if (!columnas.length) return list
  return mapIngreso(list, id, (g) => mapBloque(g, bid, (b) => ({ ...b, disenos: [...(b.disenos || []), ...columnas] })))
}

/**
 * Un bloque nuevo para recibir columnas del puente: **con cero columnas vacías**.
 *
 * ⚠️ `nuevoBloque` del core nace con 10 huecos, que es lo que quiere quien arma una importación a
 * mano. Acá las columnas ya vienen: usar aquél dejaría 34 fundas seguidas de 10 columnas en blanco
 * que hay que borrar una por una.
 */
export function bloqueParaElPuente(nid: () => string, nombre: string, modelos: Bloque['modelos']): Bloque {
  return { id: nid(), nombre, modelos, disenos: [], celdas: {} }
}

/**
 * Quién puede apretar el botón.
 *
 * Pide `ingresos.editar` **además** del permiso de Diseños, y no es celo: este botón hace lo mismo
 * que la vista Editar de Ingresos —crear columnas de diseño y, si se elige "importación nueva",
 * crear una importación entera—. Sin candado propio sería una puerta de al lado que saltea los dos
 * permisos granulares que Ingresos ya tiene. Mismo criterio que Faltantes: anotar entra con
 * `atencion`, decidir pide `pedidos-clientes`.
 *
 * ⛔ `ingresos.nombre` NO alcanza: su definición dice "no puede tocar cantidades, modelos, diseños,
 * bloques ni fotos", y crear columnas es crear diseños.
 *
 * ⚠️ Y el candado de verdad **no es éste**: el que valida es `bdi-catalogo/api/ingresos.js`, que
 * pide **admin**. Esto es honestidad del cliente para no ofrecer un botón que va a dar 403.
 */
export function puedePasarAIngresos(perfil: Perfil | null, marca: Marca): boolean {
  if (!esDeMarca('ingresos', marca)) return false
  if (!puedeVer(perfil, marca, 'ingresos')) return false
  return esAdmin(perfil) || puedeSub(perfil, marca, 'ingresos', 'editar')
}
