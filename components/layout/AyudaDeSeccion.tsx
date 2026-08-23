'use client'

/**
 * La ayuda de ESTA pantalla, sin salir de ella: **Manual de uso** y **Tour virtual**.
 *
 * Un archivo para las 42 secciones: va adentro de `SeccionHeader`, que es el único encabezado que
 * existe y lo monta el shell para toda sección.
 *
 * # Dos botones, no uno con el otro adentro
 *
 * 🔴 **Lo corrigió Bruno el 19-ago-2026, viéndolo**: el tour salía del **pie del modal del manual**,
 * o sea que para encontrarlo había que abrir primero otra cosa —y quien busca «mostrame dónde se
 * aprieta» no va a buscarlo adentro de un texto—. Son **dos ayudas distintas y del mismo nivel**:
 *
 * · **Manual de uso** — qué hacés, qué puede pasar y qué hacer si sale mal. Vive en la base y se
 *   edita sin deploy.
 * · **Tour virtual** — dónde se aprieta cada cosa, parándose sobre los controles reales.
 *
 * Cada uno aparece **sólo si existe**: un botón que promete ayuda y no la da es peor que no tener
 * botón. Una sección sin manual publicado y sin guía registrada no dibuja nada.
 *
 * **No dispara ningún fetch para saber si el manual existe.** El índice (id, sección, título) viaja
 * en el mismo GET que ya trae las novedades al arrancar el shell, así que acá sólo se busca en
 * memoria. El cuerpo se pide recién al abrirlo.
 */

import Link from 'next/link'
import { useState } from 'react'
import { useSistema } from '@/store/useSistema'
import { useGuia } from '@/store/useGuia'
import { leerManual } from '@/lib/manuales/cliente'
import { manualDe, type Manual } from '@/lib/manuales/tipos'
import { Button, Markdown, Modal, Notice } from '@/components/ui'

export function AyudaDeSeccion({ seccion }: { seccion: string }) {
  const manuales = useSistema((s) => s.manuales)
  const hayGuia = useGuia((s) => s.pasos.length > 0)
  const arrancarGuia = useGuia((s) => s.arrancar)
  const [abierto, setAbierto] = useState(false)
  const [manual, setManual] = useState<Manual | null>(null)
  const [error, setError] = useState<string | null>(null)

  const indice = manualDe(manuales, seccion)
  if (!indice && !hayGuia) return null

  const abrir = () => {
    setAbierto(true)
    if (manual || !indice) return
    leerManual(indice.id)
      .then(setManual)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo abrir el manual.'))
  }

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {/*
        `ghost` y chicos: la regla del rediseño es una sola acción sólida por pantalla, y la ayuda
        nunca es la acción principal — es la que se busca cuando algo no se entiende.
      */}
      {indice && (
        <Button variant="ghost" size="sm" iconLeft="📘" onClick={abrir}>
          Manual de uso
        </Button>
      )}
      {hayGuia && (
        <Button variant="ghost" size="sm" iconLeft="👉" onClick={arrancarGuia}>
          Tour virtual
        </Button>
      )}

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
              <Button onClick={() => setAbierto(false)}>Cerrar</Button>
            </>
          }
        >
          {error ? <Notice tone="warning">{error}</Notice> : manual ? <Markdown texto={manual.cuerpo} indice="cerrado" /> : <span>Buscando…</span>}
        </Modal>
      )}
    </div>
  )
}
