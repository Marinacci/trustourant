// Test 1: una richiesta semplicissima, per vedere se i mirror funzionano in generale
// Test 2: la stessa richiesta pesante ma con timeout più basso, per vedere se risponde più in fretta

const MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

async function testSemplice(url) {
  const query = `[out:json][timeout:25];node(45.0,7.0,45.1,7.1)["amenity"="restaurant"];out;`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query)
    });
    const testo = await r.text();
    console.log(`  [semplice] Status: ${r.status} - lunghezza risposta: ${testo.length} caratteri`);
  } catch (e) {
    console.log(`  [semplice] ERRORE: ${e.message}`);
  }
}

async function testUmbriaVeloce(url) {
  const query = `[out:json][timeout:25];area["name"="Umbria"]["admin_level"="4"]->.r;rel(area.r)["admin_level"="8"]["boundary"="administrative"];out ids tags;`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query)
    });
    const testo = await r.text();
    console.log(`  [Umbria 25s] Status: ${r.status} - lunghezza risposta: ${testo.length} caratteri`);
    if (r.status !== 200) console.log(`  Risposta: ${testo.substring(0, 300)}`);
  } catch (e) {
    console.log(`  [Umbria 25s] ERRORE: ${e.message}`);
  }
}

async function main() {
  for (const url of MIRRORS) {
    console.log(`\n=== ${url} ===`);
    await testSemplice(url);
    await testUmbriaVeloce(url);
  }
}

main();
