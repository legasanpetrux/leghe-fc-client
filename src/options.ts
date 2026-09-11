import { LegheFcError } from './errors.js';

export const DEFAULT_TIMEOUT_MS = 12_000;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

function validateIntegerOption(name: string, value: number, minimum: number, maximum: number): void {
	if (!Number.isInteger(value) || value < minimum || value > maximum) {
		throw new LegheFcError(
			'CLIENT_CONFIG_INVALID',
			`${name} must be an integer between ${minimum} and ${maximum}.`
		);
	}
}

export function validateTimeoutMs(timeoutMs: number): void {
	validateIntegerOption('timeoutMs', timeoutMs, 1, 120_000);
}

export function validateTransportOptions(options: {
	timeoutMs?: number;
	maxAttempts?: number;
	maxResponseBytes?: number;
}): void {
	validateTimeoutMs(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	validateIntegerOption('maxAttempts', options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, 1, 5);
	validateIntegerOption(
		'maxResponseBytes',
		options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
		1_024,
		50 * 1024 * 1024
	);
}
