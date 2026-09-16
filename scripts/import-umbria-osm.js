'use strict';

/*
 * Importatore ripetibile delle strutture hospitality umbre da OpenStreetMap.
 * Fonte: OpenStreetMap contributors, licenza ODbL. Non importa recensioni né
 * email; conserva solo dati professionali pubblici necessari alla ricerca.
 * Eseguire sul servizio Render, dove DB_PATH punta al database persistente:
 *   npm run import:umbria
 */

const sqlite3 = require('sqlite3').verbose();
const DB_PATH = process.env.DB_PATH || './trustourant.db';
const db = new sqlite3.Database(DB_PATH);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function(err) { err ? reject(err) : resolve(this); }));
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));

const normalize = value => String(value || '').trim().toLocaleLowerCase('it-IT').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ');
const mirrors = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

async function overpass(query) {
  for (const url of mirrors) {
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Trustourant/1.0 (hospitality directory)' }, body: `data=${encodeURIComponent(query)}` });
      if (response.ok) return response.json();
    } catch { /* prova il mirror successivo */ }
  }
  throw new Error('I servizi OpenStreetMap sono temporaneamente non disponibili.');
}

const areaId = element => element.type === 'relation' ? 3600000000 + element.id : element.type === 'way' ? 2400000000 + element.id : null;

async function comuniUmbri() {
  const query = '[out:json][timeout:300];area["name"="Umbria"]["admin_level"="4"]->.region;rel(area.region)["boundary"="administrative"]["admin_level"="8"];out ids tags;';
  const data = await overpass(query);
  return data.elements.map(element => ({ nome: element.tags?.name, area: areaId(element) })).filter(comune => comune.nome && comune.area).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
}

async function struttureComune(comune) {
  const query = `[out:json][timeout:240];area(${comune.area})->.comune;(nwr["tourism"~"^(hotel|guest_house|hostel|motel|apartment|chalet|resort|camp_site|caravan_site)$"](area.comune);nwr["amenity"~"^(restaurant|fast_food|cafe|bar|pub|ice_cream)$"](area.comune);nwr["shop"="bakery"](area.comune););out center tags;`;
  return (await overpass(query)).elements;
}

function tipo(tags) {
  const tourism = { hotel: 'Hotel', guest_house: 'B&B / Guest House', hostel: 'Ostello', motel: 'Motel', apartment: 'Appartamento turistico', chalet: 'Chalet', resort: 'Resort', camp_site: 'Campeggio', caravan_site: 'Area camper' };
  const amenity = { restaurant: 'Ristorante', fast_food: 'Ristorazione veloce', cafe: 'Caffè', bar: 'Bar', pub: 'Pub', ice_cream: 'Gelateria' };
  return tourism[tags.tourism] || amenity[tags.amenity] || (tags.shop === 'bakery' ? 'Pasticceria / Panificio' : 'Struttura hospitality');
}

async function exists(row) {
  const candidates = await all('SELECT indirizzo, sito_web FROM strutture WHERE regione = ? AND LOWER(nome) = LOWER(?) AND LOWER(città) = LOWER(?)', ['Umbria', row.nome, row.città]);
  return candidates.some(existing => !row.indirizzo || !existing.indirizzo || normalize(existing.indirizzo) === normalize(row.indirizzo) || (row.sito_web && normalize(existing.sito_web) === normalize(row.sito_web)));
}

async function save(element, comune) {
  const tags = element.tags || {};
  const nome = String(tags.name || '').trim();
  if (!nome) return 'skipped';
  const row = { nome, tipo: tipo(tags), città: comune.nome, provincia: tags['addr:province'] || '', regione: 'Umbria', indirizzo: [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' '), telefono: tags.phone || tags['contact:phone'] || '', sito_web: tags.website || tags['contact:website'] || '', latitudine: element.lat ?? element.center?.lat ?? null, longitudine: element.lon ?? element.center?.lon ?? null };
  if (await exists(row)) return 'duplicate';
  const result = await run('INSERT INTO strutture (nome,tipo,città,provincia,regione,indirizzo,telefono,sito_web,latitudine,longitudine,fonte_dati,importato_il) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)', [row.nome,row.tipo,row.città,row.provincia,row.regione,row.indirizzo,row.telefono,row.sito_web,row.latitudine,row.longitudine,'OpenStreetMap contributors (ODbL)']);
  return result.changes ? 'inserted' : 'skipped';
}

async function main() {
  const before = await get('SELECT COUNT(*) AS n FROM strutture WHERE regione = ?', ['Umbria']);
  const totals = { inserted: 0, duplicate: 0, skipped: 0, errors: 0 };
  const comuni = await comuniUmbri();
  console.log(`Umbria: ${before.n} strutture presenti; ${comuni.length} comuni da verificare.`);
  for (const [index, comune] of comuni.entries()) {
    try {
      for (const element of await struttureComune(comune)) totals[await save(element, comune)]++;
      console.log(`[${index + 1}/${comuni.length}] ${comune.nome}: completato`);
    } catch (error) {
      totals.errors++;
      console.error(`[${index + 1}/${comuni.length}] ${comune.nome}: ${error.message}`);
    }
    await pause(1200);
  }
  const after = await get('SELECT COUNT(*) AS n FROM strutture WHERE regione = ?', ['Umbria']);
  console.log(JSON.stringify({ prima: before.n, aggiunte: totals.inserted, totale_finale: after.n, duplicati_scartati: totals.duplicate, record_scartati: totals.skipped, comuni_con_errore: totals.errors }, null, 2));
  db.close();
}

main().catch(error => { console.error(error.message); db.close(); process.exitCode = 1; });
