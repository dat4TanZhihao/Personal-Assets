import { ApiError } from '../errors';
import type { BackendContext, IbkrOAuthCallbackInput, StartIbkrAuthInput, SyncIbkrInput, SyncJobStatus } from '../types';

export interface IbkrProvider {
  startAuth(input: StartIbkrAuthInput, ctx: BackendContext): Promise<{ authUrl: string; state: string }>;
  handleOAuthCallback(input: IbkrOAuthCallbackInput, ctx: BackendContext): Promise<{ ok: true }>;
  sync(input: SyncIbkrInput, ctx: BackendContext): Promise<{ status: SyncJobStatus; metadata?: Record<string, unknown> }>;
}

export function createNotConfiguredIbkrProvider(): IbkrProvider {
  const error = () => new ApiError(
    'PROVIDER_NOT_CONFIGURED',
    'IBKR provider is not configured. Set up an official IBKR API or Flex Web Service provider before enabling sync.',
    { status: 503, provider: 'IBKR' }
  );

  return {
    async startAuth() {
      throw error();
    },
    async handleOAuthCallback() {
      throw error();
    },
    async sync() {
      throw error();
    }
  };
}
