import { authenticateLegheFc, isLegheFcError } from '../dist/index.js';

function optionalEnvironment(name) {
	const value = process.env[name]?.trim();
	return value || undefined;
}

function requireEnvironment(name) {
	const value = optionalEnvironment(name);
	if (!value) throw new Error(`Set ${name} in .env.local before running the live smoke test.`);
	return value;
}

async function main() {
	const username = requireEnvironment('LEGHE_FC_USERNAME');
	const password = requireEnvironment('LEGHE_FC_PASSWORD');
	const appKey = optionalEnvironment('LEGHE_FC_APP_KEY');
	const account = await authenticateLegheFc({
		username,
		password,
		...(appKey ? { appKey } : {})
	});

	console.log(`Authentication succeeded (${account.leagues.length} league${account.leagues.length === 1 ? '' : 's'}).`);
	const configuredLeagueId = optionalEnvironment('LEGHE_FC_LEAGUE_ID');
	if (!configuredLeagueId && account.leagues.length > 1) {
		console.table(account.leagues.map(({ id, name }) => ({ id, name })));
		throw new Error('Set LEGHE_FC_LEAGUE_ID to select one of the leagues above.');
	}

	const league = account.league(configuredLeagueId);
	const discovery = await league.discover();
	console.log(
		`Discovery succeeded for ${league.league.name}: ${discovery.teams.length} teams, ${discovery.competitions.length} competitions.`
	);
	const roster = await league.getRosters();
	console.log(`Roster succeeded: ${roster.length} assigned players.`);

	const activeCompetitions = discovery.competitions.filter((competition) => !competition.deleted);
	const configuredCompetitionId = optionalEnvironment('LEGHE_FC_COMPETITION_ID');
	const competition = configuredCompetitionId
		? activeCompetitions.find((item) => item.id === configuredCompetitionId)
		: activeCompetitions.length === 1
			? activeCompetitions[0]
			: undefined;

	if (!competition) {
		console.table(
			activeCompetitions.map(({ id, name, type }) => ({ id, name, type }))
		);
		throw new Error(
			configuredCompetitionId
				? 'LEGHE_FC_COMPETITION_ID does not identify an active competition.'
				: 'Set LEGHE_FC_COMPETITION_ID to select one of the active competitions above.'
		);
	}

	const fixtures = await league.getCalendar(competition.id);
	const calculated = fixtures.filter((fixture) => fixture.calculated).length;
	console.log(
		`Calendar succeeded for ${competition.name}: ${fixtures.length} fixtures (${calculated} calculated).`
	);
	console.log('Live smoke test passed.');
}

try {
	await main();
} catch (error) {
	if (isLegheFcError(error)) {
		console.error(`[${error.code}] ${error.message}`);
	} else if (error instanceof Error) {
		console.error(error.message);
	} else {
		console.error('The live smoke test failed unexpectedly.');
	}
	process.exitCode = 1;
}
