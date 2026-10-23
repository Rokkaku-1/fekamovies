-- FekaMovies · Portada compartida. Ejecutar después de setup.sql.
begin;
create table if not exists public.lumen_homepage (
  id smallint primary key default 1 check (id = 1),
  slides jsonb not null default '[]'::jsonb
    check (jsonb_typeof(slides) = 'array' and jsonb_array_length(slides) <= 4),
  updated_at timestamptz not null default now()
);
alter table public.lumen_homepage enable row level security;
revoke all on public.lumen_homepage from anon, authenticated;
grant select on public.lumen_homepage to anon, authenticated;
grant insert, update, delete on public.lumen_homepage to authenticated;
drop policy if exists lumen_homepage_read on public.lumen_homepage;
create policy lumen_homepage_read on public.lumen_homepage for select to anon, authenticated using (true);
drop policy if exists lumen_homepage_admin on public.lumen_homepage;
create policy lumen_homepage_admin on public.lumen_homepage for all to authenticated
  using ((select public.lumen_is_admin())) with check ((select public.lumen_is_admin()));
insert into public.lumen_homepage(id) values (1) on conflict do nothing;
commit;
