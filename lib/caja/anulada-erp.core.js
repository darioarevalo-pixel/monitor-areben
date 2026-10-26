// Caja — la venta de la Caja que se ANULA en el ERP (Stunned, 26-oct): queda anotada en `caja_venta.anulada`
// ({ por, en, motivo }) y el cierre del turno ya no la suma (`resumenTurno`: `en_erp && anulada`).
// Sólo las del ERP (`destino = 'erp'`): una de GN anulada en el ERP ⛔ cambia lo que el cierre cuenta (la plata
// salió por GN). Anotada una vez ⛔ se pisa. ⛔ Frena la anulación: ya está hecha en el motor; quien llama loguea.

/**
 * @param {any} sb supabase de la base de la Caja
 * @param {string} ventaCajaId `caja_venta.id` (= `venta.origen_ref` de una venta de origen `caja`)
 * @param {{ por: string | null, motivo: string, ahora?: Date }} datos
 * @returns {Promise<{ anotada: boolean, error?: string }>}
 */
export async function anotarAnuladaDelErp(sb, ventaCajaId, { por, motivo, ahora = new Date() }) {
  const { data, error } = await sb.from('caja_venta')
    .update({ anulada: { por: por || 'erp', en: ahora.toISOString(), motivo } })
    .eq('id', ventaCajaId).eq('destino', 'erp').is('anulada', null)
    .select('id');
  if (error) return { anotada: false, error: error.message };
  return { anotada: (data || []).length > 0 };
}
