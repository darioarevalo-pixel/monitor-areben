-- Cuentas manuales: juntar plata de clientes para algo que el dashboard no conoce.
--
-- # Qué hueco tapa
--
-- El circuito de compromisos (ver `migrate-compromisos-pago.sql`) sólo sabe pedirle a un cliente
-- que le transfiera a un ACREEDOR del dashboard, y por eso la lista de destinos sale de una única
-- consulta: los gastos que tienen proveedor asignado. Todo lo que hay que pagar y no es eso —la
-- cuota de un crédito, las bolsas, la inmobiliaria— no tiene a dónde anotarse, aunque se cobre
-- exactamente igual: "en vez de pagarme a mí, transferí a esta cuenta".
--
-- Conectar cada una de esas cosas al dashboard es el camino largo (una cuota de préstamo vive en
-- otra tabla, con otro tipo de pago, y habría que abrirle la lista de acreedores Y enseñarle al
-- pago a imputarse contra la cuota). Bruno lo pidió al revés y tiene razón para este caso: una
-- cuenta hecha A MANO acá, sin ninguna atadura con el dashboard.
--
-- # 🔑 La cuenta se PRENDE con un monto y se apaga sola
--
-- La ficha (nombre + a dónde transferir) es permanente, pero **dormida**: mientras no tenga un
-- objetivo abierto no aparece para pedirle plata a nadie. Se prende cargándole cuánto hay que
-- juntar, y cuando lo confirmado llega a ese número el objetivo se cierra solo y la cuenta vuelve
-- a quedar libre hasta la próxima vez.
--
-- ⛔ **No es un ciclo mensual.** Se pensó con meses (cerrar septiembre, abrir octubre, arrastrar lo
-- que faltó) y Bruno lo corrigió: un mes la cuota se paga así y al siguiente por débito, y una
-- cuenta que se renueva sola pediría plata para algo que ya nadie está juntando. Se prende cuando
-- alguien decide prenderla, y no antes.
--
-- # ⛔ Lo que esta plata NO hace
--
-- No toca el dashboard: ni lee su deuda, ni le escribe un pago. Un compromiso contra una cuenta
-- manual se confirma acá y muere acá. Es a propósito —es lo que la hace barata y lo que la deja
-- andar con el dashboard caído— y el precio está dicho: **el pago de verdad se sigue cargando en
-- el dashboard como siempre**. Esto registra quién puso qué para juntarlo, no la contabilidad.
--
-- ⛔ Correr a mano en el SQL Editor de Supabase, en la base de **BDI**. Idempotente.

-- ── La ficha: a quién/a dónde, y nada de plata ──────────────────────────────────
create table if not exists cuentas_manuales (
  id              uuid primary key default gen_random_uuid(),

  -- Cómo se la nombra en la charla: "Cuota del crédito", "Bolsas". Es lo que se va a ver en la
  -- lista de destinos al lado de los acreedores de verdad.
  nombre          text not null,
  -- Para qué es, en una línea. No lo lee ninguna cuenta: lo lee el que abre la pantalla dentro de
  -- tres meses y no se acuerda por qué existe esta cuenta.
  para_que        text,

  -- A dónde transfieren. Mismos cuatro campos que el compromiso congela, para que copiarlos sea
  -- copiar y no traducir.
  cuenta_alias    text,
  cuenta_cbu      text,
  cuenta_banco    text,
  cuenta_titular  text,

  -- Guardada. No se borra: sus compromisos viejos tienen que seguir diciendo a dónde fue la plata.
  archivada       boolean not null default false,

  creado_en       timestamptz not null default now(),
  creado_por      text,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);

comment on table cuentas_manuales is
  'Cuentas para juntar plata de clientes por fuera del dashboard. La ficha es permanente; se prende cargándole un objetivo.';

-- ── El objetivo: cuánto hay que juntar esta vez ─────────────────────────────────
--
-- Cada vez que se prende la cuenta nace una fila. Los compromisos cuelgan del OBJETIVO y no de la
-- cuenta, y eso es lo que hace que "cuánto se juntó" sea una suma exacta y no una resta contra
-- fechas: la vuelta de septiembre y la de diciembre no se pisan ni hay que separarlas por timestamp.
create table if not exists cuentas_manuales_objetivos (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references cuentas_manuales(id) on delete cascade,

  monto       numeric(15,2) not null check (monto > 0),
  -- "Cuota de septiembre". Para reconocer la vuelta en el historial.
  nota        text,

  --   juntando  se le puede pedir plata a un cliente
  --   completo  llegó al monto: la cuenta volvió a quedar libre
  --   cancelado se dejó de juntar sin llegar (se pagó de otra forma)
  estado      text not null default 'juntando',

  abierto_en  timestamptz not null default now(),
  abierto_por text,
  cerrado_en  timestamptz,
  cerrado_por text,

  -- Mismo criterio que `compromisos_pago.estado`: el dominio cerrado en la BASE. Un estado
  -- inventado no rompe nada visible, sólo desaparece de todos los cortes de la pantalla.
  constraint cuentas_manuales_objetivos_estado
    check (estado in ('juntando', 'completo', 'cancelado')),
  constraint cuentas_manuales_objetivos_cerrado
    check (estado = 'juntando' or cerrado_en is not null)
);

comment on table cuentas_manuales_objetivos is
  'Cada vez que se prende una cuenta manual: cuánto hay que juntar. Los compromisos cuelgan de acá.';

-- 🔴 **UN solo objetivo abierto por cuenta, y lo garantiza la base.**
--
-- Es el único candado de verdad de todo este circuito. El control de "no pedir más de lo que falta"
-- no se puede cerrar con un CHECK (mira varias filas y, del lado de los acreedores, una base
-- ajena); éste sí, y es el que evita el enredo peor: dos objetivos abiertos de la misma cuenta,
-- con la plata de los clientes repartida entre los dos y ninguna pantalla capaz de decir cuánto
-- falta para pagar la cuota.
create unique index if not exists idx_objetivo_abierto_por_cuenta
    on cuentas_manuales_objetivos (cuenta_id) where estado = 'juntando';

create index if not exists idx_objetivos_por_cuenta
    on cuentas_manuales_objetivos (cuenta_id, abierto_en desc);

-- ── El compromiso ahora puede apuntar a una cuenta manual ───────────────────────
--
-- 🔑 **`acreedor_id` sigue siendo "a quién se le paga", y ahora puede ser una cuenta manual.** No
-- se agregó una columna paralela a propósito: toda la cuenta del circuito —lo comprometido por
-- destino, la lista de la pantalla, la cola de cobranza— cuelga de esa columna, y partirla en dos
-- habría obligado a escribir dos veces cada suma. Quién es cada id lo dice `origen`.
alter table compromisos_pago
  add column if not exists origen text not null default 'dashboard';
alter table compromisos_pago
  add column if not exists objetivo_id uuid references cuentas_manuales_objetivos(id) on delete restrict;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'compromisos_pago_origen') then
    alter table compromisos_pago add constraint compromisos_pago_origen
      check (origen in ('dashboard', 'manual'));
  end if;

  -- Las dos columnas dicen lo mismo desde dos lados, así que tienen que moverse juntas: un
  -- 'manual' sin objetivo no sabría contra qué controlar, y un 'dashboard' con objetivo haría que
  -- la cuenta manual sume plata que en realidad se le mandó al contador.
  if not exists (select 1 from pg_constraint where conname = 'compromisos_pago_origen_objetivo') then
    alter table compromisos_pago add constraint compromisos_pago_origen_objetivo
      check ((origen = 'manual') = (objetivo_id is not null));
  end if;
end $$;

-- 🔴 El CHECK de "confirmado completo" pedía `pagos_dashboard`, que un compromiso manual NUNCA va a
-- tener: no hay puerta a la que llamar. Sin relajarlo, confirmar en una cuenta manual choca contra
-- la base y el compromiso queda trabado — exactamente el pozo del que salió el arreglo del 7-sep.
-- Lo que se conserva es lo que importa: un confirmado siempre dice cuánta plata entró, y uno del
-- dashboard además con qué operación se pagó.
alter table compromisos_pago drop constraint if exists compromisos_pago_confirmado_completo;
alter table compromisos_pago add constraint compromisos_pago_confirmado_completo
  check (
    estado <> 'confirmado'
    or (monto_confirmado is not null and (origen = 'manual' or pagos_dashboard is not null))
  );

-- "¿Cuánto se juntó de este objetivo?" — la suma que decide si la cuenta se apaga.
create index if not exists idx_compromisos_objetivo
    on compromisos_pago (objetivo_id) where objetivo_id is not null;

comment on column compromisos_pago.origen is
  'dashboard = se le paga a un acreedor del dashboard (confirmar escribe en su ledger). manual = cuenta de acá, no sale del Monitor.';
comment on column compromisos_pago.objetivo_id is
  'Para qué vuelta de una cuenta manual se está juntando esta plata. Null en los del dashboard.';

-- 🔴 Cerradas para el navegador, igual que `compromisos_pago`: la base se lee desde el servidor con
-- la service key y el navegador no la toca. Sin esto, la anon key —que viaja en el bundle y es
-- pública— podría leer los CBU.
alter table cuentas_manuales enable row level security;
alter table cuentas_manuales_objetivos enable row level security;
