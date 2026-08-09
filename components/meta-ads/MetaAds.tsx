'use client'

/**
 * El router de la sección Meta. **Sólo despacha**: era un archivo de 811 líneas donde el router
 * convivía con toda la pantalla de Rendimiento.
 *
 * Las vistas se eligen por el 2º tramo de la URL (patrón de Tienda Nube):
 *
 *   `/meta-ads`             → **Panel**: qué está al aire y qué hay que decidir. La entrada.
 *   `/meta-ads/campanias`   → **Campañas**: todas juntas, ordenadas por gasto, para accionar.
 *   `/meta-ads/automatizaciones` → **Automatizaciones**: las reglas que miran la foto diaria y
 *                            proponen. ⛔ Ninguna ejecuta: dejan renglones en el Panel.
 *   `/meta-ads/embudo`      → **Embudo**: a quién le está hablando la plata, y dónde está el hueco.
 *   `/meta-ads/ideas`       → **Ideas**: el tablero de las piezas que hay que producir.
 *   `/meta-ads/rendimiento` → **Rendimiento**: los números de una cuenta publicitaria.
 *   `/meta-ads/registro`    → **Registro**: qué se accionó sobre la pauta, quién y cómo terminó.
 *
 * ⚠️ **Los nombres viejos siguen andando** (`/meta-ads/etapas` y `/meta-ads/auditoria`): están en
 * bookmarks, en comentarios del repo y en las notas de trabajo. Son un alias de una línea, no un
 * redirect: un redirect obliga a un viaje más y le cambia la URL a alguien que la escribió bien.
 *
 * 🔴 **`/meta-ads` cambió de contenido: antes era Rendimiento y ahora es el Panel.** Es el único
 * cambio de esta tanda que le mueve el piso a alguien con un bookmark, y se hizo a propósito
 * (ver `Panel.tsx`). Rendimiento no se perdió: tiene su propia entrada en el menú y su URL.
 */

import { useParams } from 'next/navigation'
import { ProveedorMeta } from '@/components/meta-ads/ContextoMeta'
import { SelectorMeta } from '@/components/meta-ads/SelectorMeta'
import { Panel } from '@/components/meta-ads/Panel'
import { Embudo } from '@/components/meta-ads/Embudo'
import { Ideas } from '@/components/meta-ads/Ideas'
import { Rendimiento } from '@/components/meta-ads/Rendimiento'
import { Auditoria } from '@/components/meta-ads/Auditoria'
import { Campanias } from '@/components/meta-ads/campanias/Campanias'
import { Automatizaciones } from '@/components/meta-ads/reglas/Automatizaciones'

/** Las rutas viejas, que siguen en bookmarks. Una línea cada una, sin redirect. */
const ALIAS: Record<string, string> = { etapas: 'embudo', auditoria: 'registro' }

const VISTAS: Record<string, () => React.ReactElement> = {
  campanias: Campanias,
  automatizaciones: Automatizaciones,
  embudo: Embudo,
  ideas: Ideas,
  rendimiento: Rendimiento,
  registro: Auditoria,
}

/**
 * 🔑 **El provider envuelve a todas.** El eje (cuenta × línea × rango) es de la SECCIÓN, no de una
 * pantalla, y `useFiltroUrl` sólo mira la URL al montar — si cada vista lo leyera por su cuenta,
 * navegar entre ellas perdería lo elegido.
 *
 * El despacho vive en este componente y no adentro de una vista porque una salida temprana después
 * de un hook cambiaría la cantidad de hooks entre renders al navegar de una vista a la otra.
 */
export function MetaAds() {
  const params = useParams()
  const partes = params.seccion
  const crudo = Array.isArray(partes) ? partes[1] : null
  const vista = crudo ? ALIAS[crudo] ?? crudo : ''
  const Vista = VISTAS[vista] ?? Panel
  return (
    <ProveedorMeta>
      <SelectorMeta />
      <Vista />
    </ProveedorMeta>
  )
}
