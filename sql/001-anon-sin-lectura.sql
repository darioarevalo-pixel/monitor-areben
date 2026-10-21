-- 🔴 21-oct-2026 · sesión B (Bases): anon y authenticated vuelven a NO LEER nada que no tenga política.
--
-- Las anon keys están en el repo, que es PÚBLICO (`lib/cuentas.ts` lo dice: «la exposición real no son
-- estas keys sino que no haya RLS»). `migrate-rls.sql` lo cerró en agosto, pero dejó dos puertas:
--   1. RLS ⛔ queda como default: toda tabla creada DESPUÉS nació sin RLS y con el `grant select` de
--      Supabase ⇒ legible con la anon key (medido 21-oct: canjes, canje_personas, organizacion_*,
--      meta_ads_snapshot_dia, pedido_mayorista, cuenta_real, exhib_*, devoluciones…).
--   2. Una VISTA ⛔ mira RLS: corre como su dueño ⇒ `venta_ficha`, `cuenta_saldo`, `costo_vigente`,
--      `precio_vigente`… se leían enteras con la anon key.
-- El monitor ⛔ lee nada de esto con la anon key: el servidor usa la service key o `pg`, y el motor su rol
-- `motor` (bypassrls). Oráculo: `node ~/Documents/erp-monitor/oraculos/rls-anon.mjs` ⇒ «NINGUNA» en las 2.

-- 1) RLS en toda tabla de public que no la tenga (lo mismo que migrate-rls.sql, otra vez).
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

-- 2) Las vistas: sin RLS que las frene, se les saca el permiso.
do $$
declare v record;
begin
  for v in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    execute format('revoke select on public.%I from anon, authenticated', v.relname);
  end loop;
end $$;

-- 3) De acá en adelante, lo que se cree (tabla o vista, desde el monitor o el motor) nace SIN lectura
--    para anon/authenticated. Si una pantalla la necesitara, va un `grant` explícito con su política.
alter default privileges in schema public revoke select on tables from anon, authenticated;
