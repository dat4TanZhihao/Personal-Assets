import { Pool } from '@neondatabase/serverless';
import { PostgresRepository } from './postgres';
import type { Queryable } from './postgres';

export class NeonPostgresRepository extends PostgresRepository {
  constructor(connectionString: string | Queryable) {
    super(typeof connectionString === 'string'
      ? new Pool({ connectionString }) as Queryable
      : connectionString);
  }
}
