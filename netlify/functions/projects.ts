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
  const url = new URL(req.url);
  const method = req.method;

  // GET /projects — list all projects
  if (method === "GET" && !url.searchParams.get("id")) {
    const projects = await sql`SELECT * FROM projects ORDER BY id`;
    return json({ projects });
  }

  // GET /projects?id=1 — single project with sections and passages
  if (method === "GET" && url.searchParams.get("id")) {
    const projectId = Number(url.searchParams.get("id"));

    const projectRows = await sql`SELECT * FROM projects WHERE id = ${projectId}`;
    if (projectRows.length === 0) {
      return json({ error: "Project not found" }, 404);
    }
    const project = projectRows[0];

    const sectionRows = await sql`
      SELECT * FROM sections WHERE project_id = ${projectId} ORDER BY sort_order, id
    `;

    const sectionIds = sectionRows.map((s) => s.id as number);
    let passageRows: Record<string, unknown>[] = [];
    if (sectionIds.length > 0) {
      passageRows = await sql`
        SELECT * FROM passages WHERE section_id = ANY(${sectionIds}) ORDER BY sort_order, id
      `;
    }

    // Group passages by section
    const passagesBySection = new Map<number, Record<string, unknown>[]>();
    for (const p of passageRows) {
      const sectionId = p.section_id as number;
      const list = passagesBySection.get(sectionId) || [];
      list.push(p);
      passagesBySection.set(sectionId, list);
    }

    const sections = sectionRows.map((s) => ({
      ...s,
      passages: passagesBySection.get(s.id as number) || [],
    }));

    return json({ project: { ...project, sections } });
  }

  // POST /projects — create a section or passage
  if (method === "POST") {
    const body = await req.json();

    // Create a passage: { sectionId, reference, sortOrder }
    if (body.sectionId != null) {
      const { sectionId, reference, sortOrder } = body as { sectionId: number; reference: string; sortOrder: number };
      if (!sectionId || !reference) {
        return json({ error: "sectionId and reference are required" }, 400);
      }

      // Shift existing passages at or after sortOrder
      await sql`
        UPDATE passages SET sort_order = sort_order + 1
        WHERE section_id = ${sectionId} AND sort_order >= ${sortOrder}
      `;

      const result = await sql`
        INSERT INTO passages (section_id, reference, sort_order)
        VALUES (${sectionId}, ${reference}, ${sortOrder})
        RETURNING *
      `;

      return json({ passage: result[0] }, 201);
    }

    // Create a section: { projectId, name }
    const { projectId, name } = body as { projectId: number; name: string };

    if (!projectId || !name) {
      return json({ error: "projectId and name are required" }, 400);
    }

    // Set sort_order to max+1 so it appears at the end
    const maxRow = await sql`
      SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM sections WHERE project_id = ${projectId}
    `;
    const nextOrder = (maxRow[0].max_order as number) + 1;

    const result = await sql`
      INSERT INTO sections (project_id, name, sort_order)
      VALUES (${projectId}, ${name}, ${nextOrder})
      RETURNING *
    `;

    return json({ section: { ...result[0], passages: [] } }, 201);
  }

  // DELETE /projects?sectionId=1 — delete a section
  if (method === "DELETE") {
    const sectionId = Number(url.searchParams.get("sectionId"));
    if (!sectionId) {
      return json({ error: "sectionId is required" }, 400);
    }

    await sql`DELETE FROM sections WHERE id = ${sectionId}`;
    return json({ success: true });
  }

  return json({ error: "Not found" }, 404);
}
