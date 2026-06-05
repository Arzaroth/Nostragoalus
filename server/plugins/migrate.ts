export default defineNitroPlugin(async () => {
  if (process.env.RUN_MIGRATIONS !== 'true') return

  const { migrate } = await import('drizzle-orm/node-postgres/migrator')
  const { db } = await import('../../db')
  await migrate(db, { migrationsFolder: './drizzle' })
})
