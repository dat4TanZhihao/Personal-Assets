import { MemoryRepository } from './memory';
import { PostgresRepository } from './postgres';
import type { Repository } from './types';

let singleton: Repository | undefined;

export function getWebRepository(): Repository {
  if (!singleton) {
    singleton = process.env.DATABASE_URL
      ? new PostgresRepository(process.env.DATABASE_URL)
      : new MemoryRepository();
  }
  return singleton;
}

export function resetWebRepositoryForTests(repo?: Repository): void {
  singleton = repo;
}
