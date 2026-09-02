// A quién le debemos — la cuenta corriente de los acreedores, leída del dashboard.
//
//   GET ?recurso=acreedores  → [{ id, nombre, saldo, disponible, yaPagadoSinDebitar,
//                                 ultimoMovimiento, conceptos[], cuentas[] }]
//
// ## Para qué está acá si el dato es del dashboard
//
// Porque la decisión se toma acá. A un cliente que nos debe plata se le pide que transfiera
// DIRECTO a la cuenta del contador o del abogado: una transferencia cancela dos deudas. Para
// pedírselo hay que saber, en la misma pantalla, a quién le debemos, cuánto y a qué cuenta.
//
// ## ⛔ Por qué NO lee las tablas del dashboard directo
//
// `_norte.js` sí lo hace, y está bien: lee REGLAS guardadas (qué cuenta factura, cuánto cobra cada
// medio de pago). Acá el dato no es una tabla, es una CUENTA con criterios adentro —qué pago cuenta,
// cuál está solo agendado, cómo se corta el saldo en cero—. Si el Monitor la rehiciera, el día que
// una de las dos apps cambie un criterio las dos van a mostrar números distintos y nadie va a saber
// cuál creer. Por eso el dashboard expone el RESULTADO por una puerta y acá solo se lo muestra.
//
// ## Quién llama, y con qué credencial
//
// 🔑 Del otro lado no hay una persona: hay un SERVIDOR. El navegador manda el sobre de siempre
// (`x-monitor-auth`), acá se resuelve el perfil con `exigirUsuario` —que valida contra el padrón en
// cada request— y recién ahí este servidor llama al dashboard con SU propia credencial.
//
// ⛔ No se usa el token de Google de la persona: no siempre existe. Adentro del panel de WhatsApp se
// entra con usuario y contraseña porque Google no acepta su login en un iframe. Atar la puerta al
// token dejaría al panel afuera.
//
// ⚠️ Identidad ≠ permiso: al Monitor entra mucha más gente que al dashboard. El permiso se chequea
// ACÁ, antes de llamar, y la sección está registrada en PERM_CAT.
//
// ## Si el dashboard no contesta
//
// Contesta 200 con la lista vacía y un `aviso`, no un error. Misma regla que `reglasDelDashboard`
// en `_norte.js`: que el dashboard esté caído tiene que dejar la sección sin la columna de plata,
// no sin pantalla.
//
// Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby admite 12 funciones por
// deploy y cada archivo de ruta cuenta una.
import { exigirUsuario } from './_auth.js';
import { esAdmin, marcasConAcceso } from '../lib/permisos.core.js';

const URL_PUENTE =
  process.env.DASHBOARD_PUENTE_URL || 'https://dashboard.arebensrl.com/api/puente/acreedores';

// El techo de la función son 30 s. Se corta bastante antes para poder contestar con un aviso
// entendible en vez de que Vercel mate la request y el navegador vea un error pelado.
const TIMEOUT_MS = 8000;

/**
 * Le pregunta al dashboard. Devuelve `{ acreedores }` o `{ aviso }` — nunca tira, porque el que
 * llama tiene que poder mostrar la pantalla igual.
 */
async function traerDelDashboard() {
  const secreto = process.env.DASHBOARD_PUENTE_SECRET;
  if (!secreto) {
    return { aviso: 'Falta conectar el dashboard (DASHBOARD_PUENTE_SECRET).' };
  }

  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(URL_PUENTE, {
      headers: { 'x-puente-auth': secreto },
      signal: corte.signal,
    });
    if (!r.ok) {
      // El cuerpo puede no ser JSON (un HTML de error de Vercel, por ejemplo).
      const detalle = await r.text().catch(() => '');
      let mensaje = `el dashboard contestó ${r.status}`;
      try {
        const j = JSON.parse(detalle);
        if (j && j.error) mensaje = j.error;
      } catch {}
      return { aviso: `No se pudo leer la deuda: ${mensaje}` };
    }
    const d = await r.json();
    return { acreedores: Array.isArray(d?.acreedores) ? d.acreedores : [] };
  } catch (e) {
    if (e?.name === 'AbortError') {
      return { aviso: 'El dashboard está tardando. Probá de nuevo en un minuto.' };
    }
    return { aviso: `No se pudo leer la deuda: ${e.message}` };
  } finally {
    clearTimeout(reloj);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Solo GET.' });
  }

  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  // La sección no tiene marca: lo que se le debe al contador no es de BDI ni de Zattia, es de la
  // empresa. Mismo criterio que el Memo semanal.
  const puede = esAdmin(perfil) || marcasConAcceso(perfil, 'acreedores', ['bdi', 'zattia']).length > 0;
  if (!puede) {
    return res.status(403).json({ error: 'No tenés permiso para ver a quién le debemos.' });
  }

  const r = await traerDelDashboard();
  return res.status(200).json({ ok: true, acreedores: r.acreedores || [], aviso: r.aviso || null });
}
