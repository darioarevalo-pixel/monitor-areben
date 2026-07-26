import type { Perfil } from '@/lib/permisos'

/**
 * Un usuario en la pantalla de gestión: el `Perfil` (name/admin/cuenta/acceso/funcion/
 * email) más lo que hace falta para administrar su contraseña sin poder leerla.
 *
 * Las contraseñas se guardan hasheadas, así que el servidor ya no las devuelve y esta
 * pantalla no puede mostrarlas. En su lugar:
 *
 * - `tienePass` dice si esa cuenta puede entrar con contraseña (lo informa el servidor).
 * - `pass` es la contraseña NUEVA que se le está poniendo. Vacío significa "no la
 *   toques", que es el caso normal: guardar un cambio de permisos no la pisa.
 * - `nameOriginal` es el nombre con el que la fila llegó del servidor, para que renombrar
 *   a alguien sin tocarle la contraseña no se la borre.
 */
export type UsuarioConfig = Perfil & {
  pass?: string
  tienePass?: boolean
  nameOriginal?: string
}
