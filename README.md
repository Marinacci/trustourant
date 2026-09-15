# Trustourant

Recensioni dei luoghi di lavoro e opportunità nell’ospitalità.

## Avvio

- Node.js con le dipendenze di `package-lock.json`: `npm ci`.
- Impostare `JWT_SECRET` su un valore privato casuale. Non pubblicarlo nel repository. Il server rifiuta l'avvio se manca o coincide con il vecchio valore pubblico di fallback.
- Su Render mantenere `DB_PATH=/var/data/trustourant.db` (o il percorso del database già in uso sul disco persistente). Non cambiare percorso durante un aggiornamento senza migrare i dati.
- `npm start` avvia il backend; `PORT` predefinita 5000.
- `npm test` esegue prove isolate in memoria, senza account o email reali.

## Modulo lavoro

La pagina `lavoro.html` usa il backend Render già esistente. Il collegamento “Trova lavoro” è presente in `index.html` e nella sua copia `trustourant-frontend.html`. In locale la nuova pagina usa `/api` sullo stesso host. Gli account restano quelli esistenti; i token sono condivisi fra le pagine solo sullo stesso dominio.

- Ricerca pubblica per ruolo/struttura, città/provincia, minimo mensile netto o lordo e disponibilità alloggio. Pagine da 20 risultati.
- Annunci con stipendio minimo/massimo, netto/lordo, mensilità, ore e giorni settimanali obbligatori; durata 60 giorni e chiusura anticipata.
- Nuove aziende sempre sottoposte a verifica manuale; la coda admin include anche gli account storici verificati solo tramite dominio email.
- Pubblicazione e consultazione candidati solo per account con `verificato=1` e `metodo_verifica=verifica_manuale_admin`, su strutture non bloccate. La sola corrispondenza fra dominio email digitato e sito web non prova il controllo dell'azienda.
- I candidati inviano una presentazione e confermano la condivisione di nome/email con l'azienda destinataria. Nessun documento o CV viene caricato in questa versione.
- L'azienda vede soltanto le candidature ai propri annunci. Il lavoratore può consultare e ritirare le proprie candidature.
- Le candidature sono incluse nell'esportazione account esistente; un trigger le elimina quando viene cancellato l'utente.
- Nessun invio automatico di email, nessun pagamento e nessun annuncio fittizio.

Lo schema aggiunge `jobs`, `job_applications`, indici e un trigger. Il server attende la creazione del nuovo schema prima di accettare connessioni. Non vengono modificati i dati esistenti delle recensioni.

## Pubblicazione

Il servizio Render `trustourant-backend` distribuisce automaticamente il ramo `main` e avvia `node trustourant-backend.js`. Prima di integrare la modifica verificare che `JWT_SECRET` sia già configurato e che `DB_PATH` punti al database persistente esistente. Non sostituire un segreto già configurato: invaliderebbe le sessioni correnti.

La parte statica è nel medesimo repository con `CNAME`. Pubblicare insieme `lavoro.html`, `lavoro.js`, `lavoro.css` e gli aggiornamenti a `index.html`/`privacy.html`. In caso di rollback del codice le nuove tabelle restano presenti e non vanno eliminate.

## Passi successivi

Profili professionali e CV, gestione avanzata delle candidature, job alert, abbonamenti aziendali e pagamenti. Queste funzionalità non sono incluse nel modulo attuale. Prima di aprire pubblicamente il servizio di recruiting completare la revisione della sicurezza dell'autenticazione e del rendering delle pagine storiche, oltre alle impostazioni operative e informative per il trattamento delle candidature.
