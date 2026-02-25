import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import jwt from "jsonwebtoken";
import { getDb } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

function unauthorized(msg = "Unauthorized") {
  return new Response(JSON.stringify({ error: msg }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonRes(data: unknown, status = 200) {
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

  try {
  const sql = getDb();
  const url = new URL(req.url);
  const method = req.method;

  const store = getStore("audio");

  // PUT /audio?passageId=123 — upload compressed audio
  if (method === "PUT") {
    const passageId = Number(url.searchParams.get("passageId"));
    if (!passageId) return jsonRes({ error: "passageId is required" }, 400);

    const body = await req.arrayBuffer();
    if (!body || body.byteLength === 0) {
      return jsonRes({ error: "No audio data provided" }, 400);
    }

    // Enforce a 5.5 MB limit (Netlify/Lambda payload limit is ~6 MB)
    if (body.byteLength > 5.5 * 1024 * 1024) {
      return jsonRes({ error: "Audio file too large (max 5.5 MB)" }, 413);
    }

    const blobKey = `passage-${passageId}.mp3`;

    await store.set(blobKey, body as ArrayBuffer, {
      metadata: { passageId: String(passageId), uploadedBy: String(user.userId) },
    });

    // Update passage row (also persist speaker if provided)
    const speaker = url.searchParams.get("speaker");
    if (speaker) {
      await sql`
        UPDATE passages
        SET audio_key = ${blobKey}, speaker = ${speaker}
        WHERE id = ${passageId}
      `;
    } else {
      await sql`
        UPDATE passages
        SET audio_key = ${blobKey}
        WHERE id = ${passageId}
      `;
    }

    return jsonRes({ success: true, audioKey: blobKey });
  }

  // GET /audio?passageId=123 — stream audio back
  if (method === "GET") {
    const passageId = Number(url.searchParams.get("passageId"));
    if (!passageId) return jsonRes({ error: "passageId is required" }, 400);

    const blobKey = `passage-${passageId}.mp3`;

    const blob = await store.get(blobKey, { type: "arrayBuffer" });
    if (!blob) {
      return jsonRes({ error: "No audio found for this passage" }, 404);
    }

    return new Response(blob, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // DELETE /audio?passageId=123 — remove audio
  if (method === "DELETE") {
    const passageId = Number(url.searchParams.get("passageId"));
    if (!passageId) return jsonRes({ error: "passageId is required" }, 400);

    const blobKey = `passage-${passageId}.mp3`;
    await store.delete(blobKey);

    await sql`
      UPDATE passages
      SET audio_key = NULL
      WHERE id = ${passageId}
    `;

    return jsonRes({ success: true });
  }

  return jsonRes({ error: "Method not allowed" }, 405);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("audio function error:", err);
    return jsonRes({ error: message }, 500);
  }
}
