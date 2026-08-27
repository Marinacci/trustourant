// Script per reimpostare la password dell'account admin
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const DB_PATH = process.env.DB_PATH || './trustourant.db';
const db = new sqlite3.Database(DB_PATH);

const EMAIL = 'fulvietto.marinacci@gmail.com';
const NUOVA_PASSWORD = 'Trustourant2026!';

bcrypt.hash(NUOVA_PASSWORD, 10, (err, hash) => {
  if (err) {
    console.error('❌ Errore nella creazione della password:', err.message);
    db.close();
    return;
  }

  db.run(
    'UPDATE users SET password = ? WHERE email = ?',
    [hash, EMAIL],
    function (err) {
      if (err) {
        console.error('❌ Errore aggiornamento:', err.message);
      } else if (this.changes === 0) {
        console.log('⚠️  Nessun utente trovato con questa email:', EMAIL);
        console.log('   Prova a registrarti da capo sul sito con questa email.');
      } else {
        console.log('✅ Password reimpostata con successo per:', EMAIL);
        console.log('   Nuova password:', NUOVA_PASSWORD);
      }
      db.close();
    }
  );
});
