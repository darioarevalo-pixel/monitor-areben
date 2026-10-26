'use client'

import { useEffect, useState } from 'react'
import { leerRoles, ponerRoles, restablecerRoles, type MarcaErp, type RolErp, type VistaRoles } from '@/lib/erp/cliente'
import { FUNCIONES } from '@/lib/permisos'
import { Card, Notice, color, space } from '@/components/ui'

/**
 * Qué rol puede qué en el ERP, por marca (Bruno, 25-oct: «la configuración de permisos se va a seguir trabajando»). Cada casilla es
 * un rol que tiene ese permiso en esa marca; el Admin siempre puede. Sin tocar nada vale lo del código; al tocar se guarda en la base
 * de la marca (motor sql/049) y vale en el próximo pedido. «Volver al original» borra lo guardado de ese permiso.
 */
const MARCAS: { id: MarcaErp; nombre: string }[] = [{ id: 'bdi', nombre: 'Bendito Delirio' }, { id: 'zattia', nombre: 'Zattia y Stunned' }]
const TEXTO: Record<string, string> = {
  'editar-venta': 'Editar los datos de una venta', cobrar: 'Cobrar una venta', cambiar: 'Hacer un cambio', anular: 'Anular una venta',
  'corregir-precio': 'Corregir el precio de una venta', 'corregir-medio': 'Corregir el medio de un cobro',
  desarmar: 'Confirmar que volvió la prenda de una anulada', 'facturar-venta': 'Facturar una venta', facturacion: 'Facturación del mes y notas de crédito',
  proveedores: 'Proveedores', ajustar: 'Cargar ajustes y transferencias de stock', 'aprobar-ajuste': 'Aprobar ajustes de stock', cuentas: 'Ver las cuentas corrientes',
}
const nombreRol = (r: RolErp) => FUNCIONES.find((f) => f.key === r)?.label ?? r
const mismos = (a: RolErp[], b: RolErp[]) => a.length === b.length && a.every((x) => b.includes(x))

export function RolesPermisos() {
  const [datos, setDatos] = useState<VistaRoles | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    leerRoles().then((r) => { if (vivo) setDatos(r) }, (e: Error) => { if (vivo) setError(e.message) })
    return () => { vivo = false }
  }, [])

  const rolesDe = (d: VistaRoles, marca: MarcaErp, permiso: string): RolErp[] => d.guardados[marca]?.[permiso] ?? d.defecto[marca][permiso] ?? []
  const guardar = async (marca: MarcaErp, permiso: string, roles: RolErp[] | null) => {
    setGuardando(`${marca}:${permiso}`)
    try {
      const r = roles ? await ponerRoles(marca, permiso, roles) : await restablecerRoles(marca, permiso)
      setDatos((d) => (d ? { ...d, guardados: { ...d.guardados, [marca]: r.guardados } } : d))
      setError(null)
    } catch (e) { setError((e as Error).message) } finally { setGuardando(null) }
  }

  return (
    <Card padding={4} style={{ marginTop: space[4] }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Quién puede qué en el ERP</div>
      <div style={{ color: color.mut2, fontSize: 13, marginBottom: 12 }}>
        Tildá los roles que pueden hacer cada cosa en cada marca. El Admin siempre puede; los costos y la Configuración son sólo del Admin. El cambio vale en el próximo pedido.
      </div>
      {error && <Notice tone="warning" icon="⚠️" style={{ marginBottom: 12 }}>{error}</Notice>}
      {!datos ? (
        !error && <div style={{ color: color.mut2 }}>Cargando…</div>
      ) : (
        MARCAS.map((m) => (
          <div key={m.id} style={{ marginBottom: 16, overflowX: 'auto' }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{m.nombre}</div>
            {datos.guardados[m.id]?.__error && (
              <Notice tone="warning" icon="⚠️" style={{ marginBottom: 8 }}>No se pudieron leer los roles guardados de esta marca: mientras tanto sólo el Admin hace estas cosas.</Notice>
            )}
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '4px 8px 4px 0' }}>Permiso</th>
                  {datos.roles.map((r) => <th key={r} style={{ padding: '4px 8px', fontWeight: 600 }}>{nombreRol(r)}</th>)}
                  <th />
                </tr>
              </thead>
              <tbody>
                {datos.editables.map((p) => {
                  const actuales = rolesDe(datos, m.id, p)
                  const ocupado = guardando === `${m.id}:${p}`
                  const distinto = !mismos(actuales, datos.defecto[m.id][p] ?? [])
                  return (
                    <tr key={p} style={{ borderTop: `1px solid ${color.line}` }}>
                      <td style={{ padding: '6px 8px 6px 0' }}>{TEXTO[p] ?? p}</td>
                      {datos.roles.map((r) => (
                        <td key={r} style={{ textAlign: 'center', padding: '6px 8px' }}>
                          <input
                            type="checkbox"
                            aria-label={`${nombreRol(r)}: ${TEXTO[p] ?? p}`}
                            checked={actuales.includes(r)}
                            disabled={ocupado || !!datos.guardados[m.id]?.__error}
                            onChange={(e) => void guardar(m.id, p, e.target.checked ? [...actuales, r] : actuales.filter((x) => x !== r))}
                          />
                        </td>
                      ))}
                      <td style={{ padding: '6px 0', whiteSpace: 'nowrap' }}>
                        {distinto && <button type="button" disabled={ocupado} onClick={() => void guardar(m.id, p, null)} style={{ fontSize: 12 }}>Volver al original</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
    </Card>
  )
}
