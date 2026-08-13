// Script per aggiungere manualmente una struttura mancante da OpenStreetMap
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./trustourant.db');

const struttura = {
  nome: 'Hotel Schenna Resort',
  tipo: 'Hotel',
  città: 'Schenna - Scena',
  provincia: 'BZ',
  regione: 'Trentino-Alto Adige',
  indirizzo: 'Via Strada Vecchia 14, 39017 Scena (BZ)',
  telefono: null,
  email: null,
  sito_web: null
};

db.get(
  'SELECT id FROM strutture WHERE nome = ? AND città = ?',
  [struttura.nome, struttura.città],
  (err, row) => {
    if (err) {
      console.error('Errore controllo duplicati:', err.message);
      db.close();
      return;
    }
    if (row) {
      console.log('⚠️  Struttura già presente nel database (id ' + row.id + '), non aggiunta di nuovo.');
      db.close();
      return;
    }
    db.run(
      `INSERT INTO strutture (nome, tipo, città, provincia, regione, indirizzo, telefono, email, sito_web, rating, num_reviews, bloccata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)`,
      [struttura.nome, struttura.tipo, struttura.città, struttura.provincia, struttura.regione, struttura.indirizzo, struttura.telefono, struttura.email, struttura.sito_web],
      function (err) {
        if (err) {
          console.error('❌ Errore inserimento:', err.message);
        } else {
          console.log('✅ Struttura aggiunta con successo! id:', this.lastID);
          console.log('   Nome:', struttura.nome);
          console.log('   Città:', struttura.città);
          console.log('   Indirizzo:', struttura.indirizzo);
        }
        db.close();
      }
    );
  }
);
