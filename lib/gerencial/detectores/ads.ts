/**
 * Detector de Meta Ads (área ads): plata que se va con mal retorno. Meta Ads es GLOBAL
 * (un token, N cuentas), no por marca — por eso corre UNA vez (fuera del loop de marcas)
 * y recibe los totales por cuenta que el hook trae con `traerDetalleCuenta`.
 *
 * ⚠️ Un supuesto a validar con Bruno: el ROAS objetivo (`u.roasObjetivo`) es un placeholder.
 */

import type { Marca } from '@/lib/nav.datos'
import { marcaDeCuentaAds } from '@/lib/meta-ads/etapas'
import type { Metricas } from '@/lib/meta-ads/tipos'
import type { Accionable } from '../tipos'
import type { Umbrales } from '../umbrales'

export type CuentaAds = { id: string; nombre: string; moneda: string; totales: Metricas }

/**
 * Marca de una cuenta publicitaria.
 *
 * Lo correcto es el mapa explícito `MARCA_POR_CUENTA` (`lib/meta-ads/etapas.core.js`). La regex
 * sobre el nombre quedó como **respaldo de las cuentas todavía no mapeadas**, no como el camino
 * principal: adivinar mal le atribuye a una marca la plata de la otra, y el número se ve razonable
 * estando mal. Cuando el mapa esté completo, esta función deja de usar la regex sola.
 *
 * (En la pantalla de Etapas no hay respaldo: una cuenta sin mapear se muestra aparte y no suma a
 * nadie. Acá sí lo hay porque este detector ya existía y sacarlo apagaría un aviso que funciona.)
 */
function marcaDeCuenta(id: string, nombre: string): Marca {
  const mapeada = marcaDeCuentaAds(id)
  if (mapeada === 'bdi' || mapeada === 'zattia') return mapeada
  return /zattia|stunned/i.test(nombre) ? 'zattia' : 'bdi'
}

function money(n: number, moneda: string): string {
  return `${moneda === 'USD' ? 'US$' : '$'}${Math.round(n).toLocaleString('es-AR')}`
}

export function detectarAds(cuentas: CuentaAds[], u: Umbrales): Accionable[] {
  const out: Accionable[] = []
  for (const c of cuentas) {
    const t = c.totales
    const marca = marcaDeCuenta(c.id, c.nombre)

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
