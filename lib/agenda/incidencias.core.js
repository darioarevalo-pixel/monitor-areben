// ⚠️ Incidencias del trabajo (Darío, 20-oct-2026): «algo roto, insumo u otro, porque los otros los
// reportan desde el POS». Las ve y las contesta SÓLO Darío (`quienesSeEnteran`); cada una del equipo
// ve las suyas. Todas le suenan al celular; las urgentes con 🔴 en el título.

export const TIPOS_INCIDENCIA = [
  { key: 'roto', label: 'Algo roto', icono: '🛠️' },
  { key: 'insumos', label: 'Insumos', icono: '🧹' },
  { key: 'otro', label: 'Otro', icono: '💬' },
]

export function tipoIncidencia(key) {
  return TIPOS_INCIDENCIA.find((t) => t.key === key) || null
}

/** Valida lo que manda la pantalla. Lanza con el motivo, en palabras de la pantalla. */
export function incidenciaValida(b) {
  const tipo = String((b && b.tipo) || '')
  if (!tipoIncidencia(tipo)) throw new Error('Elegí qué pasó: Algo roto, Insumos u Otro.')
  const texto = String((b && b.texto) || '').trim()
  if (!texto) throw new Error('Contá en una frase qué pasó.')
  if (texto.length > 1000) throw new Error('El texto es muy largo (hasta 1.000 letras).')
  return { tipo, texto, urgente: !!(b && b.urgente) }
}

export function mensajeValido(t) {
  const texto = String(t || '').trim()
  if (!texto) throw new Error('Escribí la respuesta.')
  if (texto.length > 1000) throw new Error('El texto es muy largo (hasta 1.000 letras).')
  return texto
}

/** El título del aviso que le llega a Darío. */
export function tituloAviso(inc, nombre) {
  const t = tipoIncidencia(inc.tipo)
  return `${inc.urgente ? '🔴 Urgente · ' : ''}${nombre}: ${t ? t.label : 'Incidencia'}`
}
