import { contextFromRequest, getWebBackend, handleApi, readJson } from '../../../web/server/api';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return handleApi(() => getWebBackend().listHoldings({
    includeArchived: url.searchParams.get('includeArchived') === 'true',
    accountId: url.searchParams.get('accountId') ?? undefined,
    assetType: url.searchParams.get('assetType') as never ?? undefined
  }, contextFromRequest(request)));
}

export async function POST(request: Request): Promise<Response> {
  return handleApi(async () => getWebBackend().upsertHolding(await readJson(request) as never, contextFromRequest(request)), { status: 201 });
}
