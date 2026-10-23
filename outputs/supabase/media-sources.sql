-- FekaMovies · MP4 / HLS. Amplía los formatos sin modificar registros ni permisos RLS.
begin;
alter table public.lumen_embeds drop constraint if exists lumen_embeds_provider_check;
alter table public.lumen_embeds add constraint lumen_embeds_provider_check check (provider in ('okru','youtube','vimeo','dailymotion','mp4','hls'));
alter table public.lumen_embeds drop constraint if exists lumen_embed_valid;
alter table public.lumen_embeds add constraint lumen_embed_valid check (
    (provider='okru' and embed_url ~ '^https://ok[.]ru/videoembed/[0-9]+$') or
    (provider='youtube' and embed_url ~ '^https://www[.]youtube[.]com/embed/[a-zA-Z0-9_-]{11}$') or
    (provider='vimeo' and embed_url ~ '^https://player[.]vimeo[.]com/video/[0-9]+$') or
    (provider='dailymotion' and embed_url ~ '^https://www[.]dailymotion[.]com/embed/video/[a-zA-Z0-9]+$') or
    (provider in ('mp4','hls') and embed_url ~ '^https://[^/@?#[:space:]]+/' and embed_url !~ '[[:space:]]' and
      ((provider='mp4' and embed_url ~* '[.]mp4([?][^#]*)?$') or
       (provider='hls' and embed_url ~* '[.]m3u8([?][^#]*)?$')))
  );
commit;
