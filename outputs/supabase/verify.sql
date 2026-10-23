-- Auditoría transaccional: no conserva usuarios ni contenido de prueba.
begin;
insert into auth.users(id,email,email_confirmed_at) values
('11111111-1111-4111-8111-111111111111','lumen-audit-reader@example.invalid',now()),
('22222222-2222-4222-8222-222222222222','lumen-audit-admin@example.invalid',now());
insert into public.lumen_admins(user_id) values('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
insert into public.lumen_embeds(media_type,tmdb_id,title,provider,embed_url,published) values
('movie',2147480001,'LUMEN_AUDIT_ONLY','okru','https://ok.ru/videoembed/10455532636838',false),
('movie',2147480002,'LUMEN_AUDIT_ONLY','okru','https://ok.ru/videoembed/10455532636838',true);
do $$ begin if not public.lumen_is_admin() then raise exception 'Admin lookup failed'; end if; end; $$;
set local role anon;
do $$ begin
if (select count(*) from public.lumen_embeds where title='LUMEN_AUDIT_ONLY')<>1 then raise exception 'Draft leaked'; end if;
begin insert into public.lumen_embeds(media_type,tmdb_id,title,provider,embed_url) values('movie',2147480003,'LUMEN_AUDIT_ONLY','okru','https://ok.ru/videoembed/10455532636838');
raise exception 'Anon write allowed'; exception when insufficient_privilege then null; end;
end; $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","user_metadata":{"role":"admin"}}',true);
do $$ declare affected integer; begin
if public.lumen_is_admin() then raise exception 'Metadata privilege escalation'; end if;
if (select count(*) from public.lumen_embeds where title='LUMEN_AUDIT_ONLY')<>1 then raise exception 'Draft leaked to member'; end if;
begin insert into public.lumen_admins(user_id) values('11111111-1111-4111-8111-111111111111'); raise exception 'Self-admin allowed'; exception when insufficient_privilege then null; end;
begin insert into public.lumen_embeds(media_type,tmdb_id,title,provider,embed_url) values('movie',2147480004,'LUMEN_AUDIT_ONLY','okru','https://ok.ru/videoembed/10455532636838'); raise exception 'Member write allowed'; exception when insufficient_privilege then null; end;
update public.lumen_embeds set published=false where title='LUMEN_AUDIT_ONLY'; get diagnostics affected=row_count; if affected<>0 then raise exception 'Member update allowed'; end if;
delete from public.lumen_embeds where title='LUMEN_AUDIT_ONLY'; get diagnostics affected=row_count; if affected<>0 then raise exception 'Member delete allowed'; end if;
end; $$;
rollback;
select 'OK: admin CRUD, anon/member blocked, drafts private, no self-elevation; rollback complete' as audit;
