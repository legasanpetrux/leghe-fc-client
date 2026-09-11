import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	LegheFcError,
	parseLegheFcPlayerCatalog,
	parseLegheFcRosters,
	parseLegheFcRosterTeams
} from '../src/index.js';

const teamsPayload = {
	timestamp: 123,
	data: [
		{
			id: 100,
			n: 'Home Team',
			nu: 'Manager',
			cal: '10;20;',
			cs: '5;12;',
			r: { p: 1, d: 0, c: 0, a: 1 }
		}
	]
};

const catalogPayload = {
	timestamp: 456,
	players: [
		{ id: 10, name: 'Goalkeeper', fcrle: 1 },
		{ id: 20, name: 'Forward *', fcrle: 4 }
	]
};

function isRosterContractError(error: unknown): boolean {
	return error instanceof LegheFcError && error.code === 'ROSTER_CONTRACT_CHANGED';
}

describe('Leghe FC roster parsers', () => {
	it('normalizes roster-bearing teams and their acquisition costs', () => {
		assert.deepEqual(parseLegheFcRosterTeams(teamsPayload), [
			{
				id: '100',
				name: 'Home Team',
				username: 'Manager',
				roster: [
					{ playerId: '10', acquisitionCost: 5 },
					{ playerId: '20', acquisitionCost: 12 }
				],
				positionCounts: { P: 1, D: 0, C: 0, A: 1 }
			}
		]);
	});

	it('normalizes the player catalog and all classic roles', () => {
		assert.deepEqual(
			parseLegheFcPlayerCatalog({
				timestamp: 456,
				players: [
					{ id: 10, name: 'Keeper', fcrle: 1 },
					{ id: 20, name: 'Defender', fcrle: 2 },
					{ id: 30, name: 'Midfielder', fcrle: 3 },
					{ id: 40, name: 'Forward *', fcrle: 4 }
				]
			}),
			[
				{ id: '10', name: 'Keeper', position: 'P' },
				{ id: '20', name: 'Defender', position: 'D' },
				{ id: '30', name: 'Midfielder', position: 'C' },
				{ id: '40', name: 'Forward', position: 'A' }
			]
		);
	});

	it('joins every assigned player to its catalog identity', () => {
		const teams = parseLegheFcRosterTeams(teamsPayload);
		const catalog = parseLegheFcPlayerCatalog(catalogPayload);
		assert.deepEqual(parseLegheFcRosters(teams, catalog), [
			{ id: '10', teamId: '100', name: 'Goalkeeper', position: 'P', acquisitionCost: 5 },
			{ id: '20', teamId: '100', name: 'Forward', position: 'A', acquisitionCost: 12 }
		]);
	});

	it('accepts an empty roster while a team is incomplete', () => {
		const teams = parseLegheFcRosterTeams({
			timestamp: 123,
			data: [
				{
					id: 100,
					n: 'Home Team',
					cal: '',
					cs: '',
					r: { p: 0, d: 0, c: 0, a: 0 }
				}
			]
		});
		assert.deepEqual(parseLegheFcRosters(teams, parseLegheFcPlayerCatalog(catalogPayload)), []);
	});

	it('rejects malformed IDs, costs, separators, and duplicate assignments', () => {
		const invalidPayloads = [
			{ ...teamsPayload, data: [{ ...teamsPayload.data[0], cal: '10;;20' }] },
			{ ...teamsPayload, data: [{ ...teamsPayload.data[0], cal: '0;20' }] },
			{ ...teamsPayload, data: [{ ...teamsPayload.data[0], cal: '10;10' }] },
			{ ...teamsPayload, data: [{ ...teamsPayload.data[0], cs: '5' }] },
			{ ...teamsPayload, data: [{ ...teamsPayload.data[0], cs: '5;-1' }] },
			{ ...teamsPayload, data: [teamsPayload.data[0], teamsPayload.data[0]] }
		];
		for (const payload of invalidPayloads) {
			assert.throws(() => parseLegheFcRosterTeams(payload), isRosterContractError);
		}
	});

	it('rejects invalid or duplicate catalog entries', () => {
		assert.throws(
			() =>
				parseLegheFcPlayerCatalog({
					...catalogPayload,
					players: [{ ...catalogPayload.players[0], fcrle: 5 }]
				}),
			isRosterContractError
		);
		assert.throws(
			() =>
				parseLegheFcPlayerCatalog({
					...catalogPayload,
					players: [catalogPayload.players[0], catalogPayload.players[0]]
				}),
			isRosterContractError
		);
	});

	it('rejects missing catalog players and mismatched position totals', () => {
		const teams = parseLegheFcRosterTeams(teamsPayload);
		assert.throws(
			() => parseLegheFcRosters(teams, parseLegheFcPlayerCatalog({ ...catalogPayload, players: [catalogPayload.players[0]] })),
			isRosterContractError
		);

		const catalog = parseLegheFcPlayerCatalog(catalogPayload);
		assert.throws(
			() =>
				parseLegheFcRosters(
					[{ ...teams[0]!, positionCounts: { P: 2, D: 0, C: 0, A: 0 } }],
					catalog
				),
			isRosterContractError
		);
	});
});
