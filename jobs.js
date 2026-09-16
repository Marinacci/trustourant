'use strict';

// Additive schema: existing reviews, users and business accounts are preserved.
module.exports = function installJobs(app, db, { jwt, secret }) {
  const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) {
    if (err) reject(err); else resolve({ id: this.lastID, changes: this.changes });
  }));
  const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
  const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
  const ready = (async () => {
    // The worker directory is deliberately separate from credentials.  A profile is
    // created for every worker and remains available until the worker deletes the
    // account or turns off visibility.
    await run(`CREATE TABLE IF NOT EXISTS professions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL UNIQUE, categoria TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
    )`);
    await run(`CREATE TABLE IF NOT EXISTS worker_profiles (
      user_id INTEGER PRIMARY KEY, profession_id INTEGER, citta TEXT, provincia TEXT, regione TEXT,
      anni_esperienza INTEGER NOT NULL DEFAULT 0 CHECK(anni_esperienza BETWEEN 0 AND 60),
      disponibilita TEXT NOT NULL DEFAULT 'da_definire' CHECK(disponibilita IN ('immediata','da_data','non_disponibile','da_definire')),
      disponibile_dal TEXT, trasferimento INTEGER NOT NULL DEFAULT 0, raggio_km INTEGER,
      contratto TEXT, stipendio_desiderato INTEGER, vitto_alloggio INTEGER NOT NULL DEFAULT 0,
      lingue TEXT, competenze TEXT, presentazione TEXT, visibile INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(profession_id) REFERENCES professions(id)
    )`);
    await run(`CREATE TABLE IF NOT EXISTS worker_professions (
      user_id INTEGER NOT NULL, profession_id INTEGER NOT NULL,
      PRIMARY KEY(user_id, profession_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(profession_id) REFERENCES professions(id)
    )`);
    await run(`CREATE TRIGGER IF NOT EXISTS create_worker_profile AFTER INSERT ON users
      BEGIN INSERT OR IGNORE INTO worker_profiles(user_id) VALUES(NEW.id); END`);
    await run(`INSERT OR IGNORE INTO worker_profiles(user_id) SELECT id FROM users`);
    const professionRows = [
      ['executive-chef','Executive Chef','Cucina'],['chef-di-cucina','Chef di cucina','Cucina'],['sous-chef','Sous Chef / Secondo Chef','Cucina'],['chef-de-partie','Chef de Partie','Cucina'],['chef-tournant','Chef Tournant','Cucina'],['commis-cucina','Commis di cucina','Cucina'],['aiuto-cuoco','Aiuto cuoco','Cucina'],['cuoco','Cuoco','Cucina'],['pizzaiolo','Pizzaiolo','Cucina'],['fornaio','Fornaio','Cucina'],['panettiere','Panettiere','Pasticceria e panificazione'],['pastaio','Pastaio','Cucina'],['grillista','Grillista','Cucina'],['addetto-colazioni','Addetto colazioni','Sala e ristorazione'],['lavapiatti','Lavapiatti / Addetto lavaggio stoviglie','Cucina'],['steward-cucina','Steward di cucina','Cucina'],
      ['pasticcere','Pasticcere','Pasticceria e panificazione'],['capo-pasticcere','Capo pasticcere','Pasticceria e panificazione'],['commis-pasticceria','Commis pasticceria','Pasticceria e panificazione'],['gelatiere','Gelatiere','Pasticceria e panificazione'],['cioccolatiere','Cioccolatiere','Pasticceria e panificazione'],
      ['restaurant-manager','Restaurant Manager','Sala e ristorazione'],['maitre','Maître di sala','Sala e ristorazione'],['sommelier','Sommelier','Sala e ristorazione'],['cameriere','Cameriere di sala','Sala e ristorazione'],['chef-de-rang','Chef de Rang','Sala e ristorazione'],['commis-de-rang','Commis de Rang','Sala e ristorazione'],['bar-manager','Bar Manager','Sala e ristorazione'],['bartender','Barman / Bartender','Sala e ristorazione'],['barista','Barista','Sala e ristorazione'],
      ['direttore-hotel','Direttore d’hotel','Hotel e accoglienza'],['hotel-manager','Hotel Manager','Hotel e accoglienza'],['front-office-manager','Front Office Manager','Hotel e accoglienza'],['receptionist','Receptionist','Hotel e accoglienza'],['night-auditor','Night Auditor','Hotel e accoglienza'],['concierge','Concierge','Hotel e accoglienza'],['booking-agent','Booking agent','Hotel e accoglienza'],['revenue-manager','Revenue manager','Hotel e accoglienza'],['facchino','Facchino','Hotel e accoglienza'],
      ['governante','Governante','Housekeeping e manutenzione'],['cameriera-piani','Cameriera ai piani','Housekeeping e manutenzione'],['addetto-pulizie','Addetto pulizie','Housekeeping e manutenzione'],['lavanderia','Addetto lavanderia','Housekeeping e manutenzione'],['hausmeister','Hausmeister / Manutentore','Housekeeping e manutenzione'],['giardiniere','Giardiniere','Housekeeping e manutenzione'],['tecnico-manutentore','Tecnico manutentore','Housekeeping e manutenzione'],
      ['spa-manager','Spa manager','Benessere'],['massaggiatore','Massaggiatore / Massaggiatrice','Benessere'],['estetista','Estetista','Benessere'],['beauty-therapist','Beauty therapist','Benessere'],['personal-trainer','Personal trainer','Benessere'],['animatore','Animatore turistico','Altre figure'],['responsabile-eventi','Responsabile eventi','Altre figure']
    ];
    for (const row of professionRows) await run('INSERT OR IGNORE INTO professions(slug,nome,categoria) VALUES(?,?,?)', row);
    await run('CREATE INDEX IF NOT EXISTS worker_profiles_search_idx ON worker_profiles(visibile, regione, citta, disponibilita)');
    await run('CREATE INDEX IF NOT EXISTS worker_professions_profession_idx ON worker_professions(profession_id, user_id)');
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

  const professionIds = async (ids, required = false) => {
    if (!Array.isArray(ids) || ids.length > 12 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) {
      if (required) throw failure(400, 'Seleziona una professione valida.');
      return [];
    }
    const unique = [...new Set(ids)];
    if (!unique.length && !required) return [];
    const rows = await all(`SELECT id FROM professions WHERE active=1 AND id IN (${unique.map(() => '?').join(',')})`, unique);
    if (rows.length !== unique.length) throw failure(400, 'Una professione selezionata non è valida.');
    return unique;
  };
  const optionalText = (value, max, label) => {
    if (value === undefined || value === null || value === '') return null;
    return text(value, 1, max, label);
  };

  app.get('/api/professions', route(async (_req, res) => {
    res.json(await all('SELECT id,slug,nome,categoria FROM professions WHERE active=1 ORDER BY categoria,nome'));
  }));
  app.get('/api/worker-profile', route(async (req, res) => {
    const user = await worker(req);
    const profile = await get(`SELECT p.*, pr.nome AS professione, pr.slug AS profession_slug FROM worker_profiles p LEFT JOIN professions pr ON pr.id=p.profession_id WHERE p.user_id=?`, [user.id]);
    const secondary = await all(`SELECT pr.id,pr.slug,pr.nome,pr.categoria FROM worker_professions wp JOIN professions pr ON pr.id=wp.profession_id WHERE wp.user_id=? ORDER BY pr.nome`, [user.id]);
    res.set('Cache-Control', 'no-store');
    res.json({ profile, secondary_professions: secondary });
  }));
  app.put('/api/worker-profile', route(async (req, res) => {
    const user = await worker(req), b = req.body || {};
    const primary = b.profession_id === null || b.profession_id === undefined || b.profession_id === '' ? null : (await professionIds([Number(b.profession_id)], true))[0];
    const secondary = await professionIds(b.secondary_profession_ids || []);
    if (primary && secondary.includes(primary)) throw failure(400, 'La professione principale non può essere duplicata.');
    const availability = b.disponibilita || 'da_definire';
    if (!['immediata','da_data','non_disponibile','da_definire'].includes(availability)) throw failure(400, 'Disponibilità non valida.');
    const boolean = (v, label) => { if (typeof v !== 'boolean') throw failure(400, `${label}: valore non valido.`); return v ? 1 : 0; };
    const years = b.anni_esperienza === undefined ? 0 : integer(Number(b.anni_esperienza), 0, 60, 'Anni di esperienza');
    const radius = b.raggio_km === null || b.raggio_km === undefined || b.raggio_km === '' ? null : integer(Number(b.raggio_km), 1, 500, 'Raggio di ricerca');
    const salary = b.stipendio_desiderato === null || b.stipendio_desiderato === undefined || b.stipendio_desiderato === '' ? null : integer(Number(b.stipendio_desiderato), 1, 100000, 'Stipendio desiderato');
    const contract = b.contratto || null;
    if (contract && !['indeterminato','determinato','stagionale','apprendistato'].includes(contract)) throw failure(400, 'Contratto non valido.');
    const values = [primary,optionalText(b.citta,100,'Città'),optionalText(b.provincia,100,'Provincia'),optionalText(b.regione,100,'Regione'),years,availability,optionalText(b.disponibile_dal,20,'Data disponibilità'),boolean(Boolean(b.trasferimento),'Trasferimento'),radius,contract,salary,boolean(Boolean(b.vitto_alloggio),'Vitto e alloggio'),optionalText(b.lingue,500,'Lingue'),optionalText(b.competenze,1500,'Competenze'),optionalText(b.presentazione,3000,'Presentazione'),boolean(Boolean(b.visibile),'Visibilità'),user.id];
    await run(`UPDATE worker_profiles SET profession_id=?,citta=?,provincia=?,regione=?,anni_esperienza=?,disponibilita=?,disponibile_dal=?,trasferimento=?,raggio_km=?,contratto=?,stipendio_desiderato=?,vitto_alloggio=?,lingue=?,competenze=?,presentazione=?,visibile=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?`, values);
    await run('DELETE FROM worker_professions WHERE user_id=?', [user.id]);
    for (const professionId of secondary) await run('INSERT INTO worker_professions(user_id,profession_id) VALUES(?,?)', [user.id, professionId]);
    res.json({ message: 'Profilo professionale aggiornato.' });
  }));
  app.put('/api/worker-profile/visibility', route(async (req, res) => {
    const user = await worker(req);
    if (typeof req.body?.visibile !== 'boolean') throw failure(400, 'Visibilità non valida.');
    await run('UPDATE worker_profiles SET visibile=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [req.body.visibile ? 1 : 0, user.id]);
    res.json({ message: req.body.visibile ? 'Profilo visibile alle aziende verificate.' : 'Profilo nascosto dalle ricerche aziendali.' });
  }));
  app.get('/api/business/workers', route(async (req, res) => {
    await business(req);
    const where = ['p.visibile=1','COALESCE(u.bannato,0)=0'], params = [];
    if (req.query.profession_id) { const id=integer(Number(req.query.profession_id),1,100000,'Professione'); where.push('(p.profession_id=? OR EXISTS(SELECT 1 FROM worker_professions wp WHERE wp.user_id=p.user_id AND wp.profession_id=?))'); params.push(id,id); }
    for (const [key,column] of [['citta','p.citta'],['provincia','p.provincia'],['regione','p.regione']]) if (req.query[key]) { const value=text(req.query[key],1,100,'Ricerca').replace(/[\\%_]/g,'\\$&'); where.push(`LOWER(${column}) LIKE LOWER(?) ESCAPE '\\'`);params.push(`%${value}%`); }
    if (req.query.disponibilita === 'immediata') where.push("p.disponibilita='immediata'");
    if (req.query.alloggio === '1') where.push('p.vitto_alloggio=1');
    const page=integer(Number(req.query.page || 1),1,10000,'Pagina'), filter=where.join(' AND ');
    const count=await get(`SELECT COUNT(*) AS total FROM worker_profiles p JOIN users u ON u.id=p.user_id WHERE ${filter}`,params);
    const rows=await all(`SELECT p.user_id,p.citta,p.provincia,p.regione,p.anni_esperienza,p.disponibilita,p.disponibile_dal,p.trasferimento,p.raggio_km,p.contratto,p.stipendio_desiderato,p.vitto_alloggio,p.lingue,p.competenze,p.presentazione,p.updated_at,pr.id AS profession_id,pr.nome AS professione FROM worker_profiles p JOIN users u ON u.id=p.user_id LEFT JOIN professions pr ON pr.id=p.profession_id WHERE ${filter} ORDER BY CASE p.disponibilita WHEN 'immediata' THEN 0 ELSE 1 END,p.anni_esperienza DESC,p.updated_at DESC LIMIT 20 OFFSET ?`,[...params,(page-1)*20]);
    // Deliberately no name, email, phone or CV in a directory search.
    res.json({workers:rows,total:count.total,page,page_size:20});
  }));
  app.get('/api/business/jobs/:id/matches', route(async (req, res) => {
    const account=await business(req); const job=await get('SELECT * FROM jobs WHERE id=? AND business_id=?',[req.params.id,account.id]);
    if (!job) throw failure(404,'Annuncio non trovato.');
    const role=`%${String(job.titolo).toLowerCase().replace(/[\\%_]/g,'\\$&')}%`;
    const rows=await all(`SELECT p.user_id,p.citta,p.provincia,p.regione,p.anni_esperienza,p.disponibilita,p.contratto,p.stipendio_desiderato,p.vitto_alloggio,p.lingue,p.competenze,pr.nome AS professione,
      (CASE WHEN LOWER(COALESCE(pr.nome,'')) LIKE ? ESCAPE '\\' THEN 45 ELSE 0 END + CASE WHEN p.disponibilita='immediata' THEN 20 ELSE 0 END + CASE WHEN p.stipendio_desiderato IS NULL OR p.stipendio_desiderato<=? THEN 20 ELSE 0 END + CASE WHEN p.vitto_alloggio=1 AND ?=1 THEN 10 ELSE 0 END + CASE WHEN p.contratto IS NULL OR p.contratto=? THEN 5 ELSE 0 END) AS score
      FROM worker_profiles p JOIN users u ON u.id=p.user_id LEFT JOIN professions pr ON pr.id=p.profession_id WHERE p.visibile=1 AND COALESCE(u.bannato,0)=0 ORDER BY score DESC,p.anni_esperienza DESC LIMIT 50`,[role,job.salario_max,job.alloggio,job.contratto]);
    res.json(rows.map(row=>({...row,compatibilita:row.score>=65?'alta':row.score>=35?'media':'bassa'})));
  }));
  return { ready, all };
};
