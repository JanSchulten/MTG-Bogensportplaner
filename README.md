# MTG Bogensportplaner

Terminplaner für das Bogensport-Training: Kalender mit allen Sonntags- und
Dienstagsterminen, Zu- und Absagen der drei Trainer, Wettervorhersage je Termin
sowie Seiten für News, Fundsachen und nützliche Videos.

Die Seite ist reines HTML, CSS und JavaScript — kein Build-Schritt, keine
Abhängigkeiten. Sie läuft direkt auf GitHub Pages. Die gemeinsamen Daten liegen
in einem kostenlosen [Supabase](https://supabase.com)-Projekt.

---

## Was die Seite kann

**Termine** (`index.html`)  — am Desktop stehen Kalender und Terminliste
nebeneinander, auf dem Handy untereinander.

* Monatskalender; jeder Sonntag (16:00–19:00) und Dienstag (17:30–19:00) ist
  automatisch angelegt und farbig markiert.
* Chris, Jan und JanS tragen je Termin „Bin da“ oder „Bin nicht da“ ein —
  jeder mit seiner eigenen PIN.
* Die Farbe zeigt sofort, woran man ist:

  | Farbe | Bedeutung |
  |---|---|
  | 🟩 grün | Mindestens ein Schlüsselträger (Chris oder Jan) ist da |
  | 🟨 gelb | Jemand ist da, aber weder Chris noch Jan — **niemand kann aufschließen** |
  | 🟥 rot | Kein Trainer hat zugesagt (oder es kam noch keine Rückmeldung) |
  | ⬜ grau | Termin abgesagt |

  Jede Farbe trägt zusätzlich Symbol und Text, damit sie auch bei
  Farbsehschwäche eindeutig ist.
* Mit dem Verwaltungspasswort lassen sich Zeiten, Ort und Notizen ändern,
  Termine absagen und Sondertermine anlegen.
* Je Termin gibt es einen einstellbaren Ort und dazu die Wettervorhersage
  (Temperatur, Regenwahrscheinlichkeit, Wind) für genau das Trainingsfenster.

**News** (`news.html`) — Ankündigungen, mit dem Passwort pflegbar, wichtige
Einträge lassen sich anheften.

**Lost & Found** (`lost-found.html`) — Fundsachen mit Foto. Eintragen darf jeder
ohne Passwort; als abgeholt markieren oder löschen nur die Verwaltung. Bilder
werden im Browser verkleinert, bevor sie hochgeladen werden.

**Videos** (`videos.html`) — Sammlung hilfreicher YouTube-Videos, eingebettet
über `youtube-nocookie.com`.

---

## Demo-Modus: gefahrlos ausprobieren

Hänge **`?demo=1`** an die Adresse, und die Seite arbeitet nur im eigenen
Browser — Änderungen berühren die echten Vereinsdaten nicht:

```
index.html?demo=1
```

Die Wahl gilt für die ganze Sitzung, also auch beim Wechsel auf News, Lost &
Found oder Videos. `?demo=0` schaltet zurück in den Normalbetrieb. Ein
Hinweisbanner zeigt jederzeit an, in welchem Modus die Seite läuft.

Zum lokalen Ausprobieren:

```bash
npm run serve        # http://localhost:8000/index.html?demo=1
```

Zugangsdaten im Demo-Modus: Passwort `RobinHood`, PINs `1111` (Chris),
`2222` (Jan), `3333` (JanS).

Ist in `config.js` gar keine Projekt-URL hinterlegt, läuft die Seite ohnehin
immer im Demo-Modus.

---

## Einrichtung mit Supabase

### 1. Projekt anlegen

Auf [supabase.com](https://supabase.com) ein kostenloses Projekt erstellen
(Region Frankfurt ist für Deutschland am schnellsten).

### 2. Datenbank aufsetzen

Im Supabase-Dashboard **SQL Editor** öffnen und nacheinander ausführen:

1. den kompletten Inhalt von [`supabase/schema.sql`](supabase/schema.sql) —
   Tabellen, Zugriffsregeln und Funktionen;
2. den kompletten Inhalt von [`supabase/seed.sql`](supabase/seed.sql) —
   Trainer, Passwort und PINs.

**Vor dem Ausführen von `seed.sql`** die drei PINs im markierten Block ändern.
Das Verwaltungspasswort steht bereits auf `RobinHood`.

`seed.sql` legt außerdem gleich alle Trainingstermine für die nächsten zwölf
Monate an.

### 3. Bilder-Bucket prüfen

`schema.sql` legt den Storage-Bucket `lostfound` mit an. Falls die beiden
`create policy … on storage.objects` am Ende der Datei an fehlenden Rechten
scheitern, lassen sie sich im Dashboard nachtragen unter
**Storage → lostfound → Policies**:

* `SELECT` für `anon` erlauben (Bilder anzeigen),
* `INSERT` für `anon` erlauben (Bilder hochladen),
* `UPDATE` und `DELETE` **nicht** erlauben.

### 4. Zugangsdaten eintragen — bereits erledigt

Projekt-URL und Publishable key stehen schon in
[`assets/js/config.js`](assets/js/config.js). Für ein anderes Projekt stehen
beide Werte in Supabase unter **Project Settings → API**:

```js
export const SUPABASE_URL = 'https://deinprojekt.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_...';
```

### 4b. Prüfen, ob die Datenbank steht

Der schnellste Weg: die Seite aufrufen. Sie sagt selbst, was fehlt — „Die
Datenbank ist noch nicht eingerichtet" oder „Es sind noch keine Trainer
angelegt" führen jeweils zum passenden Schritt oben.

Wer lieber im Terminal nachsieht:

```bash
curl "https://ipikdpqeismkbzbpnjlp.supabase.co/rest/v1/trainers?select=*" \
  -H "apikey: sb_publishable_LYpssl-5syTEc9cHGTxcnQ_-CdCeIct"
```

| Antwort | Bedeutung |
|---|---|
| Chris, Jan und JanS | alles bereit |
| `[]` | `schema.sql` lief, `seed.sql` fehlt noch |
| Meldung zu `relation ... does not exist` | `schema.sql` fehlt noch |
| `Invalid API key` | Publishable key in `config.js` prüfen |

### 5. Veröffentlichen

**Einmalig von Hand:** Repository → **Settings → Pages** → *Source* auf
**GitHub Actions** stellen.

Danach führt der Workflow
[`.github/workflows/pages.yml`](.github/workflows/pages.yml) bei jedem Push auf
`main` die Tests aus und veröffentlicht die Seite unter
`https://<benutzername>.github.io/MTG-Bogensportplaner/`.

Solange die Einstellung fehlt, laufen die Tests zwar durch, der `deploy`-Job
bricht aber ab mit *„Get Pages site failed … verify that the repository has
Pages enabled"*. Automatisieren lässt sich dieser Schritt nicht: das Anlegen
der Pages-Site verlangt Admin-Rechte, die der `GITHUB_TOKEN` eines Workflows
nicht besitzt.

---

## Wie der Zugriffsschutz funktioniert

Bei einer statischen Seite steht der Supabase-Schlüssel zwangsläufig im Browser.
Ein Passwortcheck in JavaScript wäre deshalb wertlos — jeder könnte ihn umgehen.
Der Schutz sitzt darum vollständig in der Datenbank:

* **Lesen** darf jeder. **Schreiben** darf der öffentliche Zugang an keiner
  Tabelle — es gibt schlicht keine Berechtigung dafür.
* Jede Änderung läuft über eine Datenbankfunktion, die Passwort bzw. PIN
  **serverseitig** prüft. Ohne korrektes Geheimnis passiert nichts.
* Passwort und PINs liegen nur als bcrypt-Hash in einer Tabelle, die von außen
  nicht lesbar ist.
* Jeder Trainer kann ausschließlich mit seiner eigenen PIN eintragen — Chris
  kann sich nicht für Jan eintragen.
* Eine kurze Verzögerung bei jeder Prüfung bremst das Durchprobieren der
  vierstelligen PINs.

Nach der Anmeldung liegt das Geheimnis für acht Stunden im `sessionStorage` des
Browsers, damit nicht jede Aktion erneut danach fragt. Das ist eine bewusste
Abwägung für einen Verein — sicher genug gegen versehentliche und neugierige
Änderungen, aber kein Ersatz für echte Benutzerkonten. Wer die Seite an einem
fremden Gerät nutzt, meldet sich über die Kopfzeile wieder ab.

**Passwort oder PIN später ändern** — im SQL Editor:

```sql
select change_secret('admin', 'RobinHood', 'NeuesPasswort');
select change_secret('chris', '1111', '9876');
```

---

## Wetter

Die Vorhersage kommt von [Open-Meteo](https://open-meteo.com) — kostenlos und
ohne API-Schlüssel. Damit sie funktioniert, braucht ein Termin Koordinaten:
im Bearbeiten-Dialog über **Ort suchen** einen Ort auswählen, dann werden sie
gesetzt. Über **Standardort** in der Kopfzeile lässt sich ein Ort für alle
künftigen Termine auf einmal hinterlegen.

Open-Meteo liefert bis zu 16 Tage im Voraus; weiter entfernte Termine zeigen
statt einer Vorhersage einen entsprechenden Hinweis.

---

## Bedienung auf Handy und Desktop

Die Seite ist mobil zuerst gebaut und an neun Fenstergrößen von 320 px bis
1920 px geprüft — kein waagerechtes Scrollen, kein abgeschnittener Text.

* Auf Touch-Geräten sind alle Bedienelemente mindestens 44 px hoch; die
  „Bin da“-Knöpfe als meistgenutzte Fläche sogar 46 px. Ausschlaggebend ist
  dabei die Eingabeart (`pointer: coarse`), nicht die Fensterbreite — ein
  Tablet mit 1024 px wird schließlich auch angetippt.
* Formularfelder sind auf Touch-Geräten mindestens 16 px groß, sonst zoomt
  Safari beim Antippen ungefragt ins Formular hinein.
* Ab 64 rem Breite stehen Kalender und Terminliste nebeneinander, der Kalender
  bleibt beim Blättern stehen.
* Die Kopfzeile ist nur dort angeheftet, wo sie flach ist — auf dem Handy
  würde sie mit umgebrochener Navigation sonst dauerhaft Platz kosten.
* Hell und dunkel folgen der Systemeinstellung.

## Tests

```bash
npm test
```

25 Tests, ohne Netzzugriff:

* **Ampel-Logik** — alle 27 Kombinationen der drei Trainer inklusive der
  Schlüsselregel, dazu Terminserie (auch über den Sommerzeitwechsel) und die
  Auswertung des Wetterfensters.
* **Schema-Vertrag** — vergleicht `assets/js/api-supabase.js` mit
  `supabase/schema.sql`: Funktionsnamen, Argumentnamen, gelesene Tabellen und
  Spalten, erteilte Rechte und der Storage-Bucket. Ein Tippfehler in einem
  Spaltennamen fällt so beim Testen auf statt erst im Betrieb.

Das Datenbankschema lässt sich mit [`supabase/verify.sql`](supabase/verify.sql)
gegenprüfen: nach `schema.sql` und `seed.sql` im SQL Editor ausführen. Die dort
erwarteten Fehlermeldungen sind gewollt — sie belegen, dass unerlaubte Zugriffe
abgewiesen werden.

---

## Aufbau

```
index.html · news.html · lost-found.html · videos.html
assets/css/style.css        gemeinsames Stylesheet (hell und dunkel)
assets/js/
  config.js                 Supabase-Zugangsdaten
  api.js                    wählt Supabase oder Demo-Modus
  api-supabase.js           REST-Zugriff ohne Bibliothek
  api-local.js              Demo-Backend im localStorage
  auth.js                   Anmeldung, Sitzung je Rolle
  appointments.js           Ampel-Logik und Terminserie
  calendar.js               Monatsraster
  weather.js                Open-Meteo
  place-field.js            Ortssuche
  image.js                  Bilder verkleinern
  shell.js · ui.js          Kopfzeile, Dialoge, Formatierung
  page-*.js                 je Seite ein Controller
supabase/
  schema.sql                Tabellen, Zugriffsregeln, Funktionen
  seed.sql                  Trainer, Passwort, PINs, Startdaten
  verify.sql                Selbsttest des Schemas
test/logic.test.js
```
