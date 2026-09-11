import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	createPublicAppKeyProvider,
	extractLegheFcAppKey,
	LegheFcError
} from '../src/index.js';

function appKeyResponse(appKey: string): Response {
	const response = new Response(`<script>var data={authAppKey:"${appKey}"}</script>`);
	Object.defineProperty(response, 'url', { value: 'https://leghe.fantacalcio.it/' });
	return response;
}

describe('extractLegheFcAppKey', () => {
	it('extracts the public key from the server bridge', () => {
		assert.equal(
			extractLegheFcAppKey(
				'<script id="serverBridge">var data={authAppKey:"abcdefghijklmnop1234567890"}</script>'
			),
			'abcdefghijklmnop1234567890'
		);
	});

	it('rejects missing and malformed values', () => {
		assert.equal(extractLegheFcAppKey('<script>var data={authAppKey:"short"}</script>'), null);
		assert.equal(extractLegheFcAppKey('<script>var data={}</script>'), null);
	});

	it('rejects invalid timeouts at provider creation without fetching', () => {
		let fetchCalls = 0;
		for (const timeoutMs of [0, 120_001, 1.5, Number.NaN]) {
			assert.throws(
				() =>
					createPublicAppKeyProvider({
						timeoutMs,
						fetch: async () => {
							fetchCalls += 1;
							throw new Error('Network access was not expected.');
						}
					}),
				(error: unknown) =>
					error instanceof LegheFcError && error.code === 'CLIENT_CONFIG_INVALID'
			);
		}
		assert.equal(fetchCalls, 0);
	});

	it('discovers and caches the public key without exposing page contents', async () => {
		let fetchCalls = 0;
		const fetchImplementation: typeof fetch = async () => {
			fetchCalls += 1;
			return appKeyResponse('abcdefghijklmnop-cache-key');
		};
		const provider = createPublicAppKeyProvider({ fetch: fetchImplementation });
		assert.equal(await provider({}), 'abcdefghijklmnop-cache-key');
		assert.equal(await provider({}), 'abcdefghijklmnop-cache-key');
		assert.equal(fetchCalls, 1);
	});

	it('isolates caches between provider instances and fetch implementations', async () => {
		let firstFetchCalls = 0;
		let secondFetchCalls = 0;
		const firstProvider = createPublicAppKeyProvider({
			fetch: async () => {
				firstFetchCalls += 1;
				return appKeyResponse('abcdefghijklmnop-first-key');
			}
		});
		const secondProvider = createPublicAppKeyProvider({
			fetch: async () => {
				secondFetchCalls += 1;
				return appKeyResponse('abcdefghijklmnop-second-key');
			}
		});

		assert.equal(await firstProvider({}), 'abcdefghijklmnop-first-key');
		assert.equal(await secondProvider({}), 'abcdefghijklmnop-second-key');
		assert.equal(await firstProvider({}), 'abcdefghijklmnop-first-key');
		assert.equal(await secondProvider({}), 'abcdefghijklmnop-second-key');
		assert.equal(firstFetchCalls, 1);
		assert.equal(secondFetchCalls, 1);
	});

	it('exposes explicit cache invalidation', async () => {
		const keys = ['abcdefghijklmnop-old-key', 'abcdefghijklmnop-new-key'];
		let fetchCalls = 0;
		const provider = createPublicAppKeyProvider({
			fetch: async () => appKeyResponse(keys[fetchCalls++] ?? keys[1]!)
		});

		assert.equal(await provider({}), keys[0]);
		assert.equal(await provider({}), keys[0]);
		provider.invalidate();
		assert.equal(await provider({}), keys[1]);
		assert.equal(fetchCalls, 2);
	});
});
