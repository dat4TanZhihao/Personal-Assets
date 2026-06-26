import type { Repository } from '../repositories/types';
import type { SyncJob, SyncJobStatus, SyncJobType } from '../types';
import type { IdGenerator } from '../utils/id';

export async function startSyncJob(input: {
  repo: Repository;
  idGenerator: IdGenerator;
  userId: string;
  jobType: SyncJobType;
  now: string;
  metadata?: Record<string, unknown>;
}): Promise<SyncJob> {
  const job: SyncJob = {
    _id: input.idGenerator('job'),
    userId: input.userId,
    jobType: input.jobType,
    status: 'RUNNING',
    startedAt: input.now,
    metadata: input.metadata ?? {}
  };
  return input.repo.set('sync_jobs', job);
}

export async function finishSyncJob(input: {
  repo: Repository;
  job: SyncJob;
  status: SyncJobStatus;
  now: string;
  errorMessage?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
}): Promise<SyncJob> {
  return input.repo.patch('sync_jobs', input.job._id, {
    status: input.status,
    finishedAt: input.now,
    errorMessage: input.errorMessage,
    provider: input.provider,
    metadata: {
      ...input.job.metadata,
      ...(input.metadata ?? {})
    }
  });
}
