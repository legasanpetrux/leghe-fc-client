# `@legasanpetrux/leghe-fc-client`

English | [Italiano](README.it.md)

Unofficial, server-only TypeScript client for reading league, team, roster, player, competition,
fixture, result, and fantasy-point data from Leghe FC.

> [!WARNING]
> This package is not affiliated with, endorsed by, or supported by Fantacalcio. It uses an
> undocumented private API that can change or stop working without notice. Review the platform's
> [current terms](https://www.fantacalcio.it/termini-e-condizioni/) and obtain any authorization
> appropriate to your use case.

The client intentionally supports only the login request and a small allowlist of read endpoints.
It does not expose lineup, market, calculation, cancellation, league-management, or other remote
mutation operations.

## Requirements

- Node.js 22 or newer
- An ESM application; the package does not provide a CommonJS build
- A Leghe FC account permitted to access the league being read

## Installation

```bash
npm install @legasanpetrux/leghe-fc-client
```

## Usage

```ts
import { authenticateLegheFc } from '@legasanpetrux/leghe-fc-client';

const account = await authenticateLegheFc({
  username: process.env.LEGHE_FC_USERNAME!,
  password: process.env.LEGHE_FC_PASSWORD!
});

console.log(account.leagues); // IDs and non-secret display metadata only

const league = account.league(process.env.LEGHE_FC_LEAGUE_ID);
const discovery = await league.discover();
const activeCompetitions = discovery.competitions.filter((item) => !item.deleted);
const configuredCompetitionId = process.env.LEGHE_FC_COMPETITION_ID;
const competition = configuredCompetitionId
  ? activeCompetitions.find((item) => item.id === configuredCompetitionId)
  : activeCompetitions.length === 1
    ? activeCompetitions[0]
    : undefined;
if (!competition) throw new Error('Select one active Leghe FC competition.');

const fixtures = await league.getCalendar(competition.id);
const roster = await league.getRosters();
```

`getTeams()` returns normalized teams with player IDs, acquisition costs, and position totals.
`getPlayerCatalog()` returns the normalized league player catalog. `getRosters()` joins both reads
and rejects missing players, duplicate assignments, invalid roles, and inconsistent position totals.

If the account belongs to exactly one league, `account.league()` selects it automatically.
Accounts with multiple leagues must pass a league ID.

The public web app key is discovered and cached automatically. An explicit key or custom provider
can be supplied for recovery and testing:

```ts
const account = await authenticateLegheFc({
  username,
  password,
  appKey: process.env.LEGHE_FC_APP_KEY
});
```

Providers returned by `createPublicAppKeyProvider()` keep an isolated cache and expose
`invalidate()`. Authentication uses that method automatically before retrying a rejected key.
Plain custom provider functions remain supported and are called again when a key may have rotated.

## Errors

All expected client failures use `LegheFcError` with a stable `code` and optional HTTP `status`.
Upstream response bodies, credentials, and authentication tokens are not included in error
messages.

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

Use `AbortSignal` to cancel authentication or read requests:

```ts
const controller = new AbortController();
const fixtures = await league.getCalendar('99', { signal: controller.signal });
```

## Compatibility

Contract changes are reported with errors such as `LOGIN_CONTRACT_CHANGED`,
`DISCOVERY_CONTRACT_CHANGED`, `CALENDAR_CONTRACT_CHANGED`, and `ROSTER_CONTRACT_CHANGED`.

## Development

```bash
npm ci
npm run check
npm test
npm run build
npm pack --dry-run
```

Tests use only synthetic payloads and do not require real credentials or network access.

### Manual live smoke test

The opt-in smoke test authenticates, discovers league metadata, and reads rosters plus one
competition calendar. It prints only league or competition display names and IDs needed for
selection plus aggregate counts; it never prints credentials, JWTs, or player data and contains no
remote mutation calls.

```bash
cp .env.example .env.local
# Fill in LEGHE_FC_USERNAME and LEGHE_FC_PASSWORD.
# Add the optional league or competition IDs only when discovery reports multiple choices.
npm run smoke:live
```

`.env.local` is ignored by Git.
