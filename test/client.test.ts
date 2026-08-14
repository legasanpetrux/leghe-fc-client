import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authenticateLegheFc, LegheFcError } from '../src/index.js';

const APP_KEY = 'abcdefghijklmnop1234567890';

function jsonResponse(value: unknown, status = 200): Response {
	return new Response(JSON.stringify(value), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('authenticateLegheFc', () => {
	it('keeps credentials and JWTs out of the public account and normalizes reads', async () => {
		const calls: Array<{ url: string; method: string; headers: Headers; body: string | null }> = [];
		const fetchImplementation: typeof fetch = async (input, init) => {
			const url = String(input);
			const headers = new Headers(init?.headers);
			calls.push({
				url,
				method: init?.method ?? 'GET',
				headers,
				body: typeof init?.body === 'string' ? init.body : null
			});

			if (url.endsWith('/onboarding/v1/login')) {
				return jsonResponse({
					success: true,
					data: {
						utente: { id: 1 },
						jwt: 'account-secret-jwt',
						leghe: [
							{ id: 7, nome: 'Example League', alias: 'example', jwt: 'league-secret-jwt', id_squadra: 10 },
							{ id: 8, nome: 'Other League', alias: 'other', jwt: 'other-secret-jwt', id_squadra: 11 }
						]
					}
				});
			}
			if (url.endsWith('/league/teams/all')) {
				return jsonResponse({ timestamp: 123, data: [{ id: 10, n: 'Alpha', nu: 'Alice' }] });
			}
			if (url.endsWith('/league/competitions')) {
				return jsonResponse([
					{ id: 99, lid: 7, name: 'Championship', type: 1, sDay: 3, eDay: 38, tmids: [10, 20], state: 4, del: false },
					{ id: 100, lid: 8, name: 'Other', type: 1 }
				]);
			}
			if (url.endsWith('/league/update')) {
				return jsonResponse({ leagueId: 7, profile: 1, roster: 2, options: 3, playersOptions: 4 });
			}
			if (url.endsWith('/league/competition/calendar/99')) {
				return jsonResponse([
					{
						matchDay: 1,
						championshipMatchDay: 3,
						calculated: true,
						matches: [{ tIdH: 10, tIdA: 20, result: '2-1', ptH: 72.5, ptA: 66 }]
					}
				]);
			}
			throw new Error(`Unexpected URL: ${url}`);
		};

		const account = await authenticateLegheFc({
			username: 'user@example.test',
			password: 'not-a-real-password',
			appKey: APP_KEY,
			fetch: fetchImplementation
		});

		assert.deepEqual(account.leagues, [
			{ id: '7', name: 'Example League', alias: 'example', teamId: '10' },
			{ id: '8', name: 'Other League', alias: 'other', teamId: '11' }
		]);
		const serializedAccount = JSON.stringify(account);
		assert.doesNotMatch(serializedAccount, /secret-jwt|not-a-real-password/);

		const league = account.league('7');
		const discovery = await league.discover();
		assert.deepEqual(discovery, {
			teams: [{ id: '10', name: 'Alpha', username: 'Alice' }],
			competitions: [
				{
					id: '99',
					leagueId: '7',
					name: 'Championship',
					type: 1,
					startMatchday: 3,
					endMatchday: 38,
					teamIds: ['10', '20'],
					state: '4',
					deleted: false
				}
			],
			teamsState: '2'
		});

		const [fixture] = await league.getCalendar('99');
		assert.equal(fixture?.externalFixtureKey, '99:1:10:20');
		assert.equal(fixture?.homeScore, 2);
		assert.equal(fixture?.homeFantasyPoints, '72.50');

		const loginCall = calls.find((call) => call.url.endsWith('/login'));
		assert.equal(loginCall?.method, 'POST');
		assert.equal(loginCall?.headers.get('app_key'), APP_KEY);
		const authenticatedCalls = calls.filter((call) => call.url.includes('/league/'));
		assert.ok(authenticatedCalls.every((call) => call.headers.get('authorization') === 'Bearer league-secret-jwt'));
		assert.ok(calls.every((call) => call.method === 'GET' || call.url.endsWith('/login')));
	});

	it('requires an explicit league selection for accounts with multiple leagues', async () => {
		const fetchImplementation: typeof fetch = async () =>
			jsonResponse({
				success: true,
				data: {
					utente: { id: 1 },
					jwt: 'account-jwt',
					leghe: [
						{ id: 7, nome: 'One', alias: 'one', jwt: 'jwt-one', id_squadra: 10 },
						{ id: 8, nome: 'Two', alias: 'two', jwt: 'jwt-two', id_squadra: 20 }
					]
				}
			});

		const account = await authenticateLegheFc({
			username: 'user',
			password: 'password',
			appKey: APP_KEY,
			fetch: fetchImplementation
		});
		assert.throws(
			() => account.league(),
			(error: unknown) => error instanceof LegheFcError && error.code === 'LEAGUE_NOT_SELECTED'
		);
	});

	it('does not include an API error response body in the thrown error', async () => {
		const fetchImplementation: typeof fetch = async () =>
			jsonResponse({ token: 'must-not-leak', detail: 'private upstream response' }, 401);

		await assert.rejects(
			authenticateLegheFc({
				username: 'user',
				password: 'password',
				appKey: APP_KEY,
				fetch: fetchImplementation,
				maxAttempts: 1
			}),
			(error: unknown) =>
				error instanceof LegheFcError &&
				error.code === 'HTTP_ERROR' &&
				error.status === 401 &&
				!error.message.includes('must-not-leak')
		);
	});

	it('retries login once when an app-key provider rotates its value', async () => {
		const keys = ['abcdefghijklmnop-old-key', 'abcdefghijklmnop-new-key'];
		let providerCalls = 0;
		const appKeyProvider = async () => keys[providerCalls++] ?? keys[1]!;
		const fetchImplementation: typeof fetch = async (_input, init) => {
			const appKey = new Headers(init?.headers).get('app_key');
			if (appKey === keys[0]) return jsonResponse({ error: 'expired key' }, 401);
			return jsonResponse({
				success: true,
				data: {
					utente: { id: 1 },
					jwt: 'account-jwt',
					leghe: [{ id: 7, nome: 'One', alias: 'one', jwt: 'league-jwt', id_squadra: 10 }]
				}
			});
		};

		const account = await authenticateLegheFc({
			username: 'user',
			password: 'password',
			appKeyProvider,
			fetch: fetchImplementation
		});
		assert.equal(providerCalls, 2);
		assert.equal(account.league().league.id, '7');
	});

	it('retries a transient server failure within the configured attempt limit', async () => {
		let fetchCalls = 0;
		const fetchImplementation: typeof fetch = async () => {
			fetchCalls += 1;
			if (fetchCalls === 1) {
				return new Response(JSON.stringify({ error: 'temporary' }), {
					status: 503,
					headers: { 'retry-after': '0' }
				});
			}
			return jsonResponse({
				success: true,
				data: {
					utente: { id: 1 },
					jwt: 'account-jwt',
					leghe: [{ id: 7, nome: 'One', alias: 'one', jwt: 'league-jwt', id_squadra: 10 }]
				}
			});
		};

		const account = await authenticateLegheFc({
			username: 'user',
			password: 'password',
			appKey: APP_KEY,
			fetch: fetchImplementation,
			maxAttempts: 2
		});
		assert.equal(fetchCalls, 2);
		assert.equal(account.league().league.id, '7');
	});
});
