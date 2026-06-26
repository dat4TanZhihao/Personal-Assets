import { clearSessionCookie } from '../../../../web/server/auth';
import { jsonData } from '../../../../web/server/api';

export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  return jsonData({ ok: true }, { headers: { 'set-cookie': clearSessionCookie() } });
}
