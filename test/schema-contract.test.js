/**
 * Hält den Vertrag zwischen Browser-Code und Datenbank fest.
 *
 * `api-supabase.js` spricht Supabase über REST an — Tippfehler in einem
 * Funktions- oder Spaltennamen fallen dort erst im laufenden Betrieb auf, und
 * dann als kryptische PostgREST-Meldung. Dieser Test vergleicht beide Seiten
 * ohne Netzzugriff miteinander.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../assets/js/api-supabase.js', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

/* ------------------------------------------------------------ Schema lesen */

/** Funktionsname -> sortierte Liste der p_-Argumentnamen */
function sqlFunctions() {
  const out = new Map();
  const re = /create or replace function public\.(\w+)\s*\(([\s\S]*?)\)\s*returns/g;
  for (const m of schema.matchAll(re)) {
    out.set(m[1], [...new Set([...m[2].matchAll(/\b(p_\w+)\s+\w/g)].map((a) => a[1]))].sort());
  }
  return out;
}

/** Tabellen-/Viewname -> Spaltenliste */
function sqlRelations() {
  const out = new Map();
  for (const m of schema.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
    const cols = [...m[2].matchAll(/^ {2}(\w+)\s+\S/gm)]
      .map((c) => c[1])
      .filter((c) => !['constraint', 'primary', 'unique', 'foreign', 'check'].includes(c));
    out.set(m[1], cols);
  }
  for (const m of schema.matchAll(/create or replace view public\.(\w+) as([\s\S]*?);/g)) {
    const select = m[2].match(/select ([\s\S]*?) from/);
    const cols = select[1].split(',').map((c) => c.trim().split(/\s+as\s+|\./).pop());
    out.set(m[1], cols);
  }
  return out;
}

/* ------------------------------------------------- Browser-Aufrufe lesen */

/** RPC-Name -> sortierte Argumentnamen, wie der Browser sie sendet */
function clientRpcCalls() {
  const out = new Map();
  for (const m of client.matchAll(/rpc\('(\w+)',\s*\{([\s\S]*?)\}\)/g)) {
    out.set(m[1], [...new Set([...m[2].matchAll(/(p_\w+):/g)].map((a) => a[1]))].sort());
  }
  return out;
}

/** {relation, columns} je select()-Aufruf */
function clientSelects() {
  const out = [];
  for (const m of client.matchAll(/select\(\s*'(\w+)',\s*([\s\S]*?)\n?\s*\);/g)) {
    const query = m[2];
    const columns = new Set();

    const list = query.match(/select=([\w,*]+)/);
    if (list && list[1] !== '*') list[1].split(',').forEach((c) => columns.add(c));

    const order = query.match(/order=([\w.,]+)/);
    if (order) {
      order[1].split(',').forEach((teil) => columns.add(teil.split('.')[0]));
    }

    // Filter der Form `spalte=gte.…`
    for (const f of query.matchAll(/[?&`]\s*(\w+)=(?:eq|gte|lte|gt|lt|neq|like|in)\./g)) {
      columns.add(f[1]);
    }

    out.push({ relation: m[1], columns: [...columns].filter(Boolean) });
  }
  return out;
}

/* -------------------------------------------------------------------- Tests */

test('der Browser ruft nur Funktionen auf, die es im Schema gibt', () => {
  const funktionen = sqlFunctions();
  const aufrufe = clientRpcCalls();

  assert.ok(aufrufe.size >= 13, `nur ${aufrufe.size} RPC-Aufrufe gefunden — Parser prüfen`);

  for (const [name] of aufrufe) {
    assert.ok(funktionen.has(name), `Funktion "${name}" fehlt in supabase/schema.sql`);
  }
});

test('die Argumentnamen jedes RPC-Aufrufs stimmen mit dem Schema überein', () => {
  const funktionen = sqlFunctions();

  for (const [name, gesendet] of clientRpcCalls()) {
    const erwartet = funktionen.get(name);
    assert.deepEqual(
      gesendet,
      erwartet,
      `"${name}": Browser sendet [${gesendet}], Schema erwartet [${erwartet}]`
    );
  }
});

test('Funktionen mit Passwortprüfung sind für anon freigegeben', () => {
  for (const [name] of clientRpcCalls()) {
    const re = new RegExp(`grant execute on function public\\.${name}\\(`);
    assert.match(
      schema,
      re,
      `"${name}" wird vom Browser gerufen, hat aber kein grant execute für anon`
    );
  }
});

test('gelesene Tabellen und Spalten existieren im Schema', () => {
  const relationen = sqlRelations();
  const selects = clientSelects();

  assert.ok(selects.length >= 6, `nur ${selects.length} select()-Aufrufe gefunden — Parser prüfen`);

  for (const { relation, columns } of selects) {
    assert.ok(relationen.has(relation), `Tabelle/View "${relation}" fehlt im Schema`);
    for (const column of columns) {
      assert.ok(
        relationen.get(relation).includes(column),
        `Spalte "${column}" gibt es in "${relation}" nicht (vorhanden: ${relationen.get(relation)})`
      );
    }
  }
});

test('jede gelesene Tabelle ist für anon freigegeben und hat eine Lese-Policy', () => {
  const grants = schema.match(/grant select on([\s\S]*?)to anon, authenticated;/);
  assert.ok(grants, 'kein "grant select ... to anon" im Schema gefunden');

  for (const { relation } of clientSelects()) {
    assert.ok(
      grants[1].includes(`public.${relation}`),
      `"${relation}" wird gelesen, ist aber nicht im grant select enthalten`
    );
  }
});

test('der Storage-Bucket aus der Konfiguration wird im Schema angelegt', () => {
  const config = readFileSync(new URL('../assets/js/config.js', import.meta.url), 'utf8');
  const bucket = config.match(/STORAGE_BUCKET = '([^']+)'/)[1];

  assert.match(schema, new RegExp(`values \\('${bucket}', '${bucket}'`),
    `Bucket "${bucket}" wird in schema.sql nicht angelegt`);
  assert.match(schema, new RegExp(`bucket_id = '${bucket}'`),
    `keine Storage-Policy für Bucket "${bucket}"`);
});
