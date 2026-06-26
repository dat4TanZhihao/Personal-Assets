import { contextFromRequest, getWebBackend, handleApi } from '../../../web/server/api';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  return handleApi(() => getWebBackend().userLogin({}, contextFromRequest(request)));
}
