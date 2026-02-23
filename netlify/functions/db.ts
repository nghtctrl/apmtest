import { neon } from "@neondatabase/serverless";

export function getDb() {
  const connectionString =
    process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "No database connection string found. Set DATABASE_URL or enable Netlify DB."
    );
  }
  const sql = neon(connectionString);
  return sql;
}
