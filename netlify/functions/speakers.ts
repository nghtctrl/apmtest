import type { Context } from "@netlify/functions";
import jwt from "jsonwebtoken";
import { getDb } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

function unauthorized(msg = "Unauthorized") {
  return new Response(JSON.stringify({ error: msg }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.split(" ")[1];
    return jwt.verify(token, JWT_SECRET) as { userId: number; email: string };
  } catch {
    return null;
  }
}

export default async function handler(req: Request, _context: Context) {
  const user = getUser(req);
  if (!user) return unauthorized();

  const sql = getDb();
  const method = req.method;

  // GET /speakers — list all speakers
  if (method === "GET") {
    const rows = await sql`SELECT * FROM speakers ORDER BY name`;
    return json({ speakers: rows });
  }

  // POST /speakers — create a new speaker (or return existing)
  if (method === "POST") {
    const body = await req.json();
    const name = (body.name || "").trim();
    if (!name) return json({ error: "Speaker name is required" }, 400);

    // Check if already exists
    const existing = await sql`SELECT * FROM speakers WHERE name = ${name}`;
    if (existing.length > 0) {
      return json({ speaker: existing[0] });
    }

    const rows = await sql`
      INSERT INTO speakers (name) VALUES (${name}) RETURNING *
    `;
    return json({ speaker: rows[0] }, 201);
  }

  return json({ error: "Method not allowed" }, 405);
}
