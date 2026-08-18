const sqlite3 = require('sqlite3').verbose();
const DB_PATH = process.env.DB_PATH || './trustourant.db';

console.log('Apro il database in:', DB_PATH);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ ERRORE APERTURA DATABASE:', err.message);
    return;
  }
  console.log('✅ Database aperto senza errori.');

  db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
      console.error('❌ Errore lettura tabelle:', err.message);
      db.close();
      return;
    }
    console.log('Tabelle trovate nel file:', tables.map(t => t.name));

    if (tables.some(t => t.name === 'strutture')) {
      db.get('SELECT COUNT(*) as n FROM strutture', (err, row) => {
        if (err) {
          console.error('Errore conteggio strutture:', err.message);
        } else {
          console.log('Numero di strutture nel database:', row.n);
        }
        db.close();
      });
    } else {
      console.log('⚠️ La tabella "strutture" NON esiste in questo file.');
      db.close();
    }
  });
});
