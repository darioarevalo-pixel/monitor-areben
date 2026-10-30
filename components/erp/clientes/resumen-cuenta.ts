/**
 * «Imprimir resumen de cuenta» y «Escribir por WhatsApp» de la cuenta corriente (🎨 26-oct, Resto): los dos gestos que comparten
 * la fila de la lista y la ficha. El texto y el HTML salen de `lib/erp/resumen-cuenta.core.js`.
 */

import { leerCuentaDeCliente, type CuentaDeCliente, type MarcaErp } from '@/lib/erp/cliente'
import { nombresDeVentas } from '@/lib/erp/cuenta-corriente.core.js'
import { resumenDeCuentaHtml } from '@/lib/erp/resumen-cuenta.core.js'
import type { FilaCuenta } from './FichaCuenta'

/** Arma el resumen con la cuenta ya leída y lo manda a imprimir en la ventana `w` (abierta en el clic: si no, el navegador la frena). */
export function imprimirResumenCon(w: Window, fila: FilaCuenta, prueba: boolean, s: Pick<CuentaDeCliente, 'hoy' | 'estado' | 'mayor'>) {
  const html = resumenDeCuentaHtml({ fila, hoy: s.hoy, prueba, estado: s.estado, mayor: s.mayor, ventas: nombresDeVentas(s.mayor) })
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 250)
}

/** Desde la fila: lee la cuenta entera (sin fechas) y la imprime. Devuelve el error en palabras, o null si salió. */
export async function imprimirResumenDeFila(marca: MarcaErp, fila: FilaCuenta, prueba: boolean): Promise<string | null> {
  const w = window.open('', '_blank')
  if (!w) return 'El navegador bloqueó la ventana del resumen: permitila para este sitio.'
  try {
    w.document.title = 'Resumen de cuenta'
    w.document.body.textContent = 'Armando el resumen…'
    const s = await leerCuentaDeCliente(marca, { clienteId: fila.clienteId, linea: fila.linea, prueba })
    imprimirResumenCon(w, fila, prueba, s)
    return null
  } catch (e) {
    w.close()
    return e instanceof Error ? e.message : 'No se pudo hacer el resumen.'
  }
}
