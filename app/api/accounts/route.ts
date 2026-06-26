import { contextFromRequest, getWebBackend, handleApi } from '../../../web/server/api';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return handleApi(() => getWebBackend().listAccounts({
    includeDisabled: url.searchParams.get('includeDisabled') === 'true'
  }, contextFromRequest(request)));
}

