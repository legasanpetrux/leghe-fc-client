import { LegheFcError } from './errors.js';
import { DEFAULT_TIMEOUT_MS, validateTimeoutMs } from './options.js';
import type {
	LegheFcAppKeyProvider,
	LegheFcInvalidatableAppKeyProvider
} from './types.js';

const APP_KEY_PATTERN = /\b["']?authAppKey["']?\s*:\s*(["'])([A-Za-z0-9_-]{16,128})\1/;
const APP_KEY_SOURCE_URL = 'https://leghe.fantacalcio.it/';
const APP_KEY_CACHE_MS = 6 * 60 * 60 * 1000;
const MAX_APP_KEY_PAGE_BYTES = 512 * 1024;

export function extractLegheFcAppKey(html: string): string | null {
	return APP_KEY_PATTERN.exec(html)?.[2] ?? null;
}

function browserPageHeaders(): HeadersInit {
	return {
		accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
		'accept-language': 'it-IT,it;q=0.5',
		'user-agent':
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
	};
}

async function readBoundedText(response: Response): Promise<string> {
	const declaredLength = Number(response.headers.get('content-length'));
	if (Number.isFinite(declaredLength) && declaredLength > MAX_APP_KEY_PAGE_BYTES) {
		throw new LegheFcError('APP_KEY_DISCOVERY_FAILED', 'The web client configuration was unexpectedly large.');
	}
	if (!response.body) {
		throw new LegheFcError('APP_KEY_DISCOVERY_FAILED', 'The web client returned an empty configuration.');
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let receivedBytes = 0;
	let html = '';
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		receivedBytes += value.byteLength;
		if (receivedBytes > MAX_APP_KEY_PAGE_BYTES) {
			await reader.cancel();
			throw new LegheFcError('APP_KEY_DISCOVERY_FAILED', 'The web client configuration was unexpectedly large.');
		}
		html += decoder.decode(value, { stream: true });
	}
	return html + decoder.decode();
}

export function createPublicAppKeyProvider(options: {
	fetch?: typeof globalThis.fetch;
	timeoutMs?: number;
} = {}): LegheFcInvalidatableAppKeyProvider {
	const fetchImplementation = options.fetch ?? globalThis.fetch;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	validateTimeoutMs(timeoutMs);
	let appKeyCache: { value: string; expiresAt: number } | undefined;

	const provider: LegheFcAppKeyProvider = async ({ signal } = {}) => {
		if (appKeyCache && appKeyCache.expiresAt > Date.now()) return appKeyCache.value;

		const timeoutSignal = AbortSignal.timeout(timeoutMs);
		const combinedSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;
		try {
			const response = await fetchImplementation(APP_KEY_SOURCE_URL, {
				headers: browserPageHeaders(),
				signal: combinedSignal
			});
			if (!response.ok || new URL(response.url).origin !== new URL(APP_KEY_SOURCE_URL).origin) {
				throw new LegheFcError('APP_KEY_DISCOVERY_FAILED', 'The web client configuration could not be retrieved.');
			}

			const appKey = extractLegheFcAppKey(await readBoundedText(response));
			if (!appKey) {
				throw new LegheFcError('APP_KEY_DISCOVERY_FAILED', 'The expected web client configuration was not found.');
			}

			appKeyCache = { value: appKey, expiresAt: Date.now() + APP_KEY_CACHE_MS };
			return appKey;
		} catch (error) {
			if (error instanceof LegheFcError) throw error;
			throw new LegheFcError(
				'APP_KEY_DISCOVERY_FAILED',
				combinedSignal.aborted ? 'The web client did not respond before the request was cancelled.' : 'The web client configuration could not be retrieved.',
				{ cause: error }
			);
		}
	};

	return Object.assign(provider, {
		invalidate(): void {
			appKeyCache = undefined;
		}
	});
}
