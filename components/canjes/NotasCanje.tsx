'use client'

/**
 * La bitácora del canje: lo que se le va sumando a mano por fuera de los campos.
 *
 * 🔑 **Es hermana de las notas de la PERSONA** (`FichaPersona`), y a propósito la misma forma: el
 * mismo `[{id, texto, at, usuario}]`, el mismo input con Enter, la misma lista invertida. Lo que
 * cambia es de quién cuelgan. La de la persona es del **vínculo** —«no contesta los martes», «vive
 * en Funes»— y sirve para el próximo canje; ésta es de **este canje** —«pidió que llegue antes del
 * viernes», «se le sumó una funda de regalo porque se demoró el envío»— y muere con él.
 *
 * ⚠️ **No es la `nota` de la propuesta.** Aquélla es una columna de texto que se pisa; ésta apila,
 * que es lo que hacía falta: la información de un canje no aparece toda junta al crearlo, va
 * llegando, y una columna que se pisa pierde lo anterior sin dejar rastro.
 *
 * ⛔ **Es interna: no viaja al portal.** El servidor no la manda en el payload de
 * `api/_canje-portal.js`, y hay un test que exige que su texto no aparezca en ese JSON.
 */

import { useState } from 'react'
import { Button, Input, SectionCard, color, font, space, useConfirmar, useToast } from '@/components/ui'
import { agregarNotaCanje, borrarNotaCanje } from '@/lib/canjes/cliente'
import type { CanjeStore, NotaCanje } from '@/lib/canjes/tipos'

export function NotasCanje({
  store, canjeId, notas, onCambio,
}: {
  store: CanjeStore
  canjeId: number
  notas: NotaCanje[]
  /** Recibe la lista ya actualizada: la ficha se re-pinta sin volver a leerla entera. */
  onCambio: (notas: NotaCanje[]) => void
}) {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function sumar() {
    const t = texto.trim()
    if (!t || guardando) return
    setGuardando(true)
    try {
      onCambio(await agregarNotaCanje(store, canjeId, t))
      setTexto('')
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  async function quitar(notaId: string) {
    const ok = await confirmar({ titulo: 'Borrar esta nota', mensaje: 'No se puede deshacer.', ok: 'Borrar', tono: 'danger' })
    if (!ok) return
    try {
      onCambio(await borrarNotaCanje(store, canjeId, notaId))
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    }
  }

  return (
    <SectionCard
      title="Notas del canje"
      subtitle="Lo que se vaya sabiendo y no entre en ningún campo. Se puede escribir también después de cerrarlo."
    >
      <div style={{ display: 'flex', gap: space[2], marginBottom: space[3] }}>
        <Input
          value={texto}
          placeholder="Pidió que le llegue antes del viernes"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void sumar() }}
          style={{ flex: 1 }}
        />
        <Button variant="outline" onClick={() => void sumar()} disabled={!texto.trim() || guardando}>Agregar</Button>
      </div>
      {!notas.length ? (
        <div style={{ color: color.mut2, fontSize: font.sm }}>Sin notas.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          {[...notas].reverse().map((n) => (
            <div key={n.id} style={{ display: 'flex', gap: space[2], alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{n.texto}</div>
                <div style={{ color: color.mut2, fontSize: font.sm }}>
                  {n.at.slice(0, 10)}
                  {n.usuario ? ` · ${n.usuario}` : ''}
                </div>
              </div>
              {/* ⚠️ Se borra por `n.id`, nunca por índice: la lista está invertida acá y el índice
                  del render no es el de la base. Es el bug que ya tiene `lib/crm/leads.ts`. */}
              <Button variant="ghost" tone="danger" size="sm" onClick={() => void quitar(n.id)}>Borrar</Button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
