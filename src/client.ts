import { z } from 'zod';
import { createPublicAppKeyProvider } from './app-key.js';
import { LegheFcError } from './errors.js';
import {
	parseLegheFcLiveLineup,
	validateLegheFcLiveLineupRequest
} from './live.js';
import { DEFAULT_TIMEOUT_MS, validateTransportOptions } from './options.js';
import { parseLegheFcCalendar } from './parser.js';
import {
	parseLegheFcPlayerCatalog,
	parseLegheFcRosters,
	parseLegheFcRosterTeams
} from './roster.js';
import {
	competitionSchema,
	loginSchema,
	teamsSchema,
	updateSchema,
	type RemoteLeague
} from './schemas.js';
import { ReadOnlyTransport } from './transport.js';
import type {
	LegheFcClientOptions,
	LegheFcCompetition,
	LegheFcDiscovery,
	LegheFcFixture,
	LegheFcLeague,
	LegheFcInvalidatableAppKeyProvider,
	LegheFcLiveLineup,
	LegheFcLiveLineupRequest,
	LegheFcPlayer,
	LegheFcRequestOptions,
	LegheFcRosterPlayer,
	LegheFcRosterTeam
} from './types.js';

const APP_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const ID_PATTERN = /^\d+$/;
const MAX_LIVE_RESPONSE_BYTES = 256 * 1024;
const sharedPublicAppKeyProviders = new WeakMap<
	typeof globalThis.fetch,
	Map<number, LegheFcInvalidatableAppKeyProvider>
>();

function getSharedPublicAppKeyProvider(
	fetchImplementation: typeof globalThis.fetch,
	timeoutMs: number
): LegheFcInvalidatableAppKeyProvider {
	let providersByTimeout = sharedPublicAppKeyProviders.get(fetchImplementation);
	if (!providersByTimeout) {
		providersByTimeout = new Map();
		sharedPublicAppKeyProviders.set(fetchImplementation, providersByTimeout);
	}

	let provider = providersByTimeout.get(timeoutMs);
	if (!provider) {
		provider = createPublicAppKeyProvider({ fetch: fetchImplementation, timeoutMs });
		providersByTimeout.set(timeoutMs, provider);
	}
	return provider;
}

function publicLeague(remote: RemoteLeague): LegheFcLeague {
	return {
		id: String(remote.id),
		name: remote.nome,
		alias: remote.alias,
		teamId: String(remote.id_squadra)
	};
}

function normalizeCompetition(remote: z.infer<typeof competitionSchema>): LegheFcCompetition {
	return {
		id: String(remote.id),
		leagueId: String(remote.lid),
		name: remote.name,
		type: remote.type,
		startMatchday: remote.sDay ?? null,
		endMatchday: remote.eDay ?? null,
		teamIds: remote.tmids.map(String),
		state: String(remote.state),
		deleted: remote.del
	};
}

function validateOptions(options: LegheFcClientOptions): void {
	if (!options.username.trim() || !options.password) {
		throw new LegheFcError('CLIENT_CONFIG_INVALID', 'username and password are required.');
	}
	if (options.appKey !== undefined && !APP_KEY_PATTERN.test(options.appKey)) {
		throw new LegheFcError('APP_KEY_INVALID', 'appKey does not match the expected format.');
	}
	if (options.appKey !== undefined && options.appKeyProvider !== undefined) {
		throw new LegheFcError('CLIENT_CONFIG_INVALID', 'Configure appKey or appKeyProvider, not both.');
	}
	validateTransportOptions(options);
}

export interface LegheFcAccount {
	readonly leagues: readonly LegheFcLeague[];
	league(leagueId?: string): LegheFcLeagueClient;
}

export interface LegheFcLeagueClient {
	readonly league: LegheFcLeague;
	discover(options?: LegheFcRequestOptions): Promise<LegheFcDiscovery>;
	getTeams(options?: LegheFcRequestOptions): Promise<LegheFcRosterTeam[]>;
	getPlayerCatalog(options?: LegheFcRequestOptions): Promise<LegheFcPlayer[]>;
	getRosters(options?: LegheFcRequestOptions): Promise<LegheFcRosterPlayer[]>;
	getCalendar(competitionId: string, options?: LegheFcRequestOptions): Promise<LegheFcFixture[]>;
}

export interface LegheFcLiveLeagueClient extends LegheFcLeagueClient {
	getLiveLineup(
		request: LegheFcLiveLineupRequest,
		options?: LegheFcRequestOptions
	): Promise<LegheFcLiveLineup>;
}

export interface LegheFcLiveAccount extends LegheFcAccount {
	league(leagueId?: string): LegheFcLiveLeagueClient;
}

class AuthenticatedAccount implements LegheFcLiveAccount {
	readonly leagues: readonly LegheFcLeague[];
	readonly #transport: ReadOnlyTransport;
	readonly #remoteLeagues: ReadonlyMap<string, RemoteLeague>;

	constructor(transport: ReadOnlyTransport, remoteLeagues: RemoteLeague[]) {
		this.#transport = transport;
		this.#remoteLeagues = new Map(remoteLeagues.map((league) => [String(league.id), league]));
		this.leagues = Object.freeze(remoteLeagues.map((league) => Object.freeze(publicLeague(league))));
	}

	league(leagueId?: string): LegheFcLiveLeagueClient {
		const selectedId = leagueId ?? (this.leagues.length === 1 ? this.leagues[0]?.id : undefined);
		if (!selectedId) {
			throw new LegheFcError('LEAGUE_NOT_SELECTED', 'This account has multiple leagues; select one by ID.');
		}
		if (!ID_PATTERN.test(selectedId)) {
			throw new LegheFcError('LEAGUE_ID_INVALID', 'The league ID must contain only digits.');
		}

		const remote = this.#remoteLeagues.get(selectedId);
		if (!remote) throw new LegheFcError('LEAGUE_NOT_FOUND', 'The selected league is not available to this account.');
		return new AuthenticatedLeagueClient(this.#transport, remote);
	}
}

class AuthenticatedLeagueClient implements LegheFcLiveLeagueClient {
	readonly league: LegheFcLeague;
	readonly #transport: ReadOnlyTransport;
	readonly #jwt: string;

	constructor(transport: ReadOnlyTransport, remoteLeague: RemoteLeague) {
		this.#transport = transport;
		this.#jwt = remoteLeague.jwt;
		this.league = Object.freeze(publicLeague(remoteLeague));
	}

	async discover({ signal }: LegheFcRequestOptions = {}): Promise<LegheFcDiscovery> {
		const [teamsRaw, competitionsRaw, updateRaw] = await Promise.all([
			this.#transport.request('/onboarding/v1/league/teams/all', { method: 'GET', authorization: this.#jwt }, signal),
			this.#transport.request('/onboarding/v1/league/competitions', { method: 'GET', authorization: this.#jwt }, signal),
			this.#transport.request('/onboarding/v1/league/update', { method: 'GET', authorization: this.#jwt }, signal)
		]);
		const teams = teamsSchema.safeParse(teamsRaw);
		const competitions = z.array(competitionSchema).safeParse(competitionsRaw);
		const update = updateSchema.safeParse(updateRaw);
		if (!teams.success || !competitions.success || !update.success) {
			throw new LegheFcError('DISCOVERY_CONTRACT_CHANGED', 'League discovery data no longer matches the expected format.');
		}
		if (String(update.data.leagueId) !== this.league.id) {
			throw new LegheFcError('LEAGUE_MISMATCH', 'Discovery returned data for a different league.');
		}

		return {
			teams: teams.data.data.map((team) => ({
				id: String(team.id),
				name: team.n,
				username: team.nu || null
			})),
			competitions: competitions.data
				.filter((competition) => String(competition.lid) === this.league.id)
				.map(normalizeCompetition),
			teamsState: String(update.data.roster)
		};
	}

	async getTeams({ signal }: LegheFcRequestOptions = {}): Promise<LegheFcRosterTeam[]> {
		const payload = await this.#transport.request(
			'/onboarding/v1/league/teams/all',
			{ method: 'GET', authorization: this.#jwt },
			signal
		);
		return parseLegheFcRosterTeams(payload);
	}

	async getPlayerCatalog({ signal }: LegheFcRequestOptions = {}): Promise<LegheFcPlayer[]> {
		const payload = await this.#transport.request(
			'/onboarding/v1/league/players',
			{ method: 'GET', authorization: this.#jwt },
			signal
		);
		return parseLegheFcPlayerCatalog(payload);
	}

	async getRosters({ signal }: LegheFcRequestOptions = {}): Promise<LegheFcRosterPlayer[]> {
		const requestOptions = signal === undefined ? {} : { signal };
		const [teams, catalog] = await Promise.all([
			this.getTeams(requestOptions),
			this.getPlayerCatalog(requestOptions)
		]);
		return parseLegheFcRosters(teams, catalog);
	}

	async getCalendar(
		competitionId: string,
		{ signal }: LegheFcRequestOptions = {}
	): Promise<LegheFcFixture[]> {
		if (!ID_PATTERN.test(competitionId)) {
			throw new LegheFcError('COMPETITION_ID_INVALID', 'The competition ID must contain only digits.');
		}
		const payload = await this.#transport.request(
			`/onboarding/v1/league/competition/calendar/${competitionId}`,
			{ method: 'GET', authorization: this.#jwt, cachable: true },
			signal
		);
		return parseLegheFcCalendar(payload, competitionId);
	}

	async getLiveLineup(
		request: LegheFcLiveLineupRequest,
		{ signal }: LegheFcRequestOptions = {}
	): Promise<LegheFcLiveLineup> {
		validateLegheFcLiveLineupRequest(request);
		const payload = await this.#transport.request(
			`/gaming/v1/teamLineup/${request.competitionId}/${request.competitionMatchday}/${request.serieAMatchday}/${request.homeExternalTeamId}/${request.awayExternalTeamId}`,
			{
				method: 'GET',
				authorization: this.#jwt,
				cachable: false,
				maxResponseBytes: MAX_LIVE_RESPONSE_BYTES
			},
			signal
		);
		return parseLegheFcLiveLineup(payload, request);
	}
}

export async function authenticateLegheFc(
	options: LegheFcClientOptions,
	{ signal }: LegheFcRequestOptions = {}
): Promise<LegheFcLiveAccount> {
	validateOptions(options);
	const fetchImplementation = options.fetch ?? globalThis.fetch;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const appKeyProvider =
		options.appKeyProvider ?? getSharedPublicAppKeyProvider(fetchImplementation, timeoutMs);
	const requestOptions = { ...(signal === undefined ? {} : { signal }) };
	const resolveAppKey = async () => options.appKey ?? appKeyProvider(requestOptions);
	const login = async (appKey: string) => {
		if (!APP_KEY_PATTERN.test(appKey)) {
			throw new LegheFcError('APP_KEY_INVALID', 'The app-key provider returned an invalid value.');
		}
		const transport = new ReadOnlyTransport({
			appKey,
			fetch: fetchImplementation,
			...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
			...(options.maxAttempts === undefined ? {} : { maxAttempts: options.maxAttempts }),
			...(options.maxResponseBytes === undefined ? {} : { maxResponseBytes: options.maxResponseBytes })
		});
		const raw = await transport.request(
			'/onboarding/v1/login',
			{
				method: 'POST',
				body: JSON.stringify({ username: options.username.trim(), password: options.password })
			},
			signal
		);
		const parsed = loginSchema.safeParse(raw);
		if (!parsed.success) {
			throw new LegheFcError('LOGIN_CONTRACT_CHANGED', 'Login data no longer matches the expected format.');
		}
		return new AuthenticatedAccount(transport, parsed.data.data.leghe);
	};

	const firstAppKey = await resolveAppKey();
	try {
		return await login(firstAppKey);
	} catch (error) {
		const canRefresh =
			options.appKey === undefined &&
			error instanceof LegheFcError &&
			(error.code === 'HTTP_ERROR' || error.code === 'LOGIN_CONTRACT_CHANGED');
		if (!canRefresh) throw error;
		appKeyProvider.invalidate?.();
		const refreshedAppKey = await resolveAppKey();
		if (refreshedAppKey === firstAppKey) throw error;
		return login(refreshedAppKey);
	}
}
