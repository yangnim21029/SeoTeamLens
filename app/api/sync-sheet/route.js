import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

import { invalidateProjectsCache } from "@/app/lib/projects-store";

export async function POST(request) {
  try {
    const apiKey = request.headers.get('x-api-key');
    const expectedKey = process.env.APPS_SCRIPT_API_KEY;
    if (!expectedKey) {
      console.error('APPS_SCRIPT_API_KEY is not configured.');
      return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 });
    }
    if (apiKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const sheetNameRaw = payload?.sheetName;
    const jsonDataRaw = payload?.jsonData;
    const sheetName = typeof sheetNameRaw === 'string' ? sheetNameRaw.trim() : '';

    if (!sheetName || jsonDataRaw == null) {
      return NextResponse.json({ error: 'Missing sheetName or jsonData.' }, { status: 400 });
    }

    const jsonString = typeof jsonDataRaw === 'string' ? jsonDataRaw : JSON.stringify(jsonDataRaw);

    await sql`
      INSERT INTO synced_data (sheet_name, json_data, last_updated)
      VALUES (${sheetName}, ${jsonString}, NOW())
      ON CONFLICT (sheet_name)
      DO UPDATE SET
        json_data = EXCLUDED.json_data,
        last_updated = NOW();
    `;

    await invalidateProjectsCache();

    return NextResponse.json({ message: `Sheet '${sheetName}' synced successfully.` }, { status: 200 });
  } catch (error) {
    console.error('Failed to sync sheet:', error);
    return NextResponse.json({ error: 'Internal Server Error', detail: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Only POST requests allowed.' }, { status: 405 });
}
