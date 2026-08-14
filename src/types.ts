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

export type LegheFcClientOptions = {
	username: string;
	password: string;
	appKey?: string;
	appKeyProvider?: (options: LegheFcRequestOptions) => Promise<string>;
	fetch?: typeof globalThis.fetch;
	timeoutMs?: number;
	maxAttempts?: number;
	maxResponseBytes?: number;
};
