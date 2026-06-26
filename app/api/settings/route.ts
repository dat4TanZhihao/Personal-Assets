import { contextFromRequest, getWebBackend, handleApi, readJson } from '../../../web/server/api';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  return handleApi(async () => getWebBackend().updateUserSettings(await readJson(request) as never, contextFromRequest(request)));
}

