-- ============================================================================
--  Startdaten: Trainer sowie Passwort und PINs.
--  ERST supabase/schema.sql ausführen, dann diese Datei.
--  Läuft unverändert im SQL-Editor von Supabase.
-- ============================================================================

set search_path = public, extensions;

insert into public.trainers (id, name, has_key, sort) values
  ('chris', 'Chris', true,  1),
  ('jan',   'Jan',   true,  2),
  ('jans',  'JanS',  false, 3)
on conflict (id) do update
  set name = excluded.name, has_key = excluded.has_key, sort = excluded.sort;

do $$
-- --------------------------------------------------------------------------
--  HIER ANPASSEN — die vier Geheimnisse.
--  Das Verwaltungspasswort steht wie gewünscht auf „RobinHood“.
--  Die drei PINs bitte vor dem Ausführen durch eigene ersetzen: sie stehen
--  nur hier, nie in der Webseite, und werden als bcrypt-Hash gespeichert.
--  Später ändern geht ohne SQL über  select change_secret('chris','1111','9876');
-- --------------------------------------------------------------------------
declare
  admin_password constant text := 'RobinHood';
  pin_chris      constant text := '1111';
  pin_jan        constant text := '2222';
  pin_jans       constant text := '3333';
begin
  insert into public.app_secrets (key, secret_hash) values
    ('admin',     crypt(admin_password, gen_salt('bf'))),
    ('pin_chris', crypt(pin_chris,      gen_salt('bf'))),
    ('pin_jan',   crypt(pin_jan,        gen_salt('bf'))),
    ('pin_jans',  crypt(pin_jans,       gen_salt('bf')))
  on conflict (key) do update
    set secret_hash = excluded.secret_hash, updated_at = now();
end $$;

-- Standardtermine (Sonntag + Dienstag) für die nächsten zwölf Monate anlegen.
select public.ensure_appointments(
  date_trunc('month', current_date)::date,
  (current_date + interval '12 months')::date
);
