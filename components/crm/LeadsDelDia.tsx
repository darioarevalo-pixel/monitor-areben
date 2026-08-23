'use client'

import { useCallback, useEffect, useState } from 'react'
import { guardarMapa, leerMapa } from '@/lib/kv/cliente'
import { Button, color, font, space, useToast } from '@/components/ui'
import { hableHoy, leadsDelDia, setCadencia, type Lead, type LeadConSeg, type MapaLeads } from '@/lib/crm/leads'

/**
 * Los leads que hay que contactar hoy, arriba de la lista de clientes.
 *
 * **El problema que cierra.** Los leads viven en su propia pestaña, sin filtros por día: se
 * cargan y ahí quedan. Medido el 23-ago-2026: 37 cargados, **4 con un contacto registrado**, y
 * 6 que igual llegaron a comprar. No es que sobren — es que no aparecen cuando se trabaja.
 *
 * **Por qué un bloque y no filas de la tabla.** La tabla de Clientes tiene 9 columnas y cinco
 * son de compras (pedidos, total, último pedido…). Un lead no compró nunca: entraría con la
 * mitad de la fila en "—". La tabla ya se podó una vez con un solo criterio — ¿esto lo mirás
 * mientras llamás? —, y meterle columnas vacías es deshacer esa poda. Acá va lo poco que un
 * lead tiene: quién es, de dónde, y qué se le dijo la última vez.
 *
 * 🔴 **Relee el mapa justo antes de escribir.** La pestaña Leads tiene su propia copia en
 * memoria y guarda el mapa ENTERO: sin la relectura, tocar "Le escribí hoy" acá pisaría lo que
 * se acabara de hacer allá. Es la misma disciplina del panel de WhatsApp
 * (`guardarConRelectura`), por la misma razón: dos pantallas sobre una sola clave sin backup.
 */

const fmtFecha = (d: string | null) => {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}` : '—'
}

export function LeadsDelDia({
  seg,
  hoy,
  manana,
  onAbrirLead,
}: {
  seg: string
  hoy: string
  manana: string
  onAbrirLead: (id: string) => void
}) {
  const toast = useToast()
  const [leads, setLeads] = useState<MapaLeads>({})
  const [cargado, setCargado] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  // Congelado al montar, igual que el TODAY del CRM: los cortes por día no se mueven solos.
  const [today] = useState(() => new Date())

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const r = await leerMapa<Lead>('crmleads', 'bdi')
      if (!vivo) return
      if (r.ok) {
        setLeads(r.dato)
        setCargado(true)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  const marcarHableHoy = useCallback(
    async (id: string) => {
      if (!cargado || ocupado) return
      setOcupado(id)
      // 🔴 La relectura, antes de cualquier cosa. Ver el docblock.
      const previo = await leerMapa<Lead>('crmleads', 'bdi')
      if (!previo.ok) {
        setOcupado(null)
        toast.error('No se pudo leer los leads, así que no se guarda: guardar ahora borraría los que hay.')
        return
      }
      // 🔑 Sin cadencia, marcar el contacto NO agenda nada: el lead vuelve a quedar sin fecha y
      // reaparece mañana igual, para siempre. Los 25 leads viejos están así. Se le pone la misma
      // cadencia por defecto que usa el formulario del panel de WhatsApp al cargar uno nuevo —
      // semanal—, que después se cambia desde la ficha.
      const actual = previo.dato[id]
      const base = actual && !actual.cadencia ? setCadencia(previo.dato, id, 'semanal') : previo.dato
      const nuevo = hableHoy(base, id)
      const r = await guardarMapa({ kind: 'crmleads', store: 'bdi', mapa: nuevo, cargado: true })
      setOcupado(null)
      if (!r.ok) {
        toast.error('No se pudo guardar: ' + r.motivo)
        return
      }
      setLeads(nuevo)
    },
    [cargado, ocupado, toast],
  )

  const lista: LeadConSeg[] = leadsDelDia(leads, { seg, hoy, manana, today })
  if (!lista.length) return null

  return (
    <div style={{ border: `1px solid ${color.line2}`, borderRadius: 'var(--mo-r-lg)', padding: `${space[3]} ${space[4]}`, marginBottom: space[3] }}>
      <div style={{ fontSize: font.sm, fontWeight: 700, color: color.mut, marginBottom: space[2] }}>
        Leads para contactar · {lista.length}
      </div>
      <div style={{ display: 'grid', gap: space[2] }}>
        {lista.map((l) => {
          const ult = (l.notas || [])[0]
          return (
            <div key={l.id} style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', fontSize: font.base }}>
              <button
                type="button"
                onClick={() => onAbrirLead(l.id)}
                title="Abrir la ficha del lead"
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 700, color: color.ink, textAlign: 'left' }}
              >
                {l.nombre || '(sin nombre)'}
              </button>
              {l.ciudad && <span style={{ color: color.mut2 }}>{l.ciudad}</span>}
              <span style={{ color: color.mut2 }}>{l.telefono || 'sin teléfono'}</span>
              <span style={{ color: l._seg.estado === 'vencido' || l._seg.estado === 'pendiente' || l._seg.estado === 'none' ? color.danger : color.mut }}>
                {l._seg.estado === 'none' ? 'sin agendar' : l._seg.estado === 'pendiente' ? 'sin primer contacto' : fmtFecha(l._seg.proximo)}
              </span>
              {ult && (
                <span style={{ color: color.mut, flex: 1, minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ult.texto}>
                  {ult.texto}
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={!cargado || ocupado === l.id}
                onClick={() => marcarHableHoy(l.id)}
                style={{ marginLeft: 'auto' }}
              >
                {ocupado === l.id ? 'Guardando…' : 'Le escribí hoy'}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
