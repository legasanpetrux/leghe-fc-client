import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	LegheFcError,
	parseLegheFcLiveLineup,
	type LegheFcLiveLineupRequest
} from '../src/index.js';

const request: LegheFcLiveLineupRequest = {
	competitionId: '720274',
	competitionMatchday: 1,
	serieAMatchday: 4,
	homeExternalTeamId: '10',
	awayExternalTeamId: '20'
};

function player(
	pid: number,
	options: { bonus?: string | null; rawScore?: number; adjustedScore?: number } = {}
) {
	return {
		b: options.bonus ?? null,
		cscr: options.adjustedScore ?? 100,
		pid,
		ptype: 'C',
		scr: options.rawScore ?? 56
	};
}

function payload() {
	return {
		cal: false,
		cmday: 4,
		idcomp: 720274,
		mday: 1,
		res: '0-0',
		home: {
			tid: 10,
			tot: 7.5,
			starts: [
				player(101, {
					bonus: '0;0;1;0;0;0;0;0;1;0;0;0;0;0;0;0',
					rawScore: 6.5,
					adjustedScore: 7.5
				})
			],
			bench: [player(102)]
		},
		away: {
			tid: 20,
			tot: 0,
			starts: [player(201)],
			bench: [player(202)]
		},
		ignored: { upstream: true }
	};
}

function isCode(code: string) {
	return (error: unknown) => error instanceof LegheFcError && error.code === code;
}

describe('parseLegheFcLiveLineup', () => {
	it('normalizes team partials and ordered starter and bench scores', () => {
		const parsed = parseLegheFcLiveLineup(payload(), request);

		assert.deepEqual(parsed, {
			...request,
			calculated: false,
			home: {
				externalTeamId: '10',
				partialFantasyPoints: '7.50',
				starters: [
					{
						externalPlayerId: '101',
						rawScore: 6.5,
						adjustedScore: 7.5,
						hasVote: true,
						goals: 1
					}
				],
				bench: [
					{
						externalPlayerId: '102',
						rawScore: null,
						adjustedScore: null,
						hasVote: false,
						goals: 0
					}
				]
			},
			away: {
				externalTeamId: '20',
				partialFantasyPoints: '0.00',
				starters: [
					{
						externalPlayerId: '201',
						rawScore: null,
						adjustedScore: null,
						hasVote: false,
						goals: 0
					}
				],
				bench: [
					{
						externalPlayerId: '202',
						rawScore: null,
						adjustedScore: null,
						hasVote: false,
						goals: 0
					}
				]
			}
		});
	});

	it('rejects a response for a different fixture', () => {
		const value = payload();
		value.away.tid = 30;
		assert.throws(
			() => parseLegheFcLiveLineup(value, request),
			isCode('LIVE_RESPONSE_MISMATCH')
		);
	});

	it('rejects malformed requests before parsing a payload', () => {
		const invalidRequests: unknown[] = [
			null,
			{ ...request, competitionId: '../login' },
			{ ...request, competitionId: 720274 },
			{ ...request, competitionId: '0720274' },
			{ ...request, homeExternalTeamId: '0' },
			{ ...request, awayExternalTeamId: '10' },
			{ ...request, competitionMatchday: 0 },
			{ ...request, competitionMatchday: '1' },
			{ ...request, serieAMatchday: Number.MAX_SAFE_INTEGER + 1 }
		];
		for (const invalidRequest of invalidRequests) {
			assert.throws(
				() =>
					parseLegheFcLiveLineup(
						null,
						invalidRequest as LegheFcLiveLineupRequest
					),
				isCode('LIVE_REQUEST_INVALID')
			);
		}
	});

	it('normalizes each no-vote sentinel without discarding a partially available score', () => {
		const rawPending = payload();
		rawPending.home.starts = [player(101, { rawScore: 56, adjustedScore: 6 })];
		assert.deepEqual(parseLegheFcLiveLineup(rawPending, request).home.starters[0], {
			externalPlayerId: '101',
			rawScore: null,
			adjustedScore: 6,
			hasVote: true,
			goals: 0
		});

		const adjustedPending = payload();
		adjustedPending.home.starts = [player(101, { rawScore: 6, adjustedScore: 100 })];
		assert.deepEqual(parseLegheFcLiveLineup(adjustedPending, request).home.starters[0], {
			externalPlayerId: '101',
			rawScore: 6,
			adjustedScore: null,
			hasVote: true,
			goals: 0
		});
	});

	it('rejects malformed bonus vectors and counts only the verified goal field', () => {
		const malformed = payload();
		malformed.home.starts = [player(101, { bonus: '0;0;1' })];
		assert.throws(
			() => parseLegheFcLiveLineup(malformed, request),
			isCode('LIVE_CONTRACT_CHANGED')
		);

		const valid = payload();
		valid.home.starts = [
			player(101, {
				bonus: '0;0;2;0;0;0;0;0;1;1;0;0;0;0;0;0',
				rawScore: 8,
				adjustedScore: 14
			})
		];
		assert.equal(parseLegheFcLiveLineup(valid, request).home.starters[0]?.goals, 2);
	});

	it('rejects duplicate players across every team list', () => {
		for (const mutate of [
			(value: ReturnType<typeof payload>) => {
				value.home.bench = [player(101)];
			},
			(value: ReturnType<typeof payload>) => {
				value.away.starts = [player(101)];
			}
		]) {
			const value = payload();
			mutate(value);
			assert.throws(
				() => parseLegheFcLiveLineup(value, request),
				isCode('LIVE_CONTRACT_CHANGED')
			);
		}
	});

	it('rejects unsafe response IDs and bounded collection overflows', () => {
		const unsafeId = payload();
		unsafeId.home.starts = [player(Number.MAX_SAFE_INTEGER + 1)];
		assert.throws(
			() => parseLegheFcLiveLineup(unsafeId, request),
			isCode('LIVE_CONTRACT_CHANGED')
		);

		const tooManyStarters = payload();
		tooManyStarters.home.starts = Array.from({ length: 31 }, (_, index) => player(1_000 + index));
		assert.throws(
			() => parseLegheFcLiveLineup(tooManyStarters, request),
			isCode('LIVE_CONTRACT_CHANGED')
		);
	});
});
