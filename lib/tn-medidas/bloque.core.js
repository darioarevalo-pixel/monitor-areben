/**
 * El bloque de medidas que se pega en la descripción de TiendaNube.
 *
 * 🔴 **Usa la MISMA firma que el generador viejo** (`<!--AREBEN-TALLES-INI-->`), a propósito: es
 * el mismo lugar de la ficha y tiene que **reemplazar** la tabla que ya está, ⛔ no sumarse. Dos
 * tablas de talles en la misma descripción es el modo de falla obvio, y del lado de TiendaNube no
 * hay historial para darse cuenta. La firma la conocen las tres puntas: `bloques.core.js`,
 * `prosa.ts` y `bdi-catalogo/api/_desc-talles.js`.
 *
 * # En qué se diferencia del que había
 *
 * | | el viejo (`lib/gen-talles/core.ts`) | éste |
 * |---|---|---|
 * | de dónde salen los números | un formulario que no guardaba en ninguna base | la tabla `tn_medidas` |
 * | qué mide | `Contorno busto`, `Ancho de hombros`, `Contorno cadera`, `Tiro` | lo que mide la guía de Bruno |
 * | una medida sin números | sale igual, con `-` en cada celda | ⛔ la fila no sale |
 * | la cintura | se publica lo que alguien tipeó | se publica ×2, siempre |
 * | los rótulos | letras (`a. Contorno busto`) | la palabra, como en el dibujo |
 *
 * 🔑 **Los rótulos dejan de ser letras** porque los dibujos de la guía ⛔ no tienen letras: rotulan
 * con la palabra (ANCHO, LARGO, LARGO DE MANGA). Publicar «a.» al lado de un dibujo sin «a» manda
 * a la clienta a buscar algo que en la imagen no está.
 */

import { esc } from '../esc.core.js';
import { filasDe } from './medidas.core.js';

const MARK_INI = '<!--AREBEN-TALLES-INI-->';
const MARK_FIN = '<!--AREBEN-TALLES-FIN-->';

const CEL = 'border:1px solid #ddd;padding:8px;text-align:center;';

/**
 * El HTML de la tabla, o `''` si no hay un solo número que publicar.
 *
 * 🔴 **La cadena vacía es una respuesta, ⛔ no un error**: hay prendas que no llevan tabla —de las
 * 111 sin medidas, 60 son de una tela que estira— y hay prendas a las que todavía nadie midió. En
 * los dos casos lo correcto es que la ficha no tenga tabla, ⛔ no que tenga una tabla vacía: medido
 * el 1-sep-2026, hay **5 productos publicados** (VESTIDO SOLANA, VERONA, MALIA, AMBAR y MONO
 * TIARE) que dicen «CINTURA (CONTORNO TOTAL) CM», sin número, porque alguien la publicó igual.
 */
export function htmlDeMedidas(familia, ficha, talles, cargadas) {
  const filas = filasDe(familia, ficha, talles, cargadas);
  if (!filas.length) return '';

  const cols = talles && talles.length ? talles : [''];
  const conTalles = cols.length > 1 || cols[0] !== '';

  let tabla = '<table style="border-collapse:collapse;width:100%;font-size:14px;">';
  tabla += `<thead><tr style="background:#111;color:#fff;"><th style="${CEL}text-align:left;">Medida</th>`;
  // Sin eje de talle la columna se llama «Medida» y no «Talle único»: la prenda no tiene talles,
  // así que ponerle nombre a una columna que no lo tiene es inventar un eje.
  tabla += cols.map((t) => `<th style="${CEL}">${conTalles ? esc(t) : 'cm'}</th>`).join('');
  tabla += '</tr></thead><tbody>';
  filas.forEach((f, i) => {
    const bg = i % 2 ? 'background:#f7f7f7;' : '';
    tabla += `<tr style="${bg}"><td style="${CEL}text-align:left;font-weight:bold;">${esc(f.label)}</td>`;
    // Una celda vacía adentro de una fila que SÍ tiene números es un talle que quedó sin medir, y
    // eso se dice con un guion: es distinto de la fila entera, que directamente no sale.
    tabla += cols.map((_, j) => `<td style="${CEL}">${f.valores[j] == null ? '-' : esc(f.valores[j])}</td>`).join('');
    tabla += '</tr>';
  });
  tabla += '</tbody></table>';

  let h = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#222;">';
  h += '<h3 style="text-align:center;font-size:16px;margin:0 0 14px;">Medidas de la prenda</h3>';
  h += tabla;
  // 🔴 Esta línea es la que faltaba, y es la que hacía que la ficha se contradijera sola: el bloque
  // viejo decía «tomadas sobre superficies planas» arriba y «medir alrededor de toda la cintura»
  // diez líneas abajo. Acá se dice UNA vez y coincide con el número publicado.
  h += '<div style="font-size:12px;color:#666;margin-top:16px;">' +
    '<b>Cómo están tomadas</b>' +
    '<ul style="margin:4px 0 0;padding-left:18px;">' +
    '<li>Con la prenda apoyada y plana, sin estirar.</li>' +
    '<li>En centímetros, y puede haber una mínima variación.</li>' +
    '<li>Las medidas que no figuran son de partes elastizadas, que se adaptan al cuerpo.</li>' +
    '</ul></div>';
  h += '<div style="font-size:12px;color:#444;margin-top:14px;line-height:1.5;"><b style="color:#222;">Dónde se mide cada una</b><div style="margin-top:4px;">';
  h += filas.map((f) => `<div style="margin-bottom:5px;"><b>${esc(f.label)}:</b> ${esc(f.comoMedir)}</div>`).join('');
  h += '</div></div></div>';

  return MARK_INI + h + MARK_FIN;
}

export { MARK_INI, MARK_FIN };
