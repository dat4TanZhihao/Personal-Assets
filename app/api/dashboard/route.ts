import type { Range } from '../../../shared/src/types';
import { contextFromRequest, getWebBackend, handleApi } from '../../../web/server/api';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const range = (url.searchParams.get('range') || '1M') as Range;
  return handleApi(() => getWebBackend().getDashboard({ range }, contextFromRequest(request)));
}
