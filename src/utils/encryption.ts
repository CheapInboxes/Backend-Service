// Encryption utilities for storing sensitive credentials
// Uses AES-256-GCM for authenticated encryption

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16;

// Get encryption key from environment (must be 32 bytes / 256 bits)
function getEncryptionKey(): Buffer {
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY environment variable is not set');
  }
  
  // If key is hex-encoded (64 chars = 32 bytes)
  if (key.length === 64) {
    return Buffer.from(key, 'hex');
  }
  
  // If key is base64-encoded
  if (key.length === 44) {
    return Buffer.from(key, 'base64');
  }
  
  // Otherwise hash it to get consistent 32 bytes
  return crypto.createHash('sha256').update(key).digest();
}

export interface IntegrationCredentials {
  api_key: string;
  base_url?: string;
}

/**
 * Encrypt credentials to a single string for storage
 * Format: base64(iv + authTag + ciphertext)
 */
export function encryptCredentials(credentials: IntegrationCredentials): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const plaintext = JSON.stringify(credentials);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Combine: iv (12) + authTag (16) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  
  return combined.toString('base64');
}

/**
 * Decrypt credentials from storage
 */
export function decryptCredentials(encryptedData: string): IntegrationCredentials {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedData, 'base64');
  
  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  
  return JSON.parse(decrypted.toString('utf8'));
}

/**
 * Generate a new encryption key (for initial setup)
 * Run: npx ts-node -e "import('./src/utils/encryption.js').then(m => console.log(m.generateEncryptionKey()))"
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Get decrypted credentials from an integration record.
 * Handles both encrypted format and legacy plain-text format.
 * @param integration - The integration record with credential_ref
 * @returns The decrypted credentials
 */
export function getIntegrationCredentials(
  integration: { credential_ref: string }
): IntegrationCredentials {
  try {
    return decryptCredentials(integration.credential_ref);
  } catch {
    // Fallback for old plain-text format (api_key stored directly, no base_url)
    return {
      api_key: integration.credential_ref,
    };
  }
}

