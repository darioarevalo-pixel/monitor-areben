'use client'

import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, puedeSub, puedeVer } from '@/lib/permisos'
import { CategoriasCard } from './CategoriasCard'
import { ImagenesCard } from './ImagenesCard'
import { FotosCard } from './FotosCard'
import { ColaCard } from './ColaCard'
import { AsignarCard } from './AsignarCard'
import { ExplorarCategoriaCard } from './ExplorarCategoriaCard'
import { AgotadosCard } from './AgotadosCard'
import { ConStockCard } from './ConStockCard'
import { VariantesSinStockCard } from './VariantesSinStockCard'
import type { Marca } from '@/lib/nav'
import { color, font, space } from '@/components/ui'

// La tabla de talles escribe descripciones en TiendaNube, así que es una herramienta más de
// esta sección; se carga aparte (trae su propio peso) y solo cuando se abre esa pestaña.
const GenTalles = dynamic(() => import('@/components/gen-talles/GenTalles').then((m) => m.GenTalles), {
  loading: () => <div style={{ padding: 16, color: color.mut2 }}>Cargando…</div>,
})
// Redacción es una SECCIÓN aparte (`gen-desc`), no un sub de `tncat`, y se monta acá igual
// que la tabla de talles porque la persona la busca en el mismo lugar. El permiso es propio:
// redactar gasta plata en una API externa y reescribe el texto de venta de la tienda, así que
// no se cuelga del permiso de pegar una tabla de medidas.
const GenDesc = dynamic(() => import('@/components/gen-desc/GenDesc').then((m) => m.GenDesc), {
  loading: () => <div style={{ padding: 16, color: color.mut2 }}>Cargando…</div>,
})

/**
 * Tienda Nube: las herramientas que escriben sobre la tienda online, agrupadas por SUBÁREA.
 *
 * Antes eran seis tarjetas apiladas en un scroll único, y ese era el problema: la carga de
 * imágenes —que se usa cuando entra mercadería, cada tanto— ocupaba el mismo lugar
 * permanente que la revisión de fotos, que son 200 y pico de productos. Ahora cada grupo de
 * trabajo es una pestaña.
 *
 * Cada subárea es una **entrada propia del sidebar** (`Marketing > Tienda Nube > …`), con su
 * dirección (`/tncat/visibilidad`): se ven todas de un vistazo sin entrar a la sección, se
 * puede compartir el link, y cada una aparece solo si la persona tiene ese sub-permiso. El
 * costo de volver a bajar el catálogo al cambiar de herramienta lo cubre el caché del store.
 *
 * Acá adentro no hay pestañas: la subárea sale de la URL y esta pantalla solo elige qué
 * mostrar. Si la dirección no trae ninguna, cae en la primera que la persona pueda ver.
 */
type Sub = 'fotos' | 'cola' | 'categorias' | 'visibilidad' | 'descripciones' | 'redaccion'

export function Tncat() {
  const { marca, perfil } = useSesion()
  const params = useParams()

  const admin = esAdmin(perfil)
  const verImg = admin || puedeSub(perfil, marca, 'tncat', 'imagenes')
  const verCat = marca === 'bdi' && (admin || puedeSub(perfil, marca, 'tncat', 'categorias'))
  const verAsig = marca === 'zattia' && (admin || puedeSub(perfil, marca, 'tncat', 'asignar'))
  const verOcultar = admin || puedeSub(perfil, marca, 'tncat', 'ocultar')
  const verTalles = admin || puedeVer(perfil, marca, 'gen-talles')
  const verRedaccion = admin || puedeVer(perfil, marca, 'gen-desc')

  const subs: { key: Sub; label: string; hint: string; ok: boolean }[] = [
    { key: 'fotos', label: 'Fotos', hint: 'Subir fotos y revisar que estén pegadas al color', ok: verImg },
    // 🔑 Cuelga del mismo sub que «Fotos» y ⛔ no estrena permiso: la cola le habla a quien sube
    // las fotos, que es exactamente quien ya lo tiene tildado. Un permiso nuevo es una pantalla
    // que no ve nadie hasta que alguien se acuerde de tildarlo — la lección de «Día a día».
    { key: 'cola', label: 'La cola', hint: 'Qué falta fotografiar, en qué orden, y qué ya se intentó', ok: verImg },
    { key: 'categorias', label: 'Categorías', hint: 'Asignar y quitar categorías de la tienda', ok: verCat || verAsig },
    { key: 'visibilidad', label: 'Visibilidad', hint: 'Qué se muestra y qué no en la tienda, según el stock', ok: verOcultar },
    { key: 'descripciones', label: 'Descripciones', hint: 'Tabla de talles en la descripción del producto', ok: verTalles },
    { key: 'redaccion', label: 'Redacción', hint: 'La cola de descripciones: el insumo del local y el borrador que se aprueba', ok: verRedaccion },
  ]
  const visibles = subs.filter((s) => s.ok)

  // La subárea sale del 2º tramo de la URL (`/tncat/visibilidad`). Si no viene, o si es una
  // que esta persona no puede ver, cae en la primera que sí.
  const partes = params.seccion
  const pedida = (Array.isArray(partes) ? partes[1] : null) as Sub | null
  const activa: Sub | null = visibles.find((s) => s.key === pedida)?.key ?? visibles[0]?.key ?? null

  if (!visibles.length) {
    return <div style={{ padding: 16, color: color.mut2 }}>No tenés habilitada ninguna herramienta de Tienda Nube.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Qué herramienta se está usando. El encabezado de la página dice "Tienda Nube" y
          desde el sidebar no siempre queda claro en cuál de las cinco caíste.
          Antes era una línea de color flotando sobre el lienzo, sin pertenecer a nada;
          ahora es el encabezado del bloque que sigue, con su regla abajo. */}
      <header style={{ borderBottom: `1px solid ${color.line}`, paddingBottom: space[3] }}>
        <h2 style={{ fontSize: font.xl, fontWeight: 700, color: color.ink, letterSpacing: -0.2 }}>
          {subs.find((s) => s.key === activa)?.label}
        </h2>
        <p style={{ fontSize: font.base, color: color.mut, marginTop: 2 }}>{subs.find((s) => s.key === activa)?.hint}</p>
      </header>

      {activa === 'fotos' && <Fotos marca={marca} />}
      {activa === 'cola' && <ColaCard />}
      {activa === 'categorias' && <Categorias marca={marca} verCat={verCat} verAsig={verAsig} />}
      {activa === 'visibilidad' && <Visibilidad marca={marca} />}
      {activa === 'descripciones' && <GenTalles />}
      {activa === 'redaccion' && <GenDesc />}
    </div>
  )
}

/** Fotos: cargar las nuevas y revisar que cada color tenga la suya. */
function Fotos({ marca }: { marca: Marca }) {
  return (
    <>
      <ImagenesCard />
      <FotosCard marca={marca} />
    </>
  )
}

/** Categorías: el diff automático por modelo (BDI) y la asignación masiva (Zattia). */
function Categorias({ marca, verCat, verAsig }: { marca: Marca; verCat: boolean; verAsig: boolean }) {
  return (
    <>
      <ExplorarCategoriaCard marca={marca} />
      {verCat && <CategoriasCard marca={marca} />}
      {verAsig && <AsignarCard marca={marca} />}
    </>
  )
}

/**
 * Visibilidad: los dos sentidos de la misma decisión —esconder lo agotado y volver a mostrar
 lo que reingresó— más la lista de variantes que quedaron sin stock a la vista.
 */
function Visibilidad({ marca }: { marca: Marca }) {
  return (
    <>
      <AgotadosCard marca={marca} />
      <ConStockCard marca={marca} />
      <VariantesSinStockCard marca={marca} />
    </>
  )
}
