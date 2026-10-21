// `?recurso=sesion`: quién soy, según el Monitor (login propio, fase Bases paso 3, 21-oct-2026).
//
// Lo usa `components/SesionProvider.tsx` al RECARGAR la página cuando bdi-catalogo no contesta:
// antes, esa caída cerraba la sesión y borraba la contraseña guardada (la Caja quedaba afuera en
// medio del turno). Ahora el Monitor contesta con la sesión firmada que el navegador ya tenía.
// Con bdi-catalogo en pie, esto es la misma pregunta de siempre y devuelve una firma nueva.
import { exigirUsuario } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Sólo GET' });
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;
  return res.status(200).json({ ok: true, perfil });
}
