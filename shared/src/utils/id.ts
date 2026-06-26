import { randomUUID } from 'crypto';

export type IdGenerator = (prefix: string) => string;

export const randomId: IdGenerator = (prefix) => `${prefix}_${randomUUID()}`;
