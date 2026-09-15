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
  assert.match(read('lavoro.js'), /area=azienda/);
  assert.match(read('index.html'), /TrustourantUI\.returnPath/);
});

test('Obsolete duplicate entry points redirect to the maintained frontend', () => {
  for (const file of ['index (1).html', 'trustourant-frontend (1).html']) {
    const doc = new JSDOM(read(file)).window.document;
    assert.equal(doc.querySelector('meta[http-equiv="refresh"]')?.content, '0;url=index.html');
  }
});
