'use strict';
(() => {
  const format = value => Number.isFinite(Number(value))
    ? new Intl.NumberFormat('it-IT').format(Number(value))
    : '—';

  async function loadPublicStats() {
    const status = document.getElementById('publicStatsStatus');
    try {
      const response = await fetch('https://trustourant-backend.onrender.com/api/stats');
      if (!response.ok) throw new Error('Statistiche non disponibili');
      const data = await response.json();
      document.getElementById('publicStructures').textContent = format(data.num_strutture);
      document.getElementById('publicReviews').textContent = format(data.num_reviews);
      document.getElementById('publicUsers').textContent = format(data.num_utenti);
      if (status) status.textContent = 'Dati aggiornati dal servizio Trustourant.';
    } catch {
      if (status) status.textContent = 'I dati riepilogativi non sono disponibili in questo momento.';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadPublicStats, { once: true });
  } else {
    loadPublicStats();
  }
})();
