import { access } from 'node:fs/promises';
import {
	LegheFcError,
	authenticateLegheFc,
	parseLegheFcCalendar,
	parseLegheFcLiveLineup,
	parseLegheFcPlayerCatalog,
	parseLegheFcRosters,
	parseLegheFcRosterTeams
} from '@legasanpetrux/leghe-fc-client';

if (typeof authenticateLegheFc !== 'function') {
	throw new Error('The package does not export authenticateLegheFc.');
}

await access(
	new URL('./node_modules/@legasanpetrux/leghe-fc-client/SECURITY.md', import.meta.url)
);
await access(
	new URL('./node_modules/@legasanpetrux/leghe-fc-client/README.it.md', import.meta.url)
);

const [fixture] = parseLegheFcCalendar(
	[
		{
			matchDay: 1,
			championshipMatchDay: 3,
			calculated: true,
			matches: [{ tIdH: 10, tIdA: 20, result: '2-1', ptH: 72.5, ptA: 66 }]
		}
	],
	'99'
);

if (!(new LegheFcError('NETWORK_ERROR', 'synthetic') instanceof Error)) {
	throw new Error('LegheFcError does not extend Error.');
}
if (fixture?.externalFixtureKey !== '99:1:10:20' || fixture.homeFantasyPoints !== '72.50') {
	throw new Error('The installed package did not normalize the synthetic fixture correctly.');
}

const liveRequest = {
	competitionId: '99',
	competitionMatchday: 1,
	serieAMatchday: 3,
	homeExternalTeamId: '10',
	awayExternalTeamId: '20'
};
const live = parseLegheFcLiveLineup(
	{
		cal: false,
		cmday: 3,
		idcomp: 99,
		mday: 1,
		res: '0-0',
		home: {
			tid: 10,
			tot: 7.5,
			starts: [
				{
					b: '0;0;1;0;0;0;0;0;0;0;0;0;0;0;0;0',
					cscr: 7.5,
					pid: 501,
					ptype: 'P',
					scr: 6.5
				}
			],
			bench: []
		},
		away: {
			tid: 20,
			tot: 0,
			starts: [],
			bench: [{ b: null, cscr: 100, pid: 502, ptype: 'D', scr: 56 }]
		}
	},
	liveRequest
);
if (
	live.home.partialFantasyPoints !== '7.50' ||
	live.home.starters[0]?.rawScore !== 6.5 ||
	live.home.starters[0]?.adjustedScore !== 7.5 ||
	live.home.starters[0]?.goals !== 1 ||
	live.away.bench[0]?.rawScore !== null ||
	live.away.bench[0]?.adjustedScore !== null ||
	live.away.bench[0]?.hasVote !== false
) {
	throw new Error(
		'The installed package did not normalize the synthetic live lineup correctly.'
	);
}

const teams = parseLegheFcRosterTeams({
	timestamp: 1,
	data: [
		{
			id: 10,
			n: 'Synthetic Team',
			cal: '501;',
			cs: '7;',
			r: { p: 1, d: 0, c: 0, a: 0 }
		}
	]
});
const catalog = parseLegheFcPlayerCatalog({
	timestamp: 1,
	players: [{ id: 501, name: 'Synthetic Keeper', fcrle: 1 }]
});
const roster = parseLegheFcRosters(teams, catalog);
if (roster[0]?.teamId !== '10' || roster[0].position !== 'P') {
	throw new Error('The installed package did not normalize the synthetic roster correctly.');
}

console.log('Packed package consumer smoke test passed.');
