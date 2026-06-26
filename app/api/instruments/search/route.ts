import { contextFromRequest, getWebBackend, handleApi } from '../../../../web/server/api';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return handleApi(() => getWebBackend().searchInstruments({
    query: url.searchParams.get('q') ?? '',
    assetType: url.searchParams.get('assetType') as never ?? undefined
  }, contextFromRequest(request)));
}
