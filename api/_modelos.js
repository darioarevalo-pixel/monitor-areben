// Modelos: el padrón de las modelos que trabajan con nosotros (`/api/datos?recurso=modelos`).
//
//   GET  ?recurso=modelos&store=bdi|zattia
//   GET  ?recurso=modelos&store=…&modo=elegibles   → la lista corta, para la sesión de fotos
//   POST { recurso:'modelos', action:'guardar',  modelo }
//   POST { recurso:'modelos', action:'eliminar', id }
//
// ## Siempre la base de BDI, tenga la sesión la marca que tenga
//
// Acá no hay marca: **la misma modelo hace las dos**, y Zattia no tiene service key. Que una
// trabaje sólo para una se dice con su columna `marcas`, que es una lista y **vacía quiere decir
// las dos**. Mismo criterio que `_insumos.js`, `_agenda.js` y `_sistema.js`.
//
// ⚠️ **La puerta SÍ valida `store`**, aunque la tabla no lo tenga: el permiso de la sección es por
// marca, como en Insumos.
//
// ## Lo que este handler ⛔ NO hace
//
// ⛔ **No normaliza a mano.** El talle, la altura, el Instagram y las medidas los normaliza
// `lib/modelos/core.core.js` —el MISMO núcleo que usa la sesión de fotos— y eso pasa **antes** del
// upsert: un talle guardado como `m` y otro como `Talle M` son dos talles distintos para todo lo
// que después agrupe, y eso no se arregla mostrando bonito.
// ⛔ **No lleva plata.** El cachet no está en la tabla a propósito (ver el encabezado del `.sql`):
// el permiso de Modelos ⛔ no es el de la liquidación.
//
// Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby de Vercel admite 12 funciones
// por deploy y cada archivo de ruta cuenta una.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { puedeVerAlguna } from '../lib/permisos.core.js';
import { leerTodo } from '../lib/supabase/paginar.core.js';
import {
  alturaNormalizada,
  CLAVES_ESTADO,
  esElegible,
  instagramNormalizado,
  medidasNormalizadas,
  motivoModeloInvalido,
  talleNormalizado,
} from '../lib/modelos/core.core.js';

const COLS = 'id, nombre, instagram, telefono, mail, agencia, booker, booker_contacto, talle, altura, medidas, estado, marcas, nota, autor, created_at, updated_at';

/** Siempre BDI: acá no hay marca. Ver el encabezado. */
function cfgMaestra() {
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

const nuevoId = () => `mo${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const textoOpcional = (v) => {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  return s ? s : null;
};

const salida = (f) => ({
  id: f.id,
  nombre: f.nombre,
  instagram: f.instagram ?? null,
  telefono: f.telefono ?? null,
  mail: f.mail ?? null,
  agencia: f.agencia ?? null,
  booker: f.booker ?? null,
  bookerContacto: f.booker_contacto ?? null,
  // 🔑 `null` es «todavía no se sabe qué talle usa», ⛔ no una cadena vacía: un '' se dibuja como
  // «Talle » en cualquier plantilla que lo concatene sin mirar.
  talle: f.talle ?? null,
  altura: f.altura ?? null,
  medidas: f.medidas && typeof f.medidas === 'object' ? f.medidas : {},
  estado: f.estado || 'activa',
  marcas: Array.isArray(f.marcas) ? f.marcas : [],
  nota: f.nota ?? null,
  autor: f.autor ?? null,
  creado: f.created_at,
  actualizado: f.updated_at,
});

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const store = String(req.query?.store || (req.body && req.body.store) || 'bdi');
  // 🔑 `puedeVerAlguna` y no `puedeVer` pelado: la `store` la elige el request, y `puedeVer` no
  // aplica la cuenta fija. Va ANTES de crear ningún cliente de Supabase.
  //
  // 🔴 **La lista corta la puede pedir también quien carga una SESIÓN DE FOTOS**, y ésa es toda la
  // diferencia entre los dos modos. Las dos secciones son de Marketing, así que en el padrón de hoy
  // casi siempre van juntas — pero desde el 3-sep-2026 una sección se le puede sacar a alguien de a
  // una (la excepción por marca de `puedeVer`), y el día que a un fotógrafo le saquen Modelos el
  // selector de la sesión ⛔ no puede empezar a contestar 403. Lo que ese permiso NO abre: el
  // teléfono, el mail, la agencia, la nota y **escribir**, que siguen pidiendo `modelos`.
  const elegibles = req.method === 'GET' && String(req.query?.modo || '') === 'elegibles';
  const secciones = elegibles ? ['modelos', 'sesion-fotos'] : ['modelos'];
  if (!puedeVerAlguna(perfil, store, secciones)) {
    return res.status(403).json({ error: 'No tenés acceso a Modelos.' });
  }

  const yo = perfil.name || null;
  if (!yo) return res.status(400).json({ error: 'La sesión no tiene nombre; volvé a entrar.' });

  const cfg = cfgMaestra();
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const sb = createClient(cfg.url, cfg.key);

  try {
    if (req.method === 'GET') {
      const filas = await leerTodo(sb, 'modelo', (q) => q.select(COLS).order('nombre'));
      if (elegibles) {
        // ⛔ **Cuatro campos y ninguno más**, aunque la fila los tenga al lado: es lo que hace que
        // este modo se le pueda abrir a quien ⛔ no tiene la sección. El filtro es del núcleo
        // (`esElegible`), ⛔ no un `where` escrito acá: la pantalla del padrón usa el mismo.
        const lista = filas
          .filter((f) => esElegible({ estado: f.estado || 'activa', marcas: Array.isArray(f.marcas) ? f.marcas : [] }, store))
          .map((f) => ({ id: f.id, nombre: f.nombre, talle: f.talle ?? null, altura: f.altura ?? null }));
        return res.status(200).json({ ok: true, modelos: lista });
      }
      return res.status(200).json({ ok: true, modelos: filas.map(salida) });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    const b = req.body || {};
    const action = String(b.action || '');

    if (action === 'guardar') {
      const m = b.modelo || {};
      const motivo = motivoModeloInvalido(m);
      if (motivo) return res.status(400).json({ error: motivo });
      const id = String(m.id || '') || nuevoId();
      // 🔴 **Todo lo que se compara después se normaliza ACÁ**, ⛔ no en la pantalla: la pantalla es
      // uno de los llamadores, y el día que haya otro (la sesión de fotos, un script de alta) el
      // que no normalice mete el talle torcido sin que falle nada.
      const fila = {
        id,
        nombre: String(m.nombre).trim().replace(/\s+/g, ' '),
        instagram: instagramNormalizado(m.instagram) || null,
        telefono: textoOpcional(m.telefono),
        mail: textoOpcional(m.mail),
        agencia: textoOpcional(m.agencia),
        booker: textoOpcional(m.booker),
        booker_contacto: textoOpcional(m.bookerContacto),
        talle: talleNormalizado(m.talle) || null,
        altura: alturaNormalizada(m.altura) || null,
        medidas: medidasNormalizadas(m.medidas),
        estado: CLAVES_ESTADO.includes(m.estado) ? m.estado : 'activa',
        marcas: Array.isArray(m.marcas) ? m.marcas : [],
        nota: textoOpcional(m.nota),
        autor: yo,
        updated_at: new Date().toISOString(),
      };
      const { error } = await sb.from('modelo').upsert(fila);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true, id });
    }

    if (action === 'eliminar') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      // ⚠️ Elimina de verdad, y por eso la pantalla ofrece **archivar** primero: archivada sale de la
      // lista y sigue existiendo, que es lo que corresponde con alguien que ya trabajó.
      const { error } = await sb.from('modelo').delete().eq('id', id);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `acción inválida: ${action || '(vacía)'}` });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
