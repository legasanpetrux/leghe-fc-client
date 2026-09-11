# `@legasanpetrux/leghe-fc-client`

[English](README.md) | Italiano

Client TypeScript non ufficiale, esclusivamente server-side, per leggere da Leghe FC i dati relativi
a leghe, squadre, rose, calciatori, competizioni, calendari, risultati e fantapunti.

> [!WARNING]
> Questa libreria non è affiliata a Fantacalcio né è approvata o supportata da Fantacalcio. Utilizza
> un'API privata e non documentata, che può cambiare o smettere di funzionare senza preavviso.
> Consulta i [termini in vigore](https://www.fantacalcio.it/termini-e-condizioni/) della piattaforma
> e ottieni le autorizzazioni appropriate per il tuo caso d'uso.

Il client supporta intenzionalmente soltanto il login e un insieme ristretto di
endpoint di lettura. Non espone operazioni remote per formazioni, mercato, calcolo, annullamento,
gestione della lega o altre modifiche.

## Requisiti

- Node.js 22 o versione successiva
- Un'applicazione ESM; il pacchetto non fornisce una build CommonJS
- Un account Leghe FC autorizzato ad accedere alla lega da leggere

## Installazione

```bash
npm install @legasanpetrux/leghe-fc-client
```

## Utilizzo

```ts
import { authenticateLegheFc } from '@legasanpetrux/leghe-fc-client';

const account = await authenticateLegheFc({
  username: process.env.LEGHE_FC_USERNAME!,
  password: process.env.LEGHE_FC_PASSWORD!
});

console.log(account.leagues); // Soltanto ID e metadati descrittivi non sensibili

const league = account.league(process.env.LEGHE_FC_LEAGUE_ID);
const discovery = await league.discover();
const activeCompetitions = discovery.competitions.filter((item) => !item.deleted);
const configuredCompetitionId = process.env.LEGHE_FC_COMPETITION_ID;
const competition = configuredCompetitionId
  ? activeCompetitions.find((item) => item.id === configuredCompetitionId)
  : activeCompetitions.length === 1
    ? activeCompetitions[0]
    : undefined;
if (!competition) throw new Error('Seleziona una competizione Leghe FC attiva.');

const fixtures = await league.getCalendar(competition.id);
const roster = await league.getRosters();
```

`getTeams()` restituisce squadre normalizzate con ID dei calciatori, crediti di acquisto e totali per
ruolo. `getPlayerCatalog()` restituisce il catalogo normalizzato dei calciatori della lega.
`getRosters()` combina entrambe le letture e rifiuta calciatori mancanti, assegnazioni duplicate,
ruoli non validi e totali per ruolo incoerenti.

Se l'account appartiene a una sola lega, `account.league()` la seleziona automaticamente. Gli
account associati a più leghe devono specificare l'ID della lega.

La public key dell'applicazione web viene individuata e memorizzata automaticamente nella
cache. È possibile fornire una chiave esplicita o un provider personalizzato per il ripristino e i
test:

```ts
const account = await authenticateLegheFc({
  username,
  password,
  appKey: process.env.LEGHE_FC_APP_KEY
});
```

I provider restituiti da `createPublicAppKeyProvider()` mantengono una cache isolata ed espongono
`invalidate()`. L'autenticazione usa automaticamente questo metodo prima di riprovare con una
chiave rifiutata. Le semplici funzioni provider personalizzate continuano a essere supportate e
vengono richiamate quando la chiave potrebbe essere cambiata.

## Errori

Tutti gli errori previsti del client usano `LegheFcError`, con un `code` stabile e uno `status` HTTP
opzionale. I corpi delle risposte upstream, le credenziali e i token di autenticazione non vengono
inclusi nei messaggi di errore.

```ts
import { isLegheFcError } from '@legasanpetrux/leghe-fc-client';

try {
  await league.getCalendar('99');
} catch (error) {
  if (isLegheFcError(error)) {
    console.error(error.code, error.status);
  }
}
```

Usa `AbortSignal` per annullare l'autenticazione o le richieste di lettura:

```ts
const controller = new AbortController();
const fixtures = await league.getCalendar('99', { signal: controller.signal });
```

## Compatibilità

Le modifiche ai contratti API vengono segnalate con errori quali `LOGIN_CONTRACT_CHANGED`,
`DISCOVERY_CONTRACT_CHANGED`, `CALENDAR_CONTRACT_CHANGED` e `ROSTER_CONTRACT_CHANGED`.

## Sviluppo

```bash
npm ci
npm run check
npm test
npm run build
npm pack --dry-run
```

I test utilizzano soltanto dati di esempio e non richiedono credenziali reali né accesso alla rete.

### Smoke test manuale sull'API reale

Lo smoke test facoltativo esegue l'autenticazione, individua i metadati della lega e legge le rose e
il calendario di una competizione. Stampa soltanto i nomi descrittivi e gli ID di leghe o
competizioni necessari per la selezione, insieme ai valori aggregati; non stampa mai credenziali,
JWT o dati dei calciatori e non esegue operazioni di scrittura su Leghe FC.

```bash
cp .env.example .env.local
# Inserisci LEGHE_FC_USERNAME e LEGHE_FC_PASSWORD.
# Aggiungi gli ID facoltativi della lega o della competizione soltanto se vengono rilevate più scelte.
npm run smoke:live
```

`.env.local` viene ignorato da Git.
