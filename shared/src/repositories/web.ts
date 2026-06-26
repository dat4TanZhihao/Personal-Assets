import { MemoryRepository } from './memory';
import { NeonPostgresRepository } from './neon';
import type { Repository } from './types';

let singleton: Repository | undefined;

export function getWebRepository(): Repository {
  if (!singleton) {
    singleton = process.env.DATABASE_URL
      ? createPersistentRepository(process.env.DATABASE_URL)
      : new MemoryRepository();
  }
  return singleton;
}

function createPersistentRepository(databaseUrl: string): Repository {
  if (process.env.DATABASE_DRIVER === 'neon') {
    return new NeonPostgresRepository(databaseUrl);
  }
  return createNodePostgresRepository(databaseUrl);
}

function createNodePostgresRepository(databaseUrl: string): Repository {
  const dynamicRequire = Function('return require')() as NodeRequire;
  const mod = dynamicRequire('./nodePostgres') as typeof import('./nodePostgres');
  return new mod.NodePostgresRepository(databaseUrl);
}

export function resetWebRepositoryForTests(repo?: Repository): void {
  singleton = repo;
}
