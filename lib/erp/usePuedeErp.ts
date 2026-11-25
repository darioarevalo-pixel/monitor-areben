'use client'

/**
 * `usePuedeErp(marca)`: ¿este perfil puede hacer X en el ERP de esta marca? Lee `vista=permisos` UNA vez por sesión de la pestaña.
 *
 * 🔑 Es COMODIDAD, ⛔ seguridad: el servidor rechaza igual (`api/_erp.js` chequea `permisoErpDe` en cada pedido). Por eso falla
 * ABIERTO —sin respuesta, o con un permiso que ⛔ conoce, el botón se ve— y sólo se esconde lo que el servidor dijo `false`:
 * un botón de menos por un fallo de red sería peor que uno de más que el servidor frena con su 403.
 */

import { useEffect, useState } from 'react'
import { alCambiarRolVisto } from './ver-como'
import { leerPermisos, type MarcaErp, type PermisosErp } from './cliente'

let pendiente: Promise<PermisosErp | null> | null = null
const unaVez = () => (pendiente ??= Promise.resolve().then(() => leerPermisos()).then((r) => r.permisos).catch(() => { pendiente = null; return null }))

/** Para los tests: olvida lo leído. */
export const olvidarPermisosErp = () => { pendiente = null }
// «Ver como»: al cambiar de rol, los permisos se vuelven a pedir.
alCambiarRolVisto(olvidarPermisosErp)

/** @returns `puede(permiso)`: `false` sólo si el servidor dijo que no. */
export function usePuedeErp(marca: MarcaErp): (permiso: string) => boolean {
  const [permisos, setPermisos] = useState<PermisosErp | null>(null)
  useEffect(() => {
    let vivo = true
    void unaVez().then((p) => { if (vivo) setPermisos(p) })
    return () => { vivo = false }
  }, [])
  return (permiso) => permisos?.[marca]?.[permiso] !== false
}

/**
 * ¿Ya se sabe si puede? `null` mientras se leen los permisos; después, igual que `usePuedeErp` (falla abierto si no se pudieron
 * leer). Para lo que LEE algo apenas se monta (la cuenta corriente de Clientes): ⛔ pedir antes de saber el permiso.
 */
export function usePuedeErpListo(marca: MarcaErp, permiso: string): boolean | null {
  const [estado, setEstado] = useState<boolean | null>(null)
  useEffect(() => {
    let vivo = true
    void unaVez().then((p) => { if (vivo) setEstado(p?.[marca]?.[permiso] !== false) })
    return () => { vivo = false }
  }, [marca, permiso])
  return estado
}
