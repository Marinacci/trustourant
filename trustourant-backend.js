// TrustOurant Backend - FASE 4
// Aggiunge: Email Notifications, Admin Dashboard, Ban Users, Export Data

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'trustourant-secret-key-change-in-production';

// Configurazione Email (Nodemailer)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER || 'trustourant@gmail.com',
    pass: process.env.EMAIL_PASSWORD || 'your-app-password-here'
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Database SQLite
const DB_PATH = process.env.DB_PATH || './trustourant.db';
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('Database error:', err);
  else console.log('Database connected');
});

// Crea le tabelle se non esistono
db.serialize(() => {
  // Tabella utenti
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nome TEXT NOT NULL,
    verificato INTEGER DEFAULT 0,
    bannato INTEGER DEFAULT 0,
    struttura_attuale TEXT,
    posizione TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabella strutture
  db.run(`CREATE TABLE IF NOT EXISTS strutture (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL,
    città TEXT NOT NULL,
    provincia TEXT NOT NULL,
    regione TEXT NOT NULL,
    indirizzo TEXT,
    telefono TEXT,
    email TEXT,
    sito_web TEXT,
    rating REAL DEFAULT 0,
    num_reviews INTEGER DEFAULT 0,
    bloccata INTEGER DEFAULT 0,
    vitto_alloggio TEXT,
    stagionalita TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabella recensioni
  db.run(`CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    struttura_id INTEGER NOT NULL,
    valutazione_chef REAL,
    valutazione_datore REAL,
    salario TEXT,
    ore_lavoro TEXT,
    clima_lavoro INTEGER,
    commento TEXT,
    consiglio_direzione TEXT,
    rifaresti TEXT,
    colloquio_info TEXT,
    consiglierebbe INTEGER,
    risposta_datore TEXT,
    risposta_datore_data DATETIME,
    risposta_datore_moderata INTEGER DEFAULT 0,
    rating_medio REAL,
    moderato INTEGER DEFAULT 0,
    respinto INTEGER DEFAULT 0,
    motivo_rifiuto TEXT,
    verificato_dipendente INTEGER DEFAULT 0,
    email_notificato INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(struttura_id) REFERENCES strutture(id)
  )`);

  // Tabella verificazioni
  db.run(`CREATE TABLE IF NOT EXISTS verificazioni (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    struttura_id INTEGER NOT NULL,
    periodo_inizio DATE,
    periodo_fine DATE,
    posizione TEXT,
    verificato INTEGER DEFAULT 0,
    email_notificato INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(struttura_id) REFERENCES strutture(id)
  )`);

  // Tabella moderazioni log
  db.run(`CREATE TABLE IF NOT EXISTS moderazioni_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER,
    review_id INTEGER,
    azione TEXT,
    motivo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabella admin actions log
  db.run(`CREATE TABLE IF NOT EXISTS admin_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER,
    azione TEXT,
    target_type TEXT,
    target_id INTEGER,
    dettagli TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// ============ MIGRAZIONE AUTOMATICA (aggiunge colonne mancanti su database vecchi) ============

const aggiungiColonnaSeManca = (tabella, colonna, definizione) => {
  db.run(`ALTER TABLE ${tabella} ADD COLUMN ${colonna} ${definizione}`, (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        // La colonna esiste già, va tutto bene
      } else {
        console.error(`Errore migrazione ${tabella}.${colonna}:`, err.message);
      }
    } else {
      console.log(`✓ Aggiunta colonna mancante: ${tabella}.${colonna}`);
    }
  });
};

aggiungiColonnaSeManca('strutture', 'bloccata', 'INTEGER DEFAULT 0');
aggiungiColonnaSeManca('users', 'bannato', 'INTEGER DEFAULT 0');
aggiungiColonnaSeManca('users', 'is_admin', 'INTEGER DEFAULT 0');
aggiungiColonnaSeManca('reviews', 'email_notificato', 'INTEGER DEFAULT 0');
aggiungiColonnaSeManca('verificazioni', 'email_notificato', 'INTEGER DEFAULT 0');
aggiungiColonnaSeManca('strutture', 'vitto_alloggio', 'TEXT');
aggiungiColonnaSeManca('strutture', 'stagionalita', 'TEXT');
aggiungiColonnaSeManca('reviews', 'consiglio_direzione', 'TEXT');
aggiungiColonnaSeManca('reviews', 'rifaresti', 'TEXT');
aggiungiColonnaSeManca('reviews', 'colloquio_info', 'TEXT');
aggiungiColonnaSeManca('reviews', 'consiglierebbe', 'INTEGER');
aggiungiColonnaSeManca('reviews', 'risposta_datore', 'TEXT');
aggiungiColonnaSeManca('reviews', 'risposta_datore_data', 'DATETIME');
aggiungiColonnaSeManca('reviews', 'risposta_datore_moderata', 'INTEGER DEFAULT 0');
aggiungiColonnaSeManca('reviews', 'risposta_datore_nome', 'TEXT');
aggiungiColonnaSeManca('reviews', 'risposta_datore_email', 'TEXT');

// Imposta l'account amministratore principale (unico account con accesso al pannello admin)
setTimeout(() => {
  db.run(`UPDATE users SET is_admin = 1 WHERE email = 'fulvietto.marinacci@gmail.com'`, function(err) {
    if (err) {
      console.error('Errore impostazione admin:', err.message);
    } else if (this.changes > 0) {
      console.log('✓ Account amministratore impostato: fulvietto.marinacci@gmail.com');
    }
  });
}, 500);

// ============ UTILITY EMAIL ============

const sendEmail = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: 'TrustOurant <noreply@trustourant.it>',
      to,
      subject,
      html
    });
    console.log(`✉️ Email inviata a ${to}`);
    return true;
  } catch (err) {
    console.error(`❌ Errore email a ${to}:`, err.message);
    return false;
  }
};

// ============ AUTENTICAZIONE ============

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, nome } = req.body;

    if (!email || !password || !nome) {
      return res.status(400).json({ error: 'Email, password e nome sono obbligatori' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
      'INSERT INTO users (email, password, nome) VALUES (?, ?, ?)',
      [email, hashedPassword, nome],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Email già registrata' });
          }
          return res.status(500).json({ error: 'Errore durante la registrazione' });
        }

        // Invia email di benvenuto
        const emailHtml = `
          <h2>Benvenuto su TrustOurant!</h2>
          <p>Ciao ${nome},</p>
          <p>La tua registrazione è stata completata con successo.</p>
          <p>Adesso puoi:</p>
          <ul>
            <li>Cercare strutture dove hai lavorato</li>
            <li>Scrivere review sulla tua esperienza</li>
            <li>Richiedere il badge ✓ Verificato</li>
          </ul>
          <p><strong>Accedi qui:</strong> https://trustourant.netlify.app</p>
          <p>Grazie per aver scelto TrustOurant!</p>
        `;

        sendEmail(email, 'Benvenuto su TrustOurant!', emailHtml);

        const token = jwt.sign({ userId: this.lastID }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ 
          message: 'Registrazione completata',
          token,
          user: { id: this.lastID, email, nome, verificato: 0 }
        });
      }
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password obbligatori' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) return res.status(500).json({ error: 'Errore server' });
      if (!user) return res.status(401).json({ error: 'Email o password errati' });
      if (user.bannato) return res.status(403).json({ error: 'Account bannato' });

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) return res.status(401).json({ error: 'Email o password errati' });

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ 
        message: 'Login effettuato',
        token,
        user: { id: user.id, email: user.email, nome: user.nome, verificato: user.verificato, is_admin: user.is_admin || 0 }
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token mancante' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Token non valido' });
    req.userId = decoded.userId;
    next();
  });
};

const isAdmin = (req, res, next) => {
  db.get('SELECT is_admin FROM users WHERE id = ?', [req.userId], (err, user) => {
    if (err || !user || !user.is_admin) {
      return res.status(403).json({ error: 'Accesso riservato agli amministratori' });
    }
    next();
  });
};

// ============ VERIFICAZIONE DIPENDENTI ============

app.post('/api/verificazione/richiedi', verifyToken, (req, res) => {
  const { struttura_id, periodo_inizio, periodo_fine, posizione } = req.body;

  if (!struttura_id || !posizione) {
    return res.status(400).json({ error: 'Struttura e posizione sono obbligatori' });
  }

  db.run(
    'INSERT INTO verificazioni (user_id, struttura_id, periodo_inizio, periodo_fine, posizione) VALUES (?, ?, ?, ?, ?)',
    [req.userId, struttura_id, periodo_inizio, periodo_fine, posizione],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ 
        id: this.lastID,
        message: 'Richiesta di verificazione inviata. Un admin la controllerà entro 48h.' 
      });
    }
  );
});

app.get('/api/verificazione/stato', verifyToken, (req, res) => {
  db.all('SELECT * FROM verificazioni WHERE user_id = ? ORDER BY created_at DESC', [req.userId], (err, verificazioni) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(verificazioni || []);
  });
});

// ============ ADMIN: APPROVA VERIFICAZIONE ============

app.post('/api/admin/verificazione/approva/:verificazione_id', verifyToken, isAdmin, (req, res) => {
  const verificazioneId = req.params.verificazione_id;

  db.get('SELECT * FROM verificazioni WHERE id = ?', [verificazioneId], (err, verif) => {
    if (err || !verif) return res.status(400).json({ error: 'Verificazione non trovata' });

    // Aggiorna verificazione
    db.run('UPDATE verificazioni SET verificato = 1, email_notificato = 1 WHERE id = ?', [verificazioneId]);

    // Marca utente come verificato
    db.run('UPDATE users SET verificato = 1 WHERE id = ?', [verif.user_id]);

    // Log azione admin
    db.run('INSERT INTO admin_log (admin_id, azione, target_type, target_id) VALUES (?, ?, ?, ?)',
      [req.userId, 'Verificazione Approvata', 'verificazione', verificazioneId]);

    // Invia email al dipendente
    db.get('SELECT email, nome FROM users WHERE id = ?', [verif.user_id], (err, user) => {
      if (user) {
        const emailHtml = `
          <h2>✓ Verificazione Approvata!</h2>
          <p>Ciao ${user.nome},</p>
          <p>La tua richiesta di verificazione è stata <strong>approvata</strong>!</p>
          <p>Adesso avrai il badge <strong>✓ Verificato</strong> accanto al tuo nome quando scrivi review.</p>
          <p>Questo significa che la tua opinione è attendibile perché confermata.</p>
          <p><strong>Grazie per aver contribuito a TrustOurant!</strong></p>
        `;
        sendEmail(user.email, '✓ Verificazione Approvata!', emailHtml);
      }
    });

    res.json({ message: 'Dipendente verificato e notificato via email' });
  });
});

// ============ ADMIN: RIFIUTA VERIFICAZIONE ============

app.post('/api/admin/verificazione/rifiuta/:verificazione_id', verifyToken, isAdmin, (req, res) => {
  const { motivo } = req.body;
  const verificazioneId = req.params.verificazione_id;

  db.get('SELECT * FROM verificazioni WHERE id = ?', [verificazioneId], (err, verif) => {
    if (err || !verif) return res.status(400).json({ error: 'Verificazione non trovata' });

    db.run('DELETE FROM verificazioni WHERE id = ?', [verificazioneId]);

    // Log azione
    db.run('INSERT INTO admin_log (admin_id, azione, target_type, target_id, dettagli) VALUES (?, ?, ?, ?, ?)',
      [req.userId, 'Verificazione Rifiutata', 'verificazione', verificazioneId, motivo || 'Nessun motivo']);

    // Invia email
    db.get('SELECT email, nome FROM users WHERE id = ?', [verif.user_id], (err, user) => {
      if (user) {
        const emailHtml = `
          <h2>❌ Verificazione Rifiutata</h2>
          <p>Ciao ${user.nome},</p>
          <p>La tua richiesta di verificazione è stata <strong>rifiutata</strong>.</p>
          <p><strong>Motivo:</strong> ${motivo || 'I dati forniti non corrispondono ai nostri controlli'}</p>
          <p>Puoi riprovare in qualsiasi momento con informazioni più precise.</p>
        `;
        sendEmail(user.email, '❌ Verificazione Rifiutata', emailHtml);
      }
    });

    res.json({ message: 'Verificazione rifiutata' });
  });
});

// ============ STRUTTURE ============

app.get('/api/strutture', (req, res) => {
  const { nome, città, provincia, regione, tipo, rating_min } = req.query;
  let query = 'SELECT * FROM strutture WHERE bloccata = 0';
  const params = [];

  if (nome) {
    query += ' AND nome LIKE ?';
    params.push(`%${nome}%`);
  }
  if (città) {
    query += ' AND città LIKE ?';
    params.push(`%${città}%`);
  }
  if (provincia) {
    query += ' AND provincia = ?';
    params.push(provincia);
  }
  if (regione) {
    query += ' AND regione = ?';
    params.push(regione);
  }
  if (tipo) {
    query += ' AND tipo = ?';
    params.push(tipo);
  }
  if (rating_min) {
    query += ' AND rating >= ?';
    params.push(rating_min);
  }

  query += ' ORDER BY nome ASC LIMIT 1000';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/strutture/:id', (req, res) => {
  const struturaId = req.params.id;

  db.get('SELECT * FROM strutture WHERE id = ?', [struturaId], (err, struttura) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!struttura) return res.status(404).json({ error: 'Struttura non trovata' });

    db.all('SELECT r.*, u.nome, u.verificato FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.struttura_id = ? AND r.moderato = 1 AND r.respinto = 0 ORDER BY r.created_at DESC', [struturaId], (err, reviews) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ struttura, reviews });
    });
  });
});

app.post('/api/strutture', verifyToken, (req, res) => {
  const { nome, tipo, città, provincia, regione, indirizzo, telefono, email, sito_web } = req.body;

  db.run(
    'INSERT INTO strutture (nome, tipo, città, provincia, regione, indirizzo, telefono, email, sito_web) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [nome, tipo, città, provincia, regione, indirizzo, telefono, email, sito_web],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: 'Struttura creata' });
    }
  );
});

// ============ RECENSIONI ============

const controlloModerazione = (text) => {
  const flags = [];
  
  const palavreVietate = [
    'scemo', 'stupido', 'idiota', 'coglione', 'bastardo', 'maledetto',
    'porco', 'assassino', 'ladro', 'frode', 'estorsione'
  ];

  palavreVietate.forEach(parola => {
    if (text.toLowerCase().includes(parola)) {
      flags.push({ tipo: 'PAROLA_VIETATA', valore: parola });
    }
  });

  const maiuscole = (text.match(/[A-Z]/g) || []).length;
  if (text.length > 50 && maiuscole / text.length > 0.5) {
    flags.push({ tipo: 'SPAM_MAIUSCOLE', valore: maiuscole / text.length });
  }

  if (text.length < 20) {
    flags.push({ tipo: 'TESTO_TROPPO_CORTO', valore: text.length });
  }

  const urlPattern = /https?:\/\/[^\s]+/g;
  const urls = text.match(urlPattern) || [];
  if (urls.length > 2) {
    flags.push({ tipo: 'TROPPE_URL', valore: urls.length });
  }

  return flags;
};

app.post('/api/reviews', verifyToken, (req, res) => {
  const { struttura_id, valutazione_chef, valutazione_datore, salario, ore_lavoro, clima_lavoro, commento, consiglio_direzione, rifaresti, colloquio_info, consiglierebbe } = req.body;

  if (!struttura_id) return res.status(400).json({ error: 'ID struttura obbligatorio' });

  const ratings = [valutazione_chef, valutazione_datore, clima_lavoro].filter(r => r);
  const rating_medio = ratings.length > 0 ? ratings.reduce((a, b) => a + b) / ratings.length : 0;

  const testoModerazione = [commento, consiglio_direzione, rifaresti, colloquio_info].filter(Boolean).join(' ');
  const flagsModerazione = controlloModerazione(testoModerazione);
  const moderato = flagsModerazione.length === 0 ? 1 : 0;

  db.run(
    'INSERT INTO reviews (user_id, struttura_id, valutazione_chef, valutazione_datore, salario, ore_lavoro, clima_lavoro, commento, consiglio_direzione, rifaresti, colloquio_info, consiglierebbe, rating_medio, moderato) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [req.userId, struttura_id, valutazione_chef, valutazione_datore, salario, ore_lavoro, clima_lavoro, commento, consiglio_direzione, rifaresti, colloquio_info, consiglierebbe, rating_medio, moderato],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });

      const reviewId = this.lastID;

      flagsModerazione.forEach(flag => {
        db.run(
          'INSERT INTO moderazioni_log (review_id, azione, motivo) VALUES (?, ?, ?)',
          [reviewId, 'Flag Automatico', flag.tipo]
        );
      });

      if (moderato === 1) {
        db.all('SELECT rating_medio FROM reviews WHERE struttura_id = ? AND moderato = 1 AND respinto = 0', [struttura_id], (err, reviews) => {
          if (reviews && reviews.length > 0) {
            const avgRating = reviews.reduce((sum, r) => sum + (r.rating_medio || 0), 0) / reviews.length;
            db.run('UPDATE strutture SET rating = ?, num_reviews = ? WHERE id = ?', [avgRating, reviews.length, struttura_id]);
          }
        });

        // Invia email di conferma
        db.get('SELECT email, nome FROM users WHERE id = ?', [req.userId], (err, user) => {
          if (user) {
            const emailHtml = `
              <h2>✓ Review Pubblicata!</h2>
              <p>Ciao ${user.nome},</p>
              <p>La tua review è stata <strong>pubblicata</strong> con successo!</p>
              <p>Grazie per aver condiviso la tua esperienza con TrustOurant.</p>
            `;
            sendEmail(user.email, '✓ Review Pubblicata!', emailHtml);
          }
        });
      }

      res.json({ 
        id: reviewId,
        message: moderato === 1 ? 'Recensione pubblicata' : 'Recensione in moderazione',
        rating_medio,
        moderato
      });
    }
  );
});

app.get('/api/my-reviews', verifyToken, (req, res) => {
  db.all('SELECT * FROM reviews WHERE user_id = ? ORDER BY created_at DESC', [req.userId], (err, reviews) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(reviews || []);
  });
});

// ============ ADMIN: APPROVA REVIEW ============

app.post('/api/admin/reviews/approva/:review_id', verifyToken, isAdmin, (req, res) => {
  const reviewId = req.params.review_id;

  db.get('SELECT * FROM reviews WHERE id = ?', [reviewId], (err, review) => {
    if (err || !review) return res.status(400).json({ error: 'Review non trovata' });

    db.run('UPDATE reviews SET moderato = 1, respinto = 0, email_notificato = 1 WHERE id = ?', [reviewId]);

    // Aggiorna rating struttura
    db.all('SELECT rating_medio FROM reviews WHERE struttura_id = ? AND moderato = 1 AND respinto = 0', [review.struttura_id], (err, reviews) => {
      if (reviews && reviews.length > 0) {
        const avgRating = reviews.reduce((sum, r) => sum + (r.rating_medio || 0), 0) / reviews.length;
        db.run('UPDATE strutture SET rating = ?, num_reviews = ? WHERE id = ?', [avgRating, reviews.length, review.struttura_id]);
      }
    });

    // Log
    db.run('INSERT INTO admin_log (admin_id, azione, target_type, target_id) VALUES (?, ?, ?, ?)',
      [req.userId, 'Review Approvata', 'review', reviewId]);

    // Email
    db.get('SELECT email, nome FROM users WHERE id = ?', [review.user_id], (err, user) => {
      if (user) {
        const emailHtml = `
          <h2>✓ Review Approvata!</h2>
          <p>Ciao ${user.nome},</p>
          <p>La tua review è stata <strong>approvata</strong> e pubblicata!</p>
          <p>Grazie per aver condiviso la tua esperienza con TrustOurant.</p>
        `;
        sendEmail(user.email, '✓ Review Approvata!', emailHtml);
      }
    });

    res.json({ message: 'Review approvata e notificata' });
  });
});

// ============ ADMIN: RIFIUTA REVIEW ============

app.post('/api/admin/reviews/rifiuta/:review_id', verifyToken, isAdmin, (req, res) => {
  const { motivo } = req.body;
  const reviewId = req.params.review_id;

  db.get('SELECT * FROM reviews WHERE id = ?', [reviewId], (err, review) => {
    if (err || !review) return res.status(400).json({ error: 'Review non trovata' });

    db.run('UPDATE reviews SET respinto = 1, moderato = 0, motivo_rifiuto = ?, email_notificato = 1 WHERE id = ?', [motivo || 'Non conforme alle linee guida', reviewId]);

    db.run('INSERT INTO admin_log (admin_id, azione, target_type, target_id, dettagli) VALUES (?, ?, ?, ?, ?)',
      [req.userId, 'Review Rifiutata', 'review', reviewId, motivo]);

    db.get('SELECT email, nome FROM users WHERE id = ?', [review.user_id], (err, user) => {
      if (user) {
        const emailHtml = `
          <h2>❌ Review Rifiutata</h2>
          <p>Ciao ${user.nome},</p>
          <p>La tua review non è stata pubblicata.</p>
          <p><strong>Motivo:</strong> ${motivo || 'Contiene contenuti non appropriati'}</p>
          <p>Puoi scrivere una nuova review modificando il commento.</p>
        `;
        sendEmail(user.email, '❌ Review Rifiutata', emailHtml);
      }
    });

    res.json({ message: 'Review rifiutata e notificata' });
  });
});

// ============ ADMIN: BAN USER ============

app.post('/api/admin/users/ban/:user_id', verifyToken, isAdmin, (req, res) => {
  const { motivo } = req.body;
  const userId = req.params.user_id;

  db.get('SELECT email, nome FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'Utente non trovato' });

    db.run('UPDATE users SET bannato = 1 WHERE id = ?', [userId]);

    db.run('INSERT INTO admin_log (admin_id, azione, target_type, target_id, dettagli) VALUES (?, ?, ?, ?, ?)',
      [req.userId, 'User Bannato', 'user', userId, motivo]);

    const emailHtml = `
      <h2>⛔ Account Bannato</h2>
      <p>Ciao ${user.nome},</p>
      <p>Il tuo account è stato <strong>bannato</strong> per violazione dei termini di servizio.</p>
      <p><strong>Motivo:</strong> ${motivo || 'Contenuti inappropriati'}</p>
    `;
    sendEmail(user.email, '⛔ Account Bannato', emailHtml);

    res.json({ message: 'User bannato' });
  });
});

// ============ ADMIN: BLOCCA STRUTTURA ============

app.post('/api/admin/strutture/blocca/:struttura_id', verifyToken, isAdmin, (req, res) => {
  const { motivo } = req.body;
  const struturaId = req.params.struttura_id;

  db.run('UPDATE strutture SET bloccata = 1 WHERE id = ?', [struturaId]);

  db.run('INSERT INTO admin_log (admin_id, azione, target_type, target_id, dettagli) VALUES (?, ?, ?, ?, ?)',
    [req.userId, 'Struttura Bloccata', 'struttura', struturaId, motivo]);

  res.json({ message: 'Struttura bloccata' });
});

// Chiunque dichiari di essere la struttura può rispondere a una recensione — la risposta resta nascosta finché l'admin non la approva
app.post('/api/reviews/:review_id/rispondi', (req, res) => {
  const { risposta, nome, email } = req.body;
  const reviewId = req.params.review_id;

  if (!risposta || !risposta.trim()) return res.status(400).json({ error: 'Risposta obbligatoria' });
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome della struttura obbligatorio' });

  db.run(
    'UPDATE reviews SET risposta_datore = ?, risposta_datore_data = CURRENT_TIMESTAMP, risposta_datore_moderata = 0, risposta_datore_nome = ?, risposta_datore_email = ? WHERE id = ?',
    [risposta, nome, email || null, reviewId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Recensione non trovata' });
      res.json({ message: 'Risposta inviata, in attesa di approvazione' });
    }
  );
});

app.post('/api/admin/reviews/rispondi/approva/:review_id', verifyToken, isAdmin, (req, res) => {
  const reviewId = req.params.review_id;

  db.run('UPDATE reviews SET risposta_datore_moderata = 1 WHERE id = ?', [reviewId], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    db.run('INSERT INTO admin_log (admin_id, azione, target_type, target_id) VALUES (?, ?, ?, ?)',
      [req.userId, 'Risposta Datore Approvata', 'review', reviewId]);

    res.json({ message: 'Risposta approvata e pubblicata' });
  });
});

app.post('/api/admin/reviews/rispondi/rifiuta/:review_id', verifyToken, isAdmin, (req, res) => {
  const reviewId = req.params.review_id;

  db.run('UPDATE reviews SET risposta_datore = NULL, risposta_datore_moderata = 0, risposta_datore_nome = NULL, risposta_datore_email = NULL WHERE id = ?', [reviewId], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    db.run('INSERT INTO admin_log (admin_id, azione, target_type, target_id) VALUES (?, ?, ?, ?)',
      [req.userId, 'Risposta Datore Rifiutata', 'review', reviewId]);

    res.json({ message: 'Risposta rifiutata' });
  });
});

app.get('/api/admin/reviews-risposte-pending', verifyToken, isAdmin, (req, res) => {
  db.all(
    `SELECT r.id, r.risposta_datore, r.risposta_datore_data, r.risposta_datore_nome, r.risposta_datore_email, r.commento, s.nome AS struttura_nome
     FROM reviews r JOIN strutture s ON r.struttura_id = s.id
     WHERE r.risposta_datore IS NOT NULL AND r.risposta_datore_moderata = 0`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.put('/api/admin/strutture/info/:struttura_id', verifyToken, isAdmin, (req, res) => {
  const { vitto_alloggio, stagionalita } = req.body;
  const struturaId = req.params.struttura_id;

  db.run('UPDATE strutture SET vitto_alloggio = ?, stagionalita = ? WHERE id = ?', [vitto_alloggio, stagionalita, struturaId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Struttura aggiornata' });
  });
});

// ============ ADMIN DASHBOARD ============

app.get('/api/admin/reviews-pending', verifyToken, isAdmin, (req, res) => {
  db.all(
    `SELECT r.*, u.nome AS nome, s.nome AS struttura_nome
     FROM reviews r
     JOIN users u ON r.user_id = u.id
     JOIN strutture s ON r.struttura_id = s.id
     WHERE r.moderato = 0 AND r.respinto = 0
     ORDER BY r.created_at DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.get('/api/admin/verificazioni-pending', verifyToken, isAdmin, (req, res) => {
  db.all(
    `SELECT v.*, u.nome AS nome, u.email AS email, s.nome AS struttura_nome
     FROM verificazioni v
     JOIN users u ON v.user_id = u.id
     JOIN strutture s ON v.struttura_id = s.id
     WHERE v.verificato = 0
     ORDER BY v.created_at DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.get('/api/admin/export-csv', verifyToken, isAdmin, (req, res) => {
  db.all(
    `SELECT r.id, u.nome AS dipendente, s.nome AS struttura, r.valutazione_chef, r.valutazione_datore, r.salario, r.ore_lavoro, r.clima_lavoro, r.rating_medio, r.commento, r.moderato, r.respinto, r.created_at
     FROM reviews r JOIN users u ON r.user_id = u.id JOIN strutture s ON r.struttura_id = s.id
     ORDER BY r.created_at DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const header = 'ID,Dipendente,Struttura,ResponsabileDiretto,Datore,Salario,Ore,Clima,RatingMedio,Commento,Approvato,Respinto,Data\n';
      const csv = rows.map(r => [r.id, r.dipendente, r.struttura, r.valutazione_chef, r.valutazione_datore, r.salario, r.ore_lavoro, r.clima_lavoro, r.rating_medio, `"${(r.commento || '').replace(/"/g, '""')}"`, r.moderato, r.respinto, r.created_at].join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=trustourant-reviews.csv');
      res.send(header + csv);
    }
  );
});

app.get('/api/admin/dashboard', verifyToken, isAdmin, (req, res) => {
  db.get('SELECT COUNT(*) as pending FROM reviews WHERE moderato = 0 AND respinto = 0', (err, pending) => {
    db.get('SELECT COUNT(*) as total FROM reviews WHERE moderato = 1 AND respinto = 0', (err, total) => {
      db.get('SELECT COUNT(*) as rejected FROM reviews WHERE respinto = 1', (err, rejected) => {
        db.get('SELECT COUNT(*) as bannati FROM users WHERE bannato = 1', (err, bannati) => {
          db.get('SELECT COUNT(*) as pending FROM reviews WHERE risposta_datore IS NOT NULL AND risposta_datore_moderata = 0', (err, rispostePending) => {
            db.all('SELECT azione, COUNT(*) as count FROM admin_log WHERE admin_id = ? GROUP BY azione ORDER BY count DESC LIMIT 10', [req.userId], (err, stats) => {
              res.json({
                reviews_pending: pending?.pending || 0,
                reviews_total: total?.total || 0,
                reviews_rejected: rejected?.rejected || 0,
                users_banned: bannati?.bannati || 0,
                risposte_datore_pending: rispostePending?.pending || 0,
                admin_stats: stats || []
              });
            });
          });
        });
      });
    });
  });
});

// ============ STATISTICHE ============

app.get('/api/classifica', (req, res) => {
  const tipo = req.query.tipo === 'peggiori' ? 'ASC' : 'DESC';
  const regione = req.query.regione;
  const MIN_RECENSIONI = 3;

  let query = `SELECT * FROM strutture WHERE bloccata = 0 AND num_reviews >= ?`;
  const params = [MIN_RECENSIONI];

  if (regione) {
    query += ' AND regione = ?';
    params.push(regione);
  }

  query += ` ORDER BY rating ${tipo} LIMIT 50`;

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/stats', (req, res) => {
  db.get('SELECT COUNT(*) as num_strutture FROM strutture WHERE bloccata = 0', (err, strutture) => {
    db.get('SELECT COUNT(*) as num_reviews FROM reviews WHERE moderato = 1 AND respinto = 0', (err, reviews) => {
      db.get('SELECT AVG(rating) as rating_medio FROM strutture WHERE bloccata = 0', (err, rating) => {
        db.get('SELECT COUNT(DISTINCT user_id) as num_utenti FROM reviews', (err, utenti) => {
          db.all(
            'SELECT regione, COUNT(*) as num_strutture, AVG(rating) as rating_medio FROM strutture WHERE bloccata = 0 GROUP BY regione ORDER BY rating_medio DESC',
            (err, regioni) => {
              res.json({
                num_strutture: strutture?.num_strutture || 0,
                num_reviews: reviews?.num_reviews || 0,
                rating_medio: (rating?.rating_medio || 0).toFixed(2),
                num_utenti: utenti?.num_utenti || 0,
                regioni: regioni || []
              });
            }
          );
        });
      });
    });
  });
});

app.get('/api/stats/provincia', (req, res) => {
  db.all(
    'SELECT provincia, regione, COUNT(*) as num_strutture, AVG(rating) as rating_medio, SUM(num_reviews) as total_reviews FROM strutture WHERE bloccata = 0 GROUP BY provincia ORDER BY rating_medio DESC',
    (err, province) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(province || []);
    }
  );
});

// ============ SERVER ============

app.listen(PORT, () => {
  console.log(`🚀 TrustOurant Backend FASE 4 running on http://localhost:${PORT}`);
  console.log(`📧 Email notifications ACTIVE`);
  console.log(`🔐 Admin dashboard ACTIVE`);
});

module.exports = app;
