'use client'

/**
 * El router de la sección Meta. **Sólo despacha**: era un archivo de 811 líneas donde el router
 * convivía con toda la pantalla de Rendimiento.
 *
 * ⚠️ **Al sumar o mover una vista hay que releer los textos que la CUENTAN.** El `info` de
 * `PERM_CAT` y la descripción de `lib/nav.ts` decían «en seis pantallas» y quedaron mintiendo en
 * silencio al entrar Automatizaciones — y volvió a pasar con Biblioteca, con Piezas, con Informes y
 * con Rentabilidad: **cinco veces**. La sexta fue al revés y es ésta: el menú bajó de once entradas
 * a cuatro y los dos textos hablaban de once pantallas.
 *
 * # 🔴 La reagrupación (26-ago-2026): el menú tiene CUATRO entradas
 *
 * El pedido fue textual: *«esa sección no se usa de análisis»*. Once renglones en el sidebar para
 * una sola sección obligan a saber de antemano a cuál ir, y ninguna contestaba una pregunta entera.
 *
 *   `/meta-ads`             → **Rendimiento**: qué apago, qué escalo, qué testeo hoy. LA entrada.
 *   `/meta-ads/producir`    → **Producir**: Piezas · Ideas · Biblioteca.
 *   `/meta-ads/analizar`    → **Analizar**: Campañas · Embudo · La cuenta · Registro · Informes.
 *   `/meta-ads/configurar`  → **Configurar**: Rentabilidad · Automatizaciones.
 *
 * ⚠️ **Las once rutas viejas siguen andando** (`/meta-ads/campanias`, `/meta-ads/rendimiento`, …).
 * Siguen en `VISTAS`, están en bookmarks, en `<Link href>` del propio repo y en las notas de
 * trabajo. Son una línea del mapa, ⛔ no un redirect: un redirect obliga a un viaje más y le cambia
 * la URL a alguien que la escribió bien. `etapas` y `auditoria` ya funcionaban así.
 *
 * 🔴 **`/meta-ads` cambió de contenido por segunda vez**: era Rendimiento (los totales de la cuenta),
 * pasó a ser el Panel, y ahora es la ZONA DE RENDIMIENTO. Es el único cambio que le mueve el piso a
 * alguien con un bookmark, y se hizo a propósito (ver `zona/ZonaRendimiento.tsx`). Ninguna de las
 * dos anteriores se perdió: el Panel vive en `/meta-ads/panel` y los totales de la cuenta, en
 * Analizar → La cuenta.
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
import { Biblioteca } from '@/components/meta-ads/biblioteca/Biblioteca'
import { CargarPiezas } from '@/components/meta-ads/piezas/CargarPiezas'
import { Informes } from '@/components/meta-ads/informes/Informes'
import { Rentabilidad } from '@/components/meta-ads/rentabilidad/Rentabilidad'
import { Analizar, Configurar, Producir } from '@/components/meta-ads/zona/Agrupadas'
import { ZonaRendimiento } from '@/components/meta-ads/zona/ZonaRendimiento'

/** Las rutas viejas, que siguen en bookmarks. Una línea cada una, sin redirect. */
const ALIAS: Record<string, string> = { etapas: 'embudo', auditoria: 'registro' }

/**
 * 🔑 **Las vistas que NO se leen contra el eje no dibujan el selector.**
 *
 * Rentabilidad sale de la economía del producto: elegir otra cuenta o filtrar por línea no le
 * cambia un número. Dejarle el selector arriba promete un filtro que no existe —y encima, con el
 * token sin configurar, le pega su cartel rojo de error a una pantalla que no le pide nada a Meta.
 */
const SIN_EJE = new Set(['rentabilidad', 'configurar'])

const VISTAS: Record<string, () => React.ReactElement> = {
  // Las cuatro del menú de hoy.
  producir: Producir,
  analizar: Analizar,
  configurar: Configurar,
  // Y las once de antes, que siguen en bookmarks y en `<Link>` del repo.
  panel: Panel,
  campanias: Campanias,
  biblioteca: Biblioteca,
  piezas: CargarPiezas,
  automatizaciones: Automatizaciones,
  embudo: Embudo,
  ideas: Ideas,
  rendimiento: Rendimiento,
  registro: Auditoria,
  informes: Informes,
  rentabilidad: Rentabilidad,
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
  const Vista = VISTAS[vista] ?? ZonaRendimiento
  return (
    <ProveedorMeta>
      {!SIN_EJE.has(vista) && <SelectorMeta />}
      <Vista />
    </ProveedorMeta>
  )
}
