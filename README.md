# `@legasanpetrux/leghe-fc-client`

Unofficial, server-only TypeScript client for reading league, team, competition, fixture, result,
and fantasy-point data from Leghe FC.

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
- A Leghe FC account permitted to access the league being read

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
const fixtures = await league.getCalendar(discovery.competitions[0]!.id);
```

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
`DISCOVERY_CONTRACT_CHANGED`, and `CALENDAR_CONTRACT_CHANGED`.

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

The opt-in smoke test authenticates, discovers league metadata, and reads one competition
calendar. It prints only sanitized names and counts, never credentials or JWTs, and contains no
remote mutation calls.

```bash
cp .env.example .env.local
# Fill in LEGHE_FC_USERNAME and LEGHE_FC_PASSWORD.
# Add the optional league or competition IDs only when discovery reports multiple choices.
npm run smoke:live
```

`.env.local` is ignored by Git.
