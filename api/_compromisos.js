// Compromisos de pago — tabla `compromisos_pago` (ver sql/migrate-compromisos-pago.sql).
//
//   GET  ?recurso=compromisos                                → { ok, compromisos, puede }
//   POST { recurso:'compromisos', action:'crear', compromiso }
//   POST { recurso:'compromisos', action:'estado', id, estado }
//   POST { recurso:'compromisos', action:'confirmar', id, monto_real, fecha }
//   POST { recurso:'compromisos', action:'vincular', id, cliente_id, cliente_nombre, cliente_store }
//
// Un compromiso es "este cliente le va a transferir a este acreedor". Se anota mientras la plata
// TODAVÍA NO se movió, que es justo el rato que hoy no queda registrado en ningún lado.
//
// # El único verbo que sale de esta casa es `confirmar`
//
// Crear un compromiso y cambiarle el estado son cosas de acá. `confirmar` es distinto: escribe pagos
// REALES en el ledger del dashboard, por su puerta de servicio. Por eso es el único que:
//   - pide su propio permiso (`acreedores.confirmar`, aparte de `acreedores.prometer`),
//   - manda el `operacion_id` que nació con el compromiso, para que reintentar no duplique pagos,
//   - archiva lo que devolvió la puerta (`pagos_dashboard`), que es la trazabilidad para poder ir
//     del compromiso al renglón del ledger sin buscar a ojo.
//
// # 🔑 Si la puerta escribió y nosotros no llegamos a anotarlo
//
// El orden es: llamar a la puerta → anotar acá. Si el segundo paso falla, el pago quedó hecho y el
// compromiso figura sin confirmar. **Eso NO se arregla reintentando a ciegas**, y por eso el
// `operacion_id` no se genera acá sino que viene con el compromiso: el reintento manda el mismo
// número, la puerta lo reconoce y devuelve lo de la primera vez sin escribir nada. El segundo
// intento termina de anotar lo que faltó.
//
// ⛔ Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby admite 12 funciones.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { esAdmin, marcasConAcceso, puedeSub } from '../lib/permisos.core.js';
// La misma cuenta que hacen los dos formularios de confirmar, no una copia parecida: el aviso de
// "entró de menos" y el compromiso del resto que se abre acá tienen que dar SIEMPRE el mismo número.
import { redondear, restante, sePuedeComprometer } from '../lib/compromisos/plata.core.js';
import { leerAcreedoresDelDashboard } from '../lib/acreedores/puente.core.js';
// Las cuentas manuales: el otro destino posible de un compromiso. Su plata se cuenta con las
// mismas funciones que usa su propio handler — la regla de "no pedir más de lo que falta" es una
// sola, escrita una vez, para las dos clases de destino.
import { resumenObjetivo, seExcede } from '../lib/cuentas/core.core.js';
import { CAMPOS_PLATA, cerrarSiSeCompleto } from '../lib/cuentas/base.js';

const URL_PUENTE_PAGOS =
  process.env.DASHBOARD_PUENTE_PAGOS_URL || 'https://dashboard.arebensrl.com/api/puente/pagos';

const TIMEOUT_MS = 12000;

const ESTADOS = ['prometido', 'transferido', 'confirmado', 'cancelado'];
const TRANSICIONES = {
  prometido: ['transferido', 'confirmado', 'cancelado'],
  transferido: ['confirmado', 'prometido', 'cancelado'],
  confirmado: [],
  cancelado: ['prometido'],
};

let sb = null;
function base() {
  if (!sb) {
    sb = createClient(
      process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
    );
  }
  return sb;
}

const CAMPOS =
  'id, origen, objetivo_id, acreedor_id, acreedor_nombre, cuenta_alias, cuenta_cbu, cuenta_banco, cuenta_titular, ' +
  'cliente_id, cliente_store, cliente_nombre, cliente_telefono, monto, monto_confirmado, estado, ' +
  'fecha_prometida, notas, operacion_id, pagos_dashboard, viene_de, creado_en, creado_por, ' +
  'confirmado_en, confirmado_por';

/** Ver la sección alcanza para leer; comprometer y confirmar son permisos aparte. */
function permisos(perfil) {
  const admin = esAdmin(perfil);
  const ve = admin || marcasConAcceso(perfil, 'acreedores', ['bdi', 'zattia']).length > 0;
  return {
    ver: ve,
    // ⚠️ Los subs NO se heredan de la función: se tildan a mano. Un admin puede siempre.
    prometer: admin || (ve && ['bdi', 'zattia'].some((m) => puedeSub(perfil, m, 'acreedores', 'prometer'))),
    confirmar: admin || (ve && ['bdi', 'zattia'].some((m) => puedeSub(perfil, m, 'acreedores', 'confirmar'))),
  };
}

function texto(v, max = 300) {
  const t = String(v ?? '').trim();
  return t ? t.slice(0, max) : null;
}

/**
 * Entró menos de lo comprometido: lo que falta nace como un compromiso NUEVO (decidido con Darío).
 * Un compromiso es *una transferencia*, así que dos transferencias son dos filas.
 *
 * 🔑 Está en una función porque la usan los dos caminos de confirmar —el del dashboard y el de una
 * cuenta manual— y son justo los dos que ya fabricaron un bug de plata por estar escritos dos
 * veces (el ×100 del 7-sep). Lo que cambia entre los dos es de dónde sale el techo, ⛔ nunca qué
 * pasa con el resto.
 */
async function abrirElResto(c, montoReal, quien) {
  const falta = restante(c.monto, montoReal);
  if (!(falta > 0.005)) return null;

  const { data } = await base()
    .from('compromisos_pago')
    .insert({
      origen: c.origen || 'dashboard',
      objetivo_id: c.objetivo_id || null,
      acreedor_id: c.acreedor_id,
      acreedor_nombre: c.acreedor_nombre,
      cuenta_alias: c.cuenta_alias,
      cuenta_cbu: c.cuenta_cbu,
      cuenta_banco: c.cuenta_banco,
      cuenta_titular: c.cuenta_titular,
      cliente_id: c.cliente_id,
      cliente_store: c.cliente_store,
      cliente_nombre: c.cliente_nombre,
      // ⚠️ El teléfono se copia también: sin él, el resto de un compromiso de alguien que
      // todavía no está en Gestión Nube nace huérfano y ya no se puede reenganchar.
      cliente_telefono: c.cliente_telefono,
      monto: falta,
      notas: `Lo que faltó del compromiso del ${String(c.creado_en).slice(0, 10)}: se pidieron ${c.monto} y entraron ${montoReal}.`,
      viene_de: c.id,
      creado_por: quien,
      actualizado_por: quien,
    })
    .select(CAMPOS)
    .single();
  return data || null;
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const puede = permisos(perfil);
  if (!puede.ver) {
    return res.status(403).json({ error: 'No tenés permiso para ver a quién le debemos.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await base()
      .from('compromisos_pago')
      .select(CAMPOS)
      .order('creado_en', { ascending: false })
      .limit(500);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, compromisos: data || [], puede });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

  const body = req.body || {};
  const accion = String(body.action || '');
  const quien = perfil.name || null;

  // ── Anotar un compromiso ────────────────────────────────────────────────────
  if (accion === 'crear') {
    if (!puede.prometer) {
      return res.status(403).json({ error: 'No tenés permiso para crear compromisos de pago.' });
    }
    const c = body.compromiso || {};
    if (!c.acreedor_id || !texto(c.acreedor_nombre)) {
      return res.status(400).json({ error: 'Falta a quién se le va a pagar.' });
    }
    if (!texto(c.cliente_nombre)) {
      return res.status(400).json({ error: 'Falta qué cliente va a transferir.' });
    }
    const monto = redondear(c.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return res.status(400).json({ error: 'Poné cuánto va a transferir.' });
    }

    /**
     * 🔴 **EL control del circuito, del lado que manda.**
     *
     * Toda esta sección existe para que no se comprometa dos veces la misma plata. Hasta el
     * 7-sep-2026 esa resta la hacía **sólo la pantalla**, contra su copia de los números: cada
     * navegador decidía con lo que había leído hace un rato, y el servidor guardaba lo que le
     * mandaran. O sea que el enemigo que el diseño nombra —dos charlas en paralelo comprometiendo
     * la misma deuda— pasaba igual, y encima con DOS formularios distintos calculándolo cada uno
     * por su cuenta.
     *
     * Acá se vuelve a preguntar con los números frescos, un instante antes de guardar.
     *
     * 🔑 **Dos clases de destino, un solo control.** Un acreedor del dashboard tiene una deuda que
     * se lee por la puerta; una cuenta manual tiene un objetivo cargado a mano. Lo que cambia es de
     * dónde sale el techo —y sólo eso—: la resta contra lo ya comprometido es la misma para los
     * dos, y por eso vive en `lib/` y no escrita dos veces acá.
     *
     * ⚠️ **No es un candado, es una ventana mucho más chica.** Dos `crear` exactamente simultáneos
     * leen el mismo estado y los dos pasan: cerrarlo del todo pide una transacción con lock, y del
     * lado de los acreedores el `disponible` vive en OTRA base (la del dashboard), así que un CHECK
     * no lo puede ver. Lo que cambia es el tamaño del agujero: de "dos personas en la misma tarde"
     * a "dos personas en el mismo milisegundo". ⛔ El único candado de verdad del circuito es el
     * índice que deja **una sola vuelta abierta por cuenta manual**.
     */
    const esManual = String(c.origen || '') === 'manual';
    // A dónde se manda la plata, congelado en el compromiso: si mañana cambia el CBU, esta fila
    // tiene que seguir diciendo a dónde se mandó, no a dónde se manda hoy.
    let congelado = {
      cuenta_alias: texto(c.cuenta_alias, 60),
      cuenta_cbu: texto(c.cuenta_cbu, 30),
      cuenta_banco: texto(c.cuenta_banco, 80),
      cuenta_titular: texto(c.cuenta_titular, 120),
    };
    let objetivoId = null;

    if (esManual) {
      /*
       * Cuenta manual: la cuota del crédito, las bolsas, el alquiler. Acá NO se le pregunta nada al
       * dashboard —ni hace falta ni existe el dato— y por eso esto anda con el dashboard caído.
       * El techo es lo que falta juntar del objetivo abierto, menos lo ya comprometido.
       */
      const { data: objetivo, error: eObj } = await base()
        .from('cuentas_manuales_objetivos')
        .select('id, cuenta_id, monto, nota, estado')
        .eq('id', c.objetivo_id)
        .single();
      if (eObj || !objetivo) {
        return res.status(404).json({ error: 'No se encontró eso que se está juntando. Actualizá la pantalla.' });
      }
      if (objetivo.estado !== 'juntando') {
        return res.status(409).json({ error: 'Esa cuenta está en pausa: se pagó o se pausó. Activala con un monto nuevo si hace falta.' });
      }
      // El id que manda la pantalla tiene que ser el de la cuenta de ESE objetivo. Sin esto, un
      // compromiso podría quedar contado en una cuenta y controlado contra otra.
      if (String(c.acreedor_id) !== String(objetivo.cuenta_id)) {
        return res.status(400).json({ error: 'La cuenta y lo que se está juntando no se corresponden. Actualizá la pantalla.' });
      }

      const { data: cuenta, error: eCuenta } = await base()
        .from('cuentas_manuales')
        .select('id, nombre, cuenta_alias, cuenta_cbu, cuenta_banco, cuenta_titular')
        .eq('id', objetivo.cuenta_id)
        .single();
      if (eCuenta || !cuenta) return res.status(404).json({ error: 'No se encontró esa cuenta.' });

      const { data: plata, error: ePlata } = await base()
        .from('compromisos_pago').select(CAMPOS_PLATA).eq('objetivo_id', objetivo.id);
      if (ePlata) return res.status(500).json({ error: ePlata.message });

      const r = resumenObjetivo(objetivo, plata || []);
      if (monto > r.sePuedePedir + 0.005) {
        return res.status(409).json({
          error: r.comprometido > 0
            ? `Para ${cuenta.nombre} hay disponible $${r.sePuedePedir.toLocaleString('es-AR')}: falta $${r.falta.toLocaleString('es-AR')} y ya hay $${r.comprometido.toLocaleString('es-AR')} pedidos sin acreditar.`
            : `Para ${cuenta.nombre} hay disponible $${r.sePuedePedir.toLocaleString('es-AR')}, que es lo que falta.`,
          se_puede: r.sePuedePedir,
        });
      }

      objetivoId = objetivo.id;
      // 🔑 El alias se congela desde la BASE y no desde lo que mandó el navegador: es un dato
      // nuestro, así que no hay razón para creerle a la pantalla a dónde va la plata.
      congelado = {
        cuenta_alias: texto(cuenta.cuenta_alias, 60),
        cuenta_cbu: texto(cuenta.cuenta_cbu, 30),
        cuenta_banco: texto(cuenta.cuenta_banco, 80),
        cuenta_titular: texto(cuenta.cuenta_titular, 120),
      };
    } else {
      const deuda = await leerAcreedoresDelDashboard();
      if (deuda.aviso) {
        /*
         * Sin saber cuánto se le debe no se puede controlar nada, así que no se anota. Es más
         * incómodo que dejar pasar, y es a propósito: dejar pasar abre el agujero justo cuando nadie
         * lo puede ver. La pantalla ya no deja elegir acreedor sin dashboard — esto lo hace de verdad.
         *
         * ⚠️ Esto vale sólo para los acreedores: una cuenta manual no depende del dashboard y se
         * anota igual. Es la mitad del motivo por el que existen.
         */
        return res.status(503).json({ error: `${deuda.aviso} Sin eso no se puede anotar un compromiso, porque no hay con qué controlar que no se le pida de más.` });
      }
      const acreedor = (deuda.acreedores || []).find((a) => String(a.id) === String(c.acreedor_id));
      if (!acreedor) {
        return res.status(409).json({ error: 'Ese acreedor ya no figura con deuda abierta. Actualizá la pantalla: puede haberse pagado desde el dashboard.' });
      }

      // Lo ya comprometido y sin entrar, de ESTE acreedor. Los dos estados abiertos van literales:
      // el grafo entero vive más arriba en este mismo archivo (⏭️ unificarlo con `lib/` es lo que
      // sigue en la tanda 2).
      const { data: abiertos, error: eAbiertos } = await base()
        .from('compromisos_pago')
        .select('monto')
        .eq('acreedor_id', c.acreedor_id)
        .in('estado', ['prometido', 'transferido']);
      if (eAbiertos) return res.status(500).json({ error: eAbiertos.message });

      const yaComprometido = (abiertos || []).reduce((s, f) => redondear(s + Number(f.monto)), 0);
      const libre = sePuedeComprometer(acreedor.disponible, yaComprometido);
      if (monto > libre + 0.005) {
        return res.status(409).json({
          error: yaComprometido > 0
            ? `A ${acreedor.nombre} se le puede pedir hasta $${libre.toLocaleString('es-AR')}: se le deben $${Number(acreedor.disponible).toLocaleString('es-AR')} y ya hay $${yaComprometido.toLocaleString('es-AR')} comprometidos que todavía no entraron.`
            : `A ${acreedor.nombre} se le puede pedir hasta $${libre.toLocaleString('es-AR')}, que es lo que se le debe.`,
          se_puede: libre,
        });
      }
    }

    const { data, error } = await base()
      .from('compromisos_pago')
      .insert({
        origen: esManual ? 'manual' : 'dashboard',
        objetivo_id: objetivoId,
        acreedor_id: c.acreedor_id,
        acreedor_nombre: texto(c.acreedor_nombre),
        ...congelado,
        cliente_id: texto(c.cliente_id, 60),
        cliente_store: c.cliente_store === 'zattia' ? 'zattia' : 'bdi',
        cliente_nombre: texto(c.cliente_nombre, 160),
        // 🔑 El teléfono del chat, para los compromisos que se anotan ANTES de que el cliente exista
        // en Gestión Nube. Es con lo que se reengancha después (acción `vincular`). Llega ya
        // normalizado del panel: dos formas del mismo número no se comparan iguales.
        cliente_telefono: texto(c.cliente_telefono, 40),
        monto,
        fecha_prometida: c.fecha_prometida || null,
        notas: texto(c.notas, 1000),
        viene_de: c.viene_de || null,
        creado_por: quien,
        actualizado_por: quien,
      })
      .select(CAMPOS)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, compromiso: data });
  }

  // ── Moverla de estado (sin tocar el dashboard) ────────────────────────────
  if (accion === 'estado') {
    if (!puede.prometer) {
      return res.status(403).json({ error: 'No tenés permiso para cambiar compromisos de pago.' });
    }
    const estado = String(body.estado || '');
    if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Ese estado no existe.' });
    // ⛔ `confirmado` NO entra por acá: confirmar escribe plata y tiene su propio verbo y su
    // propio permiso. Sin este corte, `estado` sería una puerta de atrás para saltear los dos.
    if (estado === 'confirmado') {
      return res.status(400).json({ error: 'Para confirmar usá el botón de confirmar: es lo que impacta en el dashboard.' });
    }

    const { data: actual, error: eLeer } = await base()
      .from('compromisos_pago').select('estado').eq('id', body.id).single();
    if (eLeer || !actual) return res.status(404).json({ error: 'No se encontró ese compromiso.' });
    if (!(TRANSICIONES[actual.estado] || []).includes(estado)) {
      const motivo = actual.estado === 'confirmado'
        ? 'Ese compromiso ya impactó en el dashboard y no se puede volver atrás desde acá. Si hay que corregirla, se borra el pago en el dashboard.'
        : `No se puede pasar de "${actual.estado}" a "${estado}".`;
      return res.status(409).json({ error: motivo });
    }

    const { data, error } = await base()
      .from('compromisos_pago')
      .update({ estado, actualizado_en: new Date().toISOString(), actualizado_por: quien })
      .eq('id', body.id)
      .select(CAMPOS)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, compromiso: data });
  }

  // ── Vincular: el cliente por fin existe en Gestión Nube ───────────────────
  //
  // El compromiso se anotó cuando el mayorista todavía no estaba cargado: quedó con el nombre escrito
  // a mano y el teléfono del chat, sin `cliente_id`. Cuando aparece en GN, esto le pone el id.
  //
  // ⛔ **No se vincula un compromiso ya confirmada**, y no es una precaución de más: al confirmar se
  // le manda al dashboard el `pagador_cliente_id`, así que el pago del ledger quedaría apuntando a
  // "sin cliente" mientras acá figura vinculado. Sería una divergencia entre dos sistemas creada
  // por un botón. Si hay que corregir eso, se corrige el pago en el dashboard.
  if (accion === 'vincular') {
    if (!puede.prometer) {
      return res.status(403).json({ error: 'No tenés permiso para cambiar compromisos de pago.' });
    }
    const idCliente = texto(body.cliente_id, 60);
    const nombre = texto(body.cliente_nombre, 160);
    if (!idCliente || !nombre) {
      return res.status(400).json({ error: 'Falta a qué cliente vincularlo.' });
    }

    const { data: actual, error: eLeer } = await base()
      .from('compromisos_pago').select('estado, cliente_id').eq('id', body.id).single();
    if (eLeer || !actual) return res.status(404).json({ error: 'No se encontró ese compromiso.' });
    if (actual.estado === 'confirmado') {
      return res.status(409).json({ error: 'Ese compromiso ya impactó en el dashboard: el pago quedó a nombre de quien figuraba. Si hay que corregirlo, se corrige el pago en el dashboard.' });
    }
    if (actual.cliente_id) {
      return res.status(409).json({ error: 'Ese compromiso ya está vinculado a un cliente.' });
    }

    const { data, error } = await base()
      .from('compromisos_pago')
      .update({
        cliente_id: idCliente,
        cliente_nombre: nombre,
        cliente_store: body.cliente_store === 'zattia' ? 'zattia' : 'bdi',
        actualizado_en: new Date().toISOString(),
        actualizado_por: quien,
      })
      .eq('id', body.id)
      .select(CAMPOS)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, compromiso: data });
  }

  // ── Confirmar: la plata se movió, que impacte en el dashboard ─────────────
  if (accion === 'confirmar') {
    if (!puede.confirmar) {
      return res.status(403).json({ error: 'No tenés permiso para confirmar pagos. Podés crear el compromiso y que la confirme otro.' });
    }

    const { data: c, error: eLeer } = await base()
      .from('compromisos_pago').select(CAMPOS).eq('id', body.id).single();
    if (eLeer || !c) return res.status(404).json({ error: 'No se encontró ese compromiso.' });
    if (c.estado === 'confirmado') {
      return res.status(409).json({ error: 'Ese compromiso ya está acreditado.', compromiso: c });
    }
    if (c.estado === 'cancelado') {
      return res.status(409).json({ error: 'Ese compromiso está cancelado. Reabrilo antes de confirmarlo.' });
    }

    // Lo que entró DE VERDAD. Puede ser menos de lo prometido: se confirma por esto.
    // ⚠️ Redondeado a centavos ANTES de salir: la columna es `numeric(15,2)` y el ledger del otro
    // lado también. Sin esto, un 33333.333 viaja con tres decimales y los dos sistemas guardan
    // números que no son exactamente el mismo.
    const montoReal = redondear(body.monto_real ?? c.monto);
    if (!Number.isFinite(montoReal) || montoReal <= 0) {
      return res.status(400).json({ error: 'Poné el monto acreditado.' });
    }
    const fecha = String(body.fecha || '').match(/^\d{4}-\d{2}-\d{2}$/)
      ? body.fecha
      : new Date().toISOString().slice(0, 10);

    /**
     * ⛔ **"A nombre de quién vino la transferencia" ya no se pregunta** (21-sep-2026). Lo pidió
     * Darío el 3-sep y lo mandó a sacar él mismo, con la medición delante: **0 de 9 confirmaciones
     * lo llenaron** en 18 días de uso real. *"No me interesa quién la manda, sino qué cliente
     * mandó, porque luego conozco bien el comprobante cuando entro al chat."*
     *
     * ⚠️ **La columna `titular_real` sigue existiendo y queda siempre en null.** No se borró: son
     * 0 filas, no hay nada que migrar, y el día que haga falta se vuelve a pedir sin tocar la base.
     * ⛔ Y el handler **ya no la acepta del cuerpo**, ni al crear ni al confirmar: si volviera a
     * pedirse, tiene que volver por los dos formularios a la vez y no por uno solo — que es
     * exactamente la forma que ya fabricó los dos bugs de plata de este circuito.
     */

    /**
     * ── Cuenta manual: la plata entró y no hay a quién avisarle ──────────────
     *
     * Éste es el camino corto, y lo corto es el punto: no hay puerta, no hay `operacion_id` que
     * viaje, no hay nada que pueda quedar escrito de un lado y sin anotar del otro. Se marca que
     * entró y, si con eso se llegó al monto, **la cuenta se apaga sola** — que es exactamente lo
     * que Bruno pidió: se prende cargando un monto y se limpia al completarse.
     *
     * ⛔ Y no le escribe un peso al dashboard, a propósito: el pago de la cuota se sigue cargando
     * allá como siempre. Esto registra quién puso qué para juntarla.
     */
    if (c.origen === 'manual') {
      const { data: objetivo, error: eObj } = await base()
        .from('cuentas_manuales_objetivos')
        .select('id, cuenta_id, monto, nota, estado')
        .eq('id', c.objetivo_id)
        .single();
      if (eObj || !objetivo) {
        return res.status(404).json({ error: 'No se encontró eso que se estaba juntando.' });
      }

      // Lo que faltaba ANTES de anotar esta plata: es contra eso que se mide si entró de más.
      const { data: antes } = await base()
        .from('compromisos_pago').select(CAMPOS_PLATA).eq('objetivo_id', objetivo.id);
      const faltaba = resumenObjetivo(objetivo, antes || []).falta;

      const { data, error } = await base()
        .from('compromisos_pago')
        .update({
          estado: 'confirmado',
          monto_confirmado: montoReal,
          // ⛔ `pagos_dashboard` queda en null y no es un olvido: no hubo pago del otro lado. El
          // CHECK de la base lo contempla desde `migrate-cuentas-manuales.sql`.
          confirmado_en: new Date().toISOString(),
          confirmado_por: quien,
          actualizado_en: new Date().toISOString(),
          actualizado_por: quien,
        })
        .eq('id', c.id)
        .select(CAMPOS)
        .single();
      if (error) return res.status(500).json({ error: error.message });

      const { cerrado, resumen } = await cerrarSiSeCompleto(base(), objetivo, quien);

      // El resto sólo se sigue reclamando mientras la cuenta siga juntando: si ya se completó, no
      // hay contra qué anotarlo y pedirle a alguien plata que ya no hace falta es peor que nada.
      const nueva = cerrado || body.anotar_restante === false ? null : await abrirElResto(data, montoReal, quien);

      return res.status(200).json({
        ok: true,
        compromiso: data,
        nueva,
        objetivo: { ...objetivo, monto: Number(objetivo.monto), ...resumen },
        cuenta_completa: cerrado,
        // Cuánto entró de más de lo que faltaba. Se acepta igual —la plata ya se movió— y se avisa,
        // que es lo único honesto: en el banco hay plata de sobra y alguien tiene que saberlo.
        se_paso: seExcede(faltaba, montoReal),
      });
    }

    const secreto = process.env.DASHBOARD_PUENTE_SECRET;
    if (!secreto) {
      return res.status(503).json({ error: 'Falta conectar el dashboard (DASHBOARD_PUENTE_SECRET). Sin eso el pago no se puede registrar.' });
    }

    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), TIMEOUT_MS);
    let respuesta;
    try {
      const r = await fetch(URL_PUENTE_PAGOS, {
        method: 'POST',
        headers: { 'x-puente-auth': secreto, 'Content-Type': 'application/json' },
        signal: corte.signal,
        body: JSON.stringify({
          // 🔑 El mismo número de siempre: nació con el compromiso. Si esta llamada ya se hizo,
          // el dashboard devuelve lo de la primera vez en vez de escribir los pagos otra vez.
          operacion_id: c.operacion_id,
          acreedor_id: c.acreedor_id,
          monto: montoReal,
          fecha,
          instrumento: 'TRANSFERENCIA',
          /**
           * 🔑 **El cliente, con su id y con su nombre.** El id es de Gestión Nube y el dashboard
           * no lo resuelve, así que sin el nombre al lado no se puede leer de quién era la deuda
           * cuando el acreedor dice que no le llegó.
           *
           * ⛔ `titular` viaja siempre en null desde el 21-sep-2026: la puerta del dashboard lo
           * sigue aceptando, pero acá ya no se pregunta a nombre de quién vino (ver arriba).
           */
          pagador: {
            cliente_id: c.cliente_id,
            nombre: c.cliente_nombre,
            titular: null,
          },
          pedido_por: quien,
          notas: `Transferencia de ${c.cliente_nombre}`,
        }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        return res.status(409).json({ error: (d && d.error) || `El dashboard rechazó el pago (${r.status}).`, detalle: d || null });
      }
      /**
       * 🔴 **Contestó que sí, pero con algo que no se entiende.**
       *
       * Sin este corte, `respuesta` quedaba en `null` y se seguía derecho al `update` — que choca
       * contra el CHECK `compromisos_pago_confirmado_completo` (un confirmado tiene que decir con
       * qué operación se pagó). O sea que el compromiso NO se marcaba, se devolvía "volvé a apretar
       * confirmar" y el reintento fallaba exactamente igual: **quedaba trabado para siempre**, sin
       * más salida que el SQL Editor.
       *
       * Cortar acá no pierde nada, porque el `operacion_id` es el mismo de siempre: el reintento le
       * vuelve a preguntar a la puerta y, si el pago ya estaba escrito, lo devuelve sin duplicarlo.
       * Lo que cambia es que el compromiso queda como estaba y se puede volver a intentar de verdad.
       */
      if (!d || typeof d !== 'object') {
        return res.status(502).json({
          error: 'El dashboard contestó algo que no se entiende. Fijate si el pago quedó registrado y volvé a intentar: si ya está, no se va a duplicar.',
        });
      }
      respuesta = d;
    } catch (e) {
      const msg = e?.name === 'AbortError'
        ? 'El dashboard está tardando. Fijate en unos minutos si el pago quedó registrado antes de volver a intentar.'
        : `No se pudo registrar el pago: ${e.message}`;
      return res.status(502).json({ error: msg });
    } finally {
      clearTimeout(reloj);
    }

    // El pago YA está escrito del otro lado. Si esto falla, el reintento manda el mismo
    // `operacion_id` y termina de anotar sin duplicar nada.
    const { data, error } = await base()
      .from('compromisos_pago')
      .update({
        estado: 'confirmado',
        monto_confirmado: montoReal,
        pagos_dashboard: respuesta,
        confirmado_en: new Date().toISOString(),
        confirmado_por: quien,
        actualizado_en: new Date().toISOString(),
        actualizado_por: quien,
      })
      .eq('id', c.id)
      .select(CAMPOS)
      .single();
    if (error) {
      return res.status(500).json({
        error: `El pago SÍ se registró en el dashboard, pero no se pudo anotar acá: ${error.message}. Volvé a apretar confirmar: no se va a duplicar.`,
        pagos: respuesta,
      });
    }

    // Entró menos de lo comprometido ⇒ lo que falta se anota como otro compromiso. La cuenta y el
    // alta viven en `abrirElResto`, que es la MISMA que usa el camino de las cuentas manuales.
    const nueva = body.anotar_restante === false ? null : await abrirElResto(data, montoReal, quien);

    return res.status(200).json({ ok: true, compromiso: data, nueva, pagos: respuesta });
  }

  return res.status(400).json({ error: 'Acción desconocida.' });
}
