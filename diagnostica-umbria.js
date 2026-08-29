// Diagnostica: prova a scaricare l'elenco comuni dell'Umbria e mostra l'errore VERO
const query = `[out:json][timeout:300];
area["name"="Umbria"]["admin_level"="4"]->.r;
rel(area.r)["admin_level"="8"]["boundary"="administrative"];
out ids tags;`;

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

async function prova() {
  for (const url of MIRRORS) {
    console.log(`\n--- Provo: ${url} ---`);
    try {
      const risposta = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'TrustOurant/1.0 (progetto recensioni ospitalita)',
        },
        body: 'data=' + encodeURIComponent(query)
      });
      console.log('Status HTTP:', risposta.status, risposta.statusText);
      const testo = await risposta.text();
      console.log('Prime 500 caratteri della risposta:');
      console.log(testo.substring(0, 500));
    } catch (e) {
      console.log('ERRORE DI RETE:', e.message);
      console.log('Dettaglio completo:', e);
    }
  }
}

prova();
