/**
 * idempotency.ts — Verdant Finance: Idempotency key generation
 *
 * An idempotency key is a client-generated UUID that uniquely identifies
 * a single form session. The same key is sent on every click of the submit
 * button for that session — meaning if the user double-clicks or the network
 * causes a retry, the server sees the same key and returns the first result
 * instead of processing the transfer again.
 *
 * The key is generated once when the TransferForm mounts (or resets after
 * a successful transfer). Closing and reopening the form generates a new key,
 * which is correct — that's a new transfer intent.
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Generates a cryptographically random UUID v4 for use as an idempotency key.
 * Prefixed with 'ikey_' to make it identifiable in logs.
 */
export function generateIdempotencyKey(): string {
  return `ikey_${uuidv4()}`;
}
