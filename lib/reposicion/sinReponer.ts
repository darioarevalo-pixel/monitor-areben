/**
 * Al CONFIRMAR una devolución, el producto se apaga de la reposición para siempre (Darío,
 * 26-oct-2026: «se apague cuando se confirma y de forma definitiva; si luego se quiere volver a
 * vender, hay que prenderlo manualmente»). Usa la lista de `cfg.apagados` de siempre (la que ya
 * respeta `porVentas.decidir`): frena sólo el «llevar», no el «devolver».
 */

import type { RepoCfg } from './tipos'

/** Suma estos productos a los apagados (sin repetir). */
export function apagarProductos(cfg: RepoCfg, pids: string[]): RepoCfg {
  const apagados = [...new Set([...cfg.apagados.map(String), ...pids.map(String)])]
  return apagados.length === cfg.apagados.length ? cfg : { ...cfg, apagados }
}

/** Vuelve a reponer estos productos. */
export function prenderProductos(cfg: RepoCfg, pids: string[]): RepoCfg {
  const fuera = new Set(pids.map(String))
  return { ...cfg, apagados: cfg.apagados.map(String).filter((p) => !fuera.has(p)) }
}
