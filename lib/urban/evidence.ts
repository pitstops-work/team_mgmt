// Evidence files (voice notes, photos). Stored privately in Vercel Blob and
// served only through /api/urban/evidence/[id], which checks the viewer may
// see the effort. In local development without a Blob token they are written
// to the OS temp dir instead, so the flow can be exercised end to end.
import { put } from "@vercel/blob";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

const LOCAL_PREFIX = "local-dev:";

export async function storeEvidence(name: string, buffer: Buffer, contentType: string): Promise<string> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`urban-evidence/${Date.now()}-${name}`, buffer, { access: "private", contentType });
    return blob.url;
  }
  if (process.env.NODE_ENV === "production") throw new Error("File storage is not configured");
  const dir = path.join(os.tmpdir(), "urban-evidence");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
  await fs.writeFile(file, buffer);
  return LOCAL_PREFIX + file;
}

export async function readEvidence(url: string): Promise<{ body: ReadableStream | Buffer; contentType?: string } | null> {
  if (url.startsWith(LOCAL_PREFIX)) {
    if (process.env.NODE_ENV === "production") return null;
    try { return { body: await fs.readFile(url.slice(LOCAL_PREFIX.length)) }; } catch { return null; }
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok || !res.body) return null;
  return { body: res.body, contentType: res.headers.get("content-type") ?? undefined };
}
