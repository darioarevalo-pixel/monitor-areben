import { esMovilCon, useMovilCon, type ReglaMovil } from '@/lib/movil'

/**
 * La vista de CELULAR del POS (Bruno, 27-oct): sólo cambia la presentación, el cobro es el MISMO
 * (`lib/caja/core.core.js`). Se activa con la pantalla chica o con `?movil=1` (para probarla desde la PC);
 * `?movil=0` la apaga aunque la pantalla sea chica. 🔴 **Pantalla chica Y táctil**: una ventana angosta o un zoom
 * del 200 % en la PC del local ⛔ la activan (ahí no imprime el ticket y nadie lo nota hasta que la clienta se va).
 * La regla vive en `lib/movil.ts` (la comparte el ERP, con su propio ancho).
 */
export const ANCHO_MOVIL = 640
const REGLA_CAJA: ReglaMovil = { hasta: ANCHO_MOVIL, pideTactil: true }

export const esMovil = (p: { search: string; ancho: number | null; tactil: boolean }): boolean => esMovilCon(REGLA_CAJA, p)

export const useEsMovil = () => useMovilCon(REGLA_CAJA)
