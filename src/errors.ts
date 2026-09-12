export type LegheFcErrorCode =
	| 'APP_KEY_DISCOVERY_FAILED'
	| 'APP_KEY_INVALID'
	| 'CALCULATED_RESULT_INVALID'
	| 'CALENDAR_CONTRACT_CHANGED'
	| 'CLIENT_CONFIG_INVALID'
	| 'COMPETITION_ID_INVALID'
	| 'DISCOVERY_CONTRACT_CHANGED'
	| 'DUPLICATE_FIXTURE'
	| 'HTTP_ERROR'
	| 'INVALID_FIXTURE'
	| 'INVALID_JSON'
	| 'LEAGUE_ID_INVALID'
	| 'LEAGUE_MISMATCH'
	| 'LEAGUE_NOT_FOUND'
	| 'LEAGUE_NOT_SELECTED'
	| 'LIVE_CONTRACT_CHANGED'
	| 'LIVE_REQUEST_INVALID'
	| 'LIVE_RESPONSE_MISMATCH'
	| 'LOGIN_CONTRACT_CHANGED'
	| 'NETWORK_ERROR'
	| 'RESPONSE_TOO_LARGE'
	| 'ROSTER_CONTRACT_CHANGED';

export class LegheFcError extends Error {
	readonly code: LegheFcErrorCode;
	readonly status: number | undefined;

	constructor(code: LegheFcErrorCode, message: string, options?: { status?: number; cause?: unknown }) {
		super(message, options?.cause === undefined ? undefined : { cause: options.cause });
		this.name = 'LegheFcError';
		this.code = code;
		this.status = options?.status;
	}
}

export function isLegheFcError(error: unknown): error is LegheFcError {
	return error instanceof LegheFcError;
}
