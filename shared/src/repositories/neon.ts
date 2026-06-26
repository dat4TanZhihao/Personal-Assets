import { neon } from '@neondatabase/serverless';
import { PostgresRepository } from './postgres';
import type { Queryable } from './postgres';

export class NeonPostgresRepository extends PostgresRepository {
  constructor(connectionString: string | Queryable) {
    super(typeof connectionString === 'string'
      ? new NeonHttpQueryable(connectionString)
      : connectionString);
  }
}

class NeonHttpQueryable implements Queryable {
  private readonly sql: ReturnType<typeof neon>;

  constructor(connectionString: string) {
    this.sql = neon(connectionString);
  }

  async query<T = unknown>(text: string, values?: unknown[]): Promise<{ rows: T[] }> {
    const rows = await this.sql.query(text, values ?? []) as T[];
    return { rows };
  }
}
