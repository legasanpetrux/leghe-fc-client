import { setTimeout as sleep } from 'node:timers/promises';
import { LegheFcError } from './errors.js';

const API_BASE_URL = 'https://apileague.fantacalcio.it';
const WEB_ORIGIN = 'https://leghe.fantacalcio.it';
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

const BROWSER_API_HEADERS = {
	'user-agent':
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
	'accept-language': 'it-IT,it;q=0.5',
	'sec-ch-ua': '"Not=A?Brand";v="99", "Brave";v="151", "Chromium";v="151"',
	'sec-ch-ua-mobile': '?0',
	'sec-ch-ua-platform': '"macOS"',
	origin: WEB_ORIGIN,
	referer: `${WEB_ORIGIN}/`,
	'sec-fetch-dest': 'empty',
	'sec-fetch-mode': 'cors',
	'sec-fetch-site': 'same-site'
} as const;

const FIXED_GET_PATHS = new Set([
	'/onboarding/v1/league/teams/all',
	'/onboarding/v1/league/competitions',
	'/onboarding/v1/league/update'
]);

function isAllowedRequest(method: string, path: string): boolean {
	if (method === 'POST') return path === '/onboarding/v1/login';
	if (method !== 'GET') return false;
	return FIXED_GET_PATHS.has(path) || /^\/onboarding\/v1\/league\/competition\/calendar\/\d+$/.test(path);
}

function validateIntegerOption(name: string, value: number, minimum: number, maximum: number): void {
	if (!Number.isInteger(value) || value < minimum || value > maximum) {
		throw new LegheFcError('CLIENT_CONFIG_INVALID', `${name} must be an integer between ${minimum} and ${maximum}.`);
	}
}

function retryDelay(attempt: number, retryAfter: string | null): number {
	if (retryAfter) {
		const seconds = Number(retryAfter);
		if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 30_000);
		const retryDate = Date.parse(retryAfter);
		if (Number.isFinite(retryDate)) return Math.max(0, Math.min(retryDate - Date.now(), 30_000));
	}
	return 300 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200);
}

async function readJson(response: Response, maxResponseBytes: number): Promise<unknown> {
	const declaredLength = Number(response.headers.get('content-length'));
	if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
		throw new LegheFcError('RESPONSE_TOO_LARGE', 'The API response exceeded the configured size limit.', {
			status: response.status
		});
	}
	if (!response.body) {
		throw new LegheFcError('INVALID_JSON', 'The API returned an empty response.', { status: response.status });
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let receivedBytes = 0;
	let text = '';
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		receivedBytes += value.byteLength;
		if (receivedBytes > maxResponseBytes) {
			await reader.cancel();
			throw new LegheFcError('RESPONSE_TOO_LARGE', 'The API response exceeded the configured size limit.', {
				status: response.status
			});
		}
		text += decoder.decode(value, { stream: true });
	}
	text += decoder.decode();

	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new LegheFcError('INVALID_JSON', 'The API returned malformed JSON.', {
			status: response.status
		});
	}
}

export type TransportOptions = {
	appKey: string;
	fetch: typeof globalThis.fetch;
	timeoutMs?: number;
	maxAttempts?: number;
	maxResponseBytes?: number;
};

export class ReadOnlyTransport {
	readonly #appKey: string;
	readonly #fetch: typeof globalThis.fetch;
	readonly #timeoutMs: number;
	readonly #maxAttempts: number;
	readonly #maxResponseBytes: number;

	constructor(options: TransportOptions) {
		this.#appKey = options.appKey;
		this.#fetch = options.fetch;
		this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.#maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
		this.#maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
		validateIntegerOption('timeoutMs', this.#timeoutMs, 1, 120_000);
		validateIntegerOption('maxAttempts', this.#maxAttempts, 1, 5);
		validateIntegerOption('maxResponseBytes', this.#maxResponseBytes, 1_024, 50 * 1024 * 1024);
	}

	async request(
		path: string,
		init: { method: 'GET' | 'POST'; authorization?: string; body?: string; cachable?: boolean },
		signal?: AbortSignal
	): Promise<unknown> {
		if (!isAllowedRequest(init.method, path)) {
			throw new LegheFcError('CLIENT_CONFIG_INVALID', 'The client attempted a request outside its read-only endpoint allowlist.');
		}

		for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
			const timeoutSignal = AbortSignal.timeout(this.#timeoutMs);
			const requestSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;
			try {
				const headers = new Headers({
					...BROWSER_API_HEADERS,
					accept: 'application/json',
					'content-type': 'application/json',
					app_key: this.#appKey
				});
				if (init.authorization) headers.set('authorization', `Bearer ${init.authorization}`);
				if (init.method === 'GET') {
					headers.set('cachable', String(init.cachable ?? false));
					headers.set('cache-control', 'no-cache');
				}

				const response = await this.#fetch(`${API_BASE_URL}${path}`, {
					method: init.method,
					headers,
					...(init.body === undefined ? {} : { body: init.body }),
					signal: requestSignal
				});

				if ((response.status === 429 || response.status >= 500) && attempt < this.#maxAttempts) {
					await response.body?.cancel();
					await sleep(retryDelay(attempt, response.headers.get('retry-after')), undefined, { signal });
					continue;
				}
				if (!response.ok) {
					await response.body?.cancel();
					throw new LegheFcError('HTTP_ERROR', 'The API returned an unexpected response.', {
						status: response.status
					});
				}

				return await readJson(response, this.#maxResponseBytes);
			} catch (error) {
				if (error instanceof LegheFcError) throw error;
				if (signal?.aborted) {
					throw new LegheFcError('NETWORK_ERROR', 'The request was cancelled.', { cause: error });
				}
				if (attempt === this.#maxAttempts) {
					throw new LegheFcError(
						'NETWORK_ERROR',
						timeoutSignal.aborted ? 'The API did not respond before the timeout.' : 'The API could not be reached.',
						{ cause: error }
					);
				}
				await sleep(retryDelay(attempt, null), undefined, { signal });
			}
		}

		throw new LegheFcError('NETWORK_ERROR', 'The API could not be reached.');
	}
}
