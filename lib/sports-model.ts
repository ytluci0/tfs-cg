import {z} from 'zod';
export const sportKinds=['football','basketball','volleyball','esports'] as const;
export const sportsSchema=z.object({kind:z.enum(sportKinds),bestOf:z.union([z.literal(1),z.literal(3),z.literal(5),z.literal(7)]),periodSeconds:z.number().int().min(1).max(7200),mapPool:z.array(z.string().trim().min(1).max(80)).max(30),draft:z.array(z.object({team:z.enum(['home','away']),map:z.string().max(80),choice:z.enum(['pick','ban'])})).max(30),results:z.array(z.object({name:z.string().max(80),home:z.number().int().min(0),away:z.number().int().min(0),winner:z.enum(['home','away'])})).max(7),events:z.array(z.object({id:z.string(),label:z.string().max(200),time:z.string().max(30)})).max(100)});
export const playerStatsSchema=z.record(z.enum(['goals','assists','kills','deaths','points','rebounds','fouls']),z.number().int().min(0).max(9999));
export type Sports=z.infer<typeof sportsSchema>;
export const sportLabels={football:'Football',basketball:'Basketball',volleyball:'Volleyball',esports:'Esports'};
