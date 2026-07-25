'use client'

import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, puedeSub, puedeVer } from '@/lib/permisos'
import { CategoriasCard } from './CategoriasCard'
import { ImagenesCard } from './ImagenesCard'
import { FotosCard } from './FotosCard'
import { AsignarCard } from './AsignarCard'
import { ExplorarCategoriaCard } from './ExplorarCategoriaCard'
import { AgotadosCard } from './AgotadosCard'
import { ConStockCard } from './ConStockCard'
import { VariantesSinStockCard } from './VariantesSinStockCard'
import type { Marca } from '@/lib/nav'

// La tabla de talles escribe descripciones en TiendaNube, así que es una herramienta más de
// esta sección; se carga aparte (trae su propio peso) y solo cuando se abre esa pestaña.
const GenTalles = dynamic(() => import('@/components/gen-talles/GenTalles').then((m) => m.GenTalles), {
  loading: () => <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando…</div>,
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
type Sub = 'fotos' | 'categorias' | 'visibilidad' | 'descripciones'

export function Tncat() {
  const { marca, perfil } = useSesion()
  const params = useParams()

  const admin = esAdmin(perfil)
  const verImg = admin || puedeSub(perfil, marca, 'tncat', 'imagenes')
  const verCat = marca === 'bdi' && (admin || puedeSub(perfil, marca, 'tncat', 'categorias'))
  const verAsig = marca === 'zattia' && (admin || puedeSub(perfil, marca, 'tncat', 'asignar'))
  const verOcultar = admin || puedeSub(perfil, marca, 'tncat', 'ocultar')
  const verTalles = admin || puedeVer(perfil, marca, 'gen-talles')

  const subs: { key: Sub; label: string; hint: string; ok: boolean }[] = [
    { key: 'fotos', label: '📷 Fotos', hint: 'Subir fotos y revisar que estén pegadas al color', ok: verImg },
    { key: 'categorias', label: '🗂️ Categorías', hint: 'Asignar y quitar categorías de la tienda', ok: verCat || verAsig },
    { key: 'visibilidad', label: '👁️ Visibilidad', hint: 'Qué se muestra y qué no en la tienda, según el stock', ok: verOcultar },
    { key: 'descripciones', label: '📏 Descripciones', hint: 'Tabla de talles en la descripción del producto', ok: verTalles },
  ]
  const visibles = subs.filter((s) => s.ok)

  // La subárea sale del 2º tramo de la URL (`/tncat/visibilidad`). Si no viene, o si es una
  // que esta persona no puede ver, cae en la primera que sí.
  const partes = params.seccion
  const pedida = (Array.isArray(partes) ? partes[1] : null) as Sub | null
  const activa: Sub | null = visibles.find((s) => s.key === pedida)?.key ?? visibles[0]?.key ?? null

  if (!visibles.length) {
    return <div style={{ padding: 16, color: '#9CA3AF' }}>No tenés habilitada ninguna herramienta de Tienda Nube.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Qué herramienta se está usando: el encabezado de la página dice "Tienda Nube" y
          desde el sidebar no siempre queda claro en cuál de las cuatro caíste. */}
      <div style={{ fontSize: 13, fontWeight: 700, color: '#B45309' }}>
        {subs.find((s) => s.key === activa)?.label}
        <span style={{ fontWeight: 400, color: '#9CA3AF', marginLeft: 8 }}>{subs.find((s) => s.key === activa)?.hint}</span>
      </div>

      {activa === 'fotos' && <Fotos marca={marca} />}
      {activa === 'categorias' && <Categorias marca={marca} verCat={verCat} verAsig={verAsig} />}
      {activa === 'visibilidad' && <Visibilidad marca={marca} />}
      {activa === 'descripciones' && <GenTalles />}
    </div>
  )
}

/** Fotos: cargar las nuevas y revisar que cada color tenga la suya. */
function Fotos({ marca }: { marca: Marca }) {
  return (
    <>
      <ImagenesCard marca={marca} />
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
