'use strict';
(function (root) {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const readStoredObject = key => {
    try { const value = JSON.parse(root.localStorage.getItem(key) || 'null'); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
    catch { return null; }
  };
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const returnPath = search => {
    const next = new URLSearchParams(search).get('next');
    // Allow only the job page and its documented parameters, never arbitrary URLs.
    if (!next || !/^lavoro\.html(?:\?(?:annuncio=\d+|area=azienda))?$/.test(next)) return null;
    return next;
  };
  root.TrustourantUI = { escapeHtml, readStoredObject, number, returnPath };
})(typeof window === 'undefined' ? globalThis : window);
