/**
 * Detector de Meta Ads (área ads): plata que se va con mal retorno. Meta Ads es GLOBAL
 * (un token, N cuentas), no por marca — por eso corre UNA vez (fuera del loop de marcas)
 * y recibe los totales por cuenta que el hook trae con `traerDetalleCuenta`.
 *
 * ⚠️ Un supuesto a validar con Bruno: el ROAS objetivo (`u.roasObjetivo`) es un placeholder.
 */

import type { Marca } from '@/lib/nav.datos'
import type { Metricas } from '@/lib/meta-ads/tipos'
import type { Accionable } from '../tipos'
import type { Umbrales } from '../umbrales'

export type CuentaAds = { id: string; nombre: string; moneda: string; totales: Metricas }

/**
 * Marca de una cuenta publicitaria. **Provisorio y se sabe que miente.**
 *
 * Este detector atribuye por totales de CUENTA, y las tres líneas (BDI, Zattia y Stunned) se
 * pautean desde la misma cuenta publicitaria: no hay ninguna marca correcta para asignarle. La
 * regex sobre el nombre cae a `bdi` cuando no matchea, que es justo el modo de fallar más peligroso
 * — el número se ve razonable estando mal.
 *
 * ⚠️ Se deja tal cual **a propósito**: hasta hoy convivía con `MARCA_POR_CUENTA`, que nunca llegó a
 * cargarse, así que esta regex ya era el 100% del comportamiento y sacarla no arregla nada —
 * apagaría un aviso que igual sirve. Lo que arregla esto es bajar el detector a nivel campaña y
 * leer `meta_ads_campania_linea`, como ya hace la pantalla de Etapas
 * (`lib/meta-ads/lineas.core.js`), y eso obliga a rehacer lo que le pasa `useGerencial.ts`.
 *
 * ▶️ Mientras tanto: los accionables de Ads dicen de qué CUENTA hablan, no de qué marca.
 */
function marcaDeCuenta(nombre: string): Marca {
  return /zattia|stunned/i.test(nombre) ? 'zattia' : 'bdi'
}

function money(n: number, moneda: string): string {
  return `${moneda === 'USD' ? 'US$' : '$'}${Math.round(n).toLocaleString('es-AR')}`
}

export function detectarAds(cuentas: CuentaAds[], u: Umbrales): Accionable[] {
  const out: Accionable[] = []
  for (const c of cuentas) {
    const t = c.totales
    const marca = marcaDeCuenta(c.nombre)

    // 1. Gasto sin compras: plata quemada.
    if (t.spend >= u.gastoMinSinCompras && t.purchases === 0) {
      out.push({
        id: `ads:sin-compras:${c.id}`,
        area: 'ads',
        severidad: 'critico',
        marca,
        titulo: `${c.nombre}: ${money(t.spend, c.moneda)} de Ads sin ninguna compra`,
        detalle: `La cuenta gastó sin registrar ventas atribuidas en la ventana.`,
        recomendacion: 'Pausar o revisar segmentación, creativos y el píxel de conversión.',
        valor: t.spend,
        acciones: [{ tipo: 'link', seccion: 'meta-ads', label: 'Ver Meta Ads' }],
      })
      continue
    }

    // 2. ROAS por debajo del objetivo (con compras y gasto relevante).
    if (t.purchases > 0 && t.spend >= u.gastoMinSinCompras && t.roas < u.roasObjetivo) {
      out.push({
        id: `ads:roas-bajo:${c.id}`,
        area: 'ads',
        severidad: 'atencion',
        marca,
        titulo: `${c.nombre}: ROAS ${t.roas.toFixed(2)}× (objetivo ${u.roasObjetivo}×)`,
        detalle: `Gasto ${money(t.spend, c.moneda)} → ingresos ${money(t.revenue, c.moneda)}. Retorno por debajo del objetivo.`,
        recomendacion: 'Reasignar presupuesto a campañas/creativos que rinden; pausar los peores.',
        valor: (u.roasObjetivo - t.roas) * t.spend,
        acciones: [{ tipo: 'link', seccion: 'meta-ads', label: 'Ver Meta Ads' }],
      })
    }
  }
  return out
}
