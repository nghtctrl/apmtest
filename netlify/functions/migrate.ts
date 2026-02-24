import type { Context } from "@netlify/functions";
import { getDb } from "./db.js";

export default async function handler(_req: Request, _context: Context) {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sections (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS passages (
      id SERIAL PRIMARY KEY,
      section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      reference VARCHAR(255) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      audio_key VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  // Add audio_key column if it doesn't exist (for existing databases)
  await sql`
    ALTER TABLE passages
    ADD COLUMN IF NOT EXISTS audio_key VARCHAR(255)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS speakers (
      name VARCHAR(255) PRIMARY KEY
    )
  `;

  // Seed a default project if none exists
  const existing = await sql`SELECT id FROM projects LIMIT 1`;
  if (existing.length === 0) {
    await sql`INSERT INTO projects (name) VALUES ('Genesis')`;
  }

  return new Response(JSON.stringify({ message: "Migration complete" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
