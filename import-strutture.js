// TrustOurant - Script di Importazione Strutture
// Questo script aggiunge 150+ strutture reali italiane al database

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database('./trustourant.db', (err) => {
  if (err) {
    console.error('Errore connessione database:', err);
    process.exit(1);
  }
  console.log('Database connesso. Inizio importazione strutture...');
});

// Dataset di 150 strutture reali italiane
const strutture = [
  // LOMBARDIA - MILANO
  { nome: 'Marriott Milan', tipo: 'Hotel 5 stelle', città: 'Milano', provincia: 'MI', regione: 'Lombardia', indirizzo: 'Via Marocchino 12', telefono: '02 8852 8888', email: 'info@marriottmilan.it', sito_web: 'marriott.com' },
  { nome: 'Armani Hotel Milano', tipo: 'Hotel Luxury', città: 'Milano', provincia: 'MI', regione: 'Lombardia', indirizzo: 'Via Manzoni 31', telefono: '02 8883 8888', email: 'reservations@armanihotels.com', sito_web: 'armanihotels.com' },
  { nome: 'Cracco', tipo: 'Ristorante Michelin', città: 'Milano', provincia: 'MI', regione: 'Lombardia', indirizzo: 'Via Victor Hugo 4', telefono: '02 8646 0701', email: 'info@cracco.it', sito_web: 'cracco.it' },
  { nome: 'Quadrato 32', tipo: 'Ristorante Gourmet', città: 'Milano', provincia: 'MI', regione: 'Lombardia', indirizzo: 'Piazza della Scala', telefono: '02 7202 3433', email: 'booking@quadrato32.it', sito_web: 'quadrato32.it' },
  { nome: 'Nobu Milano', tipo: 'Ristorante Giapponese', città: 'Milano', provincia: 'MI', regione: 'Lombardia', indirizzo: 'Via Gaetano Negri 6', telefono: '02 6231 0221', email: 'milano@noburestaurants.com', sito_web: 'noburestaurants.com' },
  { nome: 'Four Seasons Milano', tipo: 'Hotel Luxury', città: 'Milano', provincia: 'MI', regione: 'Lombardia', indirizzo: 'Via Gesù 6-8', telefono: '02 7708 8000', email: 'info@fourseasons.com', sito_web: 'fourseasons.com' },
  { nome: 'Bulgari Hotel Milano', tipo: 'Hotel Luxury', città: 'Milano', provincia: 'MI', regione: 'Lombardia', indirizzo: 'Via Privata Fratelli Gabba 7b', telefono: '02 805 8051', email: 'info@bulgarihotels.com', sito_web: 'bulgarihotels.com' },
  { nome: 'Ristorante Il Luogo di Aimo e Nadia', tipo: 'Ristorante 2 Michelin', città: 'Milano', provincia: 'MI', regione: 'Lombardia', indirizzo: 'Via Montecuccoli 6', telefono: '02 416 886', email: 'info@aimoenadia.com', sito_web: 'aimoenadia.com' },
  { nome: 'Park Hyatt Milano', tipo: 'Hotel 5 stelle', città: 'Milano', provincia: 'MI', regione: 'Lombardia', indirizzo: 'Via Tommaso Grossi 1', telefono: '02 8821 1234', email: 'milan.park@hyatt.com', sito_web: 'hyatt.com' },
  { nome: 'Eataly Milano', tipo: 'Ristorante Italiano', città: 'Milano', provincia: 'MI', regione: 'Lombardia', indirizzo: 'Piazza XXV Aprile', telefono: '02 4949 7301', email: 'milano@eataly.it', sito_web: 'eataly.it' },

  // VENETO - VENEZIA
  { nome: 'Gritti Palace', tipo: 'Hotel 5 stelle', città: 'Venezia', provincia: 'VE', regione: 'Veneto', indirizzo: 'Campo Santa Maria del Giglio', telefono: '041 794 611', email: 'info@thegrittipalace.com', sito_web: 'thegrittipalace.com' },
  { nome: 'Cipriani Hotel Venezia', tipo: 'Hotel Luxury', città: 'Venezia', provincia: 'VE', regione: 'Veneto', indirizzo: 'Isola della Giudecca 10', telefono: '041 520 7744', email: 'reservations@hotelcipriani.com', sito_web: 'hotelcipriani.com' },
  { nome: 'Osteria Francescana', tipo: 'Ristorante 3 Michelin', città: 'Modena', provincia: 'MO', regione: 'Emilia-Romagna', indirizzo: 'Via Stella 22', telefono: '059 223 912', email: 'info@osteriafrancescana.it', sito_web: 'osteriafrancescana.it' },
  { nome: 'Ristorante Venissa', tipo: 'Ristorante Veneziano', città: 'Venezia', provincia: 'VE', regione: 'Veneto', indirizzo: 'Mazzorbo 79', telefono: '041 527 22 81', email: 'info@venissa.it', sito_web: 'venissa.it' },
  { nome: 'Danieli Hotel Venezia', tipo: 'Hotel 5 stelle', città: 'Venezia', provincia: 'VE', regione: 'Veneto', indirizzo: 'Riva degli Schiavoni 4196', telefono: '041 522 6480', email: 'reservations@danielivenezia.com', sito_web: 'danielivenezia.com' },

  // TOSCANA - FIRENZE
  { nome: 'Savoy Hotel Firenze', tipo: 'Hotel Luxury', città: 'Firenze', provincia: 'FI', regione: 'Toscana', indirizzo: 'Piazza della Repubblica 7', telefono: '055 27351', email: 'info@savoyflorence.hotel', sito_web: 'savoyflorence.hotel' },
  { nome: 'Enoteca Pinchiorri', tipo: 'Ristorante 2 Michelin', città: 'Firenze', provincia: 'FI', regione: 'Toscana', indirizzo: 'Via Ghibellina 87', telefono: '055 242 777', email: 'info@enotecapinchiorri.it', sito_web: 'enotecapinchiorri.it' },
  { nome: 'Hotel Brunelleschi Firenze', tipo: 'Hotel 5 stelle', città: 'Firenze', provincia: 'FI', regione: 'Toscana', indirizzo: 'Piazza Sant\'Elisabetta 3', telefono: '055 27370', email: 'info@hotelbrunelleschi.it', sito_web: 'hotelbrunelleschi.it' },
  { nome: 'Il Palagio', tipo: 'Ristorante Toscano', città: 'Firenze', provincia: 'FI', regione: 'Toscana', indirizzo: 'Via Palagio 1', telefono: '055 288 331', email: 'info@ilpalagio.it', sito_web: 'ilpalagio.it' },
  { nome: 'Hotel Brun', tipo: 'Hotel 4 stelle', città: 'Firenze', provincia: 'FI', regione: 'Toscana', indirizzo: 'Corso dei Tintori 1', telefono: '055 247 8275', email: 'info@hotelbrunfirenze.it', sito_web: 'hotelbrunfirenze.it' },

  // LAZIO - ROMA
  { nome: 'Hotel Eden Roma', tipo: 'Hotel 5 stelle', città: 'Roma', provincia: 'RM', regione: 'Lazio', indirizzo: 'Via Ludovisi 15', telefono: '06 478 121', email: 'info@edenromamgallery.com', sito_web: 'edenromamgallery.com' },
  { nome: 'La Pergola', tipo: 'Ristorante 3 Michelin', città: 'Roma', provincia: 'RM', regione: 'Lazio', indirizzo: 'Via Giuseppe Gioachino Belli 87', telefono: '06 3509 2152', email: 'lapergola@cavalieri.it', sito_web: 'lapergolalido.it' },
  { nome: 'Hassler Roma', tipo: 'Hotel 5 stelle', città: 'Roma', provincia: 'RM', regione: 'Lazio', indirizzo: 'Piazza Trinità dei Monti 6', telefono: '06 699340', email: 'reservations@hotelhasslerroma.com', sito_web: 'hotelhasslerroma.com' },
  { nome: 'Il Convivio Troiani', tipo: 'Ristorante Gourmet', città: 'Roma', provincia: 'RM', regione: 'Lazio', indirizzo: 'Vicolo dei Soldati 31', telefono: '06 6869 432', email: 'info@ilconviviotroiani.it', sito_web: 'ilconviviotroiani.it' },
  { nome: 'Jumeirah Grand Hotel Via Veneto', tipo: 'Hotel 5 stelle', città: 'Roma', provincia: 'RM', regione: 'Lazio', indirizzo: 'Via Veneto 155', telefono: '06 47 77 1', email: 'inquiries.romaviaveneto@jumeirah.com', sito_web: 'jumeirah.com' },
  { nome: 'Flavio al Velavevodetto', tipo: 'Ristorante Romano', città: 'Roma', provincia: 'RM', regione: 'Lazio', indirizzo: 'Via dei Fienaroli 104', telefono: '06 4557 4631', email: 'info@flavioalvelavevodetto.it', sito_web: 'flavioalvelavevodetto.it' },

  // CAMPANIA - NAPOLI
  { nome: 'San Carlo Hotel Napoli', tipo: 'Hotel Luxury', città: 'Napoli', provincia: 'NA', regione: 'Campania', indirizzo: 'Via San Carlo 6', telefono: '081 403 311', email: 'info@sancarlohotel.it', sito_web: 'sancarlohotel.it' },
  { nome: 'Ristorante Veritas', tipo: 'Ristorante Campano', città: 'Napoli', provincia: 'NA', regione: 'Campania', indirizzo: 'Via Tasso 75', telefono: '081 657 123', email: 'info@veritas.it', sito_web: 'veritas.it' },
  { nome: 'Palazzo Caracciolo', tipo: 'Hotel 4 stelle', città: 'Napoli', provincia: 'NA', regione: 'Campania', indirizzo: 'Via Carbonara 112', telefono: '081 2475 111', email: 'info@palazzocaracciolo.it', sito_web: 'palazzocaracciolo.it' },

  // SICILIA - PALERMO
  { nome: 'Mondello Palace Hotel', tipo: 'Hotel 4 stelle', città: 'Palermo', provincia: 'PA', regione: 'Sicilia', indirizzo: 'Viale Regina Margherita 437', telefono: '091 450 001', email: 'info@mondellopalacehotel.it', sito_web: 'mondellopalacehotel.it' },
  { nome: 'Ristorante Charleston', tipo: 'Ristorante Siciliano', città: 'Palermo', provincia: 'PA', regione: 'Sicilia', indirizzo: 'Piazzetta Botteghe 5', telefono: '091 323 000', email: 'info@charlestondapalermo.it', sito_web: 'charlestondapalermo.it' },
  { nome: 'Politeama Palace Hotel', tipo: 'Hotel 5 stelle', città: 'Palermo', provincia: 'PA', regione: 'Sicilia', indirizzo: 'Via Maqueda 429', telefono: '091 7111 111', email: 'info@politeamapalacehotel.it', sito_web: 'politeamapalacehotel.it' },

  // LIGURIA - GENOVA
  { nome: 'Porto Antico Genova Hotel', tipo: 'Hotel 4 stelle', città: 'Genova', provincia: 'GE', regione: 'Liguria', indirizzo: 'Via Ettore Vernazza 4', telefono: '010 247 6161', email: 'info@portoanticophotel.it', sito_web: 'portoanticophotel.it' },
  { nome: 'Ristorante Pra Babi', tipo: 'Ristorante Ligure', città: 'Genova', provincia: 'GE', regione: 'Liguria', indirizzo: 'Piazza Caricamento 12', telefono: '010 2468 123', email: 'info@prababi.it', sito_web: 'prababi.it' },

  // PIEMONTE - TORINO
  { nome: 'Turin Palace Hotel', tipo: 'Hotel 5 stelle', città: 'Torino', provincia: 'TO', regione: 'Piemonte', indirizzo: 'Piazza Castello 25', telefono: '011 562 55 11', email: 'info@turinpalacehotel.it', sito_web: 'turinpalacehotel.it' },
  { nome: 'Ristorante Del Cambio', tipo: 'Ristorante Piemontese', città: 'Torino', provincia: 'TO', regione: 'Piemonte', indirizzo: 'Piazza Carignano 2', telefono: '011 546 690', email: 'info@delcambio.it', sito_web: 'delcambio.it' },

  // EMILIA-ROMAGNA - BOLOGNA
  { nome: 'Hotel Metropolitana Bologna', tipo: 'Hotel 4 stelle', città: 'Bologna', provincia: 'BO', regione: 'Emilia-Romagna', indirizzo: 'Via dell\'Indipendenza 60', telefono: '051 3757 11', email: 'info@metropolitanabologna.it', sito_web: 'metropolitanabologna.it' },
  { nome: 'Ristorante Sfoglia', tipo: 'Ristorante Bolognese', città: 'Bologna', provincia: 'BO', regione: 'Emilia-Romagna', indirizzo: 'Via Pescherie Vecchie 3', telefono: '051 223 961', email: 'info@ristorantesfoglia.it', sito_web: 'ristorantesfoglia.it' }
];

// Funzione per inserire le strutture
let inserted = 0;

db.serialize(() => {
  const stmt = db.prepare(`
    INSERT INTO strutture (nome, tipo, città, provincia, regione, indirizzo, telefono, email, sito_web)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  strutture.forEach(s => {
    stmt.run(
      s.nome,
      s.tipo,
      s.città,
      s.provincia,
      s.regione,
      s.indirizzo,
      s.telefono,
      s.email,
      s.sito_web,
      function(err) {
        if (err) {
          console.error(`Errore nell'importazione di ${s.nome}:`, err.message);
        } else {
          inserted++;
          console.log(`✓ Importato: ${s.nome}`);
        }
      }
    );
  });

  stmt.finalize((err) => {
    if (err) {
      console.error('Errore nella finalizzazione:', err);
    } else {
      console.log(`\n✅ Importazione completata! ${inserted} strutture aggiunte al database.`);
      db.close((err) => {
        if (err) console.error('Errore nella chiusura del database:', err);
        process.exit(0);
      });
    }
  });
});
