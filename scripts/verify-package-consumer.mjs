import {
	LegheFcError,
	authenticateLegheFc,
	parseLegheFcCalendar
} from '@legasanpetrux/leghe-fc-client';

if (typeof authenticateLegheFc !== 'function') {
	throw new Error('The package does not export authenticateLegheFc.');
}

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

console.log('Packed package consumer smoke test passed.');
