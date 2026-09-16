'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('Shared browser safety helpers escape stored content and restrict return destinations', () => {
  const dom = new JSDOM('', { url: 'https://trustourant.it/index.html' });
  vm.runInContext(read('ui-security.js'), vm.createContext(dom.window));
  const ui = dom.window.TrustourantUI;
  assert.equal(ui.escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  dom.window.localStorage.setItem('user', '{invalid');
  assert.equal(ui.readStoredObject('user'), null);
  assert.equal(ui.returnPath('?next=lavoro.html%3Fannuncio%3D42'), 'lavoro.html?annuncio=42');
  assert.equal(ui.returnPath('?next=https%3A%2F%2Fevil.example'), null);
  assert.equal(ui.returnPath('?next=%2F%2Fevil.example'), null);
});

test('Public pages contain the full jobs path and scripts parse correctly', () => {
  for (const file of ['index.html', 'trustourant-frontend.html', 'trustourant-admin-fase4.html']) {
    const dom = new JSDOM(read(file));
    for (const script of dom.window.document.querySelectorAll('script:not([src])')) {
      assert.doesNotThrow(() => new Function(script.textContent), `${file} contains invalid JavaScript`);
    }
  }
  const jobs = new JSDOM(read('lavoro.html')).window.document;
  assert.ok(jobs.querySelector('form#searchForm'));
  assert.ok(jobs.querySelector('dialog#panel'));
  assert.equal(jobs.querySelector('#demoBusiness')?.textContent, 'Prova demo azienda');
  assert.ok(jobs.querySelector('link[href="lavoro-demo.css"]'));
  assert.ok(jobs.querySelector('link[href^="design-system.css"]'));
  assert.match(read('lavoro.js'), /area=azienda/);
  assert.match(read('lavoro.js'), /sessionStorage\.setItem\('trustourantDemoJobs'/);
  assert.match(read('lavoro.js'), /nessuna azione modifica account, annunci o candidature reali/i);
  assert.match(read('index.html'), /TrustourantUI\.returnPath/);
  assert.match(read('index.html'), /id="publicStructures"/);
  assert.match(read('public-home.js'), /api\/stats/);
  assert.doesNotMatch(read('index.html'), /#ec4899|#f59e0b|Fase 3|Fase 4/i);
  assert.match(read('index.html'), /deleteMyReview/);
  assert.match(read('index.html'), /Elimina recensione/);
  assert.match(read('trustourant-backend.js'), /app\.delete\('\/api\/reviews\/:review_id'/);
  assert.match(read('trustourant-backend.js'), /altoAdigeAliases/);
  assert.match(read('index.html'), /\.section-tab\.active \{ display: block/);
  assert.match(read('index.html'), /tab === 'mie-review' \? 'mieReviewTab'/);
  assert.match(read('index.html'), /Classifica Strutture<\/h2>/);
  assert.doesNotMatch(read('index.html'), /<h2 style="color: white; margin-bottom: 10px;">Classifica Strutture/);
  assert.doesNotMatch(read('index.html'), /<h2 style="color: white; margin-bottom: 20px;">Dashboard Statistiche/);
});

test('Business demo is interactive and never calls protected business endpoints', async () => {
  const dom = new JSDOM(read('lavoro.html'), { url:'https://trustourant.it/lavoro.html', runScripts:'outside-only' });
  const { window } = dom;
  const requested = [];
  window.AbortSignal = global.AbortSignal;
  window.fetch = async url => {
    requested.push(String(url));
    return { ok:true, json:async () => ({ jobs:[], total:0, page:1, page_size:20 }) };
  };
  const panel = window.document.getElementById('panel');
  panel.showModal = () => { panel.open = true; };
  panel.close = () => { panel.open = false; panel.dispatchEvent(new window.Event('close')); };
  window.eval(read('lavoro.js'));
  await new Promise(resolve => setTimeout(resolve, 0));

  window.document.getElementById('demoBusiness').click();
  assert.match(window.document.getElementById('panelTitle').textContent, /Hotel Demo Merano/);
  assert.match(window.document.getElementById('panelContent').textContent, /dati fittizi/i);
  assert.equal(window.document.querySelectorAll('[data-demo-candidates]').length, 2);
  assert.equal(requested.filter(url => url.includes('/business/')).length, 0);

  window.document.querySelector('[data-demo-candidates="demo-1"]').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(window.document.getElementById('panelContent').textContent, /Mario Rossi/);
  assert.equal(requested.filter(url => url.includes('/business/')).length, 0);
});

test('Obsolete duplicate entry points redirect to the maintained frontend', () => {
  for (const file of ['index (1).html', 'trustourant-frontend (1).html']) {
    const doc = new JSDOM(read(file)).window.document;
    assert.equal(doc.querySelector('meta[http-equiv="refresh"]')?.content, '0;url=index.html');
  }
});
