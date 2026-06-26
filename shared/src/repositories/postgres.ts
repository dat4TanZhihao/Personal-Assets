import { Pool } from 'pg';
import { Pool as NeonPool } from '@neondatabase/serverless';
import { notFound } from '../errors';
import type { CollectionDoc, CollectionMap, CollectionName } from '../types';
import type { ListFilter, Repository } from './types';

export interface Queryable {
  query<T = unknown>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

const collections: CollectionName[] = [
  'users',
  'accounts',
  'holdings',
  'cashflows',
  'investment_plans',
  'prices',
  'daily_snapshots',
  'sync_jobs',
  'oauth_tokens'
];

const collectionSet = new Set<string>(collections);

type Row = {
  _id: string;
  data: unknown;
};

export class PostgresRepository implements Repository {
  private readonly db: Queryable;

  constructor(input: string | Queryable) {
    this.db = typeof input === 'string' ? createPool(input) : input;
  }

  async get<C extends CollectionName>(collection: C, id: string): Promise<CollectionDoc<C> | undefined> {
    const result = await this.db.query<Row>(`select _id, data from ${tableName(collection)} where _id = $1`, [id]);
    return result.rows[0] ? rowToDoc<C>(result.rows[0]) : undefined;
  }

  async set<C extends CollectionName>(collection: C, doc: CollectionDoc<C>): Promise<CollectionDoc<C>> {
    await this.db.query(
      `insert into ${tableName(collection)} (_id, data, user_id, updated_at)
       values ($1, $2::jsonb, $3, now())
       on conflict (_id) do update set
         data = excluded.data,
         user_id = excluded.user_id,
         updated_at = now()`,
      [doc._id, JSON.stringify(doc), userIdOf(doc)]
    );
    return clone(doc);
  }

  async patch<C extends CollectionName>(collection: C, id: string, updates: Partial<CollectionDoc<C>>): Promise<CollectionDoc<C>> {
    const current = await this.get(collection, id);
    if (!current) {
      throw notFound(collection, id);
    }
    const next = { ...current, ...updates, _id: current._id } as CollectionDoc<C>;
    return this.set(collection, next);
  }

  async delete<C extends CollectionName>(collection: C, id: string): Promise<void> {
    await this.db.query(`delete from ${tableName(collection)} where _id = $1`, [id]);
  }

  async list<C extends CollectionName>(collection: C, filter?: ListFilter<CollectionDoc<C>>): Promise<Array<CollectionDoc<C>>> {
    const isFunctionFilter = typeof filter === 'function';
    const partialFilter = isFunctionFilter ? undefined : filter;
    const clauses: string[] = [];
    const values: unknown[] = [];

    if (partialFilter && Object.keys(partialFilter).length > 0) {
      values.push(JSON.stringify(partialFilter));
      clauses.push(`data @> $${values.length}::jsonb`);
    }

    const where = clauses.length ? ` where ${clauses.join(' and ')}` : '';
    const result = await this.db.query<Row>(`select _id, data from ${tableName(collection)}${where} order by created_at asc`, values);
    const docs = result.rows.map((row) => rowToDoc<C>(row));
    return isFunctionFilter ? docs.filter(filter) : docs;
  }
}

function createPool(connectionString: string): Queryable {
  if (process.env.DATABASE_DRIVER === 'neon') {
    return new NeonPool({ connectionString }) as Queryable;
  }
  return new Pool({ connectionString });
}

function tableName(collection: CollectionName): string {
  if (!collectionSet.has(collection)) {
    throw new Error(`Invalid collection: ${collection}`);
  }
  return `"${collection}"`;
}

function rowToDoc<C extends CollectionName>(row: Row): CollectionDoc<C> {
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  return { ...(data as Record<string, unknown>), _id: row._id } as CollectionDoc<C>;
}

function userIdOf(doc: CollectionMap[CollectionName]): string | null {
  return 'userId' in doc && typeof doc.userId === 'string' ? doc.userId : null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
