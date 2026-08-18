-- ============================================================================
--  Selbsttest des Schemas. Nach schema.sql + seed.sql ausführen.
--  Erwartet die PINs aus seed.sql (chris = 1111). Nach dem Test einmal
--  supabase/seed.sql erneut laufen lassen, um die Testdaten zu überschreiben.
--
--  Zeilen mit ERROR sind hier ERWÜNSCHT: sie zeigen, dass unerlaubte
--  Zugriffe abgewiesen werden. Kommentiert ist jeweils, was passieren soll.
-- ============================================================================

\set ON_ERROR_STOP 0
\pset pager off

\echo '### 1  Geheimnisse: richtig -> t, falsch -> f'
select verify_secret('admin','RobinHood') as admin_ok,
       verify_secret('admin','robinhood') as admin_falsch,
       verify_secret('chris','1111')      as chris_ok,
       verify_secret('chris','2222')      as chris_fremde_pin;

\echo '### 2  ensure_appointments ist idempotent -> 0 neue Zeilen'
select ensure_appointments(date_trunc('month', current_date)::date,
                           (current_date + interval '12 months')::date) as neu;

\echo '### 3  Nur Sonntag (16-19) und Dienstag (17:30-19)'
select to_char(date,'Dy') as tag, start_time, end_time, count(*)
from appointments group by 1,2,3 order by 2;

\echo '### 4  Als anon: Schreiben MUSS scheitern, Lesen MUSS klappen'
set role anon;
insert into news (title, body) values ('Hack','x');          -- erwartet: ERROR
update appointments set cancelled = true;                     -- erwartet: ERROR
select * from app_secrets;                                    -- erwartet: ERROR
select count(*) > 0 as termine_lesbar from appointments;      -- erwartet: t
select count(*) >= 0 as view_lesbar from attendance_in_range; -- erwartet: t

\echo '### 5  Zusage: falsche PIN abgewiesen, richtige akzeptiert'
select set_attendance((select id from appointments order by date limit 1),
                      'chris','da','9999');                   -- erwartet: ERROR
select set_attendance((select id from appointments order by date limit 1),
                      'chris','da','1111');                   -- erwartet: ok
\echo '--- Chris darf sich nicht mit Chris'' PIN als Jan eintragen:'
select set_attendance((select id from appointments order by date limit 1),
                      'jan','da','1111');                     -- erwartet: ERROR

\echo '### 6  Verwaltung: falsches Passwort abgewiesen'
select save_news(null,'Titel','Text',false,'falsch');         -- erwartet: ERROR
select save_news(null,'Testnews','Inhalt',true,'RobinHood') is not null as ok;

\echo '### 7  Standardtermin: löschen gesperrt, absagen erlaubt'
select delete_appointment((select id from appointments where not is_custom
                           order by date limit 1),'RobinHood'); -- erwartet: ERROR
select save_appointment((select id from appointments where not is_custom order by date limit 1),
                        (select date from appointments where not is_custom order by date limit 1),
                        '16:00','19:00','Bogenwiese',50.8,8.77,'Notiz',true,'RobinHood')
       is not null as abgesagt;

\echo '### 8  Doppelter Termin auf denselben Slot wird abgefangen'
select save_appointment(null,
  (select date from appointments where not is_custom order by date limit 1),
  (select start_time from appointments where not is_custom order by date limit 1),
  '19:00',null,null,null,null,false,'RobinHood');             -- erwartet: ERROR

\echo '### 9  Video-ID wird geprüft'
select save_video(null,'Test','nicht-gueltig',null,null,'RobinHood');  -- erwartet: ERROR
select save_video(null,'Technik','dQw4w9WgXcQ','Beschreibung',1,'RobinHood') is not null as ok;

\echo '### 10 Lost & Found: eintragen offen, löschen nur mit Passwort'
select save_lost_found(null,'Armschutz','beim Ziel gefunden',null,current_date) is not null as ok;
select delete_lost_found((select id from lost_found limit 1),'falsch');  -- erwartet: ERROR

\echo '### 11 PIN ändern und zurücksetzen'
reset role;
select change_secret('chris','1111','4242');
select verify_secret('chris','4242') as neue_pin, verify_secret('chris','1111') as alte_pin;
select change_secret('chris','4242','1111');

\echo '### 12 Zeitraumschutz gegen versehentliche Massenanlage'
select ensure_appointments('2000-01-01','2030-01-01');        -- erwartet: ERROR

\echo '### 13 Aufräumen der Testdaten'
delete from news where title = 'Testnews';
delete from videos where youtube_id = 'dQw4w9WgXcQ';
delete from lost_found where title = 'Armschutz';
delete from attendance where trainer_id = 'chris';
