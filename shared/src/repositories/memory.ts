import type { CollectionDoc, CollectionMap, CollectionName } from '../types';
import type { ListFilter, Repository } from './types';
import { notFound } from '../errors';

type Store = Record<CollectionName, Map<string, unknown>>;

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

function matches<T extends Record<string, unknown>>(doc: T, filter?: ListFilter<T>): boolean {
  if (!filter) {
    return true;
  }
  if (typeof filter === 'function') {
    return filter(doc);
  }
  return Object.entries(filter).every(([key, value]) => value === undefined || doc[key] === value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MemoryRepository implements Repository {
  private readonly store: Store;

  constructor(seed?: Partial<{ [C in CollectionName]: Array<CollectionMap[C]> }>) {
    this.store = Object.fromEntries(collections.map((name) => [name, new Map()])) as Store;
    for (const [collection, docs] of Object.entries(seed ?? {}) as Array<[CollectionName, Array<CollectionMap[CollectionName]>]>) {
      for (const doc of docs) {
        this.store[collection].set(doc._id, clone(doc));
      }
    }
  }

  async get<C extends CollectionName>(collection: C, id: string): Promise<CollectionDoc<C> | undefined> {
    const doc = this.store[collection].get(id);
    return doc ? clone(doc) as CollectionDoc<C> : undefined;
  }

  async set<C extends CollectionName>(collection: C, doc: CollectionDoc<C>): Promise<CollectionDoc<C>> {
    this.store[collection].set(doc._id, clone(doc) as CollectionMap[C]);
    return clone(doc);
  }

  async patch<C extends CollectionName>(collection: C, id: string, updates: Partial<CollectionDoc<C>>): Promise<CollectionDoc<C>> {
    const current = this.store[collection].get(id);
    if (!current) {
      throw notFound(collection, id);
    }
    const next = { ...current, ...updates } as CollectionDoc<C>;
    this.store[collection].set(id, clone(next) as CollectionMap[C]);
    return clone(next);
  }

  async delete<C extends CollectionName>(collection: C, id: string): Promise<void> {
    this.store[collection].delete(id);
  }

  async list<C extends CollectionName>(collection: C, filter?: ListFilter<CollectionDoc<C>>): Promise<Array<CollectionDoc<C>>> {
    return Array.from(this.store[collection].values())
      .filter((doc) => matches(doc as unknown as Record<string, unknown>, filter as ListFilter<Record<string, unknown>>))
      .map((doc) => clone(doc) as CollectionDoc<C>);
  }

  dump<C extends CollectionName>(collection: C): Array<CollectionDoc<C>> {
    return Array.from(this.store[collection].values()).map((doc) => clone(doc) as CollectionDoc<C>);
  }
}
