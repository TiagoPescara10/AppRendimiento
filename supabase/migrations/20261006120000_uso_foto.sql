-- supabase/migrations/20261006120000_uso_foto.sql
--
-- Contadores de uso de la funcion analizar-foto (registrar comida con una
-- foto). Dos limites:
--
--   uso_foto         por instalacion y por semana (lunes, hora de Argentina).
--                    El install_id lo genera la app la primera vez y lo
--                    guarda en su base local.
--   uso_foto_global  por dia, sumando todas las instalaciones. Existe porque
--                    el install_id lo inventa el cliente: reinstalando se
--                    saltea el limite semanal. El global acota el gasto.
--
-- Nada de esto lo toca la app. RLS activado y sin politicas: anon y
-- authenticated no ven ni escriben nada. Solo la Edge Function, con la
-- service role, llama a consumir_foto y devolver_foto.
--
-- Las fotos NO se guardan en ningun lado: aca solo hay contadores.

create table public.uso_foto (
  install_id uuid    not null,
  semana     date    not null,
  cantidad   integer not null default 0 check (cantidad >= 0),
  primary key (install_id, semana)
);

create table public.uso_foto_global (
  dia      date    primary key,
  cantidad integer not null default 0 check (cantidad >= 0)
);

alter table public.uso_foto enable row level security;
alter table public.uso_foto_global enable row level security;

revoke all on table public.uso_foto, public.uso_foto_global from anon, authenticated;
grant select, insert, update on table public.uso_foto, public.uso_foto_global to service_role;

-- Descuenta una foto si hay cupo. Atomica: el UPDATE del ON CONFLICT toma el
-- lock de la fila y solo suma si todavia no se llego al limite, asi dos
-- pedidos simultaneos no pueden pasarse. Si no hay cupo, no cambia nada.
--
-- Devuelve una fila:
--   permitido  si se desconto
--   motivo     null, 'semanal' o 'global'
--   usadas     fotos usadas esta semana por la instalacion, contando esta
create or replace function public.consumir_foto(
  p_install_id    uuid,
  p_semana        date,
  p_limite        integer,
  p_dia           date,
  p_limite_global integer
)
returns table (permitido boolean, motivo text, usadas integer)
language plpgsql
set search_path = public
as $$
declare
  v_global integer;
  v_usadas integer;
begin
  if p_limite_global <= 0 then
    return query select false, 'global'::text, null::integer;
    return;
  end if;
  if p_limite <= 0 then
    return query select false, 'semanal'::text, 0;
    return;
  end if;

  insert into uso_foto_global as g (dia, cantidad)
  values (p_dia, 1)
  on conflict (dia) do update
    set cantidad = g.cantidad + 1
    where g.cantidad < p_limite_global
  returning g.cantidad into v_global;

  if v_global is null then
    return query select false, 'global'::text, null::integer;
    return;
  end if;

  insert into uso_foto as u (install_id, semana, cantidad)
  values (p_install_id, p_semana, 1)
  on conflict (install_id, semana) do update
    set cantidad = u.cantidad + 1
    where u.cantidad < p_limite
  returning u.cantidad into v_usadas;

  if v_usadas is null then
    -- Sin cupo semanal: se devuelve lo que se tomo del global.
    update uso_foto_global set cantidad = greatest(cantidad - 1, 0) where dia = p_dia;
    return query select false, 'semanal'::text, p_limite;
    return;
  end if;

  return query select true, null::text, v_usadas;
end;
$$;

-- Reintegro: cuando el analisis falla por un error nuestro o de la API, la
-- foto no cuenta.
create or replace function public.devolver_foto(
  p_install_id uuid,
  p_semana     date,
  p_dia        date
)
returns void
language plpgsql
set search_path = public
as $$
begin
  update uso_foto set cantidad = greatest(cantidad - 1, 0)
  where install_id = p_install_id and semana = p_semana;
  update uso_foto_global set cantidad = greatest(cantidad - 1, 0)
  where dia = p_dia;
end;
$$;

revoke all on function public.consumir_foto(uuid, date, integer, date, integer) from public, anon, authenticated;
revoke all on function public.devolver_foto(uuid, date, date) from public, anon, authenticated;
grant execute on function public.consumir_foto(uuid, date, integer, date, integer) to service_role;
grant execute on function public.devolver_foto(uuid, date, date) to service_role;
