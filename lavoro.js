'use strict';
(() => {
  const API = ['localhost','127.0.0.1'].includes(location.hostname) ? '/api' : 'https://trustourant-backend.onrender.com/api';
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => new Intl.NumberFormat('it-IT').format(value);
  const date = value => new Date(value.replace(' ', 'T') + 'Z').toLocaleDateString('it-IT');
  const token = type => localStorage.getItem(type === 'business' ? 'businessToken' : 'token');
  let page = 1, searchVersion = 0, panelVersion = 0;
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
  function login(type) {
    openPanel('Accedi per continuare', `<p>Usa il tuo account ${type === 'business' ? 'aziendale' : 'lavoratore'} Trustourant. Dopo l’accesso torna alla sezione Trova lavoro.</p><a class="button" href="index.html${type === 'business' ? '#aziende' : ''}">Accedi o registrati</a>`);
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
      openPanel(job.titolo, `${details(job)}<p class="description">${escape(job.descrizione)}</p><p class="muted">Annuncio valido fino al ${date(job.scadenza)}. Chiarisci eventuali costi di alloggio, turni e dettagli della retribuzione durante il colloquio.</p><button id="shareJob" class="secondary">Copia link annuncio</button><hr><h3>Presentati all’azienda</h3>${token('worker') ? '<form id="applyForm"><label>Esperienza, competenze e disponibilità<textarea name="messaggio" minlength="20" maxlength="3000" required placeholder="Racconta la tua esperienza e quando potresti iniziare…"></textarea></label><p class="muted">Evita dati sanitari, documenti d’identità e altre informazioni non necessarie.</p><label class="check"><input name="consenso" type="checkbox" required>Confermo di voler condividere nome, email e presentazione con questa azienda per la candidatura.</label><a href="privacy.html" target="_blank" rel="noopener">Leggi l’informativa privacy</a><button type="submit">Invia candidatura</button></form>' : '<p>Accedi con un account lavoratore per inviare la tua candidatura.</p><a class="button" href="index.html">Accedi o registrati</a>'}`);
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
  async function businessArea() {
    if (!token('business')) return login('business');
    const version = openPanel('I tuoi annunci', '<p>Caricamento…</p>');
    try {
      const rows = await request('/business/jobs', { type:'business' });
      if (version !== panelVersion) return;
      $('panelContent').innerHTML = '<button id="newJob">Pubblica un annuncio</button><p class="muted">Gli annunci scadono dopo 60 giorni. Puoi chiuderli prima quando trovi la persona giusta.</p>' + (rows.length ? rows.map(row => `<article class="entry"><h3>${escape(row.titolo)}</h3><p>${row.candidature} candidature · ${row.stato === 'aperto' && new Date(row.scadenza.replace(' ','T')+'Z') > new Date() ? 'Aperto' : 'Chiuso o scaduto'}</p><div class="actions"><button data-candidates="${row.id}">Vedi candidature</button>${row.stato === 'aperto' ? `<button class="secondary" data-close-job="${row.id}">Chiudi annuncio</button>` : ''}</div></article>`).join('') : '<p>Non hai ancora pubblicato annunci.</p>');
      $('newJob').onclick = publishForm;
    } catch (err) { if (version === panelVersion) { $('panelContent').innerHTML=''; panelError(err); } }
  }
  function publishForm() {
    openPanel('Pubblica un annuncio', `<p class="notice">Indica condizioni reali e complete. Spiega turni, riposi, mansioni, eventuali costi di alloggio e come vengono pagate tredicesima e quattordicesima.</p><form id="publishForm"><label>Ruolo ricercato<input name="titolo" minlength="3" maxlength="100" required placeholder="Es. Sous chef"></label><label>Descrizione e condizioni<textarea name="descrizione" minlength="30" maxlength="6000" required></textarea></label><div class="form-grid"><label>Contratto<select name="contratto"><option value="indeterminato">Tempo indeterminato</option><option value="determinato">Tempo determinato</option><option value="stagionale">Stagionale</option><option value="apprendistato">Apprendistato</option></select></label><label>Stipendio espresso come<select name="salario_tipo"><option value="netto">Netto mensile</option><option value="lordo">Lordo mensile</option></select></label><label>Minimo mensile (€)<input name="salario_min" type="number" min="1" max="100000" required></label><label>Massimo mensile (€)<input name="salario_max" type="number" min="1" max="100000" required></label><label>Mensilità<select name="mensilita"><option value="12">12</option><option value="13">13</option><option value="14">14</option></select></label><label>Ore settimanali<input name="ore_settimana" type="number" min="1" max="60" required></label><label>Giorni lavorativi a settimana<input name="giorni_settimana" type="number" min="1" max="6" required></label></div><label class="check"><input name="alloggio" type="checkbox">Alloggio disponibile (specifica condizioni e costi nella descrizione)</label><button type="submit">Pubblica annuncio</button></form>`);
    $('publishForm').onsubmit = async event => {
      event.preventDefault(); const button = event.submitter; button.disabled=true;
      const form = new FormData(event.currentTarget), body = Object.fromEntries(form);
      ['salario_min','salario_max','mensilita','ore_settimana','giorni_settimana'].forEach(key => body[key]=Number(body[key])); body.alloggio = form.has('alloggio');
      try { await request('/business/jobs', { type:'business', method:'POST', body }); await businessArea(); search(); }
      catch (err) { panelError(err); button.disabled=false; }
    };
  }
  async function candidates(id) {
    const version = openPanel('Candidature ricevute', '<p>Caricamento…</p>');
    try {
      const rows = await request(`/business/jobs/${id}/applications`, { type:'business' });
      if (version !== panelVersion) return;
      $('panelContent').innerHTML = '<button id="backBusiness" class="secondary">← I tuoi annunci</button><p class="notice">Usa questi recapiti soltanto per gestire la candidatura.</p>' + (rows.length ? rows.map(row => `<article class="entry"><h3>${escape(row.nome)}</h3><p>${escape(row.email)}</p><p class="muted">${date(row.created_at)}</p><p class="description">${escape(row.messaggio)}</p></article>`).join('') : '<p>Non sono ancora arrivate candidature per questo annuncio.</p>');
      $('backBusiness').onclick=businessArea;
    } catch (err) { if (version === panelVersion) { $('panelContent').innerHTML=''; panelError(err); } }
  }
  $('results').onclick = event => { const button=event.target.closest('[data-job]'); if (button) showJob(button.dataset.job); };
  $('panelContent').addEventListener('click', async event => {
    const button=event.target.closest('button'); if (!button) return;
    if (button.dataset.candidates) return candidates(button.dataset.candidates);
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
  $('myApplications').onclick=applications; $('businessArea').onclick=businessArea; $('openPublish').onclick=businessArea;
  $('closePanel').onclick=()=>$('panel').close(); $('panel').addEventListener('close',()=>{panelVersion++;});
  search(); const id=new URLSearchParams(location.search).get('annuncio'); if (id && /^\d+$/.test(id)) showJob(id);
})();
