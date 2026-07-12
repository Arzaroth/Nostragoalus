import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL ?? process.env.NUXT_DATABASE_URL

export const pool = new Pool({ connectionString })
export const db = drizzle(pool, { schema })
export type Db = typeof db
