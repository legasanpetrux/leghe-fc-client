import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LegheFcError, parseLegheFcCalendar } from '../src/index.js';

describe('parseLegheFcCalendar', () => {
	it('normalizes calculated fixtures and fantasy points', () => {
		const fixtures = parseLegheFcCalendar(
			[
				{
					matchDay: 2,
					championshipMatchDay: 5,
					calculated: true,
					matches: [{ id: 456, tIdH: 10, tIdA: 20, result: '3-1', ptH: '78,5', ptA: 66 }]
				}
			],
			'99'
		);

		assert.equal(fixtures.length, 1);
		assert.deepEqual(
			{
				key: fixtures[0]?.externalFixtureKey,
				fixtureId: fixtures[0]?.externalFixtureId,
				homeScore: fixtures[0]?.homeScore,
				awayScore: fixtures[0]?.awayScore,
				homePoints: fixtures[0]?.homeFantasyPoints,
				awayPoints: fixtures[0]?.awayFantasyPoints
			},
			{
				key: '99:2:10:20',
				fixtureId: '456',
				homeScore: 3,
				awayScore: 1,
				homePoints: '78.50',
				awayPoints: '66.00'
			}
		);
		assert.match(fixtures[0]?.payloadHash ?? '', /^[a-f0-9]{64}$/);
	});

	it('keeps uncalculated fixtures scoreless even when the payload contains a stale result', () => {
		const [fixture] = parseLegheFcCalendar(
			[
				{
					matchDay: 1,
					championshipMatchDay: 1,
					calculated: false,
					teamIdHome: 10,
					teamIdAway: 20,
					result: '5-4'
				}
			],
			'99'
		);
		assert.equal(fixture?.homeScore, null);
		assert.equal(fixture?.awayScore, null);
	});

	it('rejects negative team IDs instead of treating them as bye entries', () => {
		assert.throws(
			() =>
				parseLegheFcCalendar(
					[
						{
							matchDay: 1,
							championshipMatchDay: 1,
							calculated: false,
							matches: [{ tIdH: -10, tIdA: 20 }]
						}
					],
					'99'
				),
			(error: unknown) => error instanceof LegheFcError && error.code === 'INVALID_FIXTURE'
		);
	});

	it('skips bye entries', () => {
		assert.deepEqual(
			parseLegheFcCalendar(
				[
					{
						matchDay: 1,
						championshipMatchDay: 1,
						calculated: false,
						matches: [{ tIdH: 10, tIdA: 0 }]
					}
				],
				'99'
			),
			[]
		);
	});

	it('rejects a calculated fixture without a strict result', () => {
		assert.throws(
			() =>
				parseLegheFcCalendar(
					[
						{
							matchDay: 1,
							championshipMatchDay: 1,
							calculated: true,
							matches: [{ tIdH: 10, tIdA: 20, result: 'TBD' }]
						}
					],
					'99'
				),
			(error: unknown) =>
				error instanceof LegheFcError && error.code === 'CALCULATED_RESULT_INVALID'
		);
	});

	it('rejects malformed nonempty fantasy points', () => {
		assert.throws(
			() =>
				parseLegheFcCalendar(
					[
						{
							matchDay: 1,
							championshipMatchDay: 1,
							calculated: true,
							matches: [{ tIdH: 10, tIdA: 20, result: '2-1', ptH: 'invalid' }]
						}
					],
					'99'
				),
			(error: unknown) =>
				error instanceof LegheFcError && error.code === 'CALENDAR_CONTRACT_CHANGED'
		);
	});

	it('rejects duplicate fixtures', () => {
		assert.throws(
			() =>
				parseLegheFcCalendar(
					[
						{
							matchDay: 1,
							championshipMatchDay: 1,
							calculated: false,
							matches: [
								{ tIdH: 10, tIdA: 20 },
								{ tIdH: 10, tIdA: 20 }
							]
						}
					],
					'99'
				),
			(error: unknown) => error instanceof LegheFcError && error.code === 'DUPLICATE_FIXTURE'
		);
	});
});
