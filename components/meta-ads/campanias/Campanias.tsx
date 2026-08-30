'use client'

/**
 * Campañas — **todas las de la línea abierta en una sola tabla**, para accionar.
 *
 * # Por qué es una pantalla aparte del Embudo
 *
 * El Embudo reparte las campañas por etapa porque su pregunta es *dónde está el hueco*. Eso es lo
 * correcto para pensar creativos y lo peor posible para trabajar: para reactivar una campaña
 * pausada había que entrar al Embudo, elegir la línea, bajar hasta «Las pautas al aire» y abrir un
 * plegable — tres pasos que no tienen nada que ver con lo que se iba a hacer. Acá están todas
 * juntas y **ordenadas por gasto**, que es el orden en el que importan.
 *
 * 🔑 **Es la única pantalla donde el selector de CUENTA filtra de verdad.** En el Embudo no puede:
 * esconder una línea o una cuenta taparía el hueco que esa pantalla existe para mostrar. Acá al
 * revés — quien viene a tocar algo ya sabe qué cuenta está mirando.
 */

import { useMemo, useState } from 'react'
import { useMeta } from '@/components/meta-ads/ContextoMeta'
import { CorreccionAbierta } from '@/components/meta-ads/ModalCorregir'
import { VentanaEtapas } from '@/components/meta-ads/VentanaEtapas'
import { ModalesDeAccion } from '@/components/meta-ads/acciones'
import { TablaCampanias } from '@/components/meta-ads/campanias/TablaCampanias'
import { BotonesDeLinea } from '@/components/meta-ads/campanias/celdas'
import { DeDondeSale } from '@/components/meta-ads/campanias/DeDondeSale'
import { useCampanias } from '@/components/meta-ads/useCampanias'
import { plata } from '@/lib/meta-ads/formato'
import { rotuloObjetivo } from '@/lib/meta-ads/etapas'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import type { CampañaEtapa, CampañaSinLinea, Diagnostico } from '@/lib/meta-ads/tipos'
import {
  Card, EmptyState, Notice, Plegable, SectionCard, color, font, space, weight,
} from '@/components/ui'

export function Campanias() {
  const m = useCampanias()
  const { cuenta } = useMeta()
  const [verSinMarca, setVerSinMarca] = useState(false)

  /**
   * Todas las campañas de la línea, en un solo orden.
   *
   * 🔑 **Los cuatro cortes del diagnóstico se juntan de nuevo acá y eso NO es deshacer su trabajo.**
   * `alAire`, `sinEntrega`, `pausadas` y `sinClasificar` reparten el 100% de las campañas sin
   * repetir ninguna (hay un test de esa invariante), así que juntarlos es exactamente la lista
   * completa. Es la misma invariante la que hace que esta pantalla no pueda perder una fila.
   */
  const filas = useMemo(() => {
    const d: Diagnostico | null = m.diag
    if (!d) return [] as CampañaEtapa[]
    const todas = [
      ...d.etapas.flatMap((e) => e.alAire),
      ...d.etapas.flatMap((e) => e.sinEntrega),
      ...d.etapas.flatMap((e) => e.pausadas),
      ...d.sinClasificar,
    ]
    const deLaCuenta = cuenta === 'todas' ? todas : todas.filter((c) => c.cuentaId === cuenta)
    return [...deLaCuenta].sort((a, b) => (b.spend || 0) - (a.spend || 0))
  }, [m.diag, cuenta])

  const sinMarca: CampañaSinLinea[] = m.estado.fase === 'ok'
    ? (cuenta === 'todas' ? m.estado.data.sinAsignar : m.estado.data.sinAsignar.filter((c) => c.cuentaId === cuenta))
    : []
  const alAire = m.diag ? m.diag.etapas.reduce((n, e) => n + e.alAire.length, 0) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <VentanaEtapas dias={m.dias} setDias={m.setDias} />

      {m.estado.fase === 'cargando' && <Card style={{ color: color.mut2 }}>Leyendo las campañas de Meta…</Card>}

      {m.estado.fase === 'error' && (
        <Notice tone="danger">
          No se pudieron traer las campañas: {m.estado.motivo}
          <div style={{ fontSize: font.sm, marginTop: space[1] }}>
            ⚠️ Desde el 30-ago un token vencido ya ⛔ no llega acá: cae a la foto diaria y lo dice
            arriba. Si igual estás viendo esto, tampoco se pudo leer la foto.
          </div>
        </Notice>
      )}

      {m.estado.fase === 'ok' && <DeDondeSale d={m.estado.data} />}

      {m.estado.fase === 'ok' && (
        <SectionCard
          title={`Campañas de ${ETIQUETA_LINEA[m.lineaAbierta]}`}
          subtitle={
            filas.length === 0
              ? 'Ninguna con la cuenta y la ventana elegidas.'
              : `${filas.length} en total, ${alAire} al aire. Ordenadas por gasto en la ventana. Tocá el nombre para ver sus avisos, o «Conjuntos» para bajar al nivel donde vive la plata.`
          }
        >
          {filas.length === 0 ? (
            <EmptyState
              title="No hay campañas para mostrar"
              hint="Probá con «Todas» las cuentas arriba, o con la ventana de 90 días."
              dashed
            />
          ) : (
            <TablaCampanias filas={filas} correccion={m.correccion} avisos={m.avisos} palanca={m.palanca} />
          )}

          {/* Las sin marca van al pie y plegadas: acá no son el reclamo (ese vive en el Embudo, que
              es donde sus números faltan), son sólo campañas que todavía no se pueden accionar. */}
          {sinMarca.length > 0 && (
            <Plegable
              abierto={verSinMarca}
              onToggle={() => setVerSinMarca((v) => !v)}
              titulo={`${sinMarca.length} sin marca asignada`}
              ayuda="Sin marca no se las puede accionar —ni siquiera siendo admin—, porque el permiso se pregunta por línea. Asignarles una acá las habilita en el acto."
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
                {sinMarca.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space[2],
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: font.sm, fontWeight: weight.semibold }}>{c.nombre}</div>
                      <div style={{ fontSize: font.xs, color: color.mut2 }}>
                        {rotuloObjetivo(c.objetivo)} · {plata(c.spend)} · <code>{c.cuentaId}</code>
                      </div>
                    </div>
                    <BotonesDeLinea c={c} sugerida={c.sugerida} correccion={m.correccion} />
                  </div>
                ))}
              </div>
            </Plegable>
          )}
        </SectionCard>
      )}

      <ModalesDeAccion m={m.accion.modales} />

      <CorreccionAbierta m={m} />
    </div>
  )
}
