'use client'

/**
 * Las tres zonas agrupadas: **Producir · Analizar · Configurar.**
 *
 * # Por qué el menú pasó de once entradas a cuatro
 *
 * Once renglones en el sidebar para una sola sección obligan a saber de antemano a cuál ir, y once
 * pantallas que no se nombran entre sí hacen que ninguna conteste una pregunta entera. El pedido de
 * Bruno fue textual —*«esa sección no se usa de análisis»*— y la disposición era la mitad del
 * problema: lo que decide vive en Rendimiento, lo que se produce en Producir, lo que se consulta en
 * Analizar y lo que se calibra una vez en Configurar.
 *
 * ⚠️ **Las once rutas viejas siguen andando**, como ya pasaba con `etapas` y `auditoria`: siguen en
 * `VISTAS` de `MetaAds.tsx`, están en bookmarks, en `<Link>` del propio código y en notas de trabajo.
 * ⛔ No son un redirect: un redirect obliga a un viaje más y le cambia la URL a quien la escribió
 * bien.
 *
 * 🔑 **La pestaña vive en la URL, no en `useState`.** Es la lección de Canjes: la sección vivía en
 * estado local, recargar tiraba a la primera pestaña **y los filtros sí sobrevivían**, así que
 * quedaban aplicados sobre una pestaña que ya no se miraba.
 */

import { Auditoria } from '@/components/meta-ads/Auditoria'
import { Biblioteca } from '@/components/meta-ads/biblioteca/Biblioteca'
import { Campanias } from '@/components/meta-ads/campanias/Campanias'
import { Embudo } from '@/components/meta-ads/Embudo'
import { Publicos } from '@/components/meta-ads/publicos/Publicos'
import { Informes } from '@/components/meta-ads/informes/Informes'
import { CargarPiezas } from '@/components/meta-ads/piezas/CargarPiezas'
import { Automatizaciones } from '@/components/meta-ads/reglas/Automatizaciones'
import { Rendimiento } from '@/components/meta-ads/Rendimiento'
import { Rentabilidad } from '@/components/meta-ads/rentabilidad/Rentabilidad'
import { Tabs, useFiltroUrl, space } from '@/components/ui'

type Hoja = { key: string; label: string; hint: string; Vista: () => React.ReactElement }

function Agrupada({ nombre, hojas }: { nombre: string; hojas: Hoja[] }) {
  // La clave del filtro lleva el nombre del grupo: dos grupos con `?tab=` compartirían la misma
  // entrada de la URL y navegar de uno al otro arrastraría una pestaña que no existe allá.
  const [tab, setTab] = useFiltroUrl<string>(`${nombre}`, hojas[0].key)
  const actual = hojas.find((h) => h.key === tab) ?? hojas[0]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <Tabs
        items={hojas.map((h) => ({ key: h.key, label: h.label, hint: h.hint }))}
        value={actual.key}
        onChange={setTab}
      />
      {/* ⛔ Sin `key`: remontar al cambiar de pestaña tira los datos ya traídos y, en las que
          arrancan con defaults, deja un cuadro con el número de la pestaña anterior. */}
      <actual.Vista />
    </div>
  )
}

/**
 * Lo que hace falta para que entre una pieza nueva a la pauta.
 *
 * ⚠️ **Ya ⛔ no es una entrada del menú** (30-ago-2026): sus dos hojas subieron a primer nivel como
 * «Anuncio nuevo» y «Anuncios», que es lo que se usa. Esto se queda para los bookmarks.
 *
 * ⛔ **Ideas salió de acá.** Medido: `meta_ads_ideas` tiene **0 filas** —nunca se usó— y el tablero
 * lo reemplazó `/ideas` de MAKETA, que es donde vive la idea, el guion y la producción. La RUTA
 * sigue andando (`/meta-ads/ideas`) y dice adónde mudarse; ⛔ no se borra el módulo porque **el
 * Embudo sigue leyendo esa tabla** para decir qué etapa tiene ideas anotadas.
 */
export function Producir() {
  return (
    <Agrupada
      nombre="producir"
      hojas={[
        { key: 'piezas', label: 'Anuncio nuevo', hint: 'Cargar videos y armar una tanda: un conjunto por pieza, todo pausado.', Vista: CargarPiezas },
        { key: 'biblioteca', label: 'Anuncios', hint: 'Todos los avisos con la pieza a la vista y sus números al lado.', Vista: Biblioteca },
      ]}
    />
  )
}

/** Lo que se consulta, no lo que se decide. Nada de acá pide una acción hoy. */
export function Analizar() {
  return (
    <Agrupada
      nombre="analizar"
      hojas={[
        { key: 'campanias', label: 'Campañas', hint: 'El árbol completo: campaña, conjunto y aviso, con la marca y la etapa.', Vista: Campanias },
        { key: 'embudo', label: 'Embudo', hint: 'A quién le habla la plata y qué etapa está vacía.', Vista: Embudo },
        { key: 'publicos', label: 'Fría vs remarketing', hint: 'Cuánta de la plata le compra a gente que ya nos conocía, y qué parte ⛔ no se puede saber.', Vista: Publicos },
        { key: 'cuenta', label: 'Totales por cuenta', hint: 'Los anuncios por campaña, quién compra, desde dónde y en qué ubicación.', Vista: Rendimiento },
        { key: 'registro', label: 'Registro', hint: 'Qué se accionó, quién y cómo terminó.', Vista: Auditoria },
        { key: 'informes', label: 'Informes', hint: 'El análisis en prosa de cada fecha. Lo escribe una persona.', Vista: Informes },
      ]}
    />
  )
}

/** Lo que se calibra una vez y le pone la vara a todo lo demás. */
export function Configurar() {
  return (
    <Agrupada
      nombre="configurar"
      hojas={[
        { key: 'rentabilidad', label: 'Rentabilidad', hint: 'Hasta cuánto se puede pagar por una compra. Es el techo con el que juzga la zona.', Vista: Rentabilidad },
        { key: 'automatizaciones', label: 'Automatizaciones', hint: 'Las reglas que miran la foto y proponen. Ninguna ejecuta.', Vista: Automatizaciones },
      ]}
    />
  )
}
