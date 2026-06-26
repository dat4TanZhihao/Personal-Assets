import { contextFromRequest, getWebBackend, handleApi, readJson } from '../../../../web/server/api';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const ctx = contextFromRequest(request);
return handleApi(async () => getWebBackend().syncPrices(await readJson(request) as never, ctx), { status: 201 });
}
