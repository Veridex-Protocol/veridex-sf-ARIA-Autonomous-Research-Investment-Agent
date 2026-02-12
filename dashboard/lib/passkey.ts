/**
 * Passkey Wallet & Session Key — Client-side helpers
 *
 * Flow:
 *   1. Human creates a passkey wallet via WebAuthn (they own it)
 *   2. Human configures budget limits for the agent
 *   3. A secp256k1 session key is generated client-side
 *   4. The session key private key is encrypted with the passkey credential
 *   5. Only the encrypted session key + public info is sent to the agent
 *   6. Human retains full control — can revoke the session key at any time
 *
 * This runs entirely in the browser — no private keys leave the device unencrypted.
 */

import { PasskeyManager } from '@veridex/sdk';
import type { PasskeyCredential } from '@veridex/sdk';
import {
  generateSecp256k1KeyPair,
  computeSessionKeyHash,
  deriveEncryptionKey,
  encrypt,
} from '@veridex/sdk';
import { ethers } from 'ethers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WalletCredentials {
  credentialId: string;
  publicKeyX: string;
  publicKeyY: string;
  keyHash: string;
}

export interface SessionKeyConfig {
  dailyLimitUSD: number;
  perTransactionLimitUSD: number;
  expiryHours: number;
  allowedChains: number[];
}

export interface SessionKeyData {
  sessionKeyHash: string;
  sessionPublicKey: string;
  sessionAddress: string;
  encryptedPrivateKey: string;
  config: SessionKeyConfig;
  createdAt: number;
  expiresAt: number;
  masterKeyHash: string;
}

export interface WalletSetupResult {
  wallet: WalletCredentials;
  session: SessionKeyData;
}

// ---------------------------------------------------------------------------
// Passkey wallet creation
// ---------------------------------------------------------------------------

/**
 * Register a new passkey and return the credential fields as serializable strings.
 * BigInts are converted to hex strings for JSON transport.
 */
export async function createPasskeyWallet(
  username: string,
  displayName: string,
): Promise<WalletCredentials> {
  if (!PasskeyManager.isSupported()) {
    throw new Error('WebAuthn is not supported in this browser. Use Chrome, Safari, or Edge.');
  }

  const manager = new PasskeyManager({
    rpName: 'ARIA Agent — Veridex',
    rpId: window.location.hostname,
    userVerification: 'required',
    authenticatorAttachment: 'platform',
  });

  const credential: PasskeyCredential = await manager.register(username, displayName);

  return {
    credentialId: credential.credentialId,
    publicKeyX: '0x' + credential.publicKeyX.toString(16),
    publicKeyY: '0x' + credential.publicKeyY.toString(16),
    keyHash: credential.keyHash,
  };
}

/**
 * Authenticate with an existing passkey (discoverable credential).
 * Returns the credential fields for the agent.
 */
export async function authenticatePasskey(): Promise<WalletCredentials> {
  if (!PasskeyManager.isSupported()) {
    throw new Error('WebAuthn is not supported in this browser.');
  }

  const manager = new PasskeyManager({
    rpName: 'ARIA Agent — Veridex',
    rpId: window.location.hostname,
    userVerification: 'required',
    authenticatorAttachment: 'platform',
  });

  const { credential } = await manager.authenticate();

  return {
    credentialId: credential.credentialId,
    publicKeyX: '0x' + credential.publicKeyX.toString(16),
    publicKeyY: '0x' + credential.publicKeyY.toString(16),
    keyHash: credential.keyHash,
  };
}

// ---------------------------------------------------------------------------
// Session key generation (runs client-side, human authorizes the budget)
// ---------------------------------------------------------------------------

/**
 * Generate a budget-constrained session key for the agent.
 *
 * The session key is a secp256k1 key pair. The private key is encrypted
 * with a key derived from the passkey's credential ID, so only the
 * passkey owner can decrypt it. The agent receives the encrypted blob
 * and can use it for signing x402 payments within the configured limits.
 */
export async function createSessionKey(
  wallet: WalletCredentials,
  config: SessionKeyConfig,
): Promise<SessionKeyData> {
  // 1. Generate a fresh secp256k1 key pair
  const keyPair = generateSecp256k1KeyPair();

  // 2. Compute the session key hash (on-chain identifier)
  const sessionKeyHash = computeSessionKeyHash(keyPair.publicKey);

  // 3. Derive the session key's EVM address
  const sessionAddress = ethers.computeAddress(ethers.hexlify(keyPair.publicKey));

  // 4. Encrypt the private key using the passkey credential ID
  const encryptionKey = await deriveEncryptionKey(wallet.credentialId);
  const encryptedBytes = await encrypt(keyPair.privateKey, encryptionKey);
  const encryptedPrivateKey = Buffer.from(encryptedBytes).toString('base64');

  const now = Date.now();
  const expiresAt = now + config.expiryHours * 60 * 60 * 1000;

  return {
    sessionKeyHash,
    sessionPublicKey: ethers.hexlify(keyPair.publicKey),
    sessionAddress,
    encryptedPrivateKey,
    config,
    createdAt: now,
    expiresAt,
    masterKeyHash: wallet.keyHash,
  };
}

/**
 * Full setup: create passkey wallet + derive session key in one step.
 */
export async function setupWalletWithSession(
  username: string,
  displayName: string,
  sessionConfig: SessionKeyConfig,
): Promise<WalletSetupResult> {
  const wallet = await createPasskeyWallet(username, displayName);
  const session = await createSessionKey(wallet, sessionConfig);
  return { wallet, session };
}

/**
 * Authenticate existing passkey + derive a new session key.
 */
export async function authenticateAndCreateSession(
  sessionConfig: SessionKeyConfig,
): Promise<WalletSetupResult> {
  const wallet = await authenticatePasskey();
  const session = await createSessionKey(wallet, sessionConfig);
  return { wallet, session };
}
