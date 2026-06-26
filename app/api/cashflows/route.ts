import { contextFromRequest, getWebBackend, handleApi, readJson } from '../../../web/server/api';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return handleApi(() => getWebBackend().listCashflows({
    accountId: url.searchParams.get('accountId') ?? undefined,
    holdingId: url.searchParams.get('holdingId') ?? undefined,
    fromDate: url.searchParams.get('fromDate') ?? undefined,
    toDate: url.searchParams.get('toDate') ?? undefined,
    includeDeleted: url.searchParams.get('includeDeleted') === 'true'
  }, contextFromRequest(request)));
}

export async function POST(request: Request): Promise<Response> {
  const ctx = contextFromRequest(request);
return handleApi(async () => getWebBackend().upsertCashflow(await readJson(request) as never, ctx), { status: 201 });
}
