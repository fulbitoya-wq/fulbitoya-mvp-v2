-- FASE 1 panel predios: estados, datos de alta, revisión, invitación piloto.
-- No toca Mercado Pago ni migraciones anteriores.

alter table public.canchas
  add column if not exists estado text,
  add column if not exists responsable_nombre text,
  add column if not exists responsable_email text,
  add column if not exists responsable_telefono text,
  add column if not exists responsable_doc text,
  add column if not exists whatsapp text,
  add column if not exists parrilla boolean not null default false,
  add column if not exists horarios_apertura jsonb,
  add column if not exists fotos jsonb not null default '[]'::jsonb,
  add column if not exists enviado_revision_at timestamptz,
  add column if not exists aprobado_at timestamptz,
  add column if not exists suspendido_at timestamptz,
  add column if not exists revision_nota text;

update public.canchas
set estado = case when coalesce(activa, true) then 'aprobado' else 'suspendido' end
where estado is null;

alter table public.canchas drop constraint if exists canchas_estado_chk;
alter table public.canchas
  add constraint canchas_estado_chk check (
    estado in ('borrador', 'en_revision', 'aprobado', 'suspendido')
  );

alter table public.canchas alter column estado set default 'borrador';
alter table public.canchas alter column estado set not null;

update public.canchas
set horarios_apertura = '{
  "lun":{"abierto":true,"desde":"08:00","hasta":"23:00"},
  "mar":{"abierto":true,"desde":"08:00","hasta":"23:00"},
  "mie":{"abierto":true,"desde":"08:00","hasta":"23:00"},
  "jue":{"abierto":true,"desde":"08:00","hasta":"23:00"},
  "vie":{"abierto":true,"desde":"08:00","hasta":"23:00"},
  "sab":{"abierto":true,"desde":"08:00","hasta":"23:00"},
  "dom":{"abierto":true,"desde":"08:00","hasta":"23:00"}
}'::jsonb
where horarios_apertura is null;

insert into public.config_plataforma (clave, valor_text)
values ('fy_admin_email', null)
on conflict (clave) do nothing;

create or replace function public.fy_es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.es_admin_plataforma()
    or exists (
      select 1
      from public.config_plataforma c
      where c.clave = 'fy_admin_email'
        and c.valor_text is not null
        and length(btrim(c.valor_text)) > 0
        and lower(btrim(c.valor_text)) = lower(coalesce(auth.jwt()->>'email', ''))
    );
$$;

revoke all on function public.fy_es_admin() from public;
grant execute on function public.fy_es_admin() to authenticated;

create or replace function public.fy_sync_cancha_activa()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'aprobado' then
    new.activa := true;
  else
    new.activa := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fy_sync_cancha_activa on public.canchas;
create trigger trg_fy_sync_cancha_activa
before insert or update of estado on public.canchas
for each row execute function public.fy_sync_cancha_activa();

create or replace function public.fy_cancha_estado_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if public.fy_es_admin() then
      return new;
    end if;
    if old.estado in ('borrador', 'en_revision')
       and new.estado in ('borrador', 'en_revision')
       and new.owner_id = auth.uid() then
      return new;
    end if;
    raise exception 'no_permiso_estado';
  end if;
  if tg_op = 'INSERT' and new.estado in ('aprobado', 'suspendido') and not public.fy_es_admin() then
    new.estado := 'borrador';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fy_cancha_estado_guard on public.canchas;
create trigger trg_fy_cancha_estado_guard
before insert or update of estado on public.canchas
for each row execute function public.fy_cancha_estado_guard();

drop policy if exists "Todos pueden ver canchas activas" on public.canchas;
drop policy if exists "Ver canchas aprobadas o propias" on public.canchas;
create policy "Ver canchas aprobadas o propias"
  on public.canchas for select
  using (
    estado = 'aprobado'
    or owner_id = auth.uid()
    or public.fy_es_admin()
  );

create table if not exists public.predio_invitaciones (
  id uuid primary key default gen_random_uuid(),
  cancha_id uuid not null references public.canchas(id) on delete cascade,
  email text not null,
  token text not null unique,
  invited_by uuid references public.usuarios(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  claimed_at timestamptz,
  claimed_by uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_predio_invitaciones_email on public.predio_invitaciones (lower(email));

alter table public.predio_invitaciones enable row level security;
revoke all on table public.predio_invitaciones from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'predio-galeria',
  'predio-galeria',
  true,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

drop policy if exists "Leer galeria predio" on storage.objects;
create policy "Leer galeria predio"
  on storage.objects for select
  to public
  using (bucket_id = 'predio-galeria');

drop policy if exists "Subir galeria predio autenticado" on storage.objects;
create policy "Subir galeria predio autenticado"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'predio-galeria'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.fy_soy_admin()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('ok', true, 'admin', public.fy_es_admin());
$$;

revoke all on function public.fy_soy_admin() from public;
grant execute on function public.fy_soy_admin() to authenticated;

create or replace function public.fy_enviar_revision(p_cancha_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ca public.canchas%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  select * into v_ca from public.canchas where id = p_cancha_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if v_ca.owner_id is distinct from auth.uid() and not public.fy_es_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_dueno_predio');
  end if;
  if v_ca.estado not in ('borrador', 'en_revision') then
    return jsonb_build_object('ok', false, 'error', 'estado_invalido');
  end if;
  if nullif(btrim(coalesce(v_ca.responsable_nombre, '')), '') is null
     or nullif(btrim(coalesce(v_ca.responsable_email, '')), '') is null
     or nullif(btrim(coalesce(v_ca.responsable_telefono, '')), '') is null
     or nullif(btrim(coalesce(v_ca.responsable_doc, '')), '') is null
     or nullif(btrim(coalesce(v_ca.nombre, '')), '') is null
     or nullif(btrim(coalesce(v_ca.direccion, '')), '') is null
     or v_ca.lat is null or v_ca.lng is null then
    return jsonb_build_object('ok', false, 'error', 'faltan_datos');
  end if;
  update public.canchas
  set estado = 'en_revision',
      enviado_revision_at = now(),
      revision_nota = null
  where id = p_cancha_id;
  return jsonb_build_object('ok', true, 'estado', 'en_revision');
end;
$$;

revoke all on function public.fy_enviar_revision(uuid) from public;
grant execute on function public.fy_enviar_revision(uuid) to authenticated;

create or replace function public.fy_admin_listar_predios()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.fy_es_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_admin');
  end if;
  return jsonb_build_object(
    'ok', true,
    'predios', coalesce((
      select jsonb_agg(s.x order by s.x->>'updated')
      from (
        select jsonb_build_object(
          'id', ca.id,
          'nombre', ca.nombre,
          'estado', ca.estado,
          'barrio', ca.barrio,
          'direccion', ca.direccion,
          'responsable_nombre', ca.responsable_nombre,
          'responsable_email', ca.responsable_email,
          'responsable_telefono', ca.responsable_telefono,
          'owner_email', u.email,
          'enviado_revision_at', ca.enviado_revision_at,
          'revision_nota', ca.revision_nota,
          'updated', coalesce(ca.enviado_revision_at, ca.created_at)
        ) as x
        from public.canchas ca
        left join public.usuarios u on u.id = ca.owner_id
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.fy_admin_listar_predios() from public;
grant execute on function public.fy_admin_listar_predios() to authenticated;

create or replace function public.fy_admin_set_estado(
  p_cancha_id uuid,
  p_estado text,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.fy_es_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_admin');
  end if;
  if p_estado not in ('borrador', 'en_revision', 'aprobado', 'suspendido') then
    return jsonb_build_object('ok', false, 'error', 'estado_invalido');
  end if;
  if not exists (select 1 from public.canchas where id = p_cancha_id) then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  update public.canchas
  set estado = p_estado,
      revision_nota = nullif(btrim(coalesce(p_nota, '')), ''),
      aprobado_at = case when p_estado = 'aprobado' then now() else aprobado_at end,
      suspendido_at = case when p_estado = 'suspendido' then now() else suspendido_at end
  where id = p_cancha_id;
  return jsonb_build_object('ok', true, 'estado', p_estado);
end;
$$;

revoke all on function public.fy_admin_set_estado(uuid, text, text) from public;
grant execute on function public.fy_admin_set_estado(uuid, text, text) to authenticated;

create or replace function public.fy_admin_invitar_predio(p_nombre text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_token text;
  v_email text := lower(btrim(p_email));
begin
  if not public.fy_es_admin() then
    return jsonb_build_object('ok', false, 'error', 'no_admin');
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null or v_email not like '%_@_%.%' then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into public.canchas (nombre, estado, owner_id, responsable_email, activa)
  values (btrim(p_nombre), 'borrador', null, v_email, false)
  returning id into v_id;
  insert into public.predio_invitaciones (cancha_id, email, token, invited_by)
  values (v_id, v_email, v_token, auth.uid());
  return jsonb_build_object('ok', true, 'cancha_id', v_id, 'token', v_token, 'email', v_email);
end;
$$;

revoke all on function public.fy_admin_invitar_predio(text, text) from public;
grant execute on function public.fy_admin_invitar_predio(text, text) to authenticated;

create or replace function public.fy_ver_invitacion(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_inv public.predio_invitaciones%rowtype;
  v_nombre text;
begin
  select * into v_inv from public.predio_invitaciones where token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if v_inv.claimed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'ya_usada');
  end if;
  if v_inv.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'vencida');
  end if;
  select nombre into v_nombre from public.canchas where id = v_inv.cancha_id;
  return jsonb_build_object(
    'ok', true,
    'cancha_id', v_inv.cancha_id,
    'nombre', v_nombre,
    'email', v_inv.email
  );
end;
$$;

revoke all on function public.fy_ver_invitacion(text) from public;
grant execute on function public.fy_ver_invitacion(text) to authenticated, anon;

create or replace function public.fy_reclamar_predio(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.predio_invitaciones%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;
  select * into v_inv from public.predio_invitaciones where token = p_token for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  if v_inv.claimed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'ya_usada');
  end if;
  if v_inv.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'vencida');
  end if;
  update public.canchas
  set owner_id = auth.uid(),
      responsable_email = coalesce(nullif(btrim(responsable_email), ''), v_inv.email)
  where id = v_inv.cancha_id;
  update public.predio_invitaciones
  set claimed_at = now(), claimed_by = auth.uid()
  where id = v_inv.id;
  update public.usuarios set rol = 'owner' where id = auth.uid() and rol is distinct from 'owner';
  return jsonb_build_object('ok', true, 'cancha_id', v_inv.cancha_id);
end;
$$;

revoke all on function public.fy_reclamar_predio(text) from public;
grant execute on function public.fy_reclamar_predio(text) to authenticated;

create or replace function public.listar_predios_publicos()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_hoy date := public.ahora_argentina()::date;
begin
  perform public.plc_liberar_holds_vencidos();
  return jsonb_build_object(
    'ok', true,
    'predios', coalesce((
      select jsonb_agg(s.p order by s.p->>'nombre')
      from (
        select jsonb_build_object(
          'id', ca.id,
          'nombre', ca.nombre,
          'barrio', ca.barrio,
          'direccion', ca.direccion,
          'lat', ca.lat,
          'lng', ca.lng
        ) as p
        from public.canchas ca
        where ca.estado = 'aprobado'
          and coalesce(ca.activa, true)
          and exists (
            select 1
            from public.campos c
            join public.disponibilidades d on d.campo_id = c.id
            where c.cancha_id = ca.id
              and d.estado = 'disponible'
              and d.fecha >= v_hoy
          )
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.listar_turnos_publicos()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_hoy date := public.ahora_argentina()::date;
begin
  perform public.plc_liberar_holds_vencidos();
  return jsonb_build_object(
    'ok', true,
    'turnos', coalesce((
      select jsonb_agg(s.x order by s.x->>'fecha', s.x->>'hora_inicio')
      from (
        select jsonb_build_object(
          'id', d.id,
          'fecha', d.fecha,
          'hora_inicio', d.hora_inicio,
          'hora_fin', d.hora_fin,
          'precio', d.precio,
          'campo_id', c.id,
          'campo_nombre', c.nombre,
          'campo_tipo', c.tipo,
          'cancha_id', ca.id,
          'cancha_nombre', ca.nombre,
          'barrio', ca.barrio
        ) as x
        from public.disponibilidades d
        join public.campos c on c.id = d.campo_id
        join public.canchas ca on ca.id = c.cancha_id
        where d.estado = 'disponible'
          and d.fecha >= v_hoy
          and ca.estado = 'aprobado'
          and coalesce(ca.activa, true)
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.plc_predio_publico(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ca public.canchas%rowtype;
  v_hoy date := public.ahora_argentina()::date;
begin
  perform public.plc_liberar_holds_vencidos();
  select * into v_ca
  from public.canchas
  where slug = lower(trim(p_slug))
    and estado = 'aprobado'
    and coalesce(activa, true);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;
  return jsonb_build_object(
    'ok', true,
    'id', v_ca.id,
    'nombre', v_ca.nombre,
    'slug', v_ca.slug,
    'barrio', v_ca.barrio,
    'direccion', v_ca.direccion,
    'turnos', coalesce((
      select jsonb_agg(s.x order by s.x->>'fecha', s.x->>'hora_inicio')
      from (
        select jsonb_build_object(
          'id', d.id,
          'fecha', d.fecha,
          'hora_inicio', d.hora_inicio,
          'hora_fin', d.hora_fin,
          'precio', d.precio,
          'campo_nombre', c.nombre,
          'campo_tipo', c.tipo
        ) as x
        from public.disponibilidades d
        join public.campos c on c.id = d.campo_id
        where c.cancha_id = v_ca.id
          and d.estado = 'disponible'
          and d.fecha >= v_hoy
      ) s
    ), '[]'::jsonb)
  );
end;
$$;
