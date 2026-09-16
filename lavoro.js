'use strict';
(() => {
  const API = ['localhost','127.0.0.1'].includes(location.hostname) ? '/api' : 'https://trustourant-backend.onrender.com/api';
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => new Intl.NumberFormat('it-IT').format(value);
  const date = value => new Date(value.replace(' ', 'T') + 'Z').toLocaleDateString('it-IT');
  const token = type => localStorage.getItem(type === 'business' ? 'businessToken' : 'token');
  let page = 1, searchVersion = 0, panelVersion = 0;
  const demoCandidates = {
    'demo-1': [
      { nome:'Mario Rossi (profilo dimostrativo)', email:'mario.rossi@example.com', created_at:'2026-09-14 09:30:00', messaggio:'Sous chef con esperienza in hotel quattro stelle, gestione della brigata e cucina italiana. Disponibile da ottobre. Questo è un testo dimostrativo.' },
      { nome:'Giulia Bianchi (profilo dimostrativo)', email:'giulia.bianchi@example.com', created_at:'2026-09-15 07:45:00', messaggio:'Esperienza in ristorazione gourmet, pasticceria e organizzazione del servizio. Disponibile per colloquio. Questo è un testo dimostrativo.' },
      { nome:'Luca Verdi (profilo dimostrativo)', email:'luca.verdi@example.com', created_at:'2026-09-15 08:20:00', messaggio:'Cinque anni di esperienza tra Alto Adige e Trentino, conoscenza HACCP e turni di brigata. Questo è un testo dimostrativo.' }
    ],
    'demo-2': [
      { nome:'Sara Neri (profilo dimostrativo)', email:'sara.neri@example.com', created_at:'2026-09-12 10:15:00', messaggio:'Chef de rang con inglese e tedesco, esperienza nel servizio a cinque stelle. Questo è un testo dimostrativo.' }
    ]
  };
  const demoExpiry = () => new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const demoSeed = () => [
    { id:'demo-1', titolo:'Sous chef', candidature:3, stato:'aperto', scadenza:demoExpiry() },
    { id:'demo-2', titolo:'Chef de rang', candidature:1, stato:'chiuso', scadenza:demoExpiry() }
  ];
  function getDemoJobs(reset = false) {
    if (!reset) {
      try {
        const stored = JSON.parse(sessionStorage.getItem('trustourantDemoJobs') || 'null');
        if (Array.isArray(stored)) return stored;
      } catch {}
    }
    const jobs = demoSeed();
    sessionStorage.setItem('trustourantDemoJobs', JSON.stringify(jobs));
    return jobs;
  }
  const saveDemoJobs = jobs => sessionStorage.setItem('trustourantDemoJobs', JSON.stringify(jobs));
  async function request(path, { type, method = 'GET', body } = {}) {
    const headers = {};
    if (type) headers.Authorization = `Bearer ${token(type) || ''}`;
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Operazione non riuscita. Riprova.');
    return data;
  }
  const errorText = err => ['TimeoutError','TypeError'].includes(err.name) ? 'Connessione non disponibile. Riprova tra poco.' : err.message;
  function openPanel(title, html) {
    panelVersion++;
    $('panelTitle').textContent = title; $('panelContent').innerHTML = html; $('panelStatus').textContent = ''; $('panelStatus').className = '';
    if (!$('panel').open) $('panel').showModal();
    return panelVersion;
  }
  function panelError(err) { $('panelStatus').className = 'error'; $('panelStatus').textContent = errorText(err); }
  function loginUrl(type, id) {
    const next = type === 'business' ? 'lavoro.html?area=azienda' : id ? `lavoro.html?annuncio=${id}` : 'lavoro.html';
    return 'index.html?next=' + encodeURIComponent(next) + (type === 'business' ? '#aziende' : '');
  }
  function login(type) {
    openPanel('Accedi per continuare', `<p>Usa il tuo account ${type === 'business' ? 'aziendale' : 'lavoratore'} Trustourant. Dopo l’accesso tornerai qui automaticamente.</p><a class="button" href="${loginUrl(type)}">Accedi o registrati</a>`);
  }
  function details(job) {
    return `<p class="location">${escape(job.struttura_nome)} · ${escape(job.citta)} (${escape(job.provincia)})</p><p class="salary">€ ${money(job.salario_min)}–${money(job.salario_max)} <small>${escape(job.salario_tipo)} / mese</small></p><div class="tags"><span class="tag">${escape(job.contratto)}</span><span class="tag">${job.ore_settimana} ore / settimana</span><span class="tag">${job.giorni_settimana} giorni / settimana</span><span class="tag">${job.mensilita} mensilità</span><span class="tag">${job.alloggio ? 'Alloggio disponibile' : 'Alloggio non previsto'}</span></div>`;
  }
  async function search() {
    const version = ++searchVersion;
    $('searchStatus').className = ''; $('searchStatus').textContent = 'Cerco le opportunità…';
    $('results').innerHTML = ''; $('previousPage').hidden = true; $('nextPage').hidden = true; $('pageStatus').textContent = '';
    const params = new URLSearchParams(new FormData($('searchForm'))); params.set('page', page);
    try {
      const data = await request('/jobs?' + params);
      if (version !== searchVersion) return;
      $('searchStatus').textContent = `${data.total} opportunità ${data.total === 1 ? 'disponibile' : 'disponibili'}`;
      $('results').innerHTML = data.jobs.length ? data.jobs.map(job => `<article class="job"><span class="eyebrow">${escape(job.struttura_tipo)}</span><h3>${escape(job.titolo)}</h3>${details(job)}<p class="muted">Pubblicato il ${date(job.created_at)}</p><button data-job="${job.id}">Scopri e candidati →</button></article>`).join('') : '<div class="empty"><h3>Nessuna opportunità con questi criteri, per ora.</h3><p>Prova un altro ruolo o amplia la zona. Se cerchi personale, puoi pubblicare il primo annuncio dalla tua area azienda.</p></div>';
      $('previousPage').hidden = page === 1; $('nextPage').hidden = page * 20 >= data.total;
      $('pageStatus').textContent = data.total ? `Pagina ${page} di ${Math.ceil(data.total / 20)}` : '';
    } catch (err) {
      if (version !== searchVersion) return;
      $('searchStatus').className = 'error'; $('searchStatus').textContent = errorText(err);
      $('results').innerHTML = '<div class="empty"><h3>Non è stato possibile caricare gli annunci.</h3><p>Premi “Cerca lavoro” per riprovare.</p></div>';
    }
  }
  async function showJob(id) {
    const version = openPanel('Caricamento annuncio…', '');
    try {
      const job = await request('/jobs/' + encodeURIComponent(id));
      if (version !== panelVersion) return;
      openPanel(job.titolo, `${details(job)}<p class="description">${escape(job.descrizione)}</p><p class="muted">Annuncio valido fino al ${date(job.scadenza)}. Chiarisci eventuali costi di alloggio, turni e dettagli della retribuzione durante il colloquio.</p><button id="shareJob" class="secondary">Copia link annuncio</button><hr><h3>Presentati all’azienda</h3>${token('worker') ? '<form id="applyForm"><label>Esperienza, competenze e disponibilità<textarea name="messaggio" minlength="20" maxlength="3000" required placeholder="Racconta la tua esperienza e quando potresti iniziare…"></textarea></label><p class="muted">Evita dati sanitari, documenti d’identità e altre informazioni non necessarie.</p><label class="check"><input name="consenso" type="checkbox" required>Confermo di voler condividere nome, email e presentazione con questa azienda per la candidatura.</label><a href="privacy.html" target="_blank" rel="noopener">Leggi l’informativa privacy</a><button type="submit">Invia candidatura</button></form>' : '<p>Accedi con un account lavoratore per inviare la tua candidatura.</p><a id="jobLogin" class="button" href="index.html">Accedi o registrati</a>'}`);
      if ($('jobLogin')) $('jobLogin').href = loginUrl('worker', job.id);
      $('shareJob').onclick = async () => {
        const url = new URL('lavoro.html', location.href); url.searchParams.set('annuncio', job.id);
        try { await navigator.clipboard.writeText(url.href); $('panelStatus').textContent = 'Link copiato.'; }
        catch { $('panelStatus').textContent = 'Link da copiare: ' + url.href; }
      };
      if ($('applyForm')) $('applyForm').onsubmit = async event => {
        event.preventDefault(); const button = event.submitter; button.disabled = true;
        try {
          const form = new FormData(event.currentTarget);
          const data = await request(`/jobs/${job.id}/applications`, { type:'worker', method:'POST', body:{ messaggio:form.get('messaggio'), consenso:form.has('consenso') } });
          $('applyForm').remove(); $('panelStatus').className=''; $('panelStatus').textContent = data.message;
        } catch (err) { panelError(err); button.disabled=false; }
      };
    } catch (err) { if (version === panelVersion) panelError(err); }
  }
  async function applications() {
    if (!token('worker')) return login('worker');
    const version = openPanel('Le mie candidature', '<p>Caricamento…</p>');
    try {
      const rows = await request('/me/applications', { type:'worker' });
      if (version !== panelVersion) return;
      $('panelContent').innerHTML = rows.length ? rows.map(row => `<article class="entry"><h3>${escape(row.titolo)} · ${escape(row.struttura_nome)}</h3><p class="muted">Inviata il ${date(row.created_at)} · Annuncio ${row.stato === 'chiuso' || new Date(row.scadenza.replace(' ','T')+'Z') < new Date() ? 'chiuso o scaduto' : 'aperto'}</p><p class="description">${escape(row.messaggio)}</p><button class="secondary" data-withdraw="${row.id}">Ritira candidatura</button></article>`).join('') : '<p>Non hai ancora inviato candidature. Esplora gli annunci e trova quello adatto a te.</p>';
    } catch (err) { if (version === panelVersion) { $('panelContent').innerHTML=''; panelError(err); } }
  }
  async function workerProfile() {
    if (!token('worker')) return login('worker');
    const version = openPanel('Il mio profilo professionale', '<p>Caricamento…</p>');
    try {
      const [profileData, professions] = await Promise.all([request('/worker-profile', { type:'worker' }), request('/professions')]);
      if (version !== panelVersion) return;
      const p=profileData.profile || {}, secondary=new Set((profileData.secondary_professions || []).map(x=>x.id));
      const options=professions.map(item=>`<option value="${item.id}" ${Number(p.profession_id)===item.id?'selected':''}>${escape(item.categoria)} · ${escape(item.nome)}</option>`).join('');
      $('panelContent').innerHTML=`<p class="notice">Il profilo resta nel tuo archivio personale. Solo le aziende verificate possono cercarlo e non vedono email, telefono o curriculum senza il tuo consenso.</p><form id="workerProfileForm"><label>Professione principale<select name="profession_id"><option value="">Seleziona professione</option>${options}</select></label><label>Professioni secondarie<select name="secondary_profession_ids" multiple size="6">${professions.map(item=>`<option value="${item.id}" ${secondary.has(item.id)?'selected':''}>${escape(item.categoria)} · ${escape(item.nome)}</option>`).join('')}</select></label><div class="form-grid"><label>Città<input name="citta" maxlength="100" value="${escape(p.citta)}"></label><label>Provincia<input name="provincia" maxlength="100" value="${escape(p.provincia)}"></label><label>Regione<input name="regione" maxlength="100" value="${escape(p.regione)}"></label><label>Anni di esperienza<input name="anni_esperienza" type="number" min="0" max="60" value="${Number(p.anni_esperienza||0)}"></label><label>Disponibilità<select name="disponibilita"><option value="da_definire">Da definire</option><option value="immediata">Immediata</option><option value="da_data">Da una data</option><option value="non_disponibile">Non disponibile</option></select></label><label>Stipendio desiderato netto (€)<input name="stipendio_desiderato" type="number" min="1" max="100000" value="${p.stipendio_desiderato||''}"></label></div><label>Lingue<input name="lingue" maxlength="500" value="${escape(p.lingue)}" placeholder="Italiano, tedesco, inglese…"></label><label>Competenze<textarea name="competenze" maxlength="1500" placeholder="Es. HACCP, cucina gourmet, servizio…">${escape(p.competenze)}</textarea></label><label>Presentazione<textarea name="presentazione" maxlength="3000" placeholder="Racconta brevemente esperienza e disponibilità…">${escape(p.presentazione)}</textarea></label><label class="check"><input name="trasferimento" type="checkbox" ${p.trasferimento?'checked':''}>Disponibile al trasferimento</label><label class="check"><input name="vitto_alloggio" type="checkbox" ${p.vitto_alloggio?'checked':''}>Cerco vitto o alloggio</label><label class="check"><input name="visibile" type="checkbox" ${p.visibile!==0?'checked':''}>Rendi il mio profilo visibile alle aziende verificate</label><button type="submit">Salva profilo</button></form>`;
      $('workerProfileForm').elements.disponibilita.value=p.disponibilita || 'da_definire';
      $('workerProfileForm').onsubmit=async event=>{event.preventDefault();const form=new FormData(event.currentTarget),button=event.submitter;button.disabled=true;try{const body=Object.fromEntries(form);body.profession_id=body.profession_id?Number(body.profession_id):null;body.secondary_profession_ids=form.getAll('secondary_profession_ids').map(Number);body.anni_esperienza=Number(body.anni_esperienza||0);body.stipendio_desiderato=body.stipendio_desiderato?Number(body.stipendio_desiderato):null;['trasferimento','vitto_alloggio','visibile'].forEach(k=>body[k]=form.has(k));const data=await request('/worker-profile',{type:'worker',method:'PUT',body});$('panelStatus').className='';$('panelStatus').textContent=data.message;}catch(err){panelError(err);button.disabled=false;}};
    } catch (err) { if (version === panelVersion) { $('panelContent').innerHTML=''; panelError(err); } }
  }
  async function searchWorkers() {
    if (!token('business')) return login('business');
    const version=openPanel('Cerca lavoratori', '<p>Caricamento…</p>');
    try {
      const professions=await request('/professions'); if(version!==panelVersion)return;
      const options=professions.map(item=>`<option value="${item.id}">${escape(item.categoria)} · ${escape(item.nome)}</option>`).join('');
      $('panelContent').innerHTML=`<form id="workerSearchForm" class="filters"><label>Professione<select name="profession_id"><option value="">Tutte</option>${options}</select></label><label>Città<input name="citta" maxlength="100" placeholder="Merano"></label><label>Regione<input name="regione" maxlength="100" placeholder="Trentino-Alto Adige"></label><label class="check"><input type="checkbox" name="disponibilita" value="immediata">Disponibili subito</label><button>Cerca lavoratori</button></form><p id="workerSearchStatus" role="status" aria-live="polite"></p><div id="workerResults"></div>`;
      const search=async()=>{const params=new URLSearchParams(new FormData($('workerSearchForm')));$('workerSearchStatus').textContent='Ricerca in corso…';try{const data=await request('/business/workers?'+params,{type:'business'});$('workerSearchStatus').textContent=`${data.total} profili compatibili con i filtri`;$('workerResults').innerHTML=data.workers.length?data.workers.map(row=>`<article class="entry"><h3>${escape(row.professione||'Professione da completare')}</h3><p>${escape(row.citta||'Località da definire')}${row.regione?' · '+escape(row.regione):''} · ${Number(row.anni_esperienza||0)} anni di esperienza</p><div class="tags"><span class="tag">${escape(row.disponibilita)}</span>${row.vitto_alloggio?'<span class="tag">Cerca alloggio</span>':''}</div><p class="description">${escape(row.competenze||'Competenze da completare')}</p></article>`).join(''):'<p>Nessun profilo con questi filtri. Prova ad ampliare zona o professione.</p>';}catch(err){$('workerSearchStatus').textContent=errorText(err);}};
      $('workerSearchForm').onsubmit=event=>{event.preventDefault();search();};search();
    }catch(err){if(version===panelVersion){$('panelContent').innerHTML='';panelError(err);}}
  }
  async function businessArea() {
    if (!token('business')) return login('business');
    const version = openPanel('I tuoi annunci', '<p>Caricamento…</p>');
    try {
      const rows = await request('/business/jobs', { type:'business' });
      if (version !== panelVersion) return;
      renderBusinessDashboard(rows, false);
    } catch (err) { if (version === panelVersion) { $('panelContent').innerHTML=''; panelError(err); } }
  }
  function renderBusinessDashboard(rows, demo) {
    const applications = rows.reduce((total, row) => total + Number(row.candidature || 0), 0);
    const open = rows.filter(row => row.stato === 'aperto').length;
    const prefix = demo ? 'demo-' : '';
    $('panelTitle').textContent = demo ? 'Hotel Demo Merano · Area azienda' : 'I tuoi annunci';
    const demoSummary = demo ? `<p><span class="demo-badge">MODALITÀ DEMO</span></p><p class="demo-notice"><strong>Stai usando dati fittizi.</strong> Puoi provare liberamente: nessuna azione modifica account, annunci o candidature reali.</p><div class="metric-grid"><div class="metric"><strong>${rows.length}</strong><span>Annunci totali</span></div><div class="metric"><strong>${open}</strong><span>Annunci aperti</span></div><div class="metric"><strong>${applications}</strong><span>Candidature</span></div></div>` : '';
    $('panelContent').innerHTML = demoSummary + `<div class="actions"><button id="newJob">Pubblica un annuncio${demo ? ' di prova' : ''}</button>${demo ? '<button id="resetDemo" class="secondary">Azzera demo</button>' : '<button id="searchWorkers" class="secondary">Cerca lavoratori</button>'}</div><p class="muted">Gli annunci scadono dopo 60 giorni. Puoi chiuderli prima quando trovi la persona giusta.</p>` + (rows.length ? rows.map(row => `<article class="entry"><h3>${escape(row.titolo)}</h3><p>${Number(row.candidature || 0)} candidature · ${row.stato === 'aperto' && new Date(row.scadenza.replace(' ','T')+'Z') > new Date() ? 'Aperto' : 'Chiuso o scaduto'}</p><div class="actions"><button data-${prefix}candidates="${escape(row.id)}">Vedi candidature</button>${row.stato === 'aperto' ? `<button class="secondary" data-${prefix}close-job="${escape(row.id)}">Chiudi annuncio</button>` : ''}</div></article>`).join('') : '<p>Non hai ancora pubblicato annunci.</p>');
    $('newJob').onclick = () => publishForm(demo);
    if (!demo) $('searchWorkers').onclick = searchWorkers;
    if (demo) $('resetDemo').onclick = () => demoBusinessArea(true);
  }
  function demoBusinessArea(reset = false) {
    openPanel('Hotel Demo Merano · Area azienda', '');
    renderBusinessDashboard(getDemoJobs(reset), true);
    if (reset) $('panelStatus').textContent = 'Demo ripristinata.';
  }
  function publishForm(demo = false) {
    openPanel(demo ? 'Pubblica un annuncio di prova' : 'Pubblica un annuncio', `${demo ? '<p class="demo-notice"><strong>Modalità demo:</strong> l’annuncio resterà soltanto in questa scheda del browser.</p>' : ''}<p class="notice">Indica condizioni reali e complete. Spiega turni, riposi, mansioni, eventuali costi di alloggio e come vengono pagate tredicesima e quattordicesima.</p><form id="publishForm"><label>Ruolo ricercato<input name="titolo" minlength="3" maxlength="100" required placeholder="Es. Sous chef"></label><label>Descrizione e condizioni<textarea name="descrizione" minlength="30" maxlength="6000" required></textarea></label><div class="form-grid"><label>Contratto<select name="contratto"><option value="indeterminato">Tempo indeterminato</option><option value="determinato">Tempo determinato</option><option value="stagionale">Stagionale</option><option value="apprendistato">Apprendistato</option></select></label><label>Stipendio espresso come<select name="salario_tipo"><option value="netto">Netto mensile</option><option value="lordo">Lordo mensile</option></select></label><label>Minimo mensile (€)<input name="salario_min" type="number" min="1" max="100000" required></label><label>Massimo mensile (€)<input name="salario_max" type="number" min="1" max="100000" required></label><label>Mensilità<select name="mensilita"><option value="12">12</option><option value="13">13</option><option value="14">14</option></select></label><label>Ore settimanali<input name="ore_settimana" type="number" min="1" max="60" required></label><label>Giorni lavorativi a settimana<input name="giorni_settimana" type="number" min="1" max="6" required></label></div><label class="check"><input name="alloggio" type="checkbox">Alloggio disponibile (specifica condizioni e costi nella descrizione)</label><button type="submit">${demo ? 'Simula pubblicazione' : 'Pubblica annuncio'}</button></form>`);
    $('publishForm').onsubmit = async event => {
      event.preventDefault(); const button = event.submitter; button.disabled=true;
      const form = new FormData(event.currentTarget), body = Object.fromEntries(form);
      ['salario_min','salario_max','mensilita','ore_settimana','giorni_settimana'].forEach(key => body[key]=Number(body[key])); body.alloggio = form.has('alloggio');
      try {
        if (demo) {
          const jobs = getDemoJobs();
          jobs.unshift({ id:'demo-'+Date.now(), titolo:body.titolo, candidature:0, stato:'aperto', scadenza:demoExpiry() });
          saveDemoJobs(jobs); demoBusinessArea(); return;
        }
        await request('/business/jobs', { type:'business', method:'POST', body }); await businessArea(); search();
      }
      catch (err) { panelError(err); button.disabled=false; }
    };
  }
  async function candidates(id, demo = false) {
    const version = openPanel('Candidature ricevute', '<p>Caricamento…</p>');
    try {
      const rows = demo ? (demoCandidates[id] || []) : await request(`/business/jobs/${id}/applications`, { type:'business' });
      if (version !== panelVersion) return;
      $('panelContent').innerHTML = (demo ? '<p><span class="demo-badge">CANDIDATURE DIMOSTRATIVE</span></p>' : '') + '<button id="backBusiness" class="secondary">← I tuoi annunci</button><p class="notice">Usa questi recapiti soltanto per gestire la candidatura.</p>' + (rows.length ? rows.map(row => `<article class="entry"><h3>${escape(row.nome)}</h3><p>${escape(row.email)}</p><p class="muted">${date(row.created_at)}</p><p class="description">${escape(row.messaggio)}</p></article>`).join('') : '<p>Non sono ancora arrivate candidature per questo annuncio.</p>');
      $('backBusiness').onclick=demo ? () => demoBusinessArea() : businessArea;
    } catch (err) { if (version === panelVersion) { $('panelContent').innerHTML=''; panelError(err); } }
  }
  $('results').onclick = event => { const button=event.target.closest('[data-job]'); if (button) showJob(button.dataset.job); };
  $('panelContent').addEventListener('click', async event => {
    const button=event.target.closest('button'); if (!button) return;
    if (button.dataset.candidates) return candidates(button.dataset.candidates);
    if (button.dataset.demoCandidates) return candidates(button.dataset.demoCandidates, true);
    if (button.dataset.demoCloseJob) {
      const jobs = getDemoJobs();
      const job = jobs.find(row => String(row.id) === button.dataset.demoCloseJob);
      if (job) job.stato = 'chiuso';
      saveDemoJobs(jobs); demoBusinessArea(); return;
    }
    if (button.dataset.withdraw || button.dataset.closeJob) {
      const withdraw=Boolean(button.dataset.withdraw);
      if (!confirm(withdraw ? 'Ritirare e cancellare questa candidatura da Trustourant?' : 'Chiudere l’annuncio? Non riceverai altre candidature.')) return;
      button.disabled=true;
      try {
        await request(withdraw ? `/me/applications/${button.dataset.withdraw}` : `/business/jobs/${button.dataset.closeJob}/close`, {type:withdraw ? 'worker' : 'business',method:withdraw ? 'DELETE' : 'PATCH'});
        if (withdraw) await applications(); else { await businessArea(); search(); }
      } catch (err) { panelError(err); button.disabled=false; }
    }
  });
  $('searchForm').onsubmit=event => {event.preventDefault();page=1;search();};
  $('previousPage').onclick=()=>{page--;search();}; $('nextPage').onclick=()=>{page++;search();};
  $('workerProfile').onclick=workerProfile; $('myApplications').onclick=applications; $('demoBusiness').onclick=() => demoBusinessArea(); $('businessArea').onclick=businessArea; $('openPublish').onclick=businessArea;
  $('closePanel').onclick=()=>$('panel').close(); $('panel').addEventListener('close',()=>{panelVersion++;});
  search(); const params=new URLSearchParams(location.search), id=params.get('annuncio'); if (id && /^\d+$/.test(id)) showJob(id); else if (params.get('demo') === 'azienda') demoBusinessArea(); else if (params.get('area') === 'azienda') businessArea();
})();
