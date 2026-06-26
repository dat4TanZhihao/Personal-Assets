import { contextFromRequest, getWebBackend, handleApi, readJson } from '../../../../web/server/api';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  return handleApi(async () => getWebBackend().upsertInvestmentPlan({
    ...await readJson(request),
    _id: id
  } as never, contextFromRequest(request)));
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  return handleApi(() => getWebBackend().deleteInvestmentPlan({ planId: id }, contextFromRequest(request)));
}
