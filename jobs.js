'use strict';

// Additive schema: existing reviews, users and business accounts are preserved.
module.exports = function installJobs(app, db, { jwt, secret }) {
  const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) {
    if (err) reject(err); else resolve({ id: this.lastID, changes: this.changes });
  }));
  const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
  const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
  const ready = (async () => {
    await run(`CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER NOT NULL,
      titolo TEXT NOT NULL, descrizione TEXT NOT NULL, contratto TEXT NOT NULL,
      salario_min INTEGER NOT NULL CHECK(salario_min > 0), salario_max INTEGER NOT NULL CHECK(salario_max >= salario_min),
      salario_tipo TEXT NOT NULL CHECK(salario_tipo IN ('netto','lordo')),
      mensilita INTEGER NOT NULL CHECK(mensilita BETWEEN 12 AND 14),
      ore_settimana INTEGER NOT NULL CHECK(ore_settimana BETWEEN 1 AND 60),
      giorni_settimana INTEGER NOT NULL CHECK(giorni_settimana BETWEEN 1 AND 6),
      alloggio INTEGER NOT NULL DEFAULT 0, stato TEXT NOT NULL DEFAULT 'aperto',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      scadenza TEXT NOT NULL DEFAULT (datetime('now', '+60 days')),
      FOREIGN KEY(business_id) REFERENCES business_accounts(id)
    )`);
    await run(`CREATE TABLE IF NOT EXISTS job_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      messaggio TEXT NOT NULL, consenso_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(job_id, user_id),
      FOREIGN KEY(job_id) REFERENCES jobs(id), FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
    await run('CREATE INDEX IF NOT EXISTS jobs_business_idx ON jobs(business_id)');
    await run('CREATE INDEX IF NOT EXISTS applications_user_idx ON job_applications(user_id)');
    // This trigger also covers the existing account deletion endpoint.
    await run(`CREATE TRIGGER IF NOT EXISTS delete_user_applications AFTER DELETE ON users
      BEGIN DELETE FROM job_applications WHERE user_id = OLD.id; END`);
  })();
  ready.catch(err => console.error('Jobs schema initialization failed:', err.message));
  const failure = (status, message) => Object.assign(new Error(message), { status });
  const route = fn => async (req, res) => {
    try { await ready; await fn(req, res); }
    catch (err) {
      if (!err.status) console.error('Jobs request failed:', err.message);
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Servizio temporaneamente non disponibile. Riprova.' });
    }
  };
  const identity = (req, field) => {
    try {
      const decoded = jwt.verify((req.headers.authorization || '').replace(/^Bearer /, ''), secret, { algorithms: ['HS256'] });
      req.authClaims = decoded;
      if (!Number.isSafeInteger(decoded[field]) || decoded[field] < 1) throw new Error();
      return decoded[field];
    } catch { throw failure(401, 'Accedi con il tuo account per continuare.'); }
  };
  const worker = async req => {
    const user = await get('SELECT id, nome, email, bannato, token_version FROM users WHERE id = ?', [identity(req, 'userId')]);
    if (user && (req.authClaims.tokenVersion || 0) !== user.token_version) throw failure(401, 'Sessione scaduta. Accedi di nuovo.');
    if (!user || user.bannato) throw failure(403, 'Account non disponibile.');
    return user;
  };
  const business = async req => {
    const row = await get(`SELECT b.*, s.bloccata FROM business_accounts b JOIN strutture s ON s.id=b.struttura_id WHERE b.id=?`, [identity(req, 'businessId')]);
    // A typed email domain alone does not prove control of a business.
    if (!row || row.verificato !== 1 || row.metodo_verifica !== 'verifica_manuale_admin' || row.bloccata)
      throw failure(403, 'Per gestire annunci e candidature serve la verifica aziendale da parte di Trustourant.');
    return row;
  };
  const text = (value, min, max, label) => {
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw failure(400, `${label}: inserisci da ${min} a ${max} caratteri.`);
    return value.trim();
  };
  const integer = (value, min, max, label) => {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw failure(400, `${label}: valore non valido.`);
    return value;
  };
  const joins = `FROM jobs j JOIN business_accounts b ON b.id=j.business_id JOIN strutture s ON s.id=b.struttura_id`;
  const visible = `j.stato='aperto' AND j.scadenza > datetime('now') AND b.verificato=1 AND b.metodo_verifica='verifica_manuale_admin' AND COALESCE(s.bloccata,0)=0`;
  const fields = `j.*, s.nome AS struttura_nome, s.città AS citta, s.provincia, s.tipo AS struttura_tipo`;

  const writeLimiter = require('express-rate-limit')({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Troppe richieste. Riprova tra qualche minuto.' } });
  app.use(['/api/jobs', '/api/business/jobs', '/api/me/applications'], (req, res, next) => req.method === 'GET' ? next() : writeLimiter(req, res, next));

  app.get('/api/jobs', route(async (req, res) => {
    const where = [visible], params = [];
    for (const [key, clause] of [['q', "(j.titolo LIKE ? ESCAPE '\\' OR s.nome LIKE ? ESCAPE '\\')"], ['luogo', "(s.città LIKE ? ESCAPE '\\' OR s.provincia LIKE ? ESCAPE '\\')"]]) {
      if (req.query[key]) {
        const value = text(req.query[key], 1, 100, 'Ricerca').replace(/[\\%_]/g, '\\$&');
        where.push(clause); params.push(`%${value}%`, `%${value}%`);
      }
    }
    if (req.query.salario_min) {
      const min = integer(Number(req.query.salario_min), 1, 100000, 'Stipendio minimo');
      if (!['netto', 'lordo'].includes(req.query.salario_tipo)) throw failure(400, 'Scegli netto o lordo per confrontare gli stipendi.');
      where.push('j.salario_min >= ? AND j.salario_tipo = ?'); params.push(min, req.query.salario_tipo);
    }
    if (req.query.alloggio === '1') where.push('j.alloggio=1');
    const page = integer(Number(req.query.page || 1), 1, 10000, 'Pagina');
    const filter = where.join(' AND ');
    const count = await get(`SELECT COUNT(*) AS total ${joins} WHERE ${filter}`, params);
    const jobs = await all(`SELECT ${fields} ${joins} WHERE ${filter} ORDER BY j.created_at DESC, j.id DESC LIMIT 20 OFFSET ?`, [...params, (page-1)*20]);
    res.json({ jobs, total: count.total, page, page_size: 20 });
  }));
  app.get('/api/jobs/:id', route(async (req, res) => {
    const job = await get(`SELECT ${fields} ${joins} WHERE j.id=? AND ${visible}`, [req.params.id]);
    if (!job) throw failure(404, 'Annuncio non disponibile o scaduto.');
    res.json(job);
  }));
  app.get('/api/business/jobs', route(async (req, res) => {
    const account = await business(req);
    res.json(await all(`SELECT j.*, (SELECT COUNT(*) FROM job_applications a WHERE a.job_id=j.id) AS candidature FROM jobs j WHERE business_id=? ORDER BY j.id DESC`, [account.id]));
  }));
  app.post('/api/business/jobs', route(async (req, res) => {
    const account = await business(req), b = req.body;
    const titolo = text(b.titolo, 3, 100, 'Ruolo'), descrizione = text(b.descrizione, 30, 6000, 'Descrizione');
    if (!['indeterminato','determinato','stagionale','apprendistato'].includes(b.contratto)) throw failure(400, 'Seleziona un contratto valido.');
    if (!['netto','lordo'].includes(b.salario_tipo)) throw failure(400, 'Specifica stipendio netto o lordo.');
    integer(b.salario_min, 1, 100000, 'Stipendio minimo'); integer(b.salario_max, b.salario_min, 100000, 'Stipendio massimo');
    integer(b.mensilita, 12, 14, 'Mensilità'); integer(b.ore_settimana, 1, 60, 'Ore settimanali'); integer(b.giorni_settimana, 1, 6, 'Giorni settimanali');
    if (typeof b.alloggio !== 'boolean') throw failure(400, 'Specifica se è disponibile un alloggio.');
    const result = await run(`INSERT INTO jobs (business_id,titolo,descrizione,contratto,salario_min,salario_max,salario_tipo,mensilita,ore_settimana,giorni_settimana,alloggio) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [account.id,titolo,descrizione,b.contratto,b.salario_min,b.salario_max,b.salario_tipo,b.mensilita,b.ore_settimana,b.giorni_settimana,b.alloggio ? 1 : 0]);
    res.status(201).json({ id: result.id });
  }));
  app.patch('/api/business/jobs/:id/close', route(async (req, res) => {
    const account = await business(req);
    const result = await run("UPDATE jobs SET stato='chiuso' WHERE id=? AND business_id=?", [req.params.id, account.id]);
    if (!result.changes) throw failure(404, 'Annuncio non trovato.');
    res.json({ message: 'Annuncio chiuso.' });
  }));
  app.post('/api/jobs/:id/applications', route(async (req, res) => {
    const user = await worker(req);
    const messaggio = text(req.body.messaggio, 20, 3000, 'Presentazione');
    if (req.body.consenso !== true) throw failure(400, 'Conferma la condivisione di nome, email e presentazione con questa azienda.');
    try {
      const result = await run(`INSERT INTO job_applications (job_id,user_id,messaggio) SELECT j.id,?,? ${joins} WHERE j.id=? AND ${visible}`, [user.id, messaggio, req.params.id]);
      if (!result.changes) throw failure(404, 'Annuncio non disponibile o scaduto.');
      res.status(201).json({ message: 'Candidatura inviata. L’azienda può consultarla nella propria area.' });
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT') throw failure(409, 'Hai già inviato una candidatura per questo annuncio.');
      throw err;
    }
  }));
  app.get('/api/me/applications', route(async (req, res) => {
    const user = await worker(req);
    res.set('Cache-Control', 'no-store');
    res.json(await all(`SELECT a.*, j.titolo, j.stato, j.scadenza, s.nome AS struttura_nome FROM job_applications a JOIN jobs j ON j.id=a.job_id JOIN business_accounts b ON b.id=j.business_id JOIN strutture s ON s.id=b.struttura_id WHERE a.user_id=? ORDER BY a.id DESC`, [user.id]));
  }));
  app.delete('/api/me/applications/:id', route(async (req, res) => {
    const user = await worker(req);
    const result = await run('DELETE FROM job_applications WHERE id=? AND user_id=?', [req.params.id, user.id]);
    if (!result.changes) throw failure(404, 'Candidatura non trovata.');
    res.json({ message: 'Candidatura ritirata e cancellata da Trustourant.' });
  }));
  app.get('/api/business/jobs/:id/applications', route(async (req, res) => {
    const account = await business(req);
    const job = await get('SELECT id FROM jobs WHERE id=? AND business_id=?', [req.params.id, account.id]);
    if (!job) throw failure(404, 'Annuncio non trovato.');
    res.set('Cache-Control', 'no-store');
    res.json(await all(`SELECT a.id,a.messaggio,a.created_at,u.nome,u.email FROM job_applications a JOIN users u ON u.id=a.user_id WHERE a.job_id=? AND COALESCE(u.bannato,0)=0 ORDER BY a.id DESC`, [job.id]));
  }));
  return { ready, all };
};
