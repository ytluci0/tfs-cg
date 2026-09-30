import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const projects=sqliteTable('projects',{id:text('id').primaryKey(),owner:text('owner').notNull(),name:text('name').notNull(),document:text('document').notNull(),revision:integer('revision').notNull().default(1),updatedAt:integer('updated_at').notNull()},t=>[index('projects_owner_updated').on(t.owner,t.updatedAt)]);
export const channels=sqliteTable('channels',{owner:text('owner').primaryKey(),document:text('document').notNull()});
export const credentials=sqliteTable('source_credentials',{id:text('id').primaryKey(),owner:text('owner').notNull(),headers:text('headers').notNull()});
export const assets=sqliteTable('assets',{id:text('id').primaryKey(),owner:text('owner').notNull(),name:text('name').notNull(),mime:text('mime').notNull(),bytes:integer('bytes').notNull()});
