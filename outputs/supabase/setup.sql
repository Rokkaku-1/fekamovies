-- lumen+ · Instalación reutilizable. Ejecutar con el rol postgres del SQL Editor.
-- No elimina tablas ni contenido existentes. No crea cuentas ni asigna administradores.
begin;
create table if not exists public.lumen_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.lumen_admins enable row level security;
revoke all on public.lumen_admins from anon, authenticated;
grant select on public.lumen_admins to authenticated;
drop policy if exists lumen_admin_read_self on public.lumen_admins;
create policy lumen_admin_read_self on public.lumen_admins for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.lumen_is_admin() returns boolean
language sql stable security invoker set search_path = ''
as $$ select exists(select 1 from public.lumen_admins where user_id = (select auth.uid())); $$;
revoke all on function public.lumen_is_admin() from public;
grant execute on function public.lumen_is_admin() to authenticated;

create table if not exists public.lumen_embeds (
  id uuid primary key default gen_random_uuid(),
  media_type text not null check (media_type in ('movie','tv')),
  tmdb_id bigint not null check (tmdb_id > 0),
  season integer not null default 0,
  episode integer not null default 0,
  title text not null check (length(title) between 1 and 300),
  provider text not null check (provider in ('okru','youtube','vimeo','dailymotion','mp4','hls')),
  embed_url text not null check (length(embed_url) < 1000),
  label text not null default 'Servidor principal' check (length(label) between 1 and 80),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lumen_episode_valid check ((media_type='movie' and season=0 and episode=0) or (media_type='tv' and season>=0 and episode>0)),
  constraint lumen_embed_valid check (
    (provider='okru' and embed_url ~ '^https://ok[.]ru/videoembed/[0-9]+$') or
    (provider='youtube' and embed_url ~ '^https://www[.]youtube[.]com/embed/[a-zA-Z0-9_-]{11}$') or
    (provider='vimeo' and embed_url ~ '^https://player[.]vimeo[.]com/video/[0-9]+$') or
    (provider='dailymotion' and embed_url ~ '^https://www[.]dailymotion[.]com/embed/video/[a-zA-Z0-9]+$') or
    (provider in ('mp4','hls') and embed_url ~ '^https://[^/@?#[:space:]]+/' and embed_url !~ '[[:space:]]' and
      ((provider='mp4' and embed_url ~* '[.]mp4([?][^#]*)?$') or
       (provider='hls' and embed_url ~* '[.]m3u8([?][^#]*)?$')))
  ),
  unique(media_type,tmdb_id,season,episode,provider,embed_url)
);
create index if not exists lumen_embeds_published_idx on public.lumen_embeds(media_type,tmdb_id,season,episode) where published;
alter table public.lumen_embeds enable row level security;
revoke all on public.lumen_embeds from anon, authenticated;
grant select on public.lumen_embeds to anon, authenticated;
grant insert,update,delete on public.lumen_embeds to authenticated;
drop policy if exists lumen_published_read on public.lumen_embeds;
create policy lumen_published_read on public.lumen_embeds for select to anon,authenticated using (published);
drop policy if exists lumen_admin_manage on public.lumen_embeds;
create policy lumen_admin_manage on public.lumen_embeds for all to authenticated
using ((select public.lumen_is_admin())) with check ((select public.lumen_is_admin()));

create or replace function public.lumen_touch_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
revoke all on function public.lumen_touch_updated_at() from public;
drop trigger if exists lumen_embeds_updated_at on public.lumen_embeds;
create trigger lumen_embeds_updated_at before update on public.lumen_embeds
for each row execute function public.lumen_touch_updated_at();
commit;

-- Primer administrador: crear primero el usuario desde admin.html y confirmar su correo.
-- Ejecutar después en SQL Editor, sustituyendo el correo:
-- insert into public.lumen_admins(user_id)
-- select id from auth.users where lower(email)=lower('TU_CORREO')
-- on conflict do nothing;
