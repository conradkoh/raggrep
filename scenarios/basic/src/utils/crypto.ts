/**
 * Cryptographic Utilities
 *
 * Provides encryption, decryption, hashing, and key generation utilities.
 * Uses Node.js crypto module for secure operations.
 */

import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

// Encryption algorithm constants
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
  salt?: string;
}

export interface KeyDerivationOptions {
  salt?: Buffer;
  iterations?: number;
  keyLength?: number;
}

export interface HashOptions {
  algorithm?: "sha256" | "sha384" | "sha512";
  encoding?: "hex" | "base64";
}

/**
 * Generate a cryptographically secure random key
 */
export function generateSecureKey(length: number = KEY_LENGTH): Buffer {
  return randomBytes(length);
}

/**
 * Generate a random string (for tokens, IDs, etc.)
 */
export function generateRandomString(length: number = 32): string {
  return randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
}

/**
 * Generate a secure token (URL-safe)
 */
export function generateSecureToken(length: number = 48): string {
  return randomBytes(length).toString("base64url");
}

/**
 * Derive an encryption key from a password
 */
export async function deriveKeyFromPassword(
  password: string,
  options: KeyDerivationOptions = {}
): Promise<{ key: Buffer; salt: Buffer }> {
  const salt = options.salt || randomBytes(SALT_LENGTH);
  const keyLength = options.keyLength || KEY_LENGTH;

  const key = (await scryptAsync(password, salt, keyLength)) as Buffer;

  return { key, salt };
}

/**
 * Encrypt data using AES-256-GCM
 */
export function encryptData(data: string, key: Buffer): EncryptedData {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Key must be ${KEY_LENGTH} bytes`);
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(data, "utf8", "base64");
  ciphertext += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * Decrypt data encrypted with AES-256-GCM
 */
export function decryptData(encrypted: EncryptedData, key: Buffer): string {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Key must be ${KEY_LENGTH} bytes`);
  }

  const iv = Buffer.from(encrypted.iv, "base64");
  const authTag = Buffer.from(encrypted.authTag, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted.ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Encrypt data with a password (derives key internally)
 */
export async function encryptWithPassword(
  data: string,
  password: string
): Promise<EncryptedData> {
  const { key, salt } = await deriveKeyFromPassword(password);
  const encrypted = encryptData(data, key);

  return {
    ...encrypted,
    salt: salt.toString("base64"),
  };
}

/**
 * Decrypt data with a password
 */
export async function decryptWithPassword(
  encrypted: EncryptedData,
  password: string
): Promise<string> {
  if (!encrypted.salt) {
    throw new Error("Salt is required for password-based decryption");
  }

  const salt = Buffer.from(encrypted.salt, "base64");
  const { key } = await deriveKeyFromPassword(password, { salt });

  return decryptData(encrypted, key);
}

/**
 * Hash data using SHA-256 or other algorithms
 */
export function hashData(
  data: string,
  options: HashOptions = {}
): string {
  const { createHash } = require("crypto");
  const algorithm = options.algorithm || "sha256";
  const encoding = options.encoding || "hex";

  return createHash(algorithm).update(data).digest(encoding);
}

/**
 * Generate a secure hash with salt (for passwords - though bcrypt is preferred)
 */
export async function hashWithSalt(
  data: string
): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(SALT_LENGTH);
  const combined = Buffer.concat([salt, Buffer.from(data)]);
  const hash = hashData(combined.toString("base64"));

  return {
    hash,
    salt: salt.toString("base64"),
  };
}

/**
 * Verify a hash against data
 */
export function verifyHash(
  data: string,
  salt: string,
  expectedHash: string
): boolean {
  const saltBuffer = Buffer.from(salt, "base64");
  const combined = Buffer.concat([saltBuffer, Buffer.from(data)]);
  const hash = hashData(combined.toString("base64"));

  return hash === expectedHash;
}

/**
 * Generate HMAC for message authentication
 */
export function generateHMAC(
  message: string,
  key: Buffer | string,
  algorithm: "sha256" | "sha384" | "sha512" = "sha256"
): string {
  const { createHmac } = require("crypto");
  return createHmac(algorithm, key).update(message).digest("hex");
}

/**
 * Verify HMAC
 */
export function verifyHMAC(
  message: string,
  key: Buffer | string,
  expectedHMAC: string,
  algorithm: "sha256" | "sha384" | "sha512" = "sha256"
): boolean {
  const actualHMAC = generateHMAC(message, key, algorithm);
  return timingSafeEqual(actualHMAC, expectedHMAC);
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const { timingSafeEqual: cryptoTimingSafeEqual } = require("crypto");

  if (a.length !== b.length) {
    return false;
  }

  return cryptoTimingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Generate a random UUID v4
 */
export function generateUUID(): string {
  const { randomUUID } = require("crypto");
  return randomUUID();
}

/**
 * Mask sensitive data (e.g., credit card numbers)
 */
export function maskSensitiveData(
  data: string,
  visibleChars: number = 4,
  maskChar: string = "*"
): string {
  if (data.length <= visibleChars) {
    return maskChar.repeat(data.length);
  }

  const masked = maskChar.repeat(data.length - visibleChars);
  const visible = data.slice(-visibleChars);

  return masked + visible;
}
