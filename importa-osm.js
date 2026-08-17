// ============================================================
// TrustOurant - Scaricatore Strutture da OpenStreetMap (v5)
// RIPRESA AUTOMATICA: non cancella, riempie solo i buchi.
// ============================================================
// Lo puoi lanciare piu' volte: ogni volta salta i comuni gia'
// fatti e scarica solo quelli mancanti. Lancialo 2-3 volte
// finche' non compaiono tutti (Merano compreso).
//
// USO:  node importa-osm.js
// ============================================================

const sqlite3 = require('sqlite3').verbose();

console.log('\n>>> TrustOurant importer VERSIONE 5 (ripresa automatica) <<<\n');

const REGIONI = [
  'Trentino-Alto Adige/Südtirol',
];

const TIPI = [
  { tag: 'tourism', valore: 'hotel',       etichetta: 'Hotel' },
  { tag: 'tourism', valore: 'guest_house', etichetta: 'B&B / Guest House' },
  { tag: 'tourism', valore: 'hostel',      etichetta: 'Ostello' },
  { tag: 'tourism', valore: 'apartment',   etichetta: 'Appartamento turistico' },
  { tag: 'amenity', valore: 'restaurant',  etichetta: 'Ristorante' },
  { tag: 'amenity', valore: 'bar',         etichetta: 'Bar' },
  { tag: 'amenity', valore: 'cafe',        etichetta: 'Caffè' },
  { tag: 'amenity', valore: 'pub',         etichetta: 'Pub' },
  { tag: 'amenity', valore: 'fast_food',   etichetta: 'Fast Food' },
];

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const DB_PATH = process.env.DB_PATH || './trustourant.db';
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) { console.error('Errore database:', err); process.exit(1); }
  console.log('Database connesso.\n');
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

async function preparaDatabase() {
  await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_no_doppioni ON strutture(nome, città, regione)');
  // NON cancella niente: vogliamo tenere quello che c'e' gia'.
}

async function overpassFetch(query) {
  const giri = 6;
  for (let giro = 1; giro <= giri; giro++) {
    for (const url of OVERPASS_MIRRORS) {
      try {
        const risposta = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'TrustOurant/1.0 (progetto recensioni ospitalita)',
            'Accept': '*/*'
          },
          body: 'data=' + encodeURIComponent(query)
        });
        if (risposta.ok) return await risposta.json();
      } catch (e) { /* provo il prossimo mirror */ }
    }
    if (giro < giri) {
      const attesa = 15000 * giro; // 15,30,45,60,75s
      console.log(`     (server occupati, aspetto ${attesa / 1000}s e riprovo...)`);
      await sleep(attesa);
    }
  }
  throw new Error('server non disponibili');
}

function areaIdDa(el) {
  if (el.type === 'relation') return 3600000000 + el.id;
  if (el.type === 'way') return 2400000000 + el.id;
  return null;
}

async function elencoComuni(regione) {
  const query = `[out:json][timeout:300];
area["name"="${regione}"]["admin_level"="4"]->.r;
rel(area.r)["admin_level"="8"]["boundary"="administrative"];
out ids tags;`;
  const dati = await overpassFetch(query);
  const comuni = [];
  for (const el of dati.elements) {
    const areaId = areaIdDa(el);
    if (el.tags && el.tags.name && areaId) comuni.push({ nome: el.tags.name, areaId });
  }
  return comuni;
}

async function strutturePerComune(areaId) {
  const righe = TIPI.map(t => `  node["${t.tag}"="${t.valore}"](area.c);`).join('\n');
  const query = `[out:json][timeout:120];
area(${areaId})->.c;
(
${righe}
);
out center;`;
  const dati = await overpassFetch(query);
  return dati.elements;
}

function tipoDa(tags) {
  for (const t of TIPI) if (tags[t.tag] === t.valore) return t.etichetta;
  return 'Struttura';
}

async function salvaStruttura(el, comune, regione) {
  const tags = el.tags || {};
  const nome = tags.name;
  if (!nome) return false;
  const tipo = tipoDa(tags);
  const provincia = tags['addr:province'] || '';
  const indirizzo = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  const telefono = tags.phone || tags['contact:phone'] || '';
  const email = tags.email || tags['contact:email'] || '';
  const sito = tags.website || tags['contact:website'] || '';
  const r = await run(
    `INSERT OR IGNORE INTO strutture
     (nome, tipo, città, provincia, regione, indirizzo, telefono, email, sito_web)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [nome, tipo, comune, provincia, regione, indirizzo, telefono, email, sito]
  );
  return r.changes > 0;
}

async function main() {
  await preparaDatabase();
  let salvateOra = 0, giaFatti = 0, mancanti = 0;

  for (const regione of REGIONI) {
    console.log(`=== Regione: ${regione} ===`);
    let comuni;
    try {
      comuni = await elencoComuni(regione);
    } catch (err) {
      console.error(`  ERRORE elenco comuni: ${err.message}`); continue;
    }
    console.log(`  ${comuni.length} comuni totali. Scarico solo quelli mancanti...\n`);

    let n = 0;
    for (const c of comuni) {
      n++;
      // Se il comune ha gia' strutture salvate, lo salto (ripresa)
      const esiste = await get(
        'SELECT COUNT(*) as n FROM strutture WHERE città = ? AND regione = ?',
        [c.nome, regione]
      );
      if (esiste && esiste.n > 0) { giaFatti++; continue; }

      try {
        const elementi = await strutturePerComune(c.areaId);
        let q = 0;
        for (const el of elementi) if (await salvaStruttura(el, c.nome, regione)) q++;
        salvateOra += q;
        console.log(`  [${n}/${comuni.length}] ${c.nome}: ${q} strutture NUOVE`);
        if (q === 0) mancanti++; // comune davvero vuoto (o ancora da riprovare)
      } catch (err) {
        mancanti++;
        console.log(`  [${n}/${comuni.length}] ${c.nome}: non riuscito (riprova rilanciando)`);
      }
      await sleep(1500);
    }
  }

  console.log(`\n============================================`);
  console.log(`Strutture NUOVE aggiunte ora: ${salvateOra}`);
  console.log(`Comuni gia' fatti e saltati: ${giaFatti}`);
  console.log(`Comuni ancora vuoti/da riprovare: ${mancanti}`);
  if (mancanti > 0) {
    console.log(`\n>>> RILANCIA lo stesso comando per riempire i comuni mancanti <<<`);
  } else {
    console.log(`\n>>> COMPLETO! Tutti i comuni hanno strutture. <<<`);
  }
  console.log(`============================================\n`);

  db.close(() => process.exit(0));
}

main();
