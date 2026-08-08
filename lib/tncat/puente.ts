/**
 * El puente Comisiones → Asignar categoría (Tienda Nube). Port del global
 * `tncatAsigNombres` (index.html:6312): en la lista de precios de sale se tocaba
 * "Asignar categoría en TN", los nombres viajaban acá y la card de asignar los
 * tomaba ya cargados, como si se hubiera subido el Excel.
 *
 * El sentido es sacar el Excel del medio: la lista de sale ya tiene los nombres
 * que hay que categorizar, y bajarla a un archivo para volver a subirlo es un
 * rodeo que además da lugar a que se suba el archivo equivocado.
 *
 * Mismo singleton a nivel de módulo que `lib/sesionfotos/puente.ts`, y por el mismo
 * motivo: la navegación del shell es client-side (<Link>/router.push), así que la
 * app no se desmonta y la variable sobrevive el cambio de ruta. NO sobrevive un
 * reload, y no debe: entrar a Asignar por su cuenta y encontrarse una selección
 * vieja precargada es peor que empezar de cero.
 *
 * `tomar` CONSUME (devuelve y limpia). Se lee en el inicializador de un `useState`,
 * no en un efecto, para que el doble montaje de StrictMode no lo pierda.
 */

let nombres: string[] | null = null

/** Comisiones deja acá los nombres de la lista de sale y navega a /tncat/categorias. */
export function ponerPuenteAsignar(nn: string[]): void {
  nombres = nn.map(String)
}

/** Asignar categoría toma (una sola vez) los nombres, o null si no vino de Comisiones. */
export function tomarPuenteAsignar(): string[] | null {
  const p = nombres
  nombres = null
  return p
}
