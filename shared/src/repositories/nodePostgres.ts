import { Pool } from 'pg';
import { PostgresRepository } from './postgres';
import type { Queryable } from './postgres';

export class NodePostgresRepository extends PostgresRepository {
  constructor(connectionString: string | Queryable) {
    super(typeof connectionString === 'string'
      ? new Pool({ connectionString })
      : connectionString);
  }
}
