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

  return new Response(JSON.stringify({ message: "Migration complete" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
