/**
 * Quién aparece en «Autoriza la encargada» del POS (Bruno, 28-oct): sólo quien cobra en la caja de ESA marca.
 * Tener PIN no alcanza: el PIN se fija en las dos bases a la vez (Usuarios › PIN), así que la lista se acota con el padrón.
 *
 *   - tiene PIN en la base de la marca;
 *   - ⛔ Admin (Bruno: «no tiene sentido que aparezca porque no cobra en caja»);
 *   - función `local`;
 *   - su cuenta está fija en ESA marca o no tiene cuenta fija (las de BDI ⛔ aparecen en Zattia, ni al revés).
 *
 * Devuelve sólo `{ usuario, nombre }`: ni el PIN, ni el bloqueo, ni quién es admin salen al mostrador.
 * @param {{ usuarios: { name?: string, apodo?: string | null, admin?: boolean, funcion?: string[] | string | null, cuenta?: string | null }[], conPin: string[], marca: string }} e
 * @returns {{ usuario: string, nombre: string }[]}
 */
export function encargadasDeMarca({ usuarios, conPin, marca }) {
  const pin = new Set((conPin || []).map((u) => String(u).trim().toLowerCase()))
  return (usuarios || [])
    .filter((u) => u && u.name && !u.admin)
    .filter((u) => (Array.isArray(u.funcion) ? u.funcion : u.funcion ? [u.funcion] : []).includes('local'))
    .filter((u) => !u.cuenta || u.cuenta === marca)
    .map((u) => ({ usuario: String(u.name).trim().toLowerCase(), nombre: u.apodo || u.name }))
    .filter((u) => pin.has(u.usuario))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}
