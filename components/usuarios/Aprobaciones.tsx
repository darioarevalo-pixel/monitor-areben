'use client'

import { useEffect, useState } from 'react'
import { leerInterruptores, ponerInterruptor, type ClaveInterruptor, type Interruptores, type MarcaErp } from '@/lib/erp/cliente'
import { Card, Notice, color, space } from '@/components/ui'

/**
 * Aprobaciones del ERP, por marca (Bruno, 24-oct). Apagado: lo hace quien tiene el permiso de su rol y queda quién fue.
 * Prendido: sólo un Admin. Se guardan en la base de cada marca (motor sql/035); el cambio vale en el próximo pedido.
 */
const MARCAS: { id: MarcaErp; nombre: string }[] = [{ id: 'bdi', nombre: 'Bendito Delirio' }, { id: 'zattia', nombre: 'Zattia y Stunned' }]
const FILAS: { clave: ClaveInterruptor; texto: string }[] = [
  { clave: 'anular', texto: 'Anular una venta' },
  { clave: 'conteo', texto: 'Aplicar un conteo con diferencias' },
  { clave: 'precio', texto: 'Corregir el precio de una venta' },
]

export function Aprobaciones() {
  const [datos, setDatos] = useState<Record<MarcaErp, Interruptores> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    leerInterruptores().then((r) => { if (vivo) setDatos(r.interruptores) }, (e: Error) => { if (vivo) setError(e.message) })
    return () => { vivo = false }
  }, [])

  const cambiar = async (marca: MarcaErp, clave: ClaveInterruptor, valor: boolean) => {
    setGuardando(`${marca}:${clave}`)
    try {
      const r = await ponerInterruptor(marca, clave, valor)
      setDatos((d) => (d ? { ...d, [marca]: r.interruptores } : d))
      setError(null)
    } catch (e) { setError((e as Error).message) } finally { setGuardando(null) }
  }

  return (
    <Card padding={4} style={{ marginTop: space[4] }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Aprobaciones del ERP</div>
      <div style={{ color: color.mut2, fontSize: 13, marginBottom: 12 }}>
        Apagado: lo hace quien tenga el permiso de su rol y queda anotado quién fue. Prendido: sólo un Admin.
      </div>
      {error && <Notice tone="warning" icon="⚠️" style={{ marginBottom: 12 }}>{error}</Notice>}
      {!datos ? (
        !error && <div style={{ color: color.mut2 }}>Cargando…</div>
      ) : (
        MARCAS.map((m) => (
          <div key={m.id} style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{m.nombre}</div>
            {FILAS.map((f) => (
              <label key={f.clave} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
                <input
                  type="checkbox"
                  checked={datos[m.id]?.[f.clave] === true}
                  disabled={guardando === `${m.id}:${f.clave}`}
                  onChange={(e) => void cambiar(m.id, f.clave, e.target.checked)}
                />
                <span>Sólo Admin: {f.texto.toLowerCase()}</span>
              </label>
            ))}
          </div>
        ))
      )}
    </Card>
  )
}
