import { z } from 'zod';
import { LegheFcError } from './errors.js';
import type {
	LegheFcLiveLineup,
	LegheFcLiveLineupRequest,
	LegheFcLivePlayer,
	LegheFcLiveTeam
} from './types.js';

const BONUS_FIELD_COUNT = 16;
const MAX_BONUS_VALUE = 20;
const NO_VOTE_RAW_SCORE = 56;
const NO_VOTE_ADJUSTED_SCORE = 100;

const positiveSafeIntegerSchema = z
	.number()
	.int()
	.positive()
	.max(Number.MAX_SAFE_INTEGER);

const livePlayerSchema = z.object({
	b: z.string().max(256).nullable(),
	cscr: z.number().finite(),
	pid: positiveSafeIntegerSchema,
	ptype: z.string().max(16),
	scr: z.number().finite()
});

const liveTeamSchema = z.object({
	tid: positiveSafeIntegerSchema,
	tot: z.number().finite().min(0).max(99_999.99),
	starts: z.array(livePlayerSchema).max(30),
	bench: z.array(livePlayerSchema).max(40)
});

const liveLineupSchema = z.object({
	cal: z.boolean(),
	cmday: positiveSafeIntegerSchema,
	idcomp: positiveSafeIntegerSchema,
	mday: positiveSafeIntegerSchema,
	home: liveTeamSchema,
	away: liveTeamSchema
});

function liveContractError(): never {
	throw new LegheFcError(
		'LIVE_CONTRACT_CHANGED',
		'Live lineup data no longer matches the expected format.'
	);
}

function liveRequestError(): never {
	throw new LegheFcError('LIVE_REQUEST_INVALID', 'The live lineup request is invalid.');
}

function parsePositiveId(value: unknown): number {
	if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
		liveRequestError();
	}

	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		liveRequestError();
	}
	return parsed;
}

export function validateLegheFcLiveLineupRequest(request: LegheFcLiveLineupRequest): {
	competitionId: number;
	homeExternalTeamId: number;
	awayExternalTeamId: number;
} {
	if (typeof request !== 'object' || request === null) liveRequestError();

	const competitionId = parsePositiveId(request.competitionId);
	const homeExternalTeamId = parsePositiveId(request.homeExternalTeamId);
	const awayExternalTeamId = parsePositiveId(request.awayExternalTeamId);
	if (
		typeof request.competitionMatchday !== 'number' ||
		!Number.isSafeInteger(request.competitionMatchday) ||
		request.competitionMatchday < 1 ||
		typeof request.serieAMatchday !== 'number' ||
		!Number.isSafeInteger(request.serieAMatchday) ||
		request.serieAMatchday < 1 ||
		homeExternalTeamId === awayExternalTeamId
	) {
		liveRequestError();
	}

	return { competitionId, homeExternalTeamId, awayExternalTeamId };
}

function parseGoals(value: string | null): number {
	if (value === null) return 0;
	const fields = value.split(';');
	if (
		fields.length !== BONUS_FIELD_COUNT ||
		fields.some((field) => !/^\d+$/.test(field) || Number(field) > MAX_BONUS_VALUE)
	) {
		liveContractError();
	}

	return Number(fields[2]);
}

function normalizePlayer(player: z.infer<typeof livePlayerSchema>): LegheFcLivePlayer {
	const rawScore = player.scr === NO_VOTE_RAW_SCORE ? null : player.scr;
	const adjustedScore = player.cscr === NO_VOTE_ADJUSTED_SCORE ? null : player.cscr;
	return {
		externalPlayerId: String(player.pid),
		rawScore,
		adjustedScore,
		hasVote: rawScore !== null || adjustedScore !== null,
		goals: parseGoals(player.b)
	};
}

function normalizeTeam(team: z.infer<typeof liveTeamSchema>): LegheFcLiveTeam {
	return {
		externalTeamId: String(team.tid),
		partialFantasyPoints: team.tot.toFixed(2),
		starters: team.starts.map(normalizePlayer),
		bench: team.bench.map(normalizePlayer)
	};
}

export function parseLegheFcLiveLineup(
	payload: unknown,
	request: LegheFcLiveLineupRequest
): LegheFcLiveLineup {
	const expected = validateLegheFcLiveLineupRequest(request);
	const parsed = liveLineupSchema.safeParse(payload);
	if (!parsed.success) liveContractError();

	const value = parsed.data;
	if (
		value.idcomp !== expected.competitionId ||
		value.mday !== request.competitionMatchday ||
		value.cmday !== request.serieAMatchday ||
		value.home.tid !== expected.homeExternalTeamId ||
		value.away.tid !== expected.awayExternalTeamId
	) {
		throw new LegheFcError(
			'LIVE_RESPONSE_MISMATCH',
			'The API returned live lineup data for a different fixture.'
		);
	}

	const home = normalizeTeam(value.home);
	const away = normalizeTeam(value.away);
	const playerIds = new Set<string>();
	for (const player of [
		...home.starters,
		...home.bench,
		...away.starters,
		...away.bench
	]) {
		if (playerIds.has(player.externalPlayerId)) liveContractError();
		playerIds.add(player.externalPlayerId);
	}

	return {
		competitionId: request.competitionId,
		competitionMatchday: request.competitionMatchday,
		serieAMatchday: request.serieAMatchday,
		homeExternalTeamId: request.homeExternalTeamId,
		awayExternalTeamId: request.awayExternalTeamId,
		calculated: value.cal,
		home,
		away
	};
}
