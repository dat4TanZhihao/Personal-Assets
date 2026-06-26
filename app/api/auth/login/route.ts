import { ApiError } from '../../../../shared/src/errors';
import { clearSessionCookie, createSessionCookie, ownerUserId, verifyOwnerPassword } from '../../../../web/server/auth';
import { getWebBackend, jsonData, jsonError, readJson } from '../../../../web/server/api';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJson(request);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password || !(await verifyOwnerPassword(password))) {
      throw new ApiError('INVALID_CREDENTIALS', 'Invalid password', { status: 401 });
    }
    const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
    if (nickname) {
      await getWebBackend().updateUserProfile({ nickname, profileSource: 'MANUAL' }, { userId: ownerUserId });
    }
    const profile = await getWebBackend().userLogin({}, { userId: ownerUserId });
    return jsonData(profile, { headers: { 'set-cookie': createSessionCookie(ownerUserId) } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(): Promise<Response> {
  return jsonData({ ok: true }, { headers: { 'set-cookie': clearSessionCookie() } });
}
