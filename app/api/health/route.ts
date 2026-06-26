import { getWebRepository } from '../../../shared/src/repositories/web';
import { jsonData, jsonError } from '../../../web/server/api';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    await getWebRepository().list('users');
    return jsonData({
      ok: true,
      storage: process.env.DATABASE_URL ? 'postgres' : 'memory',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return jsonError(error);
  }
}
