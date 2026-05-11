import { neon } from '@neondatabase/serverless';

if (!process.env.REVIEW_DATABASE_URL) {
  console.warn('[review] REVIEW_DATABASE_URL is not set. API routes will fail until configured.');
}

export const sql = neon(process.env.REVIEW_DATABASE_URL!);

export function ok(data: any, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    ...init,
  });
}

export function bad(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function getReviewerId(req: Request): string | null {
  return req.headers.get('x-reviewer-id');
}
