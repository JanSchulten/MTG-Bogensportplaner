-- ============================================================================
--  MTG Bogensportplaner — Datenbankschema für Supabase
--  Im Supabase-Dashboard unter  SQL Editor  einmal komplett ausführen.
--  Danach supabase/seed.sql ausführen (dort werden Passwort und PINs gesetzt).
--
--  Sicherheitsgedanke: Die Seite ist statisch, der anon-Key steht also im
--  Browser. Deshalb darf `anon` ausschließlich LESEN. Jede Änderung läuft über
--  die Funktionen weiter unten, die Passwort bzw. PIN in der Datenbank prüfen.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

-- ---------------------------------------------------------------- Tabellen --

create table if not exists public.trainers (
  id       text primary key,
  name     text not null,
  has_key  boolean not null default false,
  sort     integer not null default 0
);

create table if not exists public.appointments (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  start_time  time not null,
  end_time    time not null,
  location    text,
  lat         double precision,
  lon         double precision,
  note        text,
  cancelled   boolean not null default false,
  is_custom   boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint appointments_time_order check (end_time > start_time)
);

-- Verhindert doppelte Termine und macht ensure_appointments() idempotent.
create unique index if not exists appointments_slot_idx
  on public.appointments (date, start_time);

create table if not exists public.attendance (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  trainer_id     text not null references public.trainers(id) on delete cascade,
  status         text not null check (status in ('da', 'nicht_da')),
  updated_at     timestamptz not null default now(),
  primary key (appointment_id, trainer_id)
);

create table if not exists public.news (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  pinned     boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.lost_found (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  image_path  text,
  found_date  date,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.videos (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  youtube_id  text not null,
  description text,
  sort        integer,
  created_at  timestamptz not null default now()
);

create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);

-- Passwort und PINs, ausschließlich als bcrypt-Hash. Für `anon` unlesbar.
create table if not exists public.app_secrets (
  key         text primary key,
  secret_hash text not null,
  updated_at  timestamptz not null default now()
);

-- Erspart der Seite einen zweiten Rundlauf: Anwesenheiten mit Termindatum.
create or replace view public.attendance_in_range as
  select a.appointment_id, a.trainer_id, a.status, a.updated_at, ap.date
  from public.attendance a
  join public.appointments ap on ap.id = a.appointment_id;

-- --------------------------------------------------------------------- RLS --

alter table public.trainers     enable row level security;
alter table public.appointments enable row level security;
alter table public.attendance   enable row level security;
alter table public.news         enable row level security;
alter table public.lost_found   enable row level security;
alter table public.videos       enable row level security;
alter table public.settings     enable row level security;
alter table public.app_secrets  enable row level security;

-- Lesen ist für alle frei; Schreibrechte vergibt keine einzige Policy.
do $$
declare t text;
begin
  foreach t in array array['trainers','appointments','attendance','news','lost_found','videos','settings']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_read', t
    );
  end loop;
end $$;

-- Policies regeln nur, WELCHE Zeilen sichtbar sind — das Recht auf die Tabelle
-- selbst muss zusätzlich erteilt werden, sonst liest `anon` gar nichts.
grant usage on schema public to anon, authenticated;
grant select on
  public.trainers, public.appointments, public.attendance,
  public.news, public.lost_found, public.videos, public.settings,
  public.attendance_in_range
to anon, authenticated;

-- Schreibrechte gibt es an keiner Stelle: alles läuft über die Funktionen.
revoke insert, update, delete on
  public.trainers, public.appointments, public.attendance,
  public.news, public.lost_found, public.videos, public.settings
from anon, authenticated;

-- app_secrets bekommt bewusst gar keine Policy und kein Recht: niemand außer
-- den SECURITY-DEFINER-Funktionen unten kommt an die Hashes.
revoke all on public.app_secrets from anon, authenticated;

-- ------------------------------------------------------- Geheimnis-Prüfung --

create or replace function public.check_secret(p_key text, p_secret text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  stored text;
begin
  -- Bremst das Durchprobieren der vierstelligen Trainer-PINs.
  perform pg_sleep(0.3);
  select secret_hash into stored from public.app_secrets where key = p_key;
  if stored is null then
    return false;
  end if;
  return stored = crypt(coalesce(p_secret, ''), stored);
end;
$$;

create or replace function public.secret_key_for(p_role text)
returns text
language sql
immutable
as $$
  select case when p_role = 'admin' then 'admin' else 'pin_' || p_role end;
$$;

create or replace function public.verify_secret(p_role text, p_secret text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select public.check_secret(public.secret_key_for(p_role), p_secret);
$$;

create or replace function public.assert_admin(p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.check_secret('admin', p_password) then
    raise exception 'Falsches Passwort.' using errcode = '28000';
  end if;
end;
$$;

-- ------------------------------------------------------------- Termine --

create or replace function public.ensure_appointments(p_from date, p_until date)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  created integer;
  defaults jsonb;
begin
  -- Schutz vor versehentlich riesigen Zeiträumen.
  if p_from < current_date - interval '2 years' or p_until > current_date + interval '3 years' then
    raise exception 'Zeitraum zu groß.' using errcode = '22023';
  end if;
  if p_until < p_from then
    return 0;
  end if;

  select value into defaults from public.settings where key = 'default_location';

  insert into public.appointments (date, start_time, end_time, location, lat, lon, is_custom)
  select
    d::date,
    case when extract(dow from d) = 0 then time '16:00' else time '17:30' end,
    time '19:00',
    defaults ->> 'name',
    (defaults ->> 'lat')::double precision,
    (defaults ->> 'lon')::double precision,
    false
  from generate_series(p_from::timestamp, p_until::timestamp, interval '1 day') d
  where extract(dow from d) in (0, 2)   -- 0 = Sonntag, 2 = Dienstag
  on conflict (date, start_time) do nothing;

  get diagnostics created = row_count;
  return created;
end;
$$;

create or replace function public.set_attendance(
  p_appointment uuid,
  p_trainer     text,
  p_status      text,
  p_pin         text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (select 1 from public.trainers where id = p_trainer) then
    raise exception 'Unbekannter Trainer.' using errcode = '22023';
  end if;

  -- Jeder Trainer trägt nur mit der eigenen PIN ein.
  if not public.check_secret(public.secret_key_for(p_trainer), p_pin) then
    raise exception 'Falsche PIN.' using errcode = '28000';
  end if;

  if p_status is null then
    delete from public.attendance
     where appointment_id = p_appointment and trainer_id = p_trainer;
    return;
  end if;

  if p_status not in ('da', 'nicht_da') then
    raise exception 'Ungültiger Status.' using errcode = '22023';
  end if;

  insert into public.attendance (appointment_id, trainer_id, status, updated_at)
  values (p_appointment, p_trainer, p_status, now())
  on conflict (appointment_id, trainer_id)
  do update set status = excluded.status, updated_at = now();
end;
$$;

create or replace function public.save_appointment(
  p_id        uuid,
  p_date      date,
  p_start     time,
  p_end       time,
  p_location  text,
  p_lat       double precision,
  p_lon       double precision,
  p_note      text,
  p_cancelled boolean,
  p_password  text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_id uuid;
begin
  perform public.assert_admin(p_password);

  if p_end <= p_start then
    raise exception 'Das Ende muss nach dem Beginn liegen.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.appointments (date, start_time, end_time, location, lat, lon, note, cancelled, is_custom)
    values (p_date, p_start, p_end, p_location, p_lat, p_lon, p_note, coalesce(p_cancelled, false), true)
    returning id into new_id;
  else
    update public.appointments
       set date = p_date, start_time = p_start, end_time = p_end,
           location = p_location, lat = p_lat, lon = p_lon,
           note = p_note, cancelled = coalesce(p_cancelled, false)
     where id = p_id
    returning id into new_id;

    if new_id is null then
      raise exception 'Termin nicht gefunden.' using errcode = '02000';
    end if;
  end if;

  return new_id;
exception
  when unique_violation then
    raise exception 'Zu diesem Zeitpunkt gibt es bereits einen Termin.' using errcode = '23505';
end;
$$;

create or replace function public.delete_appointment(p_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  custom boolean;
begin
  perform public.assert_admin(p_password);

  select is_custom into custom from public.appointments where id = p_id;
  if custom is null then
    raise exception 'Termin nicht gefunden.' using errcode = '02000';
  end if;

  -- Ein gelöschter Standardtermin würde sofort neu erzeugt — deshalb absagen.
  if not custom then
    raise exception 'Standardtermine bitte absagen statt löschen.' using errcode = '22023';
  end if;

  delete from public.appointments where id = p_id;
end;
$$;

-- ----------------------------------------------------------------- News --

create or replace function public.save_news(
  p_id uuid, p_title text, p_body text, p_pinned boolean, p_password text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_id uuid;
begin
  perform public.assert_admin(p_password);

  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then
    raise exception 'Überschrift und Text dürfen nicht leer sein.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.news (title, body, pinned)
    values (left(p_title, 200), left(p_body, 8000), coalesce(p_pinned, false))
    returning id into new_id;
  else
    update public.news
       set title = left(p_title, 200), body = left(p_body, 8000), pinned = coalesce(p_pinned, false)
     where id = p_id
    returning id into new_id;
    if new_id is null then
      raise exception 'Eintrag nicht gefunden.' using errcode = '02000';
    end if;
  end if;

  return new_id;
end;
$$;

create or replace function public.delete_news(p_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.assert_admin(p_password);
  delete from public.news where id = p_id;
end;
$$;

-- ----------------------------------------------------------- Lost & Found --

-- Bewusst ohne Passwort: wer etwas findet, soll es ohne Hürde eintragen können.
create or replace function public.save_lost_found(
  p_id uuid, p_title text, p_description text, p_image_path text, p_found_date date
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_id uuid;
begin
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Bitte den Gegenstand benennen.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.lost_found (title, description, image_path, found_date)
    values (left(p_title, 200), left(p_description, 4000), p_image_path, p_found_date)
    returning id into new_id;
  else
    update public.lost_found
       set title = left(p_title, 200), description = left(p_description, 4000),
           image_path = coalesce(p_image_path, image_path), found_date = p_found_date
     where id = p_id
    returning id into new_id;
    if new_id is null then
      raise exception 'Eintrag nicht gefunden.' using errcode = '02000';
    end if;
  end if;

  return new_id;
end;
$$;

create or replace function public.set_lost_found_resolved(
  p_id uuid, p_resolved boolean, p_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.assert_admin(p_password);
  update public.lost_found set resolved = coalesce(p_resolved, false) where id = p_id;
end;
$$;

create or replace function public.delete_lost_found(p_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  path text;
begin
  perform public.assert_admin(p_password);

  select image_path into path from public.lost_found where id = p_id;
  delete from public.lost_found where id = p_id;

  -- Das Bild im Storage mit entfernen, damit keine Karteileichen bleiben.
  if path is not null then
    delete from storage.objects where bucket_id = 'lostfound' and name = path;
  end if;
end;
$$;

-- --------------------------------------------------------------- Videos --

create or replace function public.save_video(
  p_id uuid, p_title text, p_youtube_id text, p_description text,
  p_sort integer, p_password text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_id uuid;
begin
  perform public.assert_admin(p_password);

  if p_youtube_id !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'Ungültige YouTube-Video-ID.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.videos (title, youtube_id, description, sort)
    values (left(p_title, 200), p_youtube_id, left(p_description, 2000),
            coalesce(p_sort, (select coalesce(max(sort), 0) + 1 from public.videos)))
    returning id into new_id;
  else
    update public.videos
       set title = left(p_title, 200), youtube_id = p_youtube_id,
           description = left(p_description, 2000), sort = coalesce(p_sort, sort)
     where id = p_id
    returning id into new_id;
    if new_id is null then
      raise exception 'Video nicht gefunden.' using errcode = '02000';
    end if;
  end if;

  return new_id;
end;
$$;

create or replace function public.delete_video(p_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.assert_admin(p_password);
  delete from public.videos where id = p_id;
end;
$$;

-- ------------------------------------------------------------ Einstellungen --

create or replace function public.save_setting(p_key text, p_value jsonb, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.assert_admin(p_password);
  insert into public.settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
end;
$$;

-- Passwort oder PIN ändern, ohne SQL-Kenntnisse: alte Angabe muss stimmen.
create or replace function public.change_secret(
  p_role text, p_old_secret text, p_new_secret text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.check_secret(public.secret_key_for(p_role), p_old_secret) then
    raise exception 'Bisheriges Passwort bzw. bisherige PIN stimmt nicht.' using errcode = '28000';
  end if;
  if length(coalesce(p_new_secret, '')) < 4 then
    raise exception 'Bitte mindestens 4 Zeichen wählen.' using errcode = '22023';
  end if;

  update public.app_secrets
     set secret_hash = crypt(p_new_secret, gen_salt('bf')), updated_at = now()
   where key = public.secret_key_for(p_role);
end;
$$;

-- ------------------------------------------------------------------ Rechte --

-- check_secret und assert_admin sind reine Bausteine und bleiben intern.
revoke all on function public.check_secret(text, text) from public, anon, authenticated;
revoke all on function public.assert_admin(text) from public, anon, authenticated;

grant execute on function public.verify_secret(text, text)            to anon, authenticated;
grant execute on function public.ensure_appointments(date, date)      to anon, authenticated;
grant execute on function public.set_attendance(uuid, text, text, text) to anon, authenticated;
grant execute on function public.save_appointment(uuid, date, time, time, text, double precision, double precision, text, boolean, text) to anon, authenticated;
grant execute on function public.delete_appointment(uuid, text)       to anon, authenticated;
grant execute on function public.save_news(uuid, text, text, boolean, text) to anon, authenticated;
grant execute on function public.delete_news(uuid, text)              to anon, authenticated;
grant execute on function public.save_lost_found(uuid, text, text, text, date) to anon, authenticated;
grant execute on function public.set_lost_found_resolved(uuid, boolean, text) to anon, authenticated;
grant execute on function public.delete_lost_found(uuid, text)        to anon, authenticated;
grant execute on function public.save_video(uuid, text, text, text, integer, text) to anon, authenticated;
grant execute on function public.delete_video(uuid, text)             to anon, authenticated;
grant execute on function public.save_setting(text, jsonb, text)      to anon, authenticated;
grant execute on function public.change_secret(text, text, text)      to anon, authenticated;

-- ------------------------------------------------------------------ Storage --

insert into storage.buckets (id, name, public)
values ('lostfound', 'lostfound', true)
on conflict (id) do update set public = true;

drop policy if exists "lostfound_read" on storage.objects;
create policy "lostfound_read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'lostfound');

-- Hochladen ist offen, Überschreiben und Löschen nicht: ein bereits
-- hochgeladenes Bild kann niemand von außen austauschen oder entfernen.
drop policy if exists "lostfound_insert" on storage.objects;
create policy "lostfound_insert" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'lostfound');
