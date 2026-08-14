import { createHash } from 'node:crypto';
import { z } from 'zod';
import { LegheFcError } from './errors.js';
import type { LegheFcFixture } from './types.js';

const scoreValue = z.union([z.number(), z.string()]).nullable().optional();
const pointsValue = z.union([z.number(), z.string()]).nullable().optional();

const nestedMatchSchema = z.object({
	id: z.union([z.number(), z.string()]).optional(),
	tIdH: z.coerce.number().int(),
	tIdA: z.coerce.number().int(),
	result: scoreValue,
	resultSR: scoreValue,
	ptH: pointsValue,
	ptA: pointsValue
});

const calendarDaySchema = z.object({
	matchDay: z.coerce.number().int().positive(),
	championshipMatchDay: z.coerce.number().int().positive(),
	calculated: z.boolean(),
	matches: z.array(nestedMatchSchema).optional(),
	teamIdHome: z.coerce.number().int().optional(),
	teamIdAway: z.coerce.number().int().optional(),
	result: scoreValue,
	resultSR: scoreValue,
	ptH: pointsValue,
	ptA: pointsValue
});

const calendarSchema = z.array(calendarDaySchema);

function parseScore(value: unknown): { home: number; away: number } | null {
	if (value === null || value === undefined || value === '') return null;
	const match = String(value).trim().match(/^(\d{1,3})\s*[-:]\s*(\d{1,3})$/);
	if (!match?.[1] || !match[2]) return null;
	return { home: Number(match[1]), away: Number(match[2]) };
}

function parsePoints(value: unknown): string | null {
	if (value === null || value === undefined || value === '') return null;
	const parsed = Number(String(value).replace(',', '.'));
	if (!Number.isFinite(parsed) || parsed < 0 || parsed > 99_999.99) return null;
	return parsed.toFixed(2);
}

function canonicalHash(value: object): string {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function parseLegheFcCalendar(payload: unknown, competitionId: string): LegheFcFixture[] {
	if (!/^\d+$/.test(competitionId)) {
		throw new LegheFcError('COMPETITION_ID_INVALID', 'The competition ID must contain only digits.');
	}

	const parsed = calendarSchema.safeParse(payload);
	if (!parsed.success) {
		throw new LegheFcError('CALENDAR_CONTRACT_CHANGED', 'Calendar data no longer matches the expected format.');
	}

	const fixtures: LegheFcFixture[] = [];
	const seen = new Set<string>();
	for (const day of parsed.data) {
		const matches = day.matches?.length
			? day.matches
			: day.teamIdHome !== undefined && day.teamIdAway !== undefined
				? [{
						tIdH: day.teamIdHome,
						tIdA: day.teamIdAway,
						result: day.result,
						resultSR: day.resultSR,
						ptH: day.ptH,
						ptA: day.ptA
					}]
				: [];

		for (const match of matches) {
			if (match.tIdH <= 0 || match.tIdA <= 0) continue;
			if (match.tIdH === match.tIdA) {
				throw new LegheFcError('INVALID_FIXTURE', 'A fixture has the same home and away team.');
			}

			const externalFixtureKey = `${competitionId}:${day.matchDay}:${match.tIdH}:${match.tIdA}`;
			if (seen.has(externalFixtureKey)) {
				throw new LegheFcError('DUPLICATE_FIXTURE', 'The same fixture appeared more than once.');
			}
			seen.add(externalFixtureKey);

			const score = parseScore(match.result);
			if (day.calculated && !score) {
				throw new LegheFcError('CALCULATED_RESULT_INVALID', 'A calculated fixture did not contain a valid result.');
			}

			const normalized = {
				externalFixtureKey,
				externalFixtureId: match.id === undefined ? null : String(match.id),
				competitionMatchday: day.matchDay,
				serieAMatchday: day.championshipMatchDay,
				homeExternalTeamId: String(match.tIdH),
				awayExternalTeamId: String(match.tIdA),
				calculated: day.calculated,
				homeScore: score?.home ?? null,
				awayScore: score?.away ?? null,
				homeFantasyPoints: parsePoints(match.ptH),
				awayFantasyPoints: parsePoints(match.ptA)
			};
			fixtures.push({ ...normalized, payloadHash: canonicalHash(normalized) });
		}
	}

	return fixtures;
}
