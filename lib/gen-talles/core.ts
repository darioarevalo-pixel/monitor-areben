/**
 * Lógica pura de la Tabla de talles: parseo de talles, limpieza de la grilla,
 * generación del HTML (lo que se pega en Tienda Nube), detección del tipo por
 * nombre, emparejado de una tabla vieja importada, y la lista de pendientes.
 * Port de genTallesHTML/_gtTipoDesdeNombre/genTallesImportar/gtRenderPendientes
 * (index.html:7264-7561), sin DOM ni globales.
 *
 * `genTallesHTML` es la superficie sensible: su salida se pega en las descripciones
 * de TN, así que va con paridad BYTE-IDÉNTICA contra el legacy (test con la función
 * extraída). Por eso `esc` se copia literal del legacy (index.html:3075).
 */

import { matchTn, type IndiceTn, type TnProducto } from '../tn'
import type { Plantilla, TablaGuardada } from './plantillas'

/** Escape HTML idéntico al `esc` del legacy (index.html:3075). No tocar: rige la paridad byte. */
export function esc(s: unknown): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Talles desde el input de texto: separados por coma o salto de línea. Port de _gtTalles. */
export function parseTalles(str: string): string[] {
  return (str || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
}

/**
 * Saca de `gtData` las claves que ya no corresponden a ningún talle×medida vigente.
 * Port de la limpieza al inicio de genTallesBuildGrid. Devuelve una copia nueva.
 */
export function limpiarData(gtData: Record<string, string>, plantilla: Plantilla, talles: string[]): Record<string, string> {
  const validas = new Set<string>()
  talles.forEach((t) => plantilla.medidas.forEach((m) => validas.add(t + '|' + m.letra)))
  const out: Record<string, string> = {}
  Object.keys(gtData).forEach((k) => {
    if (validas.has(k)) out[k] = gtData[k]
  })
  return out
}

/**
 * El HTML autónomo (estilos inline) que se pega en la descripción de TN. Tabla
 * transpuesta (medidas en filas, talles en columnas) + info + cómo se mide, envuelto
 * en la firma AREBEN-TALLES. Port BYTE-IDÉNTICO de genTallesHTML.
 */
export function generarHtml(plantilla: Plantilla, talles: string[], gtData: Record<string, string>): string {
  const p = plantilla
  const u = esc(p.unidad || 'cm')
  const cel = 'border:1px solid #ddd;padding:8px;text-align:center;'
  const lab = (m: { letra: string; nombre: string }) => esc(m.letra.toLowerCase()) + '. ' + esc(m.nombre)

  let tabla = '<table style="border-collapse:collapse;width:100%;font-size:14px;">'
  tabla += `<thead><tr style="background:#111;color:#fff;"><th style="${cel}text-align:left;">Talle</th>` + talles.map((t) => `<th style="${cel}">${esc(t)}</th>`).join('') + '</tr></thead><tbody>'
  p.medidas.forEach((m, i) => {
    const bg = i % 2 ? 'background:#f7f7f7;' : ''
    tabla += `<tr style="${bg}"><td style="${cel}text-align:left;font-weight:bold;">${lab(m)}</td>` + talles.map((t) => `<td style="${cel}">${esc(gtData[t + '|' + m.letra] || '-')}</td>`).join('') + '</tr>'
  })
  tabla += '</tbody></table>'

  let h = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#222;">'
  h += `<h3 style="text-align:center;font-size:16px;margin:0 0 14px;">Tabla de talles — ${esc(p.nombre)}</h3>`
  h += tabla
  h += '<div style="font-size:12px;color:#666;margin-top:16px;"><b>Info</b>' + `<ul style="margin:4px 0 0;padding-left:18px;"><li>Las medidas están expresadas en ${u}.</li>` + '<li>Puede haber una mínima variación.</li>' + '<li>Las medidas son tomadas sobre superficies planas, sin estirar.</li></ul></div>'
  h += '<div style="font-size:12px;color:#444;margin-top:14px;line-height:1.5;"><b style="color:#222;">Cómo se mide</b><div style="margin-top:4px;">' + p.medidas.map((m) => `<div style="margin-bottom:5px;"><b>${lab(m)}:</b> ${esc(m.comoMedir || '')}</div>`).join('') + '</div></div>'
  h += '</div>'
  return '<!--AREBEN-TALLES-INI-->' + h + '<!--AREBEN-TALLES-FIN-->'
}

/**
 * Detecta el tipo de prenda a partir del nombre del producto (ej. "Jean Río" →
 * jean). Si hay varias coincidencias, gana la que aparece primero. Port de
 * _gtTipoDesdeNombre.
 */
export function tipoDesdeNombre(name: string, plantillas: Record<string, Plantilla>): string | null {
  const sinAcento = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const n = sinAcento(name)
  let bestKey: string | null = null
  let bestIdx = Infinity
  for (const [k, p] of Object.entries(plantillas)) {
    const term = sinAcento(p.nombre).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const mm = n.match(new RegExp('\\b' + term))
    if (mm && mm.index !== undefined && mm.index < bestIdx) {
      bestIdx = mm.index
      bestKey = k
    }
  }
  return bestKey
}

/** Una medida leída de una tabla vieja: su nombre de fila y el valor por talle. */
export type MedidaImportada = { nombre: string; valores: Record<string, string> }

/**
 * Empareja las medidas de una tabla vieja (ya extraída del HTML) con las de la
 * plantilla elegida, por NOMBRE (3 pases: exacto → contención → palabra común) y con
 * fallback por posición. Devuelve el `gtData` (claves `talle|letra`). Port de la
 * lógica pura de genTallesImportar (index.html:7456-7468), sin el DOMParser.
 */
export function emparejarMedidas(talles: string[], medidas: MedidaImportada[], plantilla: Plantilla): Record<string, string> {
  const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const usadas = new Set<MedidaImportada>()
  const asignadas = new Set<string>()
  const gtData: Record<string, string> = {}
  const asignar = (m: { letra: string }, fila: MedidaImportada) => {
    usadas.add(fila)
    asignadas.add(m.letra)
    talles.forEach((t) => {
      gtData[t + '|' + m.letra] = fila.valores[t] || ''
    })
  }
  const medsPlant = plantilla.medidas || []
  // Pase 1: nombre exacto
  medsPlant.forEach((m) => {
    const f = medidas.find((r) => !usadas.has(r) && norm(r.nombre) === norm(m.nombre))
    if (f) asignar(m, f)
  })
  // Pase 2: uno contiene al otro
  medsPlant.forEach((m) => {
    if (asignadas.has(m.letra)) return
    const a = norm(m.nombre)
    const f = medidas.find((r) => {
      if (usadas.has(r)) return false
      const b = norm(r.nombre)
      return b !== '' && (a.includes(b) || b.includes(a))
    })
    if (f) asignar(m, f)
  })
  // Pase 3: comparten una palabra significativa (>3 letras)
  medsPlant.forEach((m) => {
    if (asignadas.has(m.letra)) return
    const wa = norm(m.nombre).split(/\s+/).filter((w) => w.length > 3)
    const f = medidas.find((r) => {
      if (usadas.has(r)) return false
      const wb = norm(r.nombre).split(/\s+/)
      return wa.some((w) => wb.includes(w))
    })
    if (f) asignar(m, f)
  })
  // Fallback: nada emparejado por nombre → por posición.
  if (asignadas.size === 0) {
    medidas.forEach((mm, idx) => {
      const letra = String.fromCharCode(65 + idx)
      talles.forEach((t) => {
        gtData[t + '|' + letra] = mm.valores[t] || ''
      })
    })
  }
  return gtData
}

/** ¿La descripción de TN ya tiene una tabla? (firma propia o cualquier <table>). Port de _mktTieneTabla. */
export function tieneTablaVieja(rawDesc: string | undefined): boolean {
  const d = rawDesc || ''
  return /AREBEN-TALLES-INI/.test(d) || /<table/i.test(d)
}

/** Un producto pendiente de tabla de talles. */
export type Pendiente = {
  tn: TnProducto
  nombre: string
  stock: number
  categoriasTN: string[]
  ingresoMes: string | null
  tablaVieja: boolean
}

/** El producto GN mínimo que consume la lista de pendientes. */
export type ProductoGN = { name?: string | null; sku?: string | null; stock?: number; ingresoMes?: string | null }

/**
 * Base de pendientes: por cada producto GN, lo matchea contra TN y lo incluye si
 * está en TN, todavía NO está en nuestro registro de tablas cargadas (`guardadas`),
 * y tiene una tabla vieja o una descripción. Port de la base de gtRenderPendientes
 * (index.html:7528-7530) reusando `matchTn` (= _mktFindTN). Los filtros de la UI
 * (estado/categoría/mes/stock) se aplican aparte con `filtrarPendientes`.
 */
export function computarPendientes(productos: ProductoGN[], idx: IndiceTn, guardadas: Record<string, TablaGuardada>): Pendiente[] {
  const out: Pendiente[] = []
  for (const gn of productos || []) {
    const tn = matchTn(gn, idx)
    if (!tn) continue
    if (guardadas[String(tn.id)]) continue
    const vieja = /<table/i.test(tn.raw_desc || '')
    if (!vieja && !tn.has_desc) continue
    out.push({
      tn,
      nombre: gn.name || tn.name || '',
      stock: gn.stock || 0,
      categoriasTN: tn.categories || [],
      ingresoMes: gn.ingresoMes || (tn.created_at ? tn.created_at.substring(0, 7) : null),
      tablaVieja: vieja,
    })
  }
  return out
}

export type FiltrosPendientes = { estado: 'todas' | 'vieja' | 'sin'; categoria: string; mes: string; soloStock: boolean }

/** Aplica los filtros de la UI y ordena por stock desc. Port de la 2ª mitad de gtRenderPendientes. */
export function filtrarPendientes(base: Pendiente[], f: FiltrosPendientes): Pendiente[] {
  let items = base.slice()
  if (f.estado === 'vieja') items = items.filter((x) => x.tablaVieja)
  else if (f.estado === 'sin') items = items.filter((x) => !x.tablaVieja)
  if (f.soloStock) items = items.filter((x) => x.stock > 0)
  if (f.categoria) items = items.filter((x) => x.categoriasTN.includes(f.categoria))
  if (f.mes) items = items.filter((x) => x.ingresoMes === f.mes)
  items.sort((a, b) => b.stock - a.stock)
  return items
}
