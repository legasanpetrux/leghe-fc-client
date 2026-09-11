import { playersSchema, rosterTeamsSchema } from './schemas.js';
import { LegheFcError } from './errors.js';
import type {
	LegheFcPlayer,
	LegheFcPlayerPosition,
	LegheFcPositionCounts,
	LegheFcRosterPlayer,
	LegheFcRosterTeam
} from './types.js';

const POSITION_BY_ROLE: Record<number, LegheFcPlayerPosition | undefined> = {
	1: 'P',
	2: 'D',
	3: 'C',
	4: 'A'
};
const POSITIONS = new Set<string>(['P', 'D', 'C', 'A']);

function rosterContractError(): never {
	throw new LegheFcError(
		'ROSTER_CONTRACT_CHANGED',
		'Roster data no longer matches the expected format.'
	);
}

function splitRosterValues(value: string): string[] {
	if (!value) return [];
	const values = value.split(';');
	if (values.at(-1) === '') values.pop();
	if (values.some((item) => item === '')) rosterContractError();
	return values;
}

function normalizePlayerName(value: string): string {
	const name = value.trim().replace(/\s+\*$/, '').trim();
	if (!name || name.length > 160) rosterContractError();
	return name;
}

function parsePosition(role: number): LegheFcPlayerPosition {
	const position = POSITION_BY_ROLE[role];
	if (!position) rosterContractError();
	return position;
}

export function parseLegheFcRosterTeams(payload: unknown): LegheFcRosterTeam[] {
	const parsed = rosterTeamsSchema.safeParse(payload);
	if (!parsed.success) rosterContractError();

	const seenTeamIds = new Set<string>();
	const seenPlayerIds = new Set<string>();
	return parsed.data.data.map((team) => {
		const id = String(team.id);
		if (seenTeamIds.has(id)) rosterContractError();
		seenTeamIds.add(id);

		const playerIds = splitRosterValues(team.cal);
		const acquisitionCosts = splitRosterValues(team.cs);
		if (playerIds.length !== acquisitionCosts.length) rosterContractError();

		const roster = playerIds.map((playerId, index) => {
			const acquisitionCost = acquisitionCosts[index];
			if (
				!/^\d+$/.test(playerId) ||
				!Number.isSafeInteger(Number(playerId)) ||
				Number(playerId) <= 0 ||
				seenPlayerIds.has(playerId)
			) {
				rosterContractError();
			}
			if (
				acquisitionCost === undefined ||
				!/^\d+$/.test(acquisitionCost) ||
				!Number.isSafeInteger(Number(acquisitionCost))
			) {
				rosterContractError();
			}
			seenPlayerIds.add(playerId);
			return { playerId, acquisitionCost: Number(acquisitionCost) };
		});

		return {
			id,
			name: team.n,
			username: team.nu || null,
			roster,
			positionCounts: {
				P: team.r.p,
				D: team.r.d,
				C: team.r.c,
				A: team.r.a
			}
		};
	});
}

export function parseLegheFcPlayerCatalog(payload: unknown): LegheFcPlayer[] {
	const parsed = playersSchema.safeParse(payload);
	if (!parsed.success) rosterContractError();

	const seenPlayerIds = new Set<string>();
	return parsed.data.players.map((player) => {
		const id = String(player.id);
		if (seenPlayerIds.has(id)) rosterContractError();
		seenPlayerIds.add(id);
		return {
			id,
			name: normalizePlayerName(player.name),
			position: parsePosition(player.fcrle)
		};
	});
}

export function parseLegheFcRosters(
	teams: readonly LegheFcRosterTeam[],
	catalog: readonly LegheFcPlayer[]
): LegheFcRosterPlayer[] {
	const catalogById = new Map<string, LegheFcPlayer>();
	for (const player of catalog) {
		if (
			!/^\d+$/.test(player.id) ||
			!Number.isSafeInteger(Number(player.id)) ||
			Number(player.id) <= 0 ||
			catalogById.has(player.id)
		) {
			rosterContractError();
		}
		if (!POSITIONS.has(player.position)) rosterContractError();
		catalogById.set(player.id, { ...player, name: normalizePlayerName(player.name) });
	}

	const seenTeamIds = new Set<string>();
	const seenPlayerIds = new Set<string>();
	const players: LegheFcRosterPlayer[] = [];
	for (const team of teams) {
		if (
			!/^\d+$/.test(team.id) ||
			!Number.isSafeInteger(Number(team.id)) ||
			Number(team.id) <= 0 ||
			seenTeamIds.has(team.id)
		) {
			rosterContractError();
		}
		seenTeamIds.add(team.id);
		const actualPositionCounts: LegheFcPositionCounts = { P: 0, D: 0, C: 0, A: 0 };

		for (const entry of team.roster) {
			if (
				!/^\d+$/.test(entry.playerId) ||
				!Number.isSafeInteger(Number(entry.playerId)) ||
				Number(entry.playerId) <= 0 ||
				seenPlayerIds.has(entry.playerId) ||
				!Number.isSafeInteger(entry.acquisitionCost) ||
				entry.acquisitionCost < 0
			) {
				rosterContractError();
			}
			seenPlayerIds.add(entry.playerId);

			const player = catalogById.get(entry.playerId);
			if (!player) rosterContractError();
			actualPositionCounts[player.position] += 1;
			players.push({
				...player,
				teamId: team.id,
				acquisitionCost: entry.acquisitionCost
			});
		}

		for (const position of ['P', 'D', 'C', 'A'] as const) {
			if (
				!Number.isInteger(team.positionCounts[position]) ||
				team.positionCounts[position] < 0 ||
				actualPositionCounts[position] !== team.positionCounts[position]
			) {
				rosterContractError();
			}
		}
	}

	return players;
}
