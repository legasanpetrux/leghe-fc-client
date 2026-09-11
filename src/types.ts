export type LegheFcLeague = {
	id: string;
	name: string;
	alias: string;
	teamId: string;
};

export type LegheFcTeam = {
	id: string;
	name: string;
	username: string | null;
};

export type LegheFcPlayerPosition = 'P' | 'D' | 'C' | 'A';

export type LegheFcRosterEntry = {
	playerId: string;
	acquisitionCost: number;
};

export type LegheFcPositionCounts = Record<LegheFcPlayerPosition, number>;

export type LegheFcRosterTeam = LegheFcTeam & {
	roster: LegheFcRosterEntry[];
	positionCounts: LegheFcPositionCounts;
};

export type LegheFcPlayer = {
	id: string;
	name: string;
	position: LegheFcPlayerPosition;
};

export type LegheFcRosterPlayer = LegheFcPlayer & {
	teamId: string;
	acquisitionCost: number;
};

export type LegheFcCompetition = {
	id: string;
	leagueId: string;
	name: string;
	type: number;
	startMatchday: number | null;
	endMatchday: number | null;
	teamIds: string[];
	state: string;
	deleted: boolean;
};

export type LegheFcDiscovery = {
	teams: LegheFcTeam[];
	competitions: LegheFcCompetition[];
	teamsState: string;
};

export type LegheFcFixture = {
	externalFixtureKey: string;
	externalFixtureId: string | null;
	competitionMatchday: number;
	serieAMatchday: number;
	homeExternalTeamId: string;
	awayExternalTeamId: string;
	calculated: boolean;
	homeScore: number | null;
	awayScore: number | null;
	homeFantasyPoints: string | null;
	awayFantasyPoints: string | null;
	payloadHash: string;
};

export type LegheFcRequestOptions = {
	signal?: AbortSignal;
};

export type LegheFcAppKeyProvider = {
	(options: LegheFcRequestOptions): Promise<string>;
	invalidate?(): void;
};

export type LegheFcInvalidatableAppKeyProvider = LegheFcAppKeyProvider & {
	invalidate(): void;
};

export type LegheFcClientOptions = {
	username: string;
	password: string;
	appKey?: string;
	appKeyProvider?: LegheFcAppKeyProvider;
	fetch?: typeof globalThis.fetch;
	timeoutMs?: number;
	maxAttempts?: number;
	maxResponseBytes?: number;
};
