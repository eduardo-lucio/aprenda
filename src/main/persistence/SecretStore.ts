import fs from 'fs';
import path from 'path';

/** The part of Electron's `safeStorage` this store needs. */
export interface SecretCipher {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
  getSelectedStorageBackend?(): string;
}

interface SecretFile {
  encrypted: boolean;
  data: string;
}

/**
 * API keys, kept only in the main process and encrypted by the operating system's keyring.
 * Without a usable keyring (some Linux setups) the file is still restricted to the user,
 * and `isProtected()` lets the interface say so.
 */
export class SecretStore {
  private values: Record<string, string> = {};

  constructor(private filePath: string, private cipher: SecretCipher) {
    this.load();
  }

  isProtected(): boolean {
    if (!this.cipher.isEncryptionAvailable()) return false;
    // `basic_text` encrypts with a hardcoded password: as good as no encryption
    return this.cipher.getSelectedStorageBackend?.() !== 'basic_text';
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const file = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as SecretFile;
      const raw = Buffer.from(file.data, 'base64');
      const json = file.encrypted ? this.cipher.decryptString(raw) : raw.toString('utf-8');
      this.values = JSON.parse(json);
    } catch (err) {
      console.error('[SecretStore] Não foi possível ler as chaves salvas:', err);
    }
  }

  private save(): void {
    const json = JSON.stringify(this.values);
    const encrypted = this.isProtected();
    const file: SecretFile = {
      encrypted,
      data: (encrypted ? this.cipher.encryptString(json) : Buffer.from(json, 'utf-8')).toString('base64'),
    };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(file), { mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
  }

  get(name: string): string | undefined {
    return this.values[name] || undefined;
  }

  set(name: string, value: string): void {
    if (this.values[name] === value) return;
    this.values[name] = value;
    this.save();
  }

  delete(name: string): void {
    if (!(name in this.values)) return;
    delete this.values[name];
    this.save();
  }
}

export const providerSecret = (providerId: string): string => `provider:${providerId}`;
export const DEEPGRAM_SECRET = 'deepgram';
