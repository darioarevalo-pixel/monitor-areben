/**
 * Registro de los sistemas internos de Areben (sección "Nuestras apps").
 *
 * Se repite igual en los cuatro repos a propósito: son proyectos separados, sin paquete
 * compartido, y este archivo es chico y estable. Duplicarlo cuesta menos que montar y
 * mantener un paquete común.
 *
 * SALTO SILENCIOSO (`?sso=1`): las apps marcadas con `sso: true` aceptan un link con
 * ese parámetro, que dispara el ingreso con Google SIN pantalla (`prompt=none`). Como
 * el navegador ya tiene sesión de Google, la vuelta es inmediata y se cae adentro. Es
 * el mismo efecto que una cookie compartida en `.arebensrl.com`, pero sin depender de
 * que las apps vivan todas bajo el mismo dominio. Ver `lib/identidad.ts`.
 *
 * Ojo con la forma del link: el monitor es un catch-all sin ruta de login, así que su
 * salto va a la raíz (`/?sso=1`). Producción, el dashboard y Maketa tienen `/login?sso=1`.
 */

export type AppInterna = {
  id: string
  nombre: string
  descripcion: string
  /** Dónde cae el salto. Incluye la ruta, que no es la misma en todas. */
  href: string
  /** Acepta el salto silencioso. Las de Gerardo tienen login propio. */
  sso: boolean
}

/** Cuál de las apps del registro es ESTA: se muestra marcada y sin link. */
export const APP_ACTUAL = 'monitor'

export const APPS: AppInterna[] = [
  {
    id: 'monitor',
    nombre: 'Monitor',
    descripcion: 'Ventas, stock, fotos y solicitudes del día',
    href: 'https://monitor.arebensrl.com/?sso=1',
    sso: true,
  },
  {
    id: 'maketa',
    nombre: 'Maketa',
    descripcion: 'Piezas, calendario y redes de las tres marcas',
    href: 'https://maketa.arebensrl.com/login?sso=1',
    sso: true,
  },
  {
    id: 'produccion',
    nombre: 'Producción',
    descripcion: 'Taller: cortes, escandallos, insumos y costos',
    href: 'https://produccion.arebensrl.com/login?sso=1',
    sso: true,
  },
  {
    id: 'dashboard',
    nombre: 'Dashboard',
    descripcion: 'Finanzas: cierres, gastos, nómina y resultados',
    href: 'https://dashboard.arebensrl.com/login?sso=1',
    sso: true,
  },
  {
    id: 'ingresos',
    nombre: 'Ingresos',
    descripcion: 'Ingreso de mercadería (sistema de Gerardo)',
    href: 'https://ingreso2.arebensrl.com',
    sso: false,
  },
  {
    id: 'logistica',
    nombre: 'Logística',
    descripcion: 'Preparación y envíos (sistema de Gerardo)',
    href: 'https://logistica.arebensrl.com',
    sso: false,
  },
]
