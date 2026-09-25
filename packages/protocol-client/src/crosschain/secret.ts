/**
 * CrossChainSecretStore — dedicated storage for the atomic-swap preimage S.
 *
 * S must NEVER be serialized into ordinary history, debug logs, telemetry, or URLs, and
 * must never be exposed before CLAIM_ARMED. Production restart-safe storage requires
 * encryption or wallet/device-backed protection; plain browser localStorage is explicitly
 * NOT acceptable. Testnet development storage is provided but marked unsafe/test-only.
 */
import { SecretHex, HashHex } from './types.js';

/** The ONLY value that may be persisted/displayed: SHA256(S) + length evidence. */
export interface SecretPublicPart {
  hashH: HashHex;
  /** Length of S in bytes (32) — evidence the preimage exists without revealing it. */
  secretLengthBytes: number;
}

export interface CrossChainSecretStore {
  /** Generates S, stores it under sessionId, returns ONLY the public hash part. */
  generateAndStore(sessionId: string): Promise<SecretPublicPart>;
  /**
   * TESTNET_REFERENCE path: ingest an EXTERNALLY generated preimage (the real Minotari
   * wallet generates S inside SendShaAtomicSwapTransaction and returns it to the
   * initiator — tari v6.0.0 service.rs:2203). Stored under the same CLAIM_ARMED-only
   * reveal discipline. Optional: coordinators must handle stores without ingestion.
   */
  ingestExternalSecret?(sessionId: string, secretHex: SecretHex): Promise<SecretPublicPart>;
  /** Returns S ONLY when the caller passes CLAIM_ARMED evidence. */
  revealSecret(sessionId: string, claimArmed: boolean): Promise<SecretHex>;
  hasSecret(sessionId: string): Promise<boolean>;
  /** Destroys S after both legs are claimed/refunded. */
  destroySecret(sessionId: string): Promise<void>;
  /** Safe public projection (hash + length) for display/history. */
  publicPart(sessionId: string): Promise<SecretPublicPart>;
}

/** SHA-256 via WebCrypto (browser + Node ≥ 20). */
export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return new Uint8Array(digest);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Memory implementation for tests and the current dev/testnet flow. The store is the ONLY
 * component that ever sees S. NOT restart-safe — production needs EncryptedSecretPersistence
 * below (documented blocker; testnet dev may not bypass this interface).
 */
export class InMemorySecretStore implements CrossChainSecretStore {
  private readonly secrets = new Map<string, Uint8Array>();
  private readonly hashes = new Map<string, HashHex>();

  async generateAndStore(sessionId: string): Promise<SecretPublicPart> {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    this.secrets.set(sessionId, bytes);
    const hashH = bytesToHex(await sha256(bytes));
    this.hashes.set(sessionId, hashH);
    return { hashH, secretLengthBytes: bytes.length };
  }

  async revealSecret(sessionId: string, claimArmed: boolean): Promise<SecretHex> {
    if (!claimArmed) throw new Error('Secret reveal refused: CLAIM_ARMED evidence required');
    const bytes = this.secrets.get(sessionId);
    if (!bytes) throw new Error(`No secret stored for session ${sessionId}`);
    return bytesToHex(bytes);
  }

  async ingestExternalSecret(sessionId: string, secretHex: SecretHex): Promise<SecretPublicPart> {
    if (!/^[0-9a-f]{64}$/.test(secretHex)) throw new Error('external preimage must be 64 lowercase hex chars');
    const bytes = hexToBytes(secretHex);
    this.secrets.set(sessionId, bytes);
    const hashH = bytesToHex(await sha256(bytes));
    this.hashes.set(sessionId, hashH);
    return { hashH, secretLengthBytes: bytes.length };
  }

  async hasSecret(sessionId: string): Promise<boolean> {
    return this.secrets.has(sessionId);
  }

  async destroySecret(sessionId: string): Promise<void> {
    this.secrets.delete(sessionId);
    this.hashes.delete(sessionId);
  }

  async publicPart(sessionId: string): Promise<SecretPublicPart> {
    const h = this.hashes.get(sessionId);
    if (!h) throw new Error(`No secret stored for session ${sessionId}`);
    const s = this.secrets.get(sessionId)!;
    return { hashH: h, secretLengthBytes: s.length };
  }
}

/**
 * INTERFACE for production restart-safe storage. The concrete implementation MUST encrypt
 * or delegate to wallet/device-backed key material. NOT IMPLEMENTED in this phase —
 * production restart-safe secret storage is a documented blocker. No plaintext-browser-
 * storage shortcut is provided.
 */
export interface EncryptedSecretPersistence {
  /** Encrypt-then-persist (opaque to the application). */
  persistEncrypted(sessionId: string, encryptedBlob: Uint8Array): Promise<void>;
  loadEncrypted(sessionId: string): Promise<Uint8Array | undefined>;
  /** KMS/device/wallet-held wrapping key handle; platform-specific. */
  wrappingKeyContext: string;
}

/**
 * TEST-ONLY: a coordinator gate that refuses any persistence path carrying plaintext S.
 * Used in tests to prove ordinary history/JSON serialization never contains S.
 */
export function assertNoSecretInJson(json: string, secretHex: SecretHex): void {
  if (secretHex.length === 0) throw new Error('empty secret');
  if (json.includes(secretHex)) throw new Error('SECRET LEAKED into serializable state');
}

/**
 * Coordinator guard: verify SHA256(S) === H before using any preimage (never trust peer
 * messaging alone).
 */
export async function verifyPreimage(secretHex: string, hashH: HashHex): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(secretHex)) throw new Error('preimage must be 64 lowercase hex chars');
  const digest = bytesToHex(await sha256(hexToBytes(secretHex)));
  return digest === hashH;
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]*$/.test(hex) || hex.length % 2 !== 0) throw new Error('invalid hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}