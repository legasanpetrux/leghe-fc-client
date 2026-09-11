import { z } from 'zod';

export const remoteLeagueSchema = z.object({
	id: z.number().int().positive(),
	nome: z.string().min(1),
	alias: z.string(),
	jwt: z.string().min(1),
	token: z.string().optional(),
	id_squadra: z.number().int().nonnegative()
});

export const loginSchema = z.object({
	success: z.literal(true),
	data: z.object({
		utente: z.object({ id: z.number().int().positive() }),
		leghe: z.array(remoteLeagueSchema).min(1),
		jwt: z.string().min(1)
	})
});

export const remoteTeamSchema = z.object({
	id: z.number().int().positive(),
	n: z.string().min(1),
	nu: z.string().optional().default('')
});

export const remoteRosterTeamSchema = remoteTeamSchema.extend({
	cal: z.string().max(20_000),
	cs: z.string().max(20_000),
	r: z.object({
		p: z.number().int().nonnegative(),
		d: z.number().int().nonnegative(),
		c: z.number().int().nonnegative(),
		a: z.number().int().nonnegative()
	})
});

export const teamsSchema = z.object({
	timestamp: z.number(),
	data: z.array(remoteTeamSchema)
});

export const rosterTeamsSchema = z.object({
	timestamp: z.number(),
	data: z.array(remoteRosterTeamSchema)
});

const booleanishSchema = z.preprocess((value) => {
	if (value === true || value === 1 || value === '1') return true;
	if (value === false || value === 0 || value === '0') return false;
	return value;
}, z.boolean());

export const competitionSchema = z.object({
	id: z.coerce.number().int().positive(),
	lid: z.coerce.number().int().positive(),
	name: z.string().min(1),
	type: z.coerce.number().int(),
	sDay: z.coerce.number().int().optional().nullable(),
	eDay: z.coerce.number().int().optional().nullable(),
	tmids: z.array(z.coerce.number().int()).optional().default([]),
	win: z.unknown().optional(),
	state: z.coerce.number().int().optional().default(0),
	del: booleanishSchema.optional().default(false)
});

export const updateSchema = z.object({
	leagueId: z.number().int().positive(),
	profile: z.number(),
	roster: z.number(),
	options: z.number(),
	playersOptions: z.number()
});

export const remotePlayerSchema = z.object({
	id: z.number().int().positive(),
	name: z.string().min(1).max(160),
	fcrle: z.number().int()
});

export const playersSchema = z.object({
	timestamp: z.number(),
	players: z.array(remotePlayerSchema).max(5_000)
});

export type RemoteLeague = z.infer<typeof remoteLeagueSchema>;
