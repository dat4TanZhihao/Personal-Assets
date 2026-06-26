import type { CollectionDoc, CollectionName } from '../types';

export type ListFilter<T> = Partial<T> | ((doc: T) => boolean);

export interface Repository {
  get<C extends CollectionName>(collection: C, id: string): Promise<CollectionDoc<C> | undefined>;
  set<C extends CollectionName>(collection: C, doc: CollectionDoc<C>): Promise<CollectionDoc<C>>;
  patch<C extends CollectionName>(collection: C, id: string, updates: Partial<CollectionDoc<C>>): Promise<CollectionDoc<C>>;
  delete<C extends CollectionName>(collection: C, id: string): Promise<void>;
  list<C extends CollectionName>(collection: C, filter?: ListFilter<CollectionDoc<C>>): Promise<Array<CollectionDoc<C>>>;
}
