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
 */

import { esAdmin, marcasConAcceso } from '../permisos.core.js';

export const TODOS = { tipo: 'todos' };

/** Normaliza lo que venga de la base o del cuerpo de un POST. Ante la duda, para todos. */
export function normalizarDestino(d) {
  if (!d || typeof d !== 'object') return TODOS;
  if (d.tipo === 'seccion' && typeof d.key === 'string' && d.key) return { tipo: 'seccion', key: d.key };
  if (d.tipo === 'roles') {
    const roles = Array.isArray(d.roles) ? d.roles.filter((r) => typeof r === 'string' && r) : [];
    // Una lista de roles vacía sería una novedad que no le llega a NADIE, que no es lo que nadie
    // quiso escribir: se cae a todos, que es el default visible y no un silencio.
    return roles.length ? { tipo: 'roles', roles } : TODOS;
  }
  return TODOS;
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
  if (d.tipo === 'todos') return true;

  // El admin recibe todo. No es un privilegio: es el que tiene que darse cuenta si algo se mandó
  // al grupo equivocado, y para eso lo tiene que recibir.
  if (esAdmin(perfil)) return true;

  if (d.tipo === 'seccion') {
    // En ALGUNA marca alcanza: una novedad no tiene marca, así que no puede preguntar por una.
    return marcasConAcceso(perfil, d.key, ['bdi', 'zattia']).length > 0;
  }

  const mias = Array.isArray(perfil.funcion) ? perfil.funcion : perfil.funcion ? [perfil.funcion] : [];
  return d.roles.some((r) => mias.includes(r));
}
