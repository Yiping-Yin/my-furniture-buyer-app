// Runs .sql files against the Supabase database over SUPABASE_DB_URL.
// Usage: npm run db:apply                      (schema then seed)
//        npm run db:apply -- supabase/schema.sql   (just one file)
import { readFileSync } from 'node:fs'
import pg from 'pg'

const connectionString = process.env.SUPABASE_DB_URL
if (!connectionString) {
  console.error('SUPABASE_DB_URL is not set. Add it to .env.local (see .env.example).')
  process.exit(1)
}

const files = process.argv.slice(2)
if (files.length === 0) files.push('supabase/schema.sql', 'supabase/seed.sql')

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  for (const file of files) {
    await client.query(readFileSync(file, 'utf8'))
    console.log(`applied ${file}`)
  }
} finally {
  await client.end()
}
