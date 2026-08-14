import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPublicAppKeyProvider, extractLegheFcAppKey } from '../src/index.js';

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

	it('discovers and caches the public key without exposing page contents', async () => {
		let fetchCalls = 0;
		const fetchImplementation: typeof fetch = async () => {
			fetchCalls += 1;
			const response = new Response('<script>var data={authAppKey:"abcdefghijklmnop-cache-key"}</script>');
			Object.defineProperty(response, 'url', { value: 'https://leghe.fantacalcio.it/' });
			return response;
		};
		const provider = createPublicAppKeyProvider({ fetch: fetchImplementation });
		assert.equal(await provider({}), 'abcdefghijklmnop-cache-key');
		assert.equal(await provider({}), 'abcdefghijklmnop-cache-key');
		assert.equal(fetchCalls, 1);
	});
});
