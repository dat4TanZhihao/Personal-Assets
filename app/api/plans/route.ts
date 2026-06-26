import { contextFromRequest, getWebBackend, handleApi, readJson } from '../../../web/server/api';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return handleApi(() => getWebBackend().listInvestmentPlans({
    includeEnded: url.searchParams.get('includeEnded') === 'true',
    holdingId: url.searchParams.get('holdingId') ?? undefined
  }, contextFromRequest(request)));
}

export async function POST(request: Request): Promise<Response> {
  const ctx = contextFromRequest(request);
return handleApi(async () => getWebBackend().upsertInvestmentPlan(await readJson(request) as never, ctx), { status: 201 });
}
