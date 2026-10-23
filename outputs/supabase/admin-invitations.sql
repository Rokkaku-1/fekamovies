-- Ejecutar después de setup.sql. Solo el propietario de la BD puede invitar administradores.
begin;
create schema if not exists lumen_private;
revoke all on schema lumen_private from public,anon,authenticated;
create table if not exists lumen_private.admin_invitations (
  email text primary key check (email=lower(email)), created_at timestamptz not null default now()
);
alter table lumen_private.admin_invitations enable row level security;
revoke all on lumen_private.admin_invitations from public,anon,authenticated;

-- Elevación limitada a una invitación interna y un correo confirmado por Supabase Auth.
-- SECURITY DEFINER es necesario para escribir lumen_admins desde el trigger de Auth.
-- No se expone por REST/RPC y no se concede EXECUTE a los clientes.
create or replace function lumen_private.claim_admin_invitation() returns trigger
language plpgsql security definer set search_path='' as $$
declare approved text;
begin
  if tg_table_schema <> 'auth' or tg_table_name <> 'users' then raise exception 'Trigger de Auth requerido'; end if;
  if new.email_confirmed_at is null or new.email is null then return new; end if;
  delete from lumen_private.admin_invitations where email=lower(new.email) returning email into approved;
  if approved is not null then
    insert into public.lumen_admins(user_id) values(new.id) on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function lumen_private.claim_admin_invitation() from public,anon,authenticated;
drop trigger if exists lumen_confirmed_admin on auth.users;
create trigger lumen_confirmed_admin after insert or update of email,email_confirmed_at on auth.users
for each row execute function lumen_private.claim_admin_invitation();
commit;

-- Sustituir por el correo del propietario de cada instalación:
-- insert into lumen_private.admin_invitations(email) values(lower('TU_CORREO')) on conflict do nothing;
-- Para un usuario ya confirmado, usar el INSERT en lumen_admins indicado en setup.sql.
