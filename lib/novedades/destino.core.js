/**
 * A quién le llega una novedad.
 *
 * En `.js` plano porque **el filtro corre en el servidor** (`api/_sistema.js`) y no en la pantalla.
 * Filtrar sólo en el cliente sería peor que no filtrar: una novedad que "no es para vos" igual te
 * encendería el badge y —si es importante— te frenaría con el cartel al entrar. Y los handlers de
 * `api/*.js` no pueden importar TypeScript (ver `lib/permisos.core.js`).
 *
 * Tres formas, y ninguna es "elegir gente":
 *
 *   { tipo: 'todos' }                      — el default. Novedades del sistema en general.
 *   { tipo: 'seccion', key: 'atencion' }   — le llega a quien puede VER esa pantalla.
 *   { tipo: 'roles', roles: ['local'] }    — le llega a quien tenga alguna de esas funciones.
 *
 * La de sección es la que menos hay que mantener: los destinatarios salen de los permisos que ya
 * existen, así que si mañana alguien gana o pierde el acceso a una pantalla, la lista se ajusta
 * sola. La de roles está para lo que no es de una pantalla ("cambia el horario del depósito").
 *
 * # La marca es un filtro APARTE, no una cuarta forma
 *
 * Cualquiera de las tres puede además acotarse a una marca (`marca: 'bdi' | 'zattia'`), y ausente
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

/** Normaliza lo que venga de la base o del cuerpo de un POST. Ante la duda, para todos. */
export function normalizarDestino(d) {
  if (!d || typeof d !== 'object') return TODOS;
  const marca = marcaValida(d.marca);
  if (d.tipo === 'seccion' && typeof d.key === 'string' && d.key) return conMarca({ tipo: 'seccion', key: d.key }, marca);
  if (d.tipo === 'roles') {
    const roles = Array.isArray(d.roles) ? d.roles.filter((r) => typeof r === 'string' && r) : [];
    // Una lista de roles vacía sería una novedad que no le llega a NADIE, que no es lo que nadie
    // quiso escribir: se cae a todos, que es el default visible y no un silencio. La marca se
    // conserva: "para Zattia" es lo único que quedó dicho, y descartarlo sería ampliar el reparto.
    return conMarca(roles.length ? { tipo: 'roles', roles } : { tipo: 'todos' }, marca);
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
