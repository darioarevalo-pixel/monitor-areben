/**
 * La marca de la Caja en la PANTALLA (el chip del POS, la pantalla de la clienta y el tótem). Los datos
 * de la marca —nombre, local, depósito, modo Local— viven en `lib/caja/marcas.core.js`, que también lee
 * el servidor; acá se le suma el color, que es de la pantalla. 🔑 El POS es UNO solo y la marca es
 * configuración (Bruno, 5-oct). El logo ⛔ va acá: es el del ticket (`ticket_logo` de la configuración).
 *
 * 🔑 V4 (12-oct): la marca ACTIVA la elige la pantalla que monta la Caja (la pestaña con la marca del
 * shell; `/pos`, `/pos/cliente` y `/pos/totem` con `?marca=` o la del shell) con `usarMarcaCaja`, ANTES de
 * pedir nada: de ella salen el `store` de cada pedido al servidor (`cliente.ts`), las claves del
 * `localStorage` y `MARCA_CAJA`. Una pestaña del navegador = una marca.
 *
 * ⚠️ El color de identidad todavía es el índigo del monitor: el de cada marca lo elige Bruno.
 */
import { useState } from 'react'
import { color } from '@/components/ui/tokens'
import { MARCA_POR_DEFECTO, marcaDeCaja } from '@/lib/caja/marcas.core.js'
import type { Marca } from '@/lib/nav.datos'

/** El Instagram de cada marca, para «Seguinos en …» de la pantalla de gracias. Vacío ⇒ ⛔ se muestra. */
const INSTAGRAM: Record<string, string> = {
  // La cuenta de la marca (97.765 seguidores, id 17841464104146773 en `areben-marketing`).
  zattia: '@zattia_co',
}

let activa: string = MARCA_POR_DEFECTO

/** Elige la marca de la Caja de esta pestaña. Una que ⛔ tiene Caja deja la de antes y devuelve false. */
export function usarMarcaCaja(store: string | null | undefined): boolean {
  if (!marcaDeCaja(store)) return false
  activa = String(store).toLowerCase()
  return true
}

/** El `store` de la Caja de esta pestaña (`zattia` | `bdi`). */
export const storeCaja = (): Marca => activa as Marca

/**
 * La marca de la Caja para `/pos` y compañía: la de `?marca=` si tiene Caja; si no, la del shell si tiene;
 * si no, la de siempre. ⛔ Elige una marca sin Caja.
 */
export function marcaParaPOS(param: string | null | undefined, delShell: string | null | undefined): string {
  if (marcaDeCaja(param)) return String(param).toLowerCase()
  if (marcaDeCaja(delShell)) return String(delShell).toLowerCase()
  return MARCA_POR_DEFECTO
}

/** `?marca=` de la URL de `/pos`, `/pos/cliente` y `/pos/totem`. Leído una vez: ⛔ cambia sin navegar. */
export function useMarcaDeLaUrl(): string | null {
  const [m] = useState(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('marca')))
  return m
}

const datos = () => marcaDeCaja(activa)!

/** Se lee al DIBUJAR: siempre la marca activa de la pestaña. */
export const MARCA_CAJA = {
  get nombre(): string {
    return datos().nombre
  },
  /** El color de identidad: en la pantalla de la clienta y el tótem es el color principal. */
  acento: color.brand,
  acentoBg: color.brandBg,
  get instagram(): string {
    return INSTAGRAM[activa] ?? ''
  },
  /** El nombre en la cabecera de la clienta y arriba de la bienvenida: SIEMPRE el de la marca (Bruno, 6-oct). */
  get local(): string {
    return datos().nombre
  },
}
