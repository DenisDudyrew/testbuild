import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, hashEmail } from '../encryption';

describe('encryption', () => {
  it('encrypts and decrypts text correctly', () => {
    const original = 'secret-message-123';
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('produces different ciphertext for same input (random IV)', () => {
    const original = 'same-text';
    const enc1 = encrypt(original);
    const enc2 = encrypt(original);
    expect(enc1).not.toBe(enc2);
  });

  it('encrypted format contains iv:tag:ciphertext (3 parts)', () => {
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]+$/); // iv hex
    expect(parts[1]).toMatch(/^[0-9a-f]+$/); // tag hex
    expect(parts[2]).toMatch(/^[0-9a-f]+$/); // ciphertext hex
  });

  it('handles empty string', () => {
    const encrypted = encrypt('');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  it('handles unicode characters', () => {
    const original = 'Привет, мир! 🔐';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('throws on invalid encrypted string format', () => {
    expect(() => decrypt('invalid-format')).toThrow('Invalid encrypted string format');
    expect(() => decrypt('too:many:parts:here')).toThrow('Invalid encrypted string format');
  });

  it('throws on tampered ciphertext', () => {
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    // Tamper with the ciphertext
    const tampered = [parts[0], parts[1], 'deadbeef'].join(':');
    expect(() => decrypt(tampered)).toThrow();
  });
});

describe('hashEmail', () => {
  it('produces a 64-character hex string (SHA-256)', () => {
    const hash = hashEmail('test@example.com');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is case-insensitive', () => {
    const hash1 = hashEmail('Test@Example.com');
    const hash2 = hashEmail('test@example.com');
    expect(hash1).toBe(hash2);
  });

  it('trims whitespace', () => {
    const hash1 = hashEmail('  test@example.com  ');
    const hash2 = hashEmail('test@example.com');
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different emails', () => {
    const hash1 = hashEmail('alice@example.com');
    const hash2 = hashEmail('bob@example.com');
    expect(hash1).not.toBe(hash2);
  });
});
