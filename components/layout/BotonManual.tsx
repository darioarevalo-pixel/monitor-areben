'use client'

/**
 * "Cómo se usa" — el manual de ESTA pantalla, sin salir de ella.
 *
 * Un archivo para las 42 secciones: va adentro de `SeccionHeader`, que es el único encabezado que
 * existe y lo monta el shell para toda sección.
 *
 * **No dispara ningún fetch para saber si existe.** El índice de manuales (id, sección, título)
 * viaja en el mismo GET que ya trae las novedades al arrancar el shell, así que acá sólo se busca
 * en memoria. El cuerpo se pide recién al abrirlo.
 *
 * **No aparece si esa pantalla no tiene ni manual publicado ni tour**, en vez de abrir un cartel
 * vacío: un botón que promete ayuda y no la da es peor que no tener botón.
 *
 * # Las dos ayudas son distintas y por eso conviven acá
 *
 * El **manual** (base, se edita sin deploy) contesta *qué hago y qué pasa si sale mal*. El **tour**
 * (`store/useGuia`) contesta *dónde se aprieta*, parándose sobre los controles reales. Separadas no
 * se contradicen; juntas en un texto, derivan.
 *
 * Con las dos, el botón abre el manual y el tour sale del pie. **Con una sola, el botón hace esa**:
 * un tour sin manual sigue siendo alcanzable —si no, la sección quedaría muda hasta que alguien
 * publique un texto— y un manual sin tour se comporta como antes.
 */

import Link from 'next/link'
import { useState } from 'react'
import { useSistema } from '@/store/useSistema'
import { useGuia } from '@/store/useGuia'
import { leerManual } from '@/lib/manuales/cliente'
import { manualDe, type Manual } from '@/lib/manuales/tipos'
import { Button, Markdown, Modal, Notice } from '@/components/ui'

export function BotonManual({ seccion }: { seccion: string }) {
  const manuales = useSistema((s) => s.manuales)
  const hayGuia = useGuia((s) => s.pasos.length > 0)
  const arrancarGuia = useGuia((s) => s.arrancar)
  const [abierto, setAbierto] = useState(false)
  const [manual, setManual] = useState<Manual | null>(null)
  const [error, setError] = useState<string | null>(null)

  const indice = manualDe(manuales, seccion)
  if (!indice && !hayGuia) return null

  const caminar = () => {
    setAbierto(false)
    arrancarGuia()
  }

  const abrir = () => {
    // Sin manual el botón ES el tour: no hay cartel que abrir.
    if (!indice) return caminar()
    setAbierto(true)
    if (manual) return
    leerManual(indice.id)
      .then(setManual)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo abrir el manual.'))
  }

  return (
    <>
      {/*
        `ghost` y chico: la regla del rediseño es una sola acción sólida por pantalla, y "Cómo se
        usa" nunca es la acción principal — es la que se busca cuando algo no se entiende.
      */}
      <Button variant="ghost" size="sm" iconLeft="📘" onClick={abrir}>
        Cómo se usa
      </Button>

      {abierto && indice && (
        <Modal
          abierto
          ancho="ancho"
          onCerrar={() => setAbierto(false)}
          titulo={indice.titulo}
          pie={
            <>
              <Link href="/manuales" style={{ marginRight: 'auto', alignSelf: 'center', fontSize: 12 }} onClick={() => setAbierto(false)}>
                Ver todos los manuales
              </Link>
              {hayGuia && (
                <Button variant="outline" iconLeft="👉" onClick={caminar}>
                  Mostrame en la pantalla
                </Button>
              )}
              <Button onClick={() => setAbierto(false)}>Cerrar</Button>
            </>
          }
        >
          {error ? <Notice tone="warning">{error}</Notice> : manual ? <Markdown texto={manual.cuerpo} /> : <span>Buscando…</span>}
        </Modal>
      )}
    </>
  )
}
