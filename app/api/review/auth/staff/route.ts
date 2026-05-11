export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  if (!process.env.STAFF_PASSPHRASE) {
    return Response.json({ error: 'STAFF_PASSPHRASE not configured' }, { status: 500 });
  }

  if (body?.passphrase === process.env.STAFF_PASSPHRASE) {
    return Response.json({ ok: true });
  }
  return Response.json({ error: 'Wrong passphrase' }, { status: 401 });
}
