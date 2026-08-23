/**
 * A quién le llega una novedad.
 *
 * En `.js` plano porque **el filtro corre en el servidor** (`api/_sistema.js`) y no en la pantalla.
 * Filtrar sólo en el cliente sería peor que no filtrar: una novedad que "no es para vos" igual te
 * encendería el badge y —si es importante— te frenaría con el cartel al entrar. Y los handlers de
 * `api/*.js` no pueden importar TypeScript (ver `lib/permisos.core.js`).
 *
 * Cuatro formas, y sólo la última elige gente:
 *
 *   { tipo: 'todos' }                        — el default. Novedades del sistema en general.
 *   { tipo: 'seccion', key: 'atencion' }     — le llega a quien puede VER esa pantalla.
 *   { tipo: 'roles', roles: ['local'] }      — le llega a quien tenga alguna de esas funciones.
 *   { tipo: 'personas', personas: ['sofi'] } — le llega SÓLO a esa gente, por nombre de usuario.
 *
 * La de sección es la que menos hay que mantener: los destinatarios salen de los permisos que ya
 * existen, así que si mañana alguien gana o pierde el acceso a una pantalla, la lista se ajusta
 * sola. La de roles está para lo que no es de una pantalla ("cambia el horario del depósito").
 *
 * # La cuarta llegó por la Agenda, el 23-ago-2026
 *
 * Las doce rutinas de marketing se habían cargado con `roles:['marketing']` porque no había otra
 * forma, y Sofi, Cande y Cami comparten el rol ⇒ **las doce le salían a las tres**. Una lista donde
 * ocho de doce renglones son de otra es una lista que se deja de mirar, que es exactamente lo que
 * la Agenda viene a evitar.
 *
 * 🔑 **La clave es `perfil.name` y NO el mail.** Es la única que existe para todos: los puestos
 * compartidos (`Local`, `Depósito`, `bdilocal`) tienen `email: null` porque no pueden tener casilla
 * de Workspace. De yapa, entonces, algo se le puede dirigir a un PUESTO y no sólo a una persona. Y
 * `name` ya es la clave con la que se guardan `agenda_items.autor` y `agenda_hechos.usuario`: la
 * misma columna, la misma pregunta.
 *
 * # La marca es un filtro APARTE, no una quinta forma
 *
 * Cualquiera de las cuatro puede además acotarse a una marca (`marca: 'bdi' | 'zattia'`), y ausente
 * significa las dos. Es lo que faltaba: una novedad del local de Zattia le llegaba igual al local
 * de BDI, porque el rol `local` no distingue de qué local se habla.
 *
 * 🔑 **La marca acota a QUIÉN le llega; la novedad sigue sin ser de una marca.** Por eso entra acá
 * y no como columna `store` de la tabla: duplicarla por marca duplicaría el registro de lectura y
 * mostraría el cartel dos veces al cambiar de marca (ver `sql/migrate-novedades.sql`). Sigue siendo
 * una sola fila, con una sola lectura y un solo cartel.
 */

import { esAdmin, marcasConAcceso } from '../permisos.core.js';

export const TODOS = { tipo: 'todos' };

const MARCAS = ['bdi', 'zattia'];

/** La marca sólo si es una de verdad. Cualquier otra cosa se descarta: sin marca = las dos. */
const marcaValida = (m) => (MARCAS.includes(m) ? m : null);
const conMarca = (base, marca) => (marca ? { ...base, marca } : base);

/** Los nombres que vienen como texto y no vacíos. Lo mismo que se le pide a los roles. */
const listaDeTextos = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);

/** Normaliza lo que venga de la base o del cuerpo de un POST. Ante la duda, para todos. */
export function normalizarDestino(d) {
  if (!d || typeof d !== 'object') return TODOS;
  const marca = marcaValida(d.marca);
  if (d.tipo === 'seccion' && typeof d.key === 'string' && d.key) return conMarca({ tipo: 'seccion', key: d.key }, marca);
  if (d.tipo === 'roles') {
    const roles = listaDeTextos(d.roles);
    // Una lista de roles vacía sería una novedad que no le llega a NADIE, que no es lo que nadie
    // quiso escribir: se cae a todos, que es el default visible y no un silencio. La marca se
    // conserva: "para Zattia" es lo único que quedó dicho, y descartarlo sería ampliar el reparto.
    return conMarca(roles.length ? { tipo: 'roles', roles } : { tipo: 'todos' }, marca);
  }
  if (d.tipo === 'personas') {
    // Misma regla que los roles, y por el mismo motivo: sin nadie elegido no es "para nadie", es
    // que no se terminó de decir. ⚠️ Acá pesa más que en los roles, porque un destino por nombre
    // no lo cubre ningún permiso: si cayera en el vacío, el pendiente no existiría para nadie.
    const personas = listaDeTextos(d.personas);
    return conMarca(personas.length ? { tipo: 'personas', personas } : { tipo: 'todos' }, marca);
  }
  return conMarca({ tipo: 'todos' }, marca);
}

/**
 * ¿Esta novedad es para esta persona?
 *
 * ⚠️ **Esto NO es lo mismo que "la puede ver"**: quien publica ve todas en la sección, porque las
 * tiene que administrar. Esto contesta la otra pregunta —¿le suma al badge, la frena el cartel?— y
 * la respuesta puede ser "no" incluso para el que la escribió.
 */
export function esParaMi(destino, perfil) {
  if (!perfil) return false;
  const d = normalizarDestino(destino);

  // 🔑 **Lo que tiene nombre y apellido NO lo recibe el admin**, y por eso este caso va ARRIBA del
  // atajo de abajo. Un pendiente dirigido a alguien es de esa persona: si el admin lo recibiera,
  // el "Hoy" del que carga las rutinas sería la suma de los "Hoy" de los quince —que es justo la
  // lista que nadie mira—. Lo decidió Bruno el 23-ago-2026, viendo las doce de marketing en el suyo.
  // 🔴 Consecuencia: `paraMi` es también el candado del tilde (`api/_agenda.js`), así que el admin
  // ve el pendiente ajeno en "Cargar" y en "Cumplimiento", lo edita y lo borra, pero NO lo tilda.
  // La marca no se pregunta: elegir a alguien por nombre ya dijo todo lo que había que decir.
  if (d.tipo === 'personas') return d.personas.includes(perfil.name);

  // El admin recibe todo. No es un privilegio: es el que tiene que darse cuenta si algo se mandó
  // al grupo equivocado, y para eso lo tiene que recibir.
  // 🔴 Consecuencia práctica: **el filtro no se puede verificar con un usuario admin**, porque le
  // da verdadero a todo. Para eso están los usuarios `prueba-*` del padrón.
  if (esAdmin(perfil)) return true;

  if (d.tipo === 'seccion') {
    // La marca, si está, acota las candidatas antes de preguntar por el permiso — y así "para quien
    // usa Atención en Zattia" no le llega a quien sólo la tiene tildada en BDI. Sin marca son las
    // dos, y con que la vea en ALGUNA alcanza. `marcasConAcceso` ya hace valer la cuenta fija.
    return marcasConAcceso(perfil, d.key, d.marca ? [d.marca] : MARCAS).length > 0;
  }

  // Para "todos" y para los roles no hay pantalla a la que preguntarle, así que la marca la
  // contesta la cuenta fija: queda afuera **sólo quien está clavado en la otra**. Quien ve las dos
  // trabaja en las dos, y una novedad del local de Zattia le sigue haciendo falta.
  if (d.marca && perfil.cuenta && perfil.cuenta !== d.marca) return false;

  if (d.tipo === 'todos') return true;

  const mias = Array.isArray(perfil.funcion) ? perfil.funcion : perfil.funcion ? [perfil.funcion] : [];
  return d.roles.some((r) => mias.includes(r));
}
