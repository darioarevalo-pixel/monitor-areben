'use client'

import { useSesion } from '@/components/SesionProvider'
import { puedeSub } from '@/lib/permisos'
import { CategoriasCard } from './CategoriasCard'
import { ImagenesCard } from './ImagenesCard'
import { FotosCard } from './FotosCard'
import { AsignarCard } from './AsignarCard'
import { AgotadosCard } from './AgotadosCard'
import { VariantesSinStockCard } from './VariantesSinStockCard'

/**
 * Tienda Nube (tncat): 4 herramientas de escritura sobre la tienda online, cada una
 * gateada por su sub-permiso y por marca. Port de tncatAbrir (index.html:7954):
 * - Categorías por modelo: solo BDI + `tncat.categorias`.
 * - Carga de imágenes + Revisar fotos: ambas marcas + `tncat.imagenes`.
 * - Asignar categoría (Excel): solo Zattia + `tncat.asignar`.
 */
export function Tncat() {
  const { marca, perfil } = useSesion()
  const verCat = marca === 'bdi' && puedeSub(perfil, marca, 'tncat', 'categorias')
  const verImg = puedeSub(perfil, marca, 'tncat', 'imagenes')
  const verAsig = marca === 'zattia' && puedeSub(perfil, marca, 'tncat', 'asignar')
  const verOcultar = puedeSub(perfil, marca, 'tncat', 'ocultar')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {verCat && <CategoriasCard marca={marca} />}
      {verImg && <ImagenesCard marca={marca} />}
      {verImg && <FotosCard marca={marca} />}
      {verAsig && <AsignarCard marca={marca} />}
      {verOcultar && <AgotadosCard marca={marca} />}
      {verOcultar && <VariantesSinStockCard marca={marca} />}
    </div>
  )
}
