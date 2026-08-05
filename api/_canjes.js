// Canjes con influencers y creadoras — handler del panel (ver sql/migrate-canjes.sql).
//
// ⚠️⚠️ ESTE HANDLER HABLA CON UNA SOLA BASE: LA DE **BDI**, SIEMPRE, PARA LAS TRES MARCAS. ⚠️⚠️
//
// Va contra la intuición del resto del monitor, donde `cfgFor(store)` rutea a la base de cada
// marca (`api/_reclamos.js:46`). Acá NO: el módulo entero vive en la base de BDI porque
// `canje_personas` es un padrón ÚNICO compartido. La misma creadora trabaja para BDI y para
// Zattia, y "¿hace cuánto no hacemos una acción con ella?" tiene que tener UNA respuesta, no dos.
// De qué marca es cada canje lo dice la columna `store` de `canjes`.
//
// Ventaja lateral confirmada: en `.env` hay `SUPABASE_SERVICE_KEY` (BDI) pero NO existe
// `ZATTIA_SUPABASE_SERVICE_KEY` — Zattia escribe hoy con la anon key. Escribiendo sólo contra la
// maestra de BDI el tema se esquiva por completo.
//
// Lo que se pierde, sin maquillar: la base de BDI guarda datos de Zattia, y si ese proyecto cae se
// cae Canjes de las tres marcas. Con decenas de canjes por mes el impacto es "hoy no cargo un
// canje", no "se para la venta".
//
//   GET  ?recurso=canjes&store=bdi|zattia|stunned                → personas + canjes visibles.
//   GET  ?recurso=canjes&vista=persona&id=N&store=...            → la ficha, con su historial cruzado.
//   GET  ?recurso=canjes&vista=config&store=...                  → la config de la marca.
//   POST { action:'persona-crear', instagram, ... }              → alta por @; si existe, la devuelve.
//   POST { action:'persona-editar', id, ...campos }              → edita la ficha.
//   POST { action:'persona-nota', id, texto }                    → apila una nota (con id propio).
//   POST { action:'persona-nota-borrar', id, nota_id }           → borra POR ID, nunca por índice.
//   POST { action:'persona-archivo', id, url, nombre, tipo }     → suma un archivo a la ficha.
//   POST { action:'persona-archivo-borrar', id, url }            → lo saca.
//   POST { action:'persona-borrar', id }                         → sólo si no tiene canjes.
//   POST { action:'config', store, ...campos }                   → edita la config. ADMIN.
//
//   GET  ?recurso=canjes&vista=canje&id=N&store=...              → el canje con items, entregables y evidencias.
//   POST { action:'canje-crear', persona_id, tipo, tope…, entregables[] } → nace en 'enviada' si el
//                                                                  que propone ya podía firmarlo;
//                                                                  si no, en 'propuesta'.
//   POST { action:'canje-editar', id, ...campos, entregables? }  → sólo antes del acuerdo.
//   POST { action:'canje-estado', id, estado, motivo? }          → transiciones validadas por TRANSICIONES.
//   POST { action:'canje-borrar', id }                           → NO deja rastro. Después del
//                                                                  acuerdo, sólo Administración.
//   POST { action:'canje-borrar-que-se-lleva', id }              → cuántas filas cascadean.
//   POST { action:'canje-aprobar', id }                          → exige el sub que corresponda. Deja el canje en 'enviada'.
//   POST { action:'canje-rechazar', id, motivo }                 → ídem, con motivo obligatorio.
//   POST { action:'contacto', id }                               → "ya le escribí". Pendiente, no estado.
//   POST { action:'canje-respuesta', id, respuesta, motivo?, nota? } → lo que contestó ELLA.
//                                                                  'acepto' genera el token del portal.
//   POST { action:'canje-vitrina', id, vitrina_id }              → de qué lista elige. `null` = sin vitrina.
//   GET  ?vista=vitrinas                                         → las vitrinas de la marca, CON sus productos.
//   POST { action:'vitrina-crear'|'vitrina-editar'|'vitrina-estado'|'vitrina-items'|'vitrina-item'|'vitrina-borrar' }
//                                                                → el espejo curado de Tienda Nube.
//   POST { action:'vitrina-stock', vitrina_id, items, apagar }   → la vitrina entera contra la tienda de hoy.
//   POST { action:'item-agregar', id, ...datos }                 → snapshot del producto, con control del tope.
//   POST { action:'item-quitar', id, item_id, motivo }           → NO borra: marca 'quitado'.
//   POST { action:'compra', id, tn_orden, gn_venta_number? }     → la orden creada a mano en TN.
//   POST { action:'envio', id, via, seguimiento, costo }         → despacho.
//   POST { action:'intento-entrega', id, nota? }                 → el correo pasó y no había nadie. NO cambia el estado.
//   POST { action:'entregado', id }                              → CONGELA los `vence_el`.
//   POST { action:'entregable-agregar'|'entregable-quitar', … }  → lo que prometió publicar.
//   POST { action:'evidencia-agregar', id, entregable_id, … }    → la carga el EQUIPO, no ella.
//   POST { action:'evidencia-verificar', id, evidencia_id, ok }  → sin verificar, no cuenta.
//   POST { action:'cerrar', id, incompleto?, motivo? }           → congela el balance. `incompleto` exige el sub `cerrar`.
//   POST { action:'no-conservado', id, motivo }                  → devolvió o vendió lo que le mandamos.
//
// Las tres marcas son válidas como `store`, a diferencia del resto del monitor donde son dos.
// Stunned no es marca de primera clase en el código (es una línea de Zattia por prefijo de SKU
// `STU`) pero desde el lado del canje se comporta como una: tiene su Instagram, sus acuerdos y su
// balance.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { exigirUsuario, soloMismoOrigen } from './_auth.js';
// Los permisos se IMPORTAN, no se copian: es la única implementación, la misma que usa la app.
// Ver el docblock de `lib/permisos.core.js` para por qué está en JS plano.
import { esAdmin, puedeSub, tieneFuncion } from '../lib/permisos.core.js';
import { marcaDePermisos, marcasVisiblesCanjes } from '../lib/canjes/marcas.js';
// El grafo de estados y el tope viven aparte porque **el portal público también los usa** desde la
// tanda 2 (ella elige productos desde el link y hay que frenarla si se pasa del acuerdo), y ese
// handler no puede arrastrar `_auth.js` + `permisos.core.js` por una función de quince líneas.
import { ESTADOS, puedeIr, seVaDelTope, TERMINALES, TRANSICIONES } from './_canjes-reglas.js';

/**
 * La base maestra. NO recibe `store` a propósito: no hay a dónde rutear. Si algún día se separa
 * por marca, este es el único lugar que cambia (más `scripts/apply-canjes.mjs`).
 */
function cfgMaestra() {
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

const STORES = ['bdi', 'zattia', 'stunned'];

/**
 * Espejo de `normalizarInstagram` en `lib/canjes/instagram.ts`. Los `api/*.js` no importan TS, así
 * que la deuda de espejo es inevitable (la misma que ya tiene `numeroReclamo`).
 *
 * ⚠️ ESTA es la versión que decide el `unique` de la base. Si diverge de la de TS se crean
 * duplicados en silencio: la UI cree que es la misma persona y el insert crea otra fila.
 * `tests/canjes-core.test.ts` compara las dos contra los mismos casos.
 */
function normalizarInstagram(v) {
  let s = String(v ?? '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (/^(instagram\.com|instagr\.am)\//i.test(s)) {
    s = s.replace(/^(instagram\.com|instagr\.am)\//i, '');
  }
  s = s.split('?')[0].split('#')[0];
  s = s.split('/')[0];
  s = s.replace(/^@+/, '').trim().toLowerCase();
  s = s.replace(/[^a-z0-9._]/g, '');
  s = s.replace(/\.+$/, '');
  return s;
}

/** Espejo de `numeroCanje` en `lib/canjes/tipos.ts`. Mismo formato o los números no coinciden. */
function numeroCanje(id) {
  return 'C-' + String(id).padStart(4, '0');
}

const PERSONA_COLS = `id, instagram, instagram_raw, nombre, apellido, telefono, email, tiktok, ciudad,
  dni, calle, numero, piso, depto, cp, provincia, localidad, direccion_nota,
  talles, modelo_celular, seguidores_ig, seguidores_tt, seguidores_at,
  destacada, destacada_nota, vetada, vetada_motivo, cadencia_dias,
  notas, archivos, historial, usuario, created_at, updated_at`.replace(/\s+/g, ' ');

/**
 * Las columnas de un canje que se pueden ver **de la propia marca**. El `token` NUNCA sale en
 * listados: es la llave del link público, se pide aparte y de a uno.
 */
const CANJE_COLS = `id, persona_id, store, tipo, estado, titulo, nota,
  tope_tipo, tope_pvp, tope_unidades, monto_plata, pago_estado, pago_at, pago_nota,
  aprobado_por, aprobado_at, aprobacion_nivel, rechazado_motivo, rechazado_por, rechazado_at, acordado_at,
  contacto_estado, contacto_at, respuesta_motivo, respuesta_nota, respuesta_at,
  token_vence, datos_confirmados_at,
  tn_orden, compra_estado, compra_at, compra_por, gn_venta_number, stock_estado,
  envio_via, envio_seguimiento, envio_costo, envio_estado, envio_at, envio_direccion,
  aviso_estado, aviso_at, entregado_at, intentos, cupon_codigo, cupon_desde, cupon_hasta,
  balance_costo_productos, balance_costo_envio, balance_costo_plata, balance_costo_total,
  balance_alcance, balance_interacciones, balance_cpm, balance_puntaje_manual, balance_nota,
  cerrado_incompleto, cierre_motivo, cerrado_por, cerrado_at,
  producto_no_conservado, producto_no_conservado_motivo, producto_no_conservado_por, producto_no_conservado_at,
  cancelado_motivo, usuario, historial, created_at, updated_at`.replace(/\s+/g, ' ');

/**
 * Lo que se ve de un canje **de otra marca**: marca, fecha y si está cerrado. Nada más.
 *
 * Es el corazón de la decisión de permisos: quien sólo ve Zattia SÍ se entera de que la persona
 * hizo algo para BDI, pero en modo ciego. Ocultar la *existencia* destruiría la única razón por la
 * que el padrón es compartido; ocultar la *plata* no cuesta nada.
 *
 * ⚠️ Se arma **en el servidor**, nunca filtrando en la UI: la plata de la otra marca no viaja al
 * browser. Espejo conceptual de `paraElCliente()` en `api/_reclamo.js`.
 *
 * Exportada para que `tests/canjes-core.test.ts` verifique que no se le escapa ningún campo de
 * plata el día que alguien agregue una columna nueva.
 */
export function resumenCiego(c) {
  return {
    id: c.id,
    numero: numeroCanje(c.id),
    persona_id: c.persona_id,
    store: c.store,
    estado: c.estado,
    acordado_at: c.acordado_at || null,
    entregado_at: c.entregado_at || null,
    cerrado_at: c.cerrado_at || null,
    created_at: c.created_at,
    /** La marca de agua: la UI lo usa para pintarlo gris y no dejar abrirlo. */
    ciego: true,
  };
}

/** Las columnas mínimas que necesita `resumenCiego`. Pedir menos es pedir menos plata al aire. */
const CANJE_COLS_CIEGO = 'id, persona_id, store, estado, acordado_at, entregado_at, cerrado_at, created_at';

/** ¿Puede tocar la config del módulo? Admin o administración. */
function esAdministracion(perfil) {
  return esAdmin(perfil) || tieneFuncion(perfil, 'administracion');
}

// ── ESPEJOS DE `lib/canjes/tipos.ts` ────────────────────────────────────────────
//
// Los `api/*.js` no importan TS, así que lo que el servidor tiene que hacer cumplir vive dos
// veces. Es la misma deuda que ya tiene `numeroReclamo`, y se acota con la regla de
// `api/_reclamos.js`: **acá se replica sólo lo que es un CONTROL, nunca un CÁLCULO.**
//
// - Se replica: el grafo de estados, quién firma, el tope y el bloqueo por vencidos. Son gates de
//   seguridad, y un gate que sólo existe en el browser no es un gate.
// - NO se replica: el balance. El cálculo vive en UN solo lugar (`calcularBalance` en TS, con
//   tests) y acá sólo se validan rangos. Duplicar aritmética fue exactamente lo que se
//   desincronizó con el motor viejo de Cambios.
//
// `tests/canjes-flujo.test.ts` compara los dos lados contra los mismos casos.

// ⚠️ El grafo de estados (`TRANSICIONES`, `ESTADOS`, `TERMINALES`, `puedeIr`) y el tope
// (`seVaDelTope`) **ya no están acá**: viven en `./_canjes-reglas.js` porque el portal público los
// necesita y no puede importar este archivo. Se re-exportan al final para los tests de espejo.

/** Espejo de `MOTIVOS_NO_ACEPTO`. Lista cerrada: es información sobre la persona, no sobre nosotros. */
const MOTIVOS_NO_ACEPTO = [
  'No respondió',
  'No le interesó',
  'Pidió más de lo que ofrecimos',
  'Pidió plata',
  'Trabaja con una marca competidora',
  'Ahora no, más adelante',
  'Otro',
];

/**
 * ¿Tiene el sub-permiso para esta `store`?
 *
 * ⚠️ Un sub **no se hereda de la función**: las áreas expanden a claves de sección (`canjes`),
 * nunca a subclaves (`canjes.aprobar`). O sea que sólo lo tiene el admin o quien lo tenga tildado
 * a mano en Config. Es el paso de puesta en marcha que más fácil se olvida, y sin él ningún canje
 * se puede aprobar nunca.
 */
function puedeSubCanjes(perfil, store, sub) {
  return puedeSub(perfil, marcaDePermisos(store), 'canjes', sub);
}

/**
 * Espejo de `quienApruebaCanje`. Devuelve el sub que hace falta para firmar ESTE canje.
 *
 * El umbral entra por la config, no es una constante, y `null` significa **todo va a la firma
 * alta** — el default seguro mientras el monto no esté definido.
 */
function subQueApruebe(canje, items, cfg) {
  if (canje.tipo === 'producto_plata') return 'aprobar-plata';
  const umbral = cfg?.umbral_aprobacion_alta;
  if (umbral == null) return 'aprobar-plata';
  const vivos = (items || []).filter((i) => i.estado === 'propuesto' || i.estado === 'confirmado');
  let costo = null;
  if (vivos.length) {
    costo = vivos.reduce((a, i) => a + (Number(i.costo_unit) || 0) * (Number(i.cantidad) || 0), 0);
  } else if (canje.tope_tipo === 'monto' && canje.tope_pvp != null) {
    costo = Number(canje.tope_pvp) * (Number(cfg?.factor_costo_estimado) || 0);
  }
  // No estimable ⇒ firma alta. Prefiero molestar a un gerente que dejar pasar un canje caro.
  if (costo == null) return 'aprobar-plata';
  return costo > Number(umbral) ? 'aprobar-plata' : 'aprobar';
}

/**
 * Espejo de `cubreNivel`. Quien firma alto firma bajo; al revés no.
 *
 * Una sola implementación para las dos preguntas de la firma: si puede aprobar el canje de otro, y
 * si el suyo propio sale directo sin pasar por la pestaña de Aprobaciones.
 */
function puedeFirmar(perfil, store, nivel) {
  if (puedeSubCanjes(perfil, store, 'aprobar-plata')) return true;
  return puedeSubCanjes(perfil, store, nivel);
}

/** `YYYY-MM-DD` local. Espejo de `fechaISO`: en UTC un canje de la tarde vencería un día antes. */
function fechaISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const num = (v) => (v == null || v === '' ? null : Number(v));
const texto = (v) => (v == null || v === '' ? null : String(v));
const bool = (v) => v === true || v === 'true';

/**
 * Cuántos días vive el link del portal. Más largo que el de un reclamo (15) porque un canje tarda:
 * entre que se acuerda y se despacha pasan días, y el link tiene que seguir sirviendo.
 */
const DIAS_TOKEN = 45;

const TIPOS_ENTREGABLE = ['historia_ig', 'reel_ig', 'post_ig', 'video_tiktok', 'contenido'];

/**
 * Lo que se le pide publicar, tal como llega de la grilla de la propuesta: una fila por tipo con su
 * cantidad. Los que vienen en 0 **se ignoran** — la grilla manda los cinco tipos siempre, y un
 * entregable de cantidad cero trabaría el cierre pidiendo algo que nadie prometió.
 *
 * Arrancan todos obligatorios y con el plazo de la config: lo fino se afina después en la ficha,
 * que es donde tiene sentido mirarlo de a uno.
 */
function entregablesDelBody(lista, cfg) {
  if (!Array.isArray(lista)) return [];
  const porTipo = new Map();
  for (const e of lista) {
    if (!e || !TIPOS_ENTREGABLE.includes(e.tipo)) continue;
    const cantidad = parseInt(e.cantidad ?? e.cantidad_comprometida, 10);
    if (!Number.isFinite(cantidad) || cantidad < 1) continue;
    // Si el mismo tipo viene dos veces, gana la última: es una grilla, no un carrito.
    porTipo.set(e.tipo, {
      tipo: e.tipo,
      cantidad_comprometida: cantidad,
      plazo_dias: Number(cfg?.plazo_entregable_dias_default) || 10,
      obligatorio: true,
    });
  }
  return [...porTipo.values()];
}

// ── El alta de una persona ────────────────────────────────────────────────────

/** El tope del alta masiva. Espejo del de `lib/canjes/alta-masiva.ts`, que lo avisa en pantalla. */
const TOPE_ALTA_LOTE = 50;

/**
 * Cuántos canjes se pueden crear de una sola vez.
 *
 * Mucho más bajo que el de la vitrina (120) y no por capricho: aquél es **un** insert con 120 filas
 * adentro, y esto son **dos idas a la base por canje**. Es la primera acción del módulo con costo
 * O(N) dentro de un request, y pasada cierta cantidad el lote se muere por timeout habiendo escrito
 * la mitad — que es el peor final posible, porque no hay transacción que lo desarme.
 */
const TOPE_CANJES_LOTE = 25;

/**
 * Dar de alta a UNA persona: normaliza el @, la busca, y si no está la crea.
 *
 * 🔑 **Una sola implementación, y la llaman las dos altas** (la de a una y la del lote). El dedup por
 * @ normalizado y el fallback de carrera son la única defensa contra fichas duplicadas con
 * historiales partidos: copiados en dos lugares, van a divergir el día que alguien toque uno — que
 * es exactamente lo que el AGENTS.md de este repo dice de los permisos.
 *
 * Devuelve `{ persona, existia }`. Que ya exista **no es un error**: es el caso normal, la misma
 * creadora vuelve.
 */
async function altaDeUnaPersona(supabase, b, usuario) {
  const instagram = normalizarInstagram(b.instagram);
  if (!instagram) return { error: 'falta el Instagram (es el único dato obligatorio)' };

  const { data: previa, error: eBusca } = await supabase
    .from('canje_personas').select(PERSONA_COLS).eq('instagram', instagram).maybeSingle();
  if (eBusca) throw new Error(eBusca.message);
  if (previa) return { persona: previa, existia: true };

  const { data, error } = await supabase
    .from('canje_personas').insert(filaDeAlta(b, instagram, usuario)).select(PERSONA_COLS).single();
  if (error) {
    // Carrera con otro operador dando de alta el mismo @ al mismo tiempo: el unique de la base es la
    // última palabra, y devolver la fila que ganó es mejor que un 500.
    if (/duplicate key|unique/i.test(error.message)) {
      const { data: gano } = await supabase
        .from('canje_personas').select(PERSONA_COLS).eq('instagram', instagram).maybeSingle();
      if (gano) return { persona: gano, existia: true };
    }
    throw new Error(error.message);
  }
  return { persona: data, existia: false };
}

/** La fila tal como se inserta. Aparte para que el alta de a una y la del lote escriban lo mismo. */
function filaDeAlta(b, instagram, usuario) {
  return {
    instagram,
    instagram_raw: texto(b.instagram_raw || b.instagram),
    nombre: texto(b.nombre),
    apellido: texto(b.apellido),
    telefono: texto(b.telefono),
    email: texto(b.email),
    tiktok: texto(b.tiktok),
    ciudad: texto(b.ciudad),
    cadencia_dias: num(b.cadencia_dias) || 90,
    usuario,
    historial: [{ at: new Date().toISOString(), usuario, nota: 'ficha creada' }],
  };
}

// ── La vitrina ────────────────────────────────────────────────────────────────
const ESTADOS_VITRINA = ['borrador', 'activa', 'archivada'];

/**
 * Cuántos productos admite una vitrina.
 *
 * El límite no es de base: **la vitrina entera viaja congelada al teléfono de la creadora**, con la
 * foto y las variantes de cada producto adentro, porque el portal no tiene sesión para pedirle nada
 * a Tienda Nube. Una vitrina de 500 productos no es una vitrina, es el catálogo — que es
 * exactamente lo que curar viene a evitar. Se arman varias y se elige cuál va en cada canje.
 */
const TOPE_VITRINA = 120;

/** Hasta cuántas variantes por producto. `PROTECTOR DE CÁMARA STRASS` (BDI) tiene 54; hay margen. */
const TOPE_OPCIONES = 120;

/** Cuántas fotos por producto. Espejo de `TOPE_FOTOS` en `lib/canjes/vitrina.ts`. */
const TOPE_FOTOS = 8;

/**
 * Un producto de la vitrina, saneado. Llega **ya congelado** desde el panel, que es el único lado
 * con sesión para preguntarle a la tienda.
 *
 * Devuelve `null` si no sirve. Sin `tn_product_id` no hay llave, y sin opciones no hay nada que
 * elegir: un producto cuyas variantes estaban todas agotadas al armar la vitrina simplemente no
 * entra. Es la única forma honesta de no ofrecer lo agotado — un stock congelado hace dos semanas
 * miente, así que no se guarda ni se le muestra "sin stock" a nadie.
 */
function itemDeVitrinaDelBody(x) {
  if (!x || typeof x !== 'object') return null;
  const tn_product_id = texto(x.tn_product_id);
  const nombre = texto(x.nombre);
  if (!tn_product_id || !nombre) return null;

  const opciones = (Array.isArray(x.opciones) ? x.opciones : [])
    .slice(0, TOPE_OPCIONES)
    .map((o) => {
      const id = texto(o && o.id);
      const valores = (Array.isArray(o && o.valores) ? o.valores : [])
        .map((v) => String(v ?? '').trim().slice(0, 80)).filter(Boolean).slice(0, 6);
      if (!id) return null;
      return { id, valores, foto: texto(o.foto), sku: texto(o.sku), barcode: texto(o.barcode) };
    })
    .filter(Boolean);
  if (!opciones.length) return null;

  // ⚠️ Esto es una lista blanca: **lo que no está acá se descarta sin un solo error**. Un campo
  // nuevo que se agregue al congelado y no se sume acá viaja desde el panel y se pierde en silencio.
  return {
    tn_product_id,
    sku: texto(x.sku),
    nombre: nombre.slice(0, 200),
    foto_url: texto(x.foto_url),
    // Sólo strings, y no `texto()`: aquél convierte lo que sea con `String(v)`, así que un número o
    // un objeto entrarían como "3" y "[object Object]" y el visor pediría esa URL.
    fotos: (Array.isArray(x.fotos) ? x.fotos : [])
      .filter((f) => typeof f === 'string')
      .map((f) => f.trim()).filter(Boolean).slice(0, TOPE_FOTOS),
    pvp: num(x.pvp),
    opciones,
  };
}

const VIAS_ENVIO = ['correo', 'andreani', 'cadete', 'presencial'];
const PENDIENTES = ['pendiente', 'hecho', 'no_aplica'];
const TIPOS_CANJE = ['producto', 'producto_plata'];
const TOPE_TIPOS = ['monto', 'unidades'];

/**
 * Historial append-only: se re-lee la fila, se apila el evento y se guarda. Copiado de
 * `api/_reclamos.js:102` con su misma advertencia: **no es atómico**. Dos acciones simultáneas
 * sobre la MISMA persona no pasan en la práctica (la carga la hace una persona por vez), y el
 * costo de una transacción real no se justifica para un log.
 */
async function apilar(supabase, tabla, id, evento, extra = {}) {
  const { data: previo } = await supabase.from(tabla).select('historial').eq('id', id).single();
  const historial = Array.isArray(previo?.historial) ? previo.historial : [];
  historial.push(evento);
  const { error } = await supabase.from(tabla).update({ ...extra, historial, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'GET, POST, OPTIONS')) return;
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  // El `store` acá no elige base: elige qué canjes vienen enteros y cuáles ciegos, y qué fila de
  // `canje_config` se lee.
  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!STORES.includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi, zattia o stunned)' });

  const visibles = marcasVisiblesCanjes(perfil);

  // El gate va en dos niveles, y esa distinción es el arreglo del bug que dejó a todo el mundo sin
  // padrón: antes esto era un solo `if (!visibles.includes(store)) 403` que mataba la request
  // entera, así que no ver UNA marca era no ver NADA.
  //
  //  - LEER: alcanza con ver Canjes en alguna marca. El padrón es transversal a propósito (si
  //    marketing de Zattia no viera que esa creadora ya laburó con BDI, un padrón compartido no
  //    serviría de nada) y los canjes ajenos ya salen ciegos por `canjesDePersona`, desde el
  //    servidor: filtrar plata en la UI significa que la plata ya viajó al browser.
  //  - ESCRIBIR: hay que ver ESA marca. No se toca un canje de una marca que no te toca.
  if (!visibles.length) {
    return res.status(403).json({ error: 'No tenés acceso a Canjes. Pedí el permiso en Config.' });
  }
  if (req.method === 'POST' && !visibles.includes(store)) {
    return res.status(403).json({ error: 'No tenés acceso a esa marca.' });
  }

  const cfg = cfgMaestra();
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase (base maestra BDI).' });
  const supabase = createClient(cfg.url, cfg.key);
  const usuario = perfil.name || null;
  const ahora = () => new Date().toISOString();

  /** Los canjes de una persona, enteros los de las marcas que ve y ciegos los demás. */
  async function canjesDePersona(personaId) {
    const [propios, ajenos] = await Promise.all([
      supabase.from('canjes').select(CANJE_COLS).eq('persona_id', personaId).in('store', visibles).order('created_at', { ascending: false }),
      supabase.from('canjes').select(CANJE_COLS_CIEGO).eq('persona_id', personaId).not('store', 'in', `(${visibles.join(',')})`).order('created_at', { ascending: false }),
    ]);
    if (propios.error) throw new Error(propios.error.message);
    if (ajenos.error) throw new Error(ajenos.error.message);
    return [
      ...(propios.data || []).map((c) => ({ ...c, numero: numeroCanje(c.id) })),
      ...(ajenos.data || []).map(resumenCiego),
    ];
  }

  /** La config de una marca, con los defaults si la fila no está (no debería, pero no se asume). */
  async function configDe(st) {
    const { data } = await supabase.from('canje_config').select('*').eq('store', st).maybeSingle();
    return data || {
      store: st, umbral_aprobacion_alta: null, cadencia_dias_default: 90,
      plazo_entregable_dias_default: 10, tope_evidencias_por_canje: 30, factor_costo_estimado: 0.4,
      bloquear_por_vencidos: false, cierres_incompletos_no_repetir: 2, drive_url: null,
      unidad_default: null, unidades_sugeridas: [], cupon_codigo: null, email_pedido: null,
    };
  }

  /**
   * Trae el canje y **verifica que sea de una marca que este perfil ve**.
   *
   * Es el gate que impide que alguien de Zattia toque un canje de BDI mandando el id a mano. Sin
   * esto el modo ciego sería sólo cosmético: se vería poco, pero se podría escribir igual.
   */
  async function traerCanje(id) {
    const { data, error } = await supabase.from('canjes').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { error: res.status(404).json({ error: 'no existe ese canje' }) };
    if (!visibles.includes(data.store)) {
      return { error: res.status(403).json({ error: 'Ese canje es de otra marca.' }) };
    }
    return { canje: data };
  }

  /**
   * Valida la vitrina que se le quiere colgar a un canje de `st`. Devuelve `{ id }` o `{ error }`.
   *
   * `null` es un valor válido y significa "sin vitrina": ese canje vuelve al modo de siempre, donde
   * los productos los carga el equipo y el link sólo le pide los datos.
   *
   * Sólo se acepta una vitrina **activa**. Una en borrador se está armando todavía, y colgársela a
   * un canje es mandarle a la creadora una pantalla que va a cambiar debajo de ella mientras elige.
   */
  async function vitrinaValida(valor, st) {
    if (valor === null || valor === '' || valor === undefined) return { id: null };
    const id = parseInt(valor, 10);
    if (!id) return { error: 'vitrina inválida' };
    const { data } = await supabase.from('canje_vitrinas').select('id, store, estado').eq('id', id).maybeSingle();
    if (!data || data.store !== st) return { error: 'Esa vitrina no es de esta marca.' };
    if (data.estado !== 'activa') return { error: 'Esa vitrina todavía no está activa.' };
    return { id };
  }

  /** La vitrina de un canje, con sus productos. `null` si no tiene. */
  async function vitrinaDe(id) {
    if (!id) return null;
    const { data } = await supabase.from('canje_vitrinas').select('*').eq('id', id).maybeSingle();
    if (!data) return null;
    const items = (await supabase.from('canje_vitrina_items')
      .select('*').eq('vitrina_id', id).order('orden')).data || [];
    return { ...data, items };
  }

  const itemsDe = async (id) => (await supabase.from('canje_items').select('*').eq('canje_id', id)).data || [];
  const entregablesDe = async (id) => (await supabase.from('canje_entregables').select('*').eq('canje_id', id)).data || [];
  const evidenciasDe = async (id) => (await supabase.from('canje_evidencias').select('*').eq('canje_id', id)).data || [];

  try {
    if (req.method === 'GET') {
      const vista = String(req.query.vista || 'lista');

      if (vista === 'config') {
        const { data, error } = await supabase.from('canje_config').select('*').eq('store', store).maybeSingle();
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true, config: data || null });
      }

      if (vista === 'persona') {
        const id = parseInt(req.query.id, 10);
        if (!id) return res.status(400).json({ error: 'falta id' });
        const { data, error } = await supabase.from('canje_personas').select(PERSONA_COLS).eq('id', id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return res.status(404).json({ error: 'no existe esa persona' });
        return res.status(200).json({ ok: true, persona: data, canjes: await canjesDePersona(id) });
      }

      // Las vitrinas de la marca CON sus productos: es la pantalla de armado, y sin los productos
      // no hay nada que mirar. Va en su propia vista y no en el listado general porque acá viajan
      // las fotos y las variantes congeladas de cada producto, y eso no tiene por qué pesar en cada
      // apertura de la sección.
      if (vista === 'vitrinas') {
        const { data: vitrinas, error } = await supabase.from('canje_vitrinas')
          .select('*').eq('store', store).order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        const ids = (vitrinas || []).map((v) => v.id);
        const items = ids.length
          ? (await supabase.from('canje_vitrina_items').select('*').in('vitrina_id', ids).order('orden')).data || []
          : [];
        const porVitrina = new Map(ids.map((id) => [id, []]));
        for (const i of items) porVitrina.get(i.vitrina_id)?.push(i);
        return res.status(200).json({
          ok: true,
          vitrinas: (vitrinas || []).map((v) => ({ ...v, items: porVitrina.get(v.id) || [] })),
        });
      }

      // El canje entero: la ficha necesita las cuatro tablas a la vez y pedirlas de a una sería
      // cuatro round-trips por click.
      if (vista === 'canje') {
        const id = parseInt(req.query.id, 10);
        if (!id) return res.status(400).json({ error: 'falta id' });
        const t = await traerCanje(id);
        if (t.error) return t.error;
        const [items, entregables, evidencias, persona, vitrina] = await Promise.all([
          itemsDe(id), entregablesDe(id), evidenciasDe(id),
          supabase.from('canje_personas').select(PERSONA_COLS).eq('id', t.canje.persona_id).maybeSingle(),
          vitrinaDe(t.canje.vitrina_id),
        ]);
        // El token NO viaja en el objeto del canje: se pide aparte con `vista=token`, de a uno.
        const { token, ...sinToken } = t.canje; // eslint-disable-line no-unused-vars
        return res.status(200).json({
          ok: true,
          canje: { ...sinToken, numero: numeroCanje(id) },
          items, entregables, evidencias,
          persona: persona.data || null,
          // La vitrina entera, con sus productos: la ficha muestra de dónde salió lo que ella eligió.
          vitrina,
          config: await configDe(t.canje.store),
        });
      }

      // El link del portal, de a uno y a pedido. Mismo criterio que el token de un reclamo: no
      // sale nunca en un listado, porque un listado se loguea, se cachea y se comparte.
      if (vista === 'token') {
        const id = parseInt(req.query.id, 10);
        if (!id) return res.status(400).json({ error: 'falta id' });
        const t = await traerCanje(id);
        if (t.error) return t.error;
        return res.status(200).json({ ok: true, token: t.canje.token || null, vence: t.canje.token_vence || null });
      }

      // La lista: el padrón entero (es transversal, no se filtra por marca) más, de cada persona,
      // las fechas que necesita "hace cuánto no hacemos nada con ella" — cruzando marcas, que es
      // justamente el punto. Los de otras marcas van ciegos.
      const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);
      const { data: personas, error } = await supabase
        .from('canje_personas').select(PERSONA_COLS).order('created_at', { ascending: false }).limit(limit);
      if (error) throw new Error(error.message);

      const [propios, ajenos] = await Promise.all([
        supabase.from('canjes').select(CANJE_COLS).in('store', visibles).order('created_at', { ascending: false }),
        supabase.from('canjes').select(CANJE_COLS_CIEGO).not('store', 'in', `(${visibles.join(',')})`).order('created_at', { ascending: false }),
      ]);
      if (propios.error) throw new Error(propios.error.message);
      if (ajenos.error) throw new Error(ajenos.error.message);

      // Las tres filas, no sólo la de la sección: el modal de propuesta deja elegir la marca (el
      // padrón es transversal, así que se propone desde donde se está parado) y necesita la unidad
      // por defecto de cualquiera de ellas. Son tres filas: no se paga por pedirlas.
      const { data: configs } = await supabase.from('canje_config').select('*');
      const config = (configs || []).find((c) => c.store === store) || null;

      // Las vitrinas **sin sus productos**: acá alcanza con el nombre para poder colgarle una a un
      // canje. Los productos, con sus fotos congeladas, salen por `vista=vitrinas`.
      const { data: vitrinas } = await supabase.from('canje_vitrinas')
        .select('id, store, nombre, estado, created_at').in('store', visibles)
        .order('created_at', { ascending: false });

      return res.status(200).json({
        ok: true,
        personas: personas || [],
        canjes: [
          ...(propios.data || []).map((c) => ({ ...c, numero: numeroCanje(c.id) })),
          ...(ajenos.data || []).map(resumenCiego),
        ],
        // El resumen de lo vencido viaja con el listado a propósito: el aviso del sidebar lo
        // necesita, y sin esto habría que pedir los entregables de cada canje en cada refresco de
        // los avisos — una consulta por canje, cada tres minutos, para pintar un número.
        vencidos: await resumenDeVencidos(propios.data || []),
        config,
        configs: (configs || []).filter((c) => visibles.includes(c.store)),
        vitrinas: vitrinas || [],
        marcasVisibles: visibles,
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    const b = req.body || {};
    const action = b.action || '';

    // ── Alta de persona ───────────────────────────────────────────────────────
    // Un solo campo: el @. Que dar de alta cueste un renglón es lo que hace que el padrón se llene;
    // pedirle diez campos al operador es lo que hace que siga en la planilla.
    if (action === 'persona-crear') {
      // Si ya existe se devuelve la que hay, con `existia: true`, y la UI abre esa ficha en vez de
      // tirar un error. Es el caso normal, no el excepcional: la misma creadora vuelve.
      const r = await altaDeUnaPersona(supabase, b, usuario);
      if (r.error) return res.status(400).json({ error: r.error });
      return res.status(200).json({ ok: true, persona: r.persona, existia: r.existia });
    }

    // ── Alta de varias, de una sola vez ───────────────────────────────────────
    //
    // Mismo criterio que el alta de a una, N veces: que una ya esté **no es un error**. Lo que
    // cambia es que acá el resultado se informa fila por fila — con 40 personas, un "creadas: 35"
    // pelado deja al operador sin saber cuáles de las cinco que faltan ya estaban y cuáles fallaron,
    // y la única salida sería revisar el padrón a mano.
    if (action === 'personas-crear-lote') {
      const filas = Array.isArray(b.personas) ? b.personas : [];
      if (!filas.length) return res.status(400).json({ error: 'no viene ninguna persona' });
      if (filas.length > TOPE_ALTA_LOTE) {
        // Se corta, no se trunca: cargar 80 y que entren 50 en silencio es peor que tener que
        // partirlo en dos tandas sabiendo por qué.
        return res.status(413).json({
          error: `Son ${filas.length} y el máximo es ${TOPE_ALTA_LOTE}. Cargalas en tandas.`,
        });
      }

      // El @ normalizado manda, y el primero de dos repetidos gana: quien tipeó dos veces la misma
      // creadora quiso cargarla una. El cliente ya deduplica, pero acá no se le puede creer.
      const pedidos = [];
      const yaPedido = new Set();
      for (const f of filas) {
        const instagram = normalizarInstagram(f?.instagram);
        const crudo = texto(f?.instagram_raw || f?.instagram) || '';
        if (!instagram) { pedidos.push({ crudo, instagram: '', estado: 'invalida' }); continue; }
        if (yaPedido.has(instagram)) { pedidos.push({ crudo, instagram, estado: 'repetida' }); continue; }
        yaPedido.add(instagram);
        pedidos.push({ crudo, instagram, estado: 'nueva', fila: f });
      }

      // Una sola consulta para saber quiénes ya están, en vez de una por fila.
      const aBuscar = pedidos.filter((p) => p.estado === 'nueva').map((p) => p.instagram);
      if (aBuscar.length) {
        const { data: previas, error: eBusca } = await supabase
          .from('canje_personas').select(PERSONA_COLS).in('instagram', aBuscar);
        if (eBusca) throw new Error(eBusca.message);
        const porIg = new Map((previas || []).map((p) => [p.instagram, p]));
        for (const p of pedidos) {
          const ya = porIg.get(p.instagram);
          if (p.estado === 'nueva' && ya) { p.estado = 'existia'; p.persona = ya; }
        }
      }

      const nuevas = pedidos.filter((p) => p.estado === 'nueva');
      if (nuevas.length) {
        const { data, error } = await supabase
          .from('canje_personas')
          .insert(nuevas.map((p) => filaDeAlta(p.fila, p.instagram, usuario)))
          .select(PERSONA_COLS);
        if (error) {
          // Un insert en lote muere ENTERO si una sola fila choca contra el unique (una carrera con
          // otro operador). Se cae a una por una: es lento, pero pasa una vez cada muerte de obispo
          // y el resto del lote no tiene por qué perderse.
          if (/duplicate key|unique/i.test(error.message)) {
            for (const p of nuevas) {
              try {
                const r = await altaDeUnaPersona(supabase, p.fila, usuario);
                if (r.error) { p.estado = 'error'; p.error = r.error; continue; }
                p.estado = r.existia ? 'existia' : 'creada';
                p.persona = r.persona;
              } catch (e) {
                p.estado = 'error';
                p.error = String(e?.message || e);
              }
            }
          } else {
            throw new Error(error.message);
          }
        } else {
          const porIg = new Map((data || []).map((x) => [x.instagram, x]));
          for (const p of nuevas) {
            const creada = porIg.get(p.instagram);
            if (creada) { p.estado = 'creada'; p.persona = creada; }
            else { p.estado = 'error'; p.error = 'la base no la devolvió'; }
          }
        }
      }

      // Se responde en el mismo orden en que vinieron: la pantalla dibuja el resultado fila por
      // fila contra lo que el operador tipeó, no contra lo que la previsualización había prometido.
      const resultados = pedidos.map((p) => ({
        instagram: p.instagram,
        instagram_raw: p.crudo,
        estado: p.estado,
        id: p.persona?.id ?? null,
        nombre: p.persona ? [p.persona.nombre, p.persona.apellido].filter(Boolean).join(' ') : null,
        error: p.error || null,
      }));
      const cuenta = (e) => resultados.filter((r) => r.estado === e).length;
      return res.status(200).json({
        ok: true,
        resultados,
        creadas: cuenta('creada'),
        existian: cuenta('existia'),
        repetidas: cuenta('repetida'),
        invalidas: cuenta('invalida'),
        errores: cuenta('error'),
      });
    }

    const id = parseInt(b.id, 10);

    if (action === 'persona-editar') {
      if (!id) return res.status(400).json({ error: 'falta id' });
      const campos = {};

      // Cambiar el @ es re-identificar a la persona: se normaliza igual que en el alta, y el unique
      // de la base sigue siendo el que manda.
      if (b.instagram !== undefined) {
        const ig = normalizarInstagram(b.instagram);
        if (!ig) return res.status(400).json({ error: 'el Instagram no puede quedar vacío' });
        campos.instagram = ig;
        campos.instagram_raw = texto(b.instagram_raw || b.instagram);
      }

      for (const k of ['nombre', 'apellido', 'telefono', 'email', 'tiktok', 'ciudad',
        'dni', 'calle', 'numero', 'piso', 'depto', 'cp', 'provincia', 'localidad', 'direccion_nota',
        'modelo_celular', 'destacada_nota', 'vetada_motivo']) {
        if (b[k] !== undefined) campos[k] = texto(b[k]);
      }
      for (const k of ['seguidores_ig', 'seguidores_tt']) {
        if (b[k] !== undefined) campos[k] = num(b[k]);
      }
      // El número de seguidores sin fecha miente. Se estampa al guardarlo, no se pide aparte.
      if (b.seguidores_ig !== undefined || b.seguidores_tt !== undefined) campos.seguidores_at = ahora();

      if (b.talles !== undefined) campos.talles = (b.talles && typeof b.talles === 'object') ? b.talles : {};
      if (b.cadencia_dias !== undefined) campos.cadencia_dias = num(b.cadencia_dias) || 90;
      if (b.destacada !== undefined) campos.destacada = bool(b.destacada);
      if (b.vetada !== undefined) {
        campos.vetada = bool(b.vetada);
        // Vetar sin motivo es dejarle el problema al que la encuentre en tres meses.
        if (campos.vetada && !texto(b.vetada_motivo) && !campos.vetada_motivo) {
          return res.status(400).json({ error: 'para vetar hace falta un motivo' });
        }
      }

      if (!Object.keys(campos).length) return res.status(400).json({ error: 'nada para editar' });

      const { error } = await supabase.from('canje_personas')
        .update({ ...campos, updated_at: ahora() }).eq('id', id);
      if (error) {
        if (/duplicate key|unique/i.test(error.message)) {
          return res.status(409).json({ error: 'Ya hay otra ficha con ese Instagram.' });
        }
        throw new Error(error.message);
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'persona-nota') {
      if (!id) return res.status(400).json({ error: 'falta id' });
      const t = texto(b.texto);
      if (!t) return res.status(400).json({ error: 'la nota está vacía' });
      const { data: previo, error: eLee } = await supabase.from('canje_personas').select('notas').eq('id', id).single();
      if (eLee) throw new Error(eLee.message);
      const notas = Array.isArray(previo?.notas) ? previo.notas : [];
      // El id propio es la razón de ser de este formato. Ver `persona-nota-borrar`.
      notas.push({ id: randomUUID(), texto: t, at: ahora(), usuario });
      const { error } = await supabase.from('canje_personas').update({ notas, updated_at: ahora() }).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, notas });
    }

    if (action === 'persona-nota-borrar') {
      if (!id) return res.status(400).json({ error: 'falta id' });
      const notaId = texto(b.nota_id);
      if (!notaId) return res.status(400).json({ error: 'falta nota_id' });
      const { data: previo, error: eLee } = await supabase.from('canje_personas').select('notas').eq('id', id).single();
      if (eLee) throw new Error(eLee.message);
      const notas = Array.isArray(previo?.notas) ? previo.notas : [];
      // ⚠️ Se borra POR ID, nunca por índice. `lib/crm/leads.ts` borra por índice posicional y ya
      // borró la nota equivocada cuando la lista se había reordenado entre el render y el click.
      const quedan = notas.filter((n) => n && n.id !== notaId);
      if (quedan.length === notas.length) return res.status(404).json({ error: 'esa nota ya no está' });
      const { error } = await supabase.from('canje_personas').update({ notas: quedan, updated_at: ahora() }).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, notas: quedan });
    }

    if (action === 'persona-archivo') {
      if (!id) return res.status(400).json({ error: 'falta id' });
      const url = texto(b.url);
      if (!url) return res.status(400).json({ error: 'falta la url del archivo' });
      const { data: previo, error: eLee } = await supabase.from('canje_personas').select('archivos').eq('id', id).single();
      if (eLee) throw new Error(eLee.message);
      const archivos = Array.isArray(previo?.archivos) ? previo.archivos : [];
      archivos.push({ url, nombre: texto(b.nombre), tipo: texto(b.tipo), at: ahora(), usuario });
      const { error } = await supabase.from('canje_personas').update({ archivos, updated_at: ahora() }).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, archivos });
    }

    if (action === 'persona-archivo-borrar') {
      if (!id) return res.status(400).json({ error: 'falta id' });
      const url = texto(b.url);
      if (!url) return res.status(400).json({ error: 'falta la url' });
      const { data: previo, error: eLee } = await supabase.from('canje_personas').select('archivos').eq('id', id).single();
      if (eLee) throw new Error(eLee.message);
      const archivos = Array.isArray(previo?.archivos) ? previo.archivos : [];
      const quedan = archivos.filter((a) => a && a.url !== url);
      const { error } = await supabase.from('canje_personas').update({ archivos: quedan, updated_at: ahora() }).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, archivos: quedan });
    }

    /**
     * Borrar del padrón. Es para el error de tipeo y la ficha duplicada, no para "ya no
     * trabajamos más con ella" — para eso está el veto, que **deja el rastro**.
     *
     * ⚠️ Con canjes encima no se borra, y no es una restricción cosmética: la FK de
     * `canjes.persona_id` es `restrict`, así que la base lo rechazaría igual. Se chequea acá para
     * poder decirlo en criollo en vez de devolver un error de Postgres. Las notas y los archivos
     * viven en la misma fila, así que se van con ella.
     */
    if (action === 'persona-borrar') {
      if (!id) return res.status(400).json({ error: 'falta id' });
      const { data: p } = await supabase.from('canje_personas')
        .select('id, instagram').eq('id', id).maybeSingle();
      if (!p) return res.status(404).json({ error: 'no existe esa persona' });

      // Cuenta sobre TODAS las marcas, no sólo las visibles: si tiene un canje de BDI y quien
      // borra sólo ve Zattia, igual no se borra. El padrón es uno solo.
      const { count } = await supabase.from('canjes')
        .select('id', { count: 'exact', head: true }).eq('persona_id', id);
      if (count) {
        return res.status(409).json({
          error: `@${p.instagram} tiene ${count} ${count === 1 ? 'canje' : 'canjes'} en el historial, así que no se borra. Si no querés que aparezca más, vetala: queda el motivo escrito.`,
        });
      }

      const { error } = await supabase.from('canje_personas').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── La config del módulo ──────────────────────────────────────────────────
    // Los números que si no serían constantes escondidas en el código. Se toca con permiso de
    // administración: el umbral de aprobación decide qué firma hace falta, así que no es un ajuste
    // cosmético.
    if (action === 'config') {
      if (!esAdministracion(perfil)) {
        return res.status(403).json({ error: 'Esto lo hace Administración: pedile a alguien con ese permiso.' });
      }
      const campos = {};
      // `null` es un valor válido y significa "todo va a la firma alta": no se puede tratar como
      // "no lo mandaron".
      if (b.umbral_aprobacion_alta !== undefined) campos.umbral_aprobacion_alta = num(b.umbral_aprobacion_alta);
      for (const k of ['cadencia_dias_default', 'plazo_entregable_dias_default',
        'tope_evidencias_por_canje', 'cierres_incompletos_no_repetir']) {
        if (b[k] !== undefined) campos[k] = num(b[k]);
      }
      if (b.factor_costo_estimado !== undefined) campos.factor_costo_estimado = num(b.factor_costo_estimado);
      if (b.bloquear_por_vencidos !== undefined) campos.bloquear_por_vencidos = bool(b.bloquear_por_vencidos);
      if (b.drive_url !== undefined) campos.drive_url = texto(b.drive_url);
      if (b.unidad_default !== undefined) campos.unidad_default = texto(b.unidad_default);
      // El cupón de 100% de TN. Se le sacan los espacios de los bordes —se pega desde el admin y se
      // arrastran— pero nada más: los códigos de Tienda Nube distinguen mayúsculas, y
      // "normalizarlo" acá sería romperlo en silencio.
      if (b.cupon_codigo !== undefined) campos.cupon_codigo = texto(String(b.cupon_codigo ?? '').trim());
      // El mail con el que se tipea la orden en TN. Es el de la marca, NO el de la creadora: ver
      // `camposParaTiendaNube` en `lib/canjes/tipos.ts`. Se guarda en minúsculas y sin espacios
      // porque se copia de un mail o se tipea a mano, y ahí "BDI@…" y "bdi@…" son el mismo buzón.
      if (b.email_pedido !== undefined) campos.email_pedido = texto(String(b.email_pedido ?? '').trim().toLowerCase());
      if (Array.isArray(b.unidades_sugeridas)) {
        campos.unidades_sugeridas = b.unidades_sugeridas
          .map((u) => String(u || '').trim()).filter(Boolean).slice(0, 20);
      }
      if (!Object.keys(campos).length) return res.status(400).json({ error: 'nada para editar' });

      const { error } = await supabase.from('canje_config')
        .update({ ...campos, updated_at: ahora() }).eq('store', store);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ══ LA VITRINA ════════════════════════════════════════════════════════════
    // Un espejo curado de Tienda Nube. **De acá no vuelve nada a TN**: el monitor no escribe en la
    // tienda (ni acá ni en ningún lado del módulo). Se trae, se saca lo que no va, y lo que queda
    // se congela para que el link le abra a ella sin sesión y sin depender del catálogo.
    //
    // Escribir una vitrina pide lo mismo que armar un canje de esa marca: ya está chequeado arriba
    // (`visibles.includes(store)` para todo POST). No pide Administración porque no hay plata de
    // por medio — se decide qué se ofrece, no cuánto se gasta.

    if (action === 'vitrina-crear') {
      const nombre = texto(b.nombre);
      if (!nombre) return res.status(400).json({ error: 'Ponele un nombre: es lo que después elegís al armar el canje.' });
      const { data, error } = await supabase.from('canje_vitrinas')
        .insert({ store, nombre: nombre.slice(0, 120), nota: texto(b.nota), usuario })
        .select('*').single();
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, vitrina: { ...data, items: [] } });
    }

    if (action === 'vitrina-editar' || action === 'vitrina-estado'
      || action === 'vitrina-items' || action === 'vitrina-item' || action === 'vitrina-borrar'
      || action === 'vitrina-stock') {
      const vitrinaId = parseInt(b.vitrina_id, 10);
      if (!vitrinaId) return res.status(400).json({ error: 'falta vitrina_id' });

      // El mismo gate que `traerCanje`: una vitrina es de una marca y no se toca desde otra.
      const { data: vit } = await supabase.from('canje_vitrinas').select('*').eq('id', vitrinaId).maybeSingle();
      if (!vit) return res.status(404).json({ error: 'no existe esa vitrina' });
      if (!visibles.includes(vit.store)) return res.status(403).json({ error: 'Esa vitrina es de otra marca.' });

      if (action === 'vitrina-editar') {
        const campos = {};
        if (b.nombre !== undefined) {
          const n = texto(b.nombre);
          if (!n) return res.status(400).json({ error: 'el nombre no puede quedar vacío' });
          campos.nombre = n.slice(0, 120);
        }
        if (b.nota !== undefined) campos.nota = texto(b.nota);
        if (!Object.keys(campos).length) return res.status(400).json({ error: 'nada para editar' });
        const { error } = await supabase.from('canje_vitrinas')
          .update({ ...campos, updated_at: ahora() }).eq('id', vitrinaId);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      if (action === 'vitrina-estado') {
        if (!ESTADOS_VITRINA.includes(b.estado)) return res.status(400).json({ error: 'estado inválido' });
        // Activar una vitrina vacía la deja ofrecible y le abre a la creadora una pantalla sin nada
        // que elegir, que es la peor forma de enterarse de que faltaba cargarla.
        if (b.estado === 'activa') {
          const { count } = await supabase.from('canje_vitrina_items')
            .select('id', { count: 'exact', head: true }).eq('vitrina_id', vitrinaId).eq('activo', true);
          if (!count) return res.status(409).json({ error: 'Está vacía: sumale productos antes de activarla.' });
        }
        const { error } = await supabase.from('canje_vitrinas')
          .update({ estado: b.estado, updated_at: ahora() }).eq('id', vitrinaId);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      // Sumar productos: llegan ya congelados desde el panel, que es el único lado con sesión para
      // preguntarle a Tienda Nube. Se **upsertean por producto** (hay un unique por
      // `vitrina_id + tn_product_id`) para que traer una categoría que se pisa con otra ya traída
      // sea inofensivo en vez de duplicar la grilla. Re-traer es también el botón "actualizar": se
      // vuelve a congelar la foto y el precio de hoy.
      if (action === 'vitrina-items') {
        const crudos = Array.isArray(b.items) ? b.items : [];
        // Se corta con un error, **no truncando**: mandar 200 y guardar 120 en silencio se lee
        // como que entraron todos, y el que armó la vitrina se entera recién cuando falta la mitad.
        if (crudos.length > TOPE_VITRINA) {
          return res.status(413).json({ error: `Son ${crudos.length} productos y el máximo es ${TOPE_VITRINA}. Traelos en tandas o armá otra vitrina.` });
        }
        const limpios = crudos.map(itemDeVitrinaDelBody).filter(Boolean);
        if (!limpios.length) return res.status(400).json({ error: 'no llegó ningún producto' });

        const { data: previos } = await supabase.from('canje_vitrina_items')
          .select('id, tn_product_id').eq('vitrina_id', vitrinaId);
        const porProducto = new Map((previos || []).map((p) => [String(p.tn_product_id), p.id]));

        // El tope es por lo que le llega a ELLA: la vitrina entera viaja congelada al teléfono, con
        // las fotos y las variantes de cada producto adentro. Una vitrina de 500 productos no es una
        // vitrina, es el catálogo — y era justamente lo que había que evitar.
        const nuevos = limpios.filter((i) => !porProducto.has(i.tn_product_id));
        if (porProducto.size + nuevos.length > TOPE_VITRINA) {
          return res.status(409).json({
            error: `Una vitrina admite hasta ${TOPE_VITRINA} productos y con estos serían ${porProducto.size + nuevos.length}. Armá otra: se eligen al colgarlas del canje.`,
          });
        }

        if (nuevos.length) {
          const { error } = await supabase.from('canje_vitrina_items')
            .insert(nuevos.map((i, n) => ({ ...i, vitrina_id: vitrinaId, orden: porProducto.size + n })));
          if (error) throw new Error(error.message);
        }
        // Los que ya estaban se actualizan de a uno y **sin tocar `activo`**: si alguien apagó un
        // producto a mano, re-traer la categoría no lo tiene que volver a prender por atrás.
        for (const i of limpios) {
          const id = porProducto.get(i.tn_product_id);
          if (!id) continue;
          const { error } = await supabase.from('canje_vitrina_items')
            .update({ ...i, updated_at: ahora() }).eq('id', id);
          if (error) throw new Error(error.message);
        }
        return res.status(200).json({ ok: true, sumados: nuevos.length, actualizados: limpios.length - nuevos.length });
      }

      /**
       * Revisar el stock de la vitrina ENTERA contra la tienda de hoy.
       *
       * Es distinto de `vitrina-items`, que refresca sólo lo que trae la importación: **un producto
       * agotado del todo ya no vuelve en esa lista**, así que su fila quedaba intacta y se seguía
       * ofreciendo para siempre. Acá llega la lista de los que sí se pueden seguir ofreciendo (con
       * la foto y el precio de hoy) y aparte los `tn_product_id` que hay que apagar.
       *
       * La comparación la hace el panel y no el servidor porque **el catálogo se lee desde el
       * panel**: `traerAudit` pasa por `bdi-catalogo`, que es el único lado con credenciales de TN,
       * y este handler no las tiene. Lo que sí se hace acá es no aceptar apagar nada que no sea de
       * esta vitrina.
       */
      if (action === 'vitrina-stock') {
        const crudos = Array.isArray(b.items) ? b.items : [];
        const limpios = crudos.map(itemDeVitrinaDelBody).filter(Boolean);
        const aApagar = (Array.isArray(b.apagar) ? b.apagar : []).map((x) => String(x || '')).filter(Boolean);
        if (!limpios.length && !aApagar.length) return res.status(400).json({ error: 'no llegó nada para revisar' });

        const { data: previos } = await supabase.from('canje_vitrina_items')
          .select('id, tn_product_id, activo').eq('vitrina_id', vitrinaId);
        const porProducto = new Map((previos || []).map((p) => [String(p.tn_product_id), p]));

        // Sólo se refresca lo que YA está en la vitrina: esta acción no suma productos. Sumar es
        // `vitrina-items`, que además controla el tope.
        let actualizados = 0;
        for (const i of limpios) {
          const fila = porProducto.get(i.tn_product_id);
          if (!fila) continue;
          // `activo` no se toca: si alguien lo apagó a mano, tener stock hoy no lo vuelve a prender.
          const { error } = await supabase.from('canje_vitrina_items')
            .update({ ...i, updated_at: ahora() }).eq('id', fila.id);
          if (error) throw new Error(error.message);
          actualizados++;
        }

        // Se apagan de a uno y sólo los de ESTA vitrina. No se borran: que un producto se haya
        // caído es información, y lo que alguien ya eligió quedó congelado en su canje.
        let apagados = 0;
        for (const pid of aApagar) {
          const fila = porProducto.get(pid);
          if (!fila || fila.activo === false) continue;
          const { error } = await supabase.from('canje_vitrina_items')
            .update({ activo: false, updated_at: ahora() }).eq('id', fila.id);
          if (error) throw new Error(error.message);
          apagados++;
        }

        await supabase.from('canje_vitrinas')
          .update({ stock_at: ahora(), updated_at: ahora() }).eq('id', vitrinaId);
        return res.status(200).json({ ok: true, actualizados, apagados });
      }

      // Sacar un producto. **Mientras la vitrina se está armando se borra de verdad**: todavía no se
      // le ofreció a nadie y no hay nada que explicar. Una vez que salió, se apaga: que un producto
      // se haya caído es información, y sin eso no se entiende por qué la vitrina salió como salió.
      if (action === 'vitrina-item') {
        const itemId = parseInt(b.item_id, 10);
        if (!itemId) return res.status(400).json({ error: 'falta item_id' });
        if (b.activo === undefined) {
          if (vit.estado !== 'borrador') {
            return res.status(409).json({ error: 'Esta vitrina ya salió: los productos se apagan, no se borran.' });
          }
          const { error } = await supabase.from('canje_vitrina_items')
            .delete().eq('id', itemId).eq('vitrina_id', vitrinaId);
          if (error) throw new Error(error.message);
          return res.status(200).json({ ok: true });
        }
        const { error } = await supabase.from('canje_vitrina_items')
          .update({ activo: bool(b.activo), updated_at: ahora() }).eq('id', itemId).eq('vitrina_id', vitrinaId);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      // Borrar la vitrina entera. La FK de `canjes.vitrina_id` es `no action`, así que si algún
      // canje la está usando la base frena el borrado — y está bien que lo haga: lo que ella eligió
      // quedó congelado en `canje_items`, pero la vitrina es lo que explica de dónde salió. Mismo
      // criterio que `persona-borrar`: con historial encima, se archiva.
      const { count: colgados } = await supabase.from('canjes')
        .select('id', { count: 'exact', head: true }).eq('vitrina_id', vitrinaId);
      if (colgados) {
        return res.status(409).json({
          error: `La están usando ${colgados} ${colgados === 1 ? 'canje' : 'canjes'}: archivala en vez de borrarla y deja de ofrecerse para los nuevos.`,
        });
      }
      const { error: eBorrar } = await supabase.from('canje_vitrinas').delete().eq('id', vitrinaId);
      if (eBorrar) throw new Error(eBorrar.message);
      return res.status(200).json({ ok: true });
    }

    // ══ EL CANJE ══════════════════════════════════════════════════════════════

    /**
     * Lo compartido de la propuesta: todo menos de quién es.
     *
     * Se arma UNA vez y lo usan el alta de a una y la del lote. Nada de esto depende de la persona
     * —ni siquiera el nivel de firma, que sale de `tipo`, `tope_pvp` y la config—, así que en un
     * lote de veinticinco se valida una vez y no veinticinco.
     */
    async function baseDeLaPropuesta(cfgStore) {
      const tope_tipo = TOPE_TIPOS.includes(b.tope_tipo) ? b.tope_tipo : 'unidades';
      const tipo = TIPOS_CANJE.includes(b.tipo) ? b.tipo : 'producto';
      // De qué vitrina va a elegir. Opcional: sin vitrina el canje sigue funcionando como siempre
      // —los productos los carga el equipo— y el link sólo le pide los datos.
      const vit = await vitrinaValida(b.vitrina_id, store);
      if (vit.error) return { error: vit.error };
      return {
        row: {
          store,
          tipo,
          vitrina_id: vit.id,
          titulo: texto(b.titulo),
          nota: texto(b.nota),
          tope_tipo,
          tope_pvp: tope_tipo === 'monto' ? num(b.tope_pvp) : null,
          tope_unidades: tope_tipo === 'unidades' && Array.isArray(b.tope_unidades) ? b.tope_unidades : [],
          monto_plata: tipo === 'producto_plata' ? num(b.monto_plata) : null,
          // El pendiente de pago sólo existe si hay plata: si no, sería un pendiente que nunca se
          // resuelve y que traba el cierre para siempre.
          pago_estado: tipo === 'producto_plata' ? 'pendiente' : 'no_aplica',
          usuario,
        },
        entregables: entregablesDelBody(b.entregables, cfgStore),
      };
    }

    /**
     * Crear UN canje con sus entregables. **La unidad de atomicidad del módulo.**
     *
     * El lote la llama N veces en vez de insertar N filas de una: así la compensación de acá abajo
     * —si los entregables no entran, el canje no queda— vale igual para el lote sin escribirla dos
     * veces, y un lote a medias son doce canjes válidos, no doce canjes rotos.
     */
    async function crearUnCanje(personaId, base, cfgStore) {
      const row = { ...base.row, persona_id: personaId };

      // ── La firma que se saltea sola ───────────────────────────────────────
      // Espejo de `naceEn`. Si quien lo propone ya podía firmarlo, no tiene sentido mandarlo a una
      // pestaña para que se apruebe a sí mismo. Que se saltee NO borra la firma: se estampa igual,
      // porque de lo que sirve una aprobación es de saber quién se hizo cargo.
      const nivel = subQueApruebe(row, [], cfgStore);
      const firmaSola = puedeFirmar(perfil, store, nivel);
      row.estado = firmaSola ? 'enviada' : 'propuesta';
      row.contacto_estado = 'pendiente';
      if (firmaSola) {
        row.aprobado_por = usuario;
        row.aprobado_at = ahora();
        row.aprobacion_nivel = nivel;
      }
      row.historial = [{
        estado: row.estado,
        at: ahora(),
        usuario,
        nota: firmaSola ? 'propuesta armada' : 'propuesta armada, a la firma',
      }];

      const { data, error } = await supabase.from('canjes').insert(row).select('id').single();
      if (error) throw new Error(error.message);

      // Los entregables van en el MISMO request: hacerlo con N llamadas desde el browser deja un
      // canje a medias si falla la tercera, y lo que se le prometió publicar es parte de la
      // propuesta, no un agregado posterior.
      if (base.entregables.length) {
        const { error: e2 } = await supabase.from('canje_entregables')
          // ⚠️ Sin `usuario`: `canje_entregables` no tiene esa columna (quién lo cargó vive en el
          // historial del canje, que es donde se mira). Ponerla tira "Could not find the 'usuario'
          // column ... in the schema cache".
          .insert(base.entregables.map((e) => ({ ...e, canje_id: data.id })));
        if (e2) {
          // No hay transacción (supabase-js va por REST), así que se compensa a mano: **si los
          // entregables no entran, el canje no queda**. Un canje sin lo que prometió publicar es
          // exactamente lo que la propuesta en una sola pantalla vino a evitar, y peor todavía
          // porque el que lo creó vio un error y se fue creyendo que no se había guardado nada.
          await supabase.from('canjes').delete().eq('id', data.id);
          throw new Error(e2.message);
        }
      }

      return { id: data.id, numero: numeroCanje(data.id), estado: row.estado };
    }

    if (action === 'canje-crear') {
      const personaId = parseInt(b.persona_id, 10);
      if (!personaId) return res.status(400).json({ error: 'falta la persona' });

      const { data: persona } = await supabase.from('canje_personas')
        .select('id, vetada, vetada_motivo').eq('id', personaId).maybeSingle();
      if (!persona) return res.status(404).json({ error: 'no existe esa persona' });

      // ── §2 bis: el bloqueo ──────────────────────────────────────────────────
      // Se valida ACÁ y no sólo deshabilitando el botón: un gate que sólo vive en el browser no
      // es un gate. Y es TRANSVERSAL a las marcas — si debe algo en BDI, tampoco se le propone en
      // Zattia. Ese es el sentido del padrón único: si no, se esquiva cambiando de marca.
      if (persona.vetada) {
        return res.status(403).json({
          error: persona.vetada_motivo ? `Está vetada: ${persona.vetada_motivo}` : 'Está vetada.',
        });
      }
      const cfgStore = await configDe(store);
      if (cfgStore.bloquear_por_vencidos) {
        const bloqueo = await motivoDeBloqueo(personaId);
        if (bloqueo) return res.status(403).json({ error: bloqueo });
      }

      const base = await baseDeLaPropuesta(cfgStore);
      if (base.error) return res.status(400).json({ error: base.error });

      const creado = await crearUnCanje(personaId, base, cfgStore);
      return res.status(200).json({ ok: true, ...creado });
    }

    // ── La misma propuesta, para varias personas ──────────────────────────────
    //
    // ⚠️ **Va ANTES del `parseInt(b.id)` de acá abajo**: esta acción no manda `id`, y puesta después
    // moriría con "falta id" sin llegar nunca a su `if`.
    //
    // Dos fases. Primero se valida lo compartido —vitrina, tope, entregables— y si algo de eso está
    // mal se corta sin escribir nada. Después se crean de a uno: **una persona vetada no aborta el
    // lote**, va a `rechazadas` y las demás se crean igual. Quien eligió veinte no tiene por qué
    // volver a elegirlas por una; lo que no puede pasar es que se la saltee en silencio, y por eso
    // la pantalla las muestra con el motivo.
    //
    // ⚠️ Si esto se corta por timeout, reintentar crea canjes DUPLICADOS: no hay unique que lo
    // impida. Por eso el cliente deshabilita el botón mientras guarda y, ante un error de red, dice
    // "puede que algunos se hayan creado, actualizá y revisá" en vez de ofrecer reintentar.
    if (action === 'canjes-crear-lote') {
      const ids = [...new Set((Array.isArray(b.persona_ids) ? b.persona_ids : [])
        .map((x) => parseInt(x, 10)).filter(Boolean))];
      if (!ids.length) return res.status(400).json({ error: 'no viene ninguna persona' });
      if (ids.length > TOPE_CANJES_LOTE) {
        // El tope es mucho más bajo que el de la vitrina porque acá el costo es O(N): cada canje son
        // dos idas a la base. Con cien, el lote se muere a mitad de camino habiendo escrito la mitad.
        return res.status(413).json({
          error: `Son ${ids.length} y el máximo es ${TOPE_CANJES_LOTE}. Hacelo en tandas.`,
        });
      }

      const cfgStore = await configDe(store);
      const base = await baseDeLaPropuesta(cfgStore);
      if (base.error) return res.status(400).json({ error: base.error });

      // Las N personas en una sola consulta, y los bloqueos en tres más (no en tres por persona).
      const { data: personas, error: ePersonas } = await supabase.from('canje_personas')
        .select('id, nombre, apellido, vetada, vetada_motivo').in('id', ids);
      if (ePersonas) throw new Error(ePersonas.message);
      const porId = new Map((personas || []).map((p) => [p.id, p]));
      const bloqueos = cfgStore.bloquear_por_vencidos ? await motivosDeBloqueo(ids) : new Map();

      const creados = [];
      const rechazadas = [];
      const errores = [];
      for (const personaId of ids) {
        const persona = porId.get(personaId);
        if (!persona) { rechazadas.push({ persona_id: personaId, motivo: 'No existe esa persona.' }); continue; }
        if (persona.vetada) {
          rechazadas.push({
            persona_id: personaId,
            motivo: persona.vetada_motivo ? `Está vetada: ${persona.vetada_motivo}` : 'Está vetada.',
          });
          continue;
        }
        const bloqueo = bloqueos.get(personaId);
        if (bloqueo) { rechazadas.push({ persona_id: personaId, motivo: bloqueo }); continue; }

        try {
          creados.push({ persona_id: personaId, ...(await crearUnCanje(personaId, base, cfgStore)) });
        } catch (e) {
          // El canje que falló ya se limpió solo (la compensación de `crearUnCanje`). Los demás del
          // lote no tienen por qué caerse con él.
          errores.push({ persona_id: personaId, error: String(e?.message || e) });
        }
      }

      return res.status(200).json({ ok: true, creados, rechazadas, errores });
    }

    const canjeId = parseInt(b.id, 10);
    if (!canjeId) return res.status(400).json({ error: 'falta id' });
    const t = await traerCanje(canjeId);
    if (t.error) return t.error;
    const canje = t.canje;
    const cfgCanje = await configDe(canje.store);

    if (action === 'canje-editar') {
      // Se edita mientras la conversación esté abierta: eso incluye `enviada`, porque la
      // negociación pasa por las redes y lo que se acuerde ahí hay que poder asentarlo (es el
      // "generar cambios"). Después del acuerdo el trato ya está cerrado con ella: cambiarlo por
      // atrás es cambiarle las condiciones sin avisar. Se cancela y se hace otro.
      if (!['propuesta', 'enviada'].includes(canje.estado)) {
        return res.status(409).json({ error: 'Un canje ya acordado no se edita: cancelalo y armá uno nuevo.' });
      }
      const campos = {};
      if (b.titulo !== undefined) campos.titulo = texto(b.titulo);
      if (b.nota !== undefined) campos.nota = texto(b.nota);
      if (b.tipo !== undefined && TIPOS_CANJE.includes(b.tipo)) {
        campos.tipo = b.tipo;
        campos.pago_estado = b.tipo === 'producto_plata' ? 'pendiente' : 'no_aplica';
        if (b.tipo === 'producto') campos.monto_plata = null;
      }
      if (b.monto_plata !== undefined) campos.monto_plata = num(b.monto_plata);
      if (b.tope_tipo !== undefined && TOPE_TIPOS.includes(b.tope_tipo)) campos.tope_tipo = b.tope_tipo;
      if (b.tope_pvp !== undefined) campos.tope_pvp = num(b.tope_pvp);
      if (b.tope_unidades !== undefined && Array.isArray(b.tope_unidades)) campos.tope_unidades = b.tope_unidades;

      // Los entregables se reemplazan enteros, porque lo que cambió en la negociación es el trato
      // completo ("me hacés 2 historias en vez de 3"), no una fila suelta. Se borran y se insertan
      // en un solo paso; con evidencias colgando no se toca, aunque acá no debería haberlas.
      const nuevos = b.entregables === undefined ? null : entregablesDelBody(b.entregables, cfgCanje);
      if (nuevos) {
        const { count } = await supabase.from('canje_evidencias')
          .select('id', { count: 'exact', head: true }).eq('canje_id', canjeId);
        if (count) {
          return res.status(409).json({
            error: 'Este canje ya tiene publicaciones cargadas: cambiá los entregables de a uno desde la ficha.',
          });
        }
      }
      if (!Object.keys(campos).length && !nuevos) return res.status(400).json({ error: 'nada para editar' });

      if (Object.keys(campos).length) {
        const { error } = await supabase.from('canjes').update({ ...campos, updated_at: ahora() }).eq('id', canjeId);
        if (error) throw new Error(error.message);
      }
      if (nuevos) {
        const { error: eDel } = await supabase.from('canje_entregables').delete().eq('canje_id', canjeId);
        if (eDel) throw new Error(eDel.message);
        if (nuevos.length) {
          const { error: eIns } = await supabase.from('canje_entregables')
            .insert(nuevos.map((e) => ({ ...e, canje_id: canjeId })));
          if (eIns) throw new Error(eIns.message);
        }
      }
      return res.status(200).json({ ok: true });
    }

    /**
     * De qué vitrina elige.
     *
     * Va **aparte de `canje-editar`**, que sólo deja tocar el canje antes del acuerdo, porque la
     * vitrina recién importa cuando el link empieza a servir —o sea, a partir de `acuerdo`—. No es
     * cambiarle el trato por atrás: la cantidad y lo que se le pide publicar siguen siendo los
     * acordados, y lo único que se mueve es de qué lista elige.
     *
     * ⛔ Una vez que ella mandó su elección **no se cambia**: lo que eligió quedó congelado en
     * `canje_items` y darle otra vitrina dejaría en la ficha una elección que no se corresponde con
     * ninguna lista. Se quitan los productos de a uno, como cualquier otro.
     */
    if (action === 'canje-vitrina') {
      if (canje.seleccion_cerrada_at) {
        return res.status(409).json({ error: 'Ya eligió sus productos: para cambiarlos, quitalos de la lista de abajo.' });
      }
      if (TERMINALES.includes(canje.estado)) {
        return res.status(409).json({ error: 'Este canje ya está cerrado.' });
      }
      const vit = await vitrinaValida(b.vitrina_id, canje.store);
      if (vit.error) return res.status(400).json({ error: vit.error });
      const { error } = await supabase.from('canjes')
        .update({ vitrina_id: vit.id, updated_at: ahora() }).eq('id', canjeId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, vitrina_id: vit.id });
    }

    /**
     * "Ya le escribí." Es un **pendiente, no un estado**: la propuesta está armada igual y el canje
     * no se mueve. Sirve para que el listado distinga "falta escribirle" de "esperando su
     * respuesta", que es la diferencia entre una tarea mía y una espera de otro.
     *
     * Es registro, no control: no tiene espejo en TS.
     */
    if (action === 'contacto') {
      if (canje.estado !== 'enviada') {
        return res.status(409).json({ error: 'Sólo se marca en un canje que se le haya mandado.' });
      }
      const { error } = await supabase.from('canjes')
        .update({ contacto_estado: 'hecho', contacto_at: ahora(), updated_at: ahora() }).eq('id', canjeId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    /**
     * Lo que contestó ELLA. Va por acción propia y no por `canje-estado` por una razón concreta:
     * **acá nace el token del portal**, y `canje-estado` no mintea tokens. Si el acuerdo se
     * alcanzara por la acción genérica, el link nunca existiría y la ficha diría "este canje no
     * tiene link activo" sin explicar por qué.
     *
     * No exige sub-permiso: registrar lo que dijo la persona lo hace quien lleva la conversación,
     * no quien firma la plata.
     */
    if (action === 'canje-respuesta') {
      if (canje.estado !== 'enviada') {
        return res.status(409).json({ error: 'Esa respuesta se registra sobre un canje que esté esperando contestación.' });
      }
      const at = ahora();

      if (b.respuesta === 'acepto') {
        // El token nace acá, con el sí. Antes del acuerdo el link no tiene nada que mostrarle.
        const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
        const vence = new Date();
        vence.setDate(vence.getDate() + DIAS_TOKEN);
        await apilar(supabase, 'canjes', canjeId, { estado: 'acuerdo', at, usuario, nota: 'aceptó' }, {
          estado: 'acuerdo',
          // ⚠️ `acordado_at` se estampa ACÁ y no en la firma interna: es la fecha que
          // `fechaDeAccion` lee como "última acción con ella", y una propuesta que nunca contestó
          // no puede taparle la cadencia 90 días.
          acordado_at: at,
          respuesta_at: at,
          token,
          token_vence: vence.toISOString(),
        });
        return res.status(200).json({ ok: true, estado: 'acuerdo' });
      }

      if (b.respuesta === 'no_acepto') {
        const motivo = texto(b.motivo);
        if (!MOTIVOS_NO_ACEPTO.includes(motivo)) {
          return res.status(400).json({ error: 'Elegí un motivo de la lista.' });
        }
        const nota = texto(b.nota);
        if (motivo === 'Otro' && !nota) {
          return res.status(400).json({ error: 'Contá en una línea qué pasó: "Otro" sin nota no dice nada dentro de seis meses.' });
        }
        await apilar(supabase, 'canjes', canjeId, { estado: 'no_acepto', at, usuario, nota: motivo }, {
          estado: 'no_acepto',
          respuesta_motivo: motivo,
          respuesta_nota: nota,
          respuesta_at: at,
          // Higiene: sin canje vivo, el link no tiene por qué seguir abriendo.
          token: null,
          token_vence: null,
        });
        return res.status(200).json({ ok: true, estado: 'no_acepto' });
      }

      return res.status(400).json({ error: 'respuesta inválida (acepto | no_acepto)' });
    }

    /**
     * Borrar un canje. **Distinto de cancelar**: cancelar deja el rastro de que existió y por qué
     * se cayó, borrar no deja nada. Es para la prueba y el error de carga, no para "esto no salió".
     *
     * Dos niveles, por lo que se lleva puesto:
     * - **Antes del acuerdo** (`propuesta`, `enviada` y los dos "no") no hay nada material: ni
     *   productos, ni envío, ni plata, ni publicaciones. Lo borra cualquiera que vea la marca.
     * - **De `acuerdo` en adelante** ya hay cosas colgando y el borrado **cascadea** items,
     *   entregables y evidencias. Eso lo hace sólo Administración, y la UI dice cuántas filas se
     *   van antes de preguntar.
     */
    if (action === 'canje-borrar') {
      const antesDelAcuerdo = ['propuesta', 'enviada', 'rechazado', 'no_acepto'].includes(canje.estado);
      if (!antesDelAcuerdo && !esAdministracion(perfil)) {
        return res.status(403).json({
          error: 'Este canje ya tiene productos o envío encima: borrarlo lo hace Administración. Si no salió, cancelalo — así queda el motivo.',
        });
      }
      const { error } = await supabase.from('canjes').delete().eq('id', canjeId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    /** Qué se lleva puesto el borrado. Se pide ANTES de preguntar, para poder decirlo. */
    if (action === 'canje-borrar-que-se-lleva') {
      const [items, ents, evis] = await Promise.all([
        supabase.from('canje_items').select('id', { count: 'exact', head: true }).eq('canje_id', canjeId),
        supabase.from('canje_entregables').select('id', { count: 'exact', head: true }).eq('canje_id', canjeId),
        supabase.from('canje_evidencias').select('id', { count: 'exact', head: true }).eq('canje_id', canjeId),
      ]);
      return res.status(200).json({
        ok: true,
        items: items.count || 0,
        entregables: ents.count || 0,
        evidencias: evis.count || 0,
      });
    }

    if (action === 'canje-estado') {
      const destino = String(b.estado || '');
      if (!ESTADOS.includes(destino)) return res.status(400).json({ error: 'estado inválido' });
      if (!puedeIr(canje.estado, destino)) {
        return res.status(409).json({ error: `De "${canje.estado}" no se puede pasar a "${destino}".` });
      }
      // Cancelar sin motivo deja el problema al que lo encuentre en tres meses.
      const motivo = texto(b.motivo);
      if (destino === 'cancelado' && !motivo) return res.status(400).json({ error: 'para cancelar hace falta un motivo' });

      const extra = { estado: destino };
      if (destino === 'cancelado') {
        extra.cancelado_motivo = motivo;
        // Cancelar REVOCA el link: si no, el token sigue vivo y ella carga datos para un canje
        // que ya no existe.
        extra.token = null;
        extra.token_vence = null;
      }
      await apilar(supabase, 'canjes', canjeId, { estado: destino, at: ahora(), usuario, nota: motivo }, extra);
      return res.status(200).json({ ok: true });
    }

    // ── La aprobación ─────────────────────────────────────────────────────────
    if (action === 'canje-aprobar' || action === 'canje-rechazar') {
      if (canje.estado !== 'propuesta') {
        return res.status(409).json({ error: 'Este canje no está esperando aprobación.' });
      }
      // Qué firma hace falta lo decide el canje, no quien lo mira: un canje con plata siempre va a
      // la firma alta, tenga el monto que tenga.
      const nivel = subQueApruebe(canje, await itemsDe(canjeId), cfgCanje);
      if (!puedeFirmar(perfil, canje.store, nivel)) {
        return res.status(403).json({
          error: nivel === 'aprobar-plata'
            ? 'Este canje necesita la firma alta (permiso "aprobar canjes con plata o de monto alto").'
            : 'No tenés permiso para aprobar canjes.',
        });
      }

      if (action === 'canje-rechazar') {
        const motivo = texto(b.motivo);
        if (!motivo) return res.status(400).json({ error: 'para rechazar hace falta un motivo' });
        await apilar(supabase, 'canjes', canjeId, { estado: 'rechazado', at: ahora(), usuario, nota: motivo }, {
          estado: 'rechazado', rechazado_motivo: motivo, rechazado_por: usuario, rechazado_at: ahora(),
        });
        return res.status(200).json({ ok: true });
      }

      // ⚠️ Aprobar deja el canje en `enviada`, **no** en `acuerdo`: la firma es nuestra, el acuerdo
      // es de ella. Y por eso acá tampoco nace el token — nace cuando dice que sí
      // (`canje-respuesta`), que es cuando el link tiene algo para mostrarle.
      await apilar(supabase, 'canjes', canjeId, { estado: 'enviada', at: ahora(), usuario, nota: `aprobado (${nivel})` }, {
        estado: 'enviada',
        aprobado_por: usuario,
        aprobado_at: ahora(),
        // Se GUARDA el nivel, no se recalcula: si mañana cambia el umbral, lo ya aprobado sigue
        // diciendo con qué regla se aprobó.
        aprobacion_nivel: nivel,
      });
      return res.status(200).json({ ok: true, nivel });
    }

    // ── Los productos ─────────────────────────────────────────────────────────
    if (action === 'item-agregar') {
      if (TERMINALES.includes(canje.estado)) {
        return res.status(409).json({ error: 'Este canje ya está cerrado.' });
      }
      const cantidad = Math.max(1, parseInt(b.cantidad, 10) || 1);
      const nuevo = {
        canje_id: canjeId,
        sku: texto(b.sku),
        product_id: texto(b.product_id),
        size_id: texto(b.size_id),
        nombre: texto(b.nombre),
        variante: texto(b.variante),
        cantidad,
        // Congelados: el balance necesita el costo DE ESE DÍA, no el de hoy.
        costo_unit: num(b.costo_unit),
        pvp_unit: num(b.pvp_unit),
        origen: b.origen === 'persona' ? 'persona' : 'equipo',
        estado: 'confirmado',
        usuario,
      };
      // El control del tope corre en el servidor con la lista REAL, no con la que tenga el
      // browser en pantalla: dos operadores cargando a la vez se pasarían del tope sin que
      // ninguno de los dos lo viera.
      const previos = await itemsDe(canjeId);
      const seVa = seVaDelTope(canje, [...previos, nuevo]);
      if (seVa) return res.status(409).json({ error: seVa });

      const { data, error } = await supabase.from('canje_items').insert(nuevo).select('*').single();
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, item: data });
    }

    /**
     * "Sí, esto se lo mandamos." Sólo aplica a lo que eligió **ella**: lo que carga el equipo desde
     * el buscador nace confirmado, porque lo está mirando contra el stock de Gestión Nube en ese
     * mismo momento. La vitrina, en cambio, está congelada y no sabe si el producto sigue estando.
     *
     * Acá es también donde entra el **costo**: no viaja con la vitrina —vive en GN y no se puede
     * cruzar confiable— así que el que confirma lo puede cargar de una si lo tiene a mano.
     */
    if (action === 'item-confirmar') {
      const itemId = parseInt(b.item_id, 10);
      if (!itemId) return res.status(400).json({ error: 'falta item_id' });
      const campos = { estado: 'confirmado', updated_at: ahora() };
      if (b.costo_unit !== undefined) campos.costo_unit = num(b.costo_unit);
      const { error } = await supabase.from('canje_items')
        .update(campos).eq('id', itemId).eq('canje_id', canjeId).eq('estado', 'propuesto');
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (action === 'item-quitar') {
      const itemId = parseInt(b.item_id, 10);
      if (!itemId) return res.status(400).json({ error: 'falta item_id' });
      const motivo = texto(b.motivo);
      if (!motivo) return res.status(400).json({ error: 'para quitar un producto hace falta un motivo' });
      const estado = b.sin_stock === true ? 'sin_stock' : 'quitado';
      // NO se borra: que algo se haya caído por falta de stock es información, y al mes siguiente
      // es lo que explica por qué el canje salió distinto de lo acordado.
      const { error } = await supabase.from('canje_items')
        .update({ estado, motivo, updated_at: ahora() }).eq('id', itemId).eq('canje_id', canjeId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── Compra y envío ────────────────────────────────────────────────────────
    if (action === 'compra') {
      // La orden se crea A MANO en el admin de Tienda Nube: este repo no tiene credenciales de TN
      // (todo lo de TN pasa por bdi-catalogo, que no escribe órdenes). Acá sólo se registra.
      const campos = {
        tn_orden: texto(b.tn_orden),
        gn_venta_number: texto(b.gn_venta_number),
        compra_estado: 'hecho',
        compra_at: ahora(),
        compra_por: usuario,
      };
      if (!campos.tn_orden) return res.status(400).json({ error: 'falta el número de orden de Tienda Nube' });
      // Con qué cupón se tipeó esta orden. Es el de la marca y hoy es siempre el mismo, así que no
      // sirve para decidir nada — sirve para que dentro de un año, cuando el código haya cambiado
      // dos veces, se pueda entender una orden vieja. Se estampa una sola vez: si la orden se
      // corrige después, el cupón con el que se cargó no cambió.
      if (!canje.cupon_codigo && cfgCanje.cupon_codigo) campos.cupon_codigo = cfgCanje.cupon_codigo;
      const extra = canje.estado === 'acuerdo' ? { ...campos, estado: 'preparando' } : campos;
      await apilar(supabase, 'canjes', canjeId, { at: ahora(), usuario, nota: `orden ${campos.tn_orden} cargada` }, extra);
      return res.status(200).json({ ok: true });
    }

    if (action === 'envio') {
      const via = VIAS_ENVIO.includes(b.envio_via) ? b.envio_via : null;
      if (!via) return res.status(400).json({ error: 'falta la vía del envío' });
      const campos = {
        envio_via: via,
        envio_seguimiento: texto(b.envio_seguimiento),
        envio_costo: num(b.envio_costo),
        envio_estado: 'hecho',
        envio_at: ahora(),
      };
      if (campos.envio_costo != null && campos.envio_costo < 0) {
        return res.status(400).json({ error: 'el costo del envío no puede ser negativo' });
      }
      // La dirección se CONGELA acá: si el mes que viene se muda, el histórico no tiene que mentir
      // sobre a dónde se mandó esto.
      const { data: persona } = await supabase.from('canje_personas')
        .select('nombre, apellido, dni, calle, numero, piso, depto, cp, provincia, localidad, direccion_nota, telefono')
        .eq('id', canje.persona_id).maybeSingle();
      if (persona) campos.envio_direccion = persona;

      const extra = canje.estado === 'acuerdo' ? { ...campos, estado: 'preparando' } : campos;
      await apilar(supabase, 'canjes', canjeId, { at: ahora(), usuario, nota: `despachado por ${via}` }, extra);
      return res.status(200).json({ ok: true });
    }

    if (action === 'aviso') {
      await supabase.from('canjes')
        .update({ aviso_estado: 'hecho', aviso_at: ahora(), updated_at: ahora() }).eq('id', canjeId);
      return res.status(200).json({ ok: true });
    }

    /**
     * "Pasaron a entregarlo y no había nadie".
     *
     * **No cambia el estado a propósito**: el pedido sigue sin llegar, así que el canje sigue en la
     * cola de tránsito y sigue siendo trabajo de alguien. Un estado "con problemas" lo sacaría de
     * la lista que la encargada mira todos los días, que es justo donde tiene que estar.
     *
     * Se apila en una lista y no en una columna porque el correo intenta más de una vez: con una
     * fecha sola, el segundo intento pisa al primero.
     */
    if (action === 'intento-entrega') {
      if (canje.envio_estado !== 'hecho') {
        return res.status(409).json({ error: 'Todavía no figura despachado: no puede haber un intento de entrega.' });
      }
      if (canje.entregado_at) return res.status(409).json({ error: 'Este canje ya figura entregado.' });
      const at = ahora();
      const nota = texto(b.nota);
      const previos = Array.isArray(canje.intentos) ? canje.intentos : [];
      // Tope defensivo: es una lista que crece sola desde un botón y vive en la fila del canje.
      const intentos = [...previos, { at, nota, usuario }].slice(-20);
      await apilar(supabase, 'canjes', canjeId, {
        at, usuario, nota: nota ? `intento de entrega: ${nota}` : 'intento de entrega fallido',
      }, { intentos });
      return res.status(200).json({ ok: true, intentos });
    }

    /**
     * "Le llegó". **Es el pivote del módulo**: acá y sólo acá los `plazo_dias` se vuelven fechas.
     *
     * El plazo se guarda en días desde la entrega porque al armar el acuerdo todavía no se sabe
     * cuándo llega el pedido. `vence_el` se calcula una vez y se congela: si se recalculara en
     * cada lectura, mover `entregado_at` movería todos los vencimientos hacia atrás y un
     * incumplimiento desaparecería solo.
     */
    if (action === 'entregado') {
      if (canje.entregado_at) return res.status(409).json({ error: 'Este canje ya figura entregado.' });
      const at = ahora();
      const entregables = await entregablesDe(canjeId);
      const base = new Date(at);
      for (const e of entregables) {
        const dias = e.plazo_dias == null ? Number(cfgCanje.plazo_entregable_dias_default) : Number(e.plazo_dias);
        const d = new Date(base);
        d.setDate(d.getDate() + (Number.isFinite(dias) ? dias : 10));
        await supabase.from('canje_entregables')
          .update({ vence_el: fechaISO(d), updated_at: at }).eq('id', e.id);
      }
      await apilar(supabase, 'canjes', canjeId, { estado: 'en_curso', at, usuario, nota: 'le llegó el pedido' }, {
        estado: 'en_curso', entregado_at: at,
      });
      return res.status(200).json({ ok: true, entregables: entregables.length });
    }

    // ── Lo que prometió publicar ──────────────────────────────────────────────
    if (action === 'entregable-agregar') {
      if (!TIPOS_ENTREGABLE.includes(b.tipo)) return res.status(400).json({ error: 'tipo de entregable inválido' });
      const row = {
        canje_id: canjeId,
        tipo: b.tipo,
        cantidad_comprometida: Math.max(1, parseInt(b.cantidad_comprometida, 10) || 1),
        plazo_dias: num(b.plazo_dias) ?? Number(cfgCanje.plazo_entregable_dias_default),
        obligatorio: b.obligatorio === false ? false : true,
        nota: texto(b.nota),
      };
      // Si el pedido YA llegó, el vencimiento se calcula al vuelo: un entregable sumado después
      // sin fecha nunca vencería, y sería la forma de esquivar el control sin querer.
      if (canje.entregado_at) {
        const d = new Date(canje.entregado_at);
        d.setDate(d.getDate() + (Number(row.plazo_dias) || 10));
        row.vence_el = fechaISO(d);
      }
      const { data, error } = await supabase.from('canje_entregables').insert(row).select('*').single();
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, entregable: data });
    }

    if (action === 'entregable-quitar') {
      const eid = parseInt(b.entregable_id, 10);
      if (!eid) return res.status(400).json({ error: 'falta entregable_id' });
      // Acá SÍ se borra, a diferencia de los items: un entregable que se saca del acuerdo no
      // ocurrió nunca, no es un producto que estuvo y se cayó. Las evidencias colgadas quedan
      // huérfanas (`on delete set null`) y siguen visibles en el canje.
      const { error } = await supabase.from('canje_entregables').delete().eq('id', eid).eq('canje_id', canjeId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── El cumplimiento ───────────────────────────────────────────────────────
    if (action === 'evidencia-agregar') {
      const previas = await evidenciasDe(canjeId);
      const tope = Number(cfgCanje.tope_evidencias_por_canje) || 30;
      if (previas.length >= tope) {
        return res.status(409).json({ error: `Este canje ya tiene ${previas.length} evidencias (el tope es ${tope}).` });
      }
      if (!texto(b.url_publicacion) && !texto(b.captura_url) && !texto(b.archivo_url)) {
        return res.status(400).json({ error: 'hace falta el link de la publicación o una captura' });
      }
      const row = {
        canje_id: canjeId,
        entregable_id: b.entregable_id ? parseInt(b.entregable_id, 10) : null,
        url_publicacion: texto(b.url_publicacion),
        // Las historias vencen a las 24 h: la captura ES la prueba, no un adorno.
        captura_url: texto(b.captura_url),
        archivo_url: texto(b.archivo_url),
        archivo_tipo: texto(b.archivo_tipo),
        fecha_publicacion: texto(b.fecha_publicacion),
        metricas: b.metricas && typeof b.metricas === 'object' ? b.metricas : {},
        subido_por: b.subido_por === 'persona' ? 'persona' : 'equipo',
        usuario,
      };
      const { data, error } = await supabase.from('canje_evidencias').insert(row).select('*').single();
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, evidencia: data });
    }

    if (action === 'evidencia-verificar') {
      const eid = parseInt(b.evidencia_id, 10);
      if (!eid) return res.status(400).json({ error: 'falta evidencia_id' });
      const ok = b.ok !== false;
      const motivo = texto(b.motivo);
      if (!ok && !motivo) return res.status(400).json({ error: 'para rechazar una evidencia hace falta un motivo' });
      // Una evidencia sin verificar NO cuenta para el cumplimiento. Sin este paso, pegar un link
      // roto cerraría el canje.
      const campos = ok
        ? { verificada: true, verificada_por: usuario, verificada_at: ahora(), rechazada_motivo: null }
        : { verificada: false, verificada_por: usuario, verificada_at: ahora(), rechazada_motivo: motivo };
      const { error } = await supabase.from('canje_evidencias')
        .update({ ...campos, updated_at: ahora() }).eq('id', eid).eq('canje_id', canjeId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (action === 'evidencia-borrar') {
      const eid = parseInt(b.evidencia_id, 10);
      if (!eid) return res.status(400).json({ error: 'falta evidencia_id' });
      const { error } = await supabase.from('canje_evidencias').delete().eq('id', eid).eq('canje_id', canjeId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── La plata ──────────────────────────────────────────────────────────────
    if (action === 'pago') {
      if (canje.tipo !== 'producto_plata') return res.status(409).json({ error: 'Este canje no lleva plata.' });
      // El pago se hace POR FUERA del sistema (transferencia). Acá sólo queda registrado que se
      // hizo, con fecha: es lo que después permite cerrar y lo que evita pagar dos veces.
      await apilar(supabase, 'canjes', canjeId, { at: ahora(), usuario, nota: 'plata pagada' }, {
        pago_estado: 'pagado', pago_at: ahora(), pago_nota: texto(b.pago_nota),
      });
      return res.status(200).json({ ok: true });
    }

    // ── El cierre ─────────────────────────────────────────────────────────────
    if (action === 'cerrar') {
      if (canje.estado === 'cerrado') return res.status(409).json({ error: 'Este canje ya está cerrado.' });
      if (!puedeIr(canje.estado, 'cerrado')) {
        return res.status(409).json({ error: 'Todavía no llegó al punto de poder cerrarse.' });
      }
      const incompleto = bool(b.incompleto);
      const motivo = texto(b.cierre_motivo);
      // "Cerrar igual" es una decisión, no un atajo: exige el sub y un motivo. Queda marcado y en
      // la Fase 3 le baja el puntaje a ella.
      if (incompleto) {
        if (!puedeSubCanjes(perfil, canje.store, 'cerrar')) {
          return res.status(403).json({ error: 'No tenés permiso para cerrar un canje incompleto.' });
        }
        if (!motivo) return res.status(400).json({ error: 'para cerrar igual hace falta un motivo' });
      }

      // ⚠️ El balance lo CALCULA el cliente (`calcularBalance`, con tests) y acá se valida rango.
      // Es la regla de `api/_reclamos.js`: replicar aritmética en JS es la fuente conocida de
      // desincronización. Lo que el servidor no delega es la autorización, que está arriba.
      const balance = {};
      for (const k of ['balance_costo_productos', 'balance_costo_envio', 'balance_costo_plata',
        'balance_costo_total', 'balance_alcance', 'balance_interacciones', 'balance_cpm']) {
        const v = num(b[k]);
        if (v != null && v < 0) return res.status(400).json({ error: `${k} no puede ser negativo` });
        if (v != null) balance[k] = v;
      }
      const pm = num(b.balance_puntaje_manual);
      if (pm != null && (pm < 1 || pm > 5)) return res.status(400).json({ error: 'el puntaje va de 1 a 5' });
      if (pm != null) balance.balance_puntaje_manual = pm;
      if (b.balance_nota !== undefined) balance.balance_nota = texto(b.balance_nota);

      await apilar(supabase, 'canjes', canjeId, {
        estado: 'cerrado', at: ahora(), usuario, nota: incompleto ? `cerrado igual: ${motivo}` : 'cerrado',
      }, {
        ...balance,
        estado: 'cerrado',
        cerrado_incompleto: incompleto,
        cierre_motivo: motivo,
        cerrado_por: usuario,
        cerrado_at: ahora(),
        // El link deja de servir: el canje terminó.
        token: null,
        token_vence: null,
      });
      return res.status(200).json({ ok: true });
    }

    /**
     * Devolvió o vendió lo que le mandamos.
     *
     * Un flag y nada más: **no hay flujo de reingreso ni enganche con Reclamos**, a propósito.
     * Pasa dos veces al año, cada caso es distinto, y armar un flujo entero para eso es
     * complejidad que después nadie usa. Queda en el historial de la persona y en la Fase 3 le
     * baja el puntaje; si amerita, se la veta a mano.
     */
    if (action === 'no-conservado') {
      const motivo = texto(b.motivo);
      if (!motivo) return res.status(400).json({ error: 'hace falta el motivo' });
      await apilar(supabase, 'canjes', canjeId, { at: ahora(), usuario, nota: `no conservó el producto: ${motivo}` }, {
        producto_no_conservado: true,
        producto_no_conservado_motivo: motivo,
        producto_no_conservado_por: usuario,
        producto_no_conservado_at: ahora(),
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `acción desconocida: ${action}` });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 300) });
  }

  /**
   * El motivo por el que NO se le puede proponer un canje nuevo, o `null` si se puede.
   *
   * Mira **todos** los canjes de la persona, de todas las marcas: si debe algo en BDI, tampoco se
   * le propone en Zattia. Es el sentido del padrón único — si no, el bloqueo se esquiva cambiando
   * de marca.
   */
  /**
   * Un renglón por canje con entregables obligatorios vencidos: cuántos faltan y desde cuándo.
   *
   * Deriva lo mismo que `entregablesVencidos` en TS (obligatorio + fecha pasada + sin evidencia
   * verificada que lo complete), pero sobre el conjunto entero y en **dos** consultas, no una por
   * canje. Es lo que alimenta el aviso agrupado del sidebar.
   */
  async function resumenDeVencidos(canjes) {
    const abiertos = canjes.filter((c) => !TERMINALES.includes(c.estado)).map((c) => c.id);
    if (!abiertos.length) return [];
    const [ents, evis] = await Promise.all([
      supabase.from('canje_entregables').select('id, canje_id, tipo, cantidad_comprometida, obligatorio, vence_el').in('canje_id', abiertos),
      supabase.from('canje_evidencias').select('entregable_id, verificada').in('canje_id', abiertos),
    ]);
    const hoyISO = fechaISO(new Date());
    const verificadas = new Map();
    for (const e of evis.data || []) {
      if (!e.verificada || e.entregable_id == null) continue;
      verificadas.set(e.entregable_id, (verificadas.get(e.entregable_id) || 0) + 1);
    }
    const porCanje = new Map();
    for (const e of ents.data || []) {
      if (!e.obligatorio || !e.vence_el || e.vence_el >= hoyISO) continue;
      const comprometidas = Number(e.cantidad_comprometida) || 0;
      const cumplidas = Math.min(verificadas.get(e.id) || 0, comprometidas);
      if (cumplidas >= comprometidas) continue;
      const prev = porCanje.get(e.canje_id) || { cuantas: 0, desde: null };
      prev.cuantas += comprometidas - cumplidas;
      // La fecha del vencimiento más viejo: es la que ordena el aviso.
      const ts = Date.parse(e.vence_el) || 0;
      prev.desde = prev.desde == null ? ts : Math.min(prev.desde, ts);
      porCanje.set(e.canje_id, prev);
    }
    const porId = new Map(canjes.map((c) => [c.id, c]));
    return [...porCanje.entries()].map(([canjeId, v]) => ({
      canjeId,
      store: porId.get(canjeId)?.store || null,
      persona_id: porId.get(canjeId)?.persona_id || null,
      cuantas: v.cuantas,
      desde: v.desde || 0,
    }));
  }

  /**
   * Por qué NO se le puede proponer un canje a cada una de estas personas. Devuelve un `Map` con el
   * motivo en criollo, o `null` para las que están libres.
   *
   * 🔑 **Va en lote a propósito.** Son tres consultas, y son tres para una persona o para
   * veinticinco: llamarla por fila plantaría 75 idas a la base adentro de un solo request, que es
   * exactamente cómo se muere por timeout habiendo escrito la mitad del lote.
   */
  async function motivosDeBloqueo(personaIds) {
    const motivos = new Map(personaIds.map((id) => [id, null]));
    if (!personaIds.length) return motivos;

    const { data: suyos } = await supabase.from('canjes')
      .select('id, persona_id, estado').in('persona_id', personaIds)
      .not('estado', 'in', '(rechazado,cerrado,cancelado)');
    if (!suyos || !suyos.length) return motivos;

    const ids = suyos.map((c) => c.id);
    const dePersona = new Map(suyos.map((c) => [c.id, c.persona_id]));
    const [ents, evis] = await Promise.all([
      supabase.from('canje_entregables').select('*').in('canje_id', ids),
      supabase.from('canje_evidencias').select('canje_id, entregable_id, verificada').in('canje_id', ids),
    ]);
    const hoyISO = fechaISO(new Date());
    const verificadas = new Map();
    for (const e of evis.data || []) {
      if (!e.verificada || e.entregable_id == null) continue;
      verificadas.set(e.entregable_id, (verificadas.get(e.entregable_id) || 0) + 1);
    }
    for (const e of ents.data || []) {
      if (!e.obligatorio || !e.vence_el || e.vence_el >= hoyISO) continue;
      const cumplidas = Math.min(verificadas.get(e.id) || 0, Number(e.cantidad_comprometida) || 0);
      if (cumplidas >= (Number(e.cantidad_comprometida) || 0)) continue;
      const persona = dePersona.get(e.canje_id);
      // Gana el primero que aparece: alcanza con un vencido para no proponerle otro.
      if (persona != null && !motivos.get(persona)) {
        motivos.set(persona, `Tiene entregables vencidos del canje ${numeroCanje(e.canje_id)}. Resolvelo antes de proponerle otro.`);
      }
    }
    return motivos;
  }

  async function motivoDeBloqueo(personaId) {
    return (await motivosDeBloqueo([personaId])).get(personaId) || null;
  }
}

// `apilar` queda listo para la Fase 1 (los canjes en sí, que sí llevan historial de estados). En la
// Fase 0 las fichas se editan sin apilar: una nota ya es el registro de lo que pasó.
// Los espejos se exportan para que `tests/canjes-flujo.test.ts` los compare contra los de
// `lib/canjes/tipos.ts`. Es lo único que mantiene honesta la duplicación.
//
// Los cuatro del grafo y `seVaDelTope` se re-exportan desde `_canjes-reglas.js`: se mudaron ahí para
// que el portal público los use, y siguen saliendo por acá para no partir los tests en dos archivos
// según dónde vive hoy cada función.
export {
  apilar, entregablesDelBody, itemDeVitrinaDelBody, MOTIVOS_NO_ACEPTO, normalizarInstagram,
  numeroCanje, puedeIr, seVaDelTope, subQueApruebe, TERMINALES, TRANSICIONES,
};
