/** El día pedido (YYYY-MM-DD) o el último calculado (Conciliación). 23-nov: salió de `diferencias.core.js` al sacar Diferencias. */
export function leerFecha(x) {
  const s = String(x ?? '').trim()
  if (!s) return { fecha: null }
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? { fecha: s } : { error: 'No se pudo: volvé a intentar.' }
}
