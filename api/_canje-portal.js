// El canje visto por la CREADORA, desde el link que se le pasa por WhatsApp. **Es lo único del
// módulo abierto a internet**, así que conviene leerlo con esa lente.
//
//   GET  /api/postventa?recurso=canje&token=XXX               → lo poco que ella ve, prellenado.
//   POST { recurso:'canje', token, accion:'guardar', datos }  → sus datos + `datos_confirmados_at`.
//
// CÓMO SE PROTEGE (no hay sesión: la llave es el token)
//   - El token son 64 hex aleatorios, único por canje, con vencimiento, y `cancelar` lo revoca.
//   - Token inválido, vencido, de un canje terminal o todavía sin aprobar → **404 pelado**. No
//     dice "existe pero venció" ni "no existe": desde afuera son indistinguibles, así que el link
//     no sirve para averiguar nada.
//   - Sólo se puede escribir en la persona de ESE canje, y sólo los campos de `CAMPOS_PERSONA`.
//     Nada de plata, nada de estados, nada de otra persona.
//   - La respuesta se arma campo por campo (`paraLaPersona`): no se hace `select *` ni se filtra
//     después. Lo que no está en la whitelist no viaja, aunque mañana alguien agregue una columna.
//
// DIFERENCIA CON `_reclamo.js`, que es su molde: **acá hay UNA sola base**. Todo el módulo de
// canjes vive en la maestra de BDI para las tres marcas (ver el encabezado de `_canjes.js`), así
// que no hay que buscar el token en dos lugares.
//
// LO QUE ESCRIBE, Y POR QUÉ NO APILA HISTORIAL: los datos van a la fila de la **persona** (la
// dirección se muda una vez cada tres años, no es del canje) y la marca de tiempo va a una columna
// propia del canje, `datos_confirmados_at`. Nada de `apilar()`: ese patrón re-lee y reescribe un
// array y **no es atómico**, y acá hay dos escritores por diseño —el operador desde el panel y ella
// desde el portal, al mismo tiempo, sin coordinarse—. Columna propia = no hay carrera que perder.
import { createClient } from '@supabase/supabase-js';

/** La misma base maestra de `_canjes.js`. Si algún día se separa por marca, cambian los dos. */
function cfgMaestra() {
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

/** Estados en los que el link todavía sirve. Antes de `acuerdo` no hay token; después ya se cerró. */
const ABIERTO = ['acuerdo', 'preparando', 'en_curso'];

/** Las únicas columnas del canje que se leen. */
const CANJE_COLS = 'id, store, estado, persona_id, token_vence, datos_confirmados_at, envio_estado, entregado_at';

/**
 * Los únicos campos que ella puede ver y escribir de su propia ficha. Es la whitelist en los dos
 * sentidos: lo que sale y lo que entra.
 *
 * ⚠️ Nunca sumar acá `vetada`, `vetada_motivo`, `destacada_nota`, `notas` ni `cadencia_dias`: son
 * juicios internos sobre ella. `seguidores_*` tampoco — los carga el equipo y son parte del criterio
 * con el que se decide un canje.
 */
const CAMPOS_PERSONA = [
  'nombre', 'apellido', 'telefono', 'email', 'dni',
  'calle', 'numero', 'piso', 'depto', 'cp', 'localidad', 'provincia', 'direccion_nota',
];

/** Espejo de `queDatoPide` en `lib/canjes/tipos.ts`: BDI vende fundas, Zattia y Stunned, ropa. */
function queDatoPide(store) {
  return store === 'bdi' ? 'modelo_celular' : 'talles';
}

/** Espejo de `STORE_LABEL`. Es lo que ella lee en el saludo, así que va con las mayúsculas de la marca. */
const STORE_LABEL = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' };

/** Espejo de `numeroCanje` en `lib/canjes/tipos.ts`. Mismo formato o los números no coinciden. */
function numeroCanje(id) {
  return 'C-' + String(id).padStart(4, '0');
}

const TALLES = ['remera', 'pantalon', 'calzado'];

const recorte = (v, max) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Lo que se le muestra: sus propios datos y nada más. Ni el tope, ni el monto, ni los productos, ni
 * lo que se le exigió publicar, ni una palabra del criterio con el que se la eligió.
 *
 * Se exporta para poder testearla: es la última barrera antes de que algo salga a internet, y un
 * campo de más acá no rompe ninguna pantalla — simplemente se filtra, en silencio, hacia afuera.
 * `tests/canje-portal.test.ts` le pasa una fila con todo lo sensible adentro y verifica que no salga.
 *
 * @returns {{ numero: string, marca: string, pide: 'talles'|'modelo_celular', despachado: boolean,
 *   confirmadoAt: string|null, driveUrl: string|null, datos: Record<string, any> }}
 */
export function paraLaPersona(canje, persona, cfg) {
  const store = canje.store;
  const p = persona || {};
  const datos = {};
  for (const k of CAMPOS_PERSONA) datos[k] = p[k] ?? null;

  // Los dos conviven en la ficha (la misma creadora puede tener talles por Zattia y modelo por BDI)
  // pero se manda sólo el que esta marca pide: pedirle datos que no le sirven a nadie es la forma
  // más barata de que abandone el formulario.
  const pide = queDatoPide(store);
  if (pide === 'talles') {
    const t = (p.talles && typeof p.talles === 'object') ? p.talles : {};
    datos.talles = { remera: t.remera ?? null, pantalon: t.pantalon ?? null, calzado: t.calzado ?? null };
  } else {
    datos.modelo_celular = p.modelo_celular ?? null;
  }

  return {
    numero: numeroCanje(canje.id),
    marca: STORE_LABEL[store] || store,
    pide,
    // Ya despachado: los datos no cambian nada y dejarla editarlos sería mentirle. Se muestra en
    // modo lectura con el aviso, en vez de un 404 que la haría escribirnos para nada.
    despachado: canje.envio_estado === 'hecho' || !!canje.entregado_at || canje.estado === 'en_curso',
    confirmadoAt: canje.datos_confirmados_at || null,
    // La carpeta donde deja las fotos. Opcional: si la marca no la cargó, la sección no aparece.
    driveUrl: (cfg && cfg.drive_url) || null,
    datos,
  };
}

/**
 * Sanea y valida lo que llega del formulario. Devuelve `{ campos, error }`: `error` en criollo, que
 * es lo que ella va a leer en el teléfono.
 *
 * Se valida **acá además de en el browser**: una validación que sólo existe en el front no es una
 * validación. Y se escribe **sólo lo que vino definido** — una clave ausente no borra lo que el
 * equipo ya había cargado.
 *
 * Exportada para test.
 *
 * @returns {{ campos?: Record<string, any>, error?: string }}
 */
export function camposDeLaPersona(datos, store) {
  const d = (datos && typeof datos === 'object') ? datos : {};
  /** @type {Record<string, any>} */
  const campos = {};

  for (const k of CAMPOS_PERSONA) {
    if (d[k] === undefined) continue;
    campos[k] = recorte(d[k], k === 'direccion_nota' ? 300 : 120);
  }

  if (queDatoPide(store) === 'talles') {
    if (d.talles !== undefined) {
      const t = (d.talles && typeof d.talles === 'object') ? d.talles : {};
      const limpio = {};
      for (const k of TALLES) limpio[k] = recorte(t[k], 30);
      campos.talles = limpio;
      if (!TALLES.some((k) => limpio[k])) return { error: 'Poné al menos un talle: es lo que necesitamos para elegirte el producto.' };
    }
  } else if (d.modelo_celular !== undefined) {
    campos.modelo_celular = recorte(d.modelo_celular, 60);
    if (!campos.modelo_celular) return { error: 'Falta el modelo de tu celular: sin eso no sabemos qué funda mandarte.' };
  }

  // Los obligatorios se piden sólo si la clave vino: así un guardado parcial (que hoy no existe,
  // pero mañana sí) no se rompe contra una regla pensada para el formulario completo.
  const falta = (k, comoSeLlama) => campos[k] !== undefined && !campos[k] ? comoSeLlama : null;
  const faltantes = [
    falta('nombre', 'tu nombre'),
    falta('telefono', 'tu teléfono'),
    falta('dni', 'tu DNI (lo pide el correo)'),
    falta('calle', 'la calle'),
    falta('numero', 'la altura'),
    falta('cp', 'el código postal'),
    falta('localidad', 'la localidad'),
    falta('provincia', 'la provincia'),
  ].filter(Boolean);
  if (faltantes.length) {
    const lista = faltantes.length === 1
      ? faltantes[0]
      : `${faltantes.slice(0, -1).join(', ')} y ${faltantes[faltantes.length - 1]}`;
    return { error: `Nos falta ${lista}.` };
  }

  if (!Object.keys(campos).length) return { error: 'No llegó ningún dato.' };
  return { campos };
}

/** Busca el canje del token. Devuelve null si no existe, venció, no arrancó o ya terminó. */
async function buscarPorToken(supabase, token) {
  const { data, error } = await supabase.from('canjes').select(CANJE_COLS).eq('token', token).maybeSingle();
  // El error se loguea aunque ella vea 404 igual. Sin esto, un problema de base (una columna que no
  // existe, credenciales vencidas) se ve EXACTAMENTE igual que un link inválido y nadie entiende
  // por qué "el link no anda". Ya pasó con el portal de reclamos.
  if (error) console.error(`[canje-portal] ${error.message}`);
  if (!data) return null;
  if (data.token_vence && new Date(data.token_vence).getTime() < Date.now()) return null;
  if (!ABIERTO.includes(data.estado)) return null;
  return data;
}

export default async function handler(req, res) {
  // Este endpoint NO usa `soloMismoOrigen`: lo abre ella desde su celular, con el link.
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = String((req.method === 'POST' ? (req.body || {}).token : req.query.token) || '').trim();
  // Un token con forma inválida ni siquiera se consulta.
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return res.status(404).json({ error: 'no encontrado' });

  const cfgDb = cfgMaestra();
  if (!cfgDb.url || !cfgDb.key) return res.status(500).json({ error: 'No se pudo abrir el formulario. Escribinos y lo resolvemos.' });
  const supabase = createClient(cfgDb.url, cfgDb.key);

  try {
    const canje = await buscarPorToken(supabase, token);
    if (!canje) return res.status(404).json({ error: 'no encontrado' });

    const [{ data: persona }, { data: cfg }] = await Promise.all([
      supabase.from('canje_personas')
        .select(`${CAMPOS_PERSONA.join(', ')}, talles, modelo_celular`)
        .eq('id', canje.persona_id).maybeSingle(),
      supabase.from('canje_config').select('drive_url').eq('store', canje.store).maybeSingle(),
    ]);

    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, canje: paraLaPersona(canje, persona, cfg) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    const accion = String((req.body || {}).accion || '');
    if (accion !== 'guardar') return res.status(400).json({ error: 'acción desconocida' });

    // Después del despacho la dirección ya viajó con el paquete: dejarla editar sería hacerle creer
    // que el pedido cambia de rumbo. El canje ya congeló su copia en `envio_direccion`.
    if (canje.envio_estado === 'hecho' || canje.entregado_at) {
      return res.status(409).json({ error: 'Tu pedido ya salió, así que los datos quedaron como estaban. Si algo no coincide, escribinos.' });
    }

    const { campos, error: eValida } = camposDeLaPersona((req.body || {}).datos, canje.store);
    if (eValida) return res.status(400).json({ error: eValida });

    const ahora = new Date().toISOString();
    const { error: eP } = await supabase.from('canje_personas')
      .update({ ...campos, updated_at: ahora }).eq('id', canje.persona_id);
    if (eP) throw new Error(eP.message);

    // Sin historial y sin re-leer: una columna, un update. Ver el encabezado.
    const { error: eC } = await supabase.from('canjes')
      .update({ datos_confirmados_at: ahora, updated_at: ahora }).eq('id', canje.id);
    if (eC) throw new Error(eC.message);

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 200) });
  }
}
