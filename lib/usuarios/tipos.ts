import type { Perfil } from '@/lib/permisos'

/**
 * Un usuario en la config admin: el `Perfil` (name/admin/cuenta/acceso) + la
 * contraseña. La pantalla de gestión (solo admin) pide la config COMPLETA (con
 * `pass`), a diferencia del login/`traerPerfiles` que no la exponen. El modelo de
 * contraseñas en texto plano es el actual del legacy (lo reemplaza la Fase S).
 */
export type UsuarioConfig = Perfil & { pass: string }
