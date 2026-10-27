// Gastos comerciales del ERP — la puerta que llama el SERVIDOR del dashboard, no una persona.
//
//   GET ?recurso=gastos-puente&marca=bdi|zattia&desde=YYYY-MM-DD&hasta=YYYY-MM-DD     header  x-puente-auth: <secreto>
//     → { desde, hasta, total, por_tipo: { comision, impuesto, otro }, meses: [{ mes, total, por_tipo }], comisionAutomatica, cobrosSinComision }
//
// El dashboard muestra en Cierre de mes lo que cuesta vender (comisiones, impuestos, envíos de devolución), antes de la
// posición de mercadería y de los gastos operativos. Son los gastos REALES (⛔ `prueba:true`) y ⛔ el detalle fila por fila:
// el dashboard sólo necesita los totales.
//
// 🔑 Misma llave que `adelantos-puente` (`DASHBOARD_PUENTE_SECRET` acá, `PUENTE_SECRET` allá). Archivo aparte, sin sesión,
// por el mismo criterio: un verbo abierto no convive con verbos con login. Suma las líneas de la marca con
// `gastosDelPeriodo` (la misma cuenta que ve el ERP, ⛔ una segunda).
import { timingSafeEqual } from 'node:crypto';
import { configPg } from '../lib/pg.core.js';
import { gastosDelPeriodo } from './_erp-gastos.js';

const PG_DE_MARCA = { bdi: 'DATABASE_URL_BDI', zattia: 'DATABASE_URL_ZATTIA' };

function sobreValido(req) {
  const esperado = process.env.DASHBOARD_PUENTE_SECRET;
  const recibido = String(req.headers['x-puente-auth'] || '');
  // Falla CERRADA: sin secreto configurado no entra nadie.
  if (!esperado || esperado.length < 32) return false;
  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(recibido, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Sólo lectura: abre la conexión de la marca y la cierra. */
async function conMotor(marca, que, fn) {
  const conexion = process.env[PG_DE_MARCA[marca]];
  if (!conexion) return { status: 409, error: `${que} todavía no está conectado: falta la conexión del motor en Vercel.` };
  const { default: pg } = await import('pg');
  const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: 5000, statement_timeout: 15000 });
  try {
    await db.connect();
    return await fn(db);
  } finally {
    await db.end().catch(() => {});
  }
}

export default async function handler(req, res, deps = { conMotor }) {
  if (!sobreValido(req)) return res.status(401).json({ error: 'Sobre inválido.' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' });

  const r = await gastosDelPeriodo(
    { marca: String(req.query?.marca || ''), desde: String(req.query?.desde || ''), hasta: String(req.query?.hasta || ''), prueba: false },
    deps,
  );
  if (r.status) return res.status(r.status).json({ error: r.error });
  const { desde, hasta, total, por_tipo, meses, comisionAutomatica, cobrosSinComision } = r;
  return res.status(200).json({ desde, hasta, total, por_tipo, meses, comisionAutomatica, cobrosSinComision });
}
