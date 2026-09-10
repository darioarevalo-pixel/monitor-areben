/**
 * Qué es un CÓDIGO y qué es una descripción — la regla, con nombre, en un solo lugar.
 *
 * Nació el 10-sep-2026 de un caso real: se cargaron 152 prendas escaneando el SKU dentro del campo
 * «Cargalo sin código», que es un input de texto que dispara con Enter. El lector tipea el código y
 * ese código quedó guardado como NOMBRE del producto, con el SKU vacío ⇒ la devolución no lo
 * encontraba nunca (`resolverItem` prueba vid → sku → barcode, y los tres estaban vacíos).
 */

/**
 * Normaliza un código para COMPARARLO: mayúsculas y sólo `A-Z0-9`.
 *
 * Es lo que hace que `RVE-0047-NG` (el SKU en Gestión Nube) y `RVE0047NG` (su código de barras, que
 * es el mismo sin guiones) sean la misma cosa.
 *
 * 🔴 **Se usa como FALLBACK, nunca como primer intento.** Borrar los guiones fusiona el espacio de
 * los SKU con el de los códigos de barras: medido sobre el ETL de BDI, **894 claves normalizadas
 * son a la vez un barcode y un SKU**, y 3 de ellas apuntan a variantes distintas. El match exacto
 * va primero y esto después, así lo que hoy anda sigue andando igual.
 */
export function normCodigo(s: unknown): string {
  return String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * ¿Este texto es un código, o es algo que escribió una persona?
 *
 * Sin espacios, al menos 3 caracteres, y sólo letras, números y separadores. `RVE0047NG` sí;
 * `Remera estampa X` no.
 *
 * ⚠️ **⛔ No dice a qué producto corresponde, y no puede decirlo.** En Zattia un SKU puede ser
 * literalmente el nombre del producto (`ANGELINA`, `BABY TEE HOT`, `CORSET FRANK`), así que ninguna
 * heurística de forma separa un código de un nombre. Lo único que contesta esta función es «¿esto
 * lo tipeó alguien o lo escupió un lector?»; **a qué producto pertenece lo contesta el cruce contra
 * el espejo** (`lib/sesionfotos/vincular.ts`), que es una medición y no una suposición.
 */
export function pareceCodigo(t: unknown): boolean {
  const s = String(t ?? '').trim()
  return s.length >= 3 && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(s) && /[A-Za-z0-9]/.test(s)
}
