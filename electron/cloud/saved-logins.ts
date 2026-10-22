import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

interface Encryption {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}
const emailSchema = z.string().trim().toLowerCase().email().max(320);
const entrySchema = z.object({ email: emailSchema, password: z.string().min(1).max(4096), lastUsedAt: z.number().finite() });
const fileSchema = z.object({ version: z.literal(1), origin: z.string(), accounts: z.array(entrySchema).max(20) });
type Entry = z.infer<typeof entrySchema>;

/** Passwords never enter settings, status broadcasts, logs, or the account list. */
export class SavedLogins {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly path: string;
  private readonly origin: string;
  private readonly encryption: Encryption;
  constructor(path: string, origin: string, encryption: Encryption) { this.path=path; this.origin=origin; this.encryption=encryption; }
  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async read(): Promise<Entry[]> {
    if (!this.encryption.isEncryptionAvailable()) throw new Error('系统安全存储暂不可用，请手动输入密码。');
    let data: Buffer;
    try { data = await readFile(this.path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw new Error('无法读取此电脑保存的账号。'); }
    try {
      const parsed = fileSchema.parse(JSON.parse(this.encryption.decryptString(data)));
      if (parsed.origin !== this.origin) throw new Error('origin');
      return parsed.accounts;
    } catch { throw new Error('此电脑保存的账号无法解密，请重新输入账号和密码。'); }
  }
  private async write(accounts: Entry[]): Promise<void> {
    if (!this.encryption.isEncryptionAvailable()) throw new Error('系统安全存储暂不可用，未保存密码。');
    const bytes = this.encryption.encryptString(JSON.stringify({ version: 1, origin: this.origin, accounts }));
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path + '.tmp', bytes, { mode: 0o600 });
    await rename(this.path + '.tmp', this.path);
  }
  list(): Promise<Array<{ email: string; lastUsedAt: number }>> {
    return this.run(async () => (await this.read()).map(({ email, lastUsedAt }) => ({ email, lastUsedAt })));
  }
  get(email: string): Promise<{ email: string; password: string } | null> {
    return this.run(async () => {
      const normalized = emailSchema.parse(email), entry = (await this.read()).find(a => a.email === normalized);
      return entry ? { email: entry.email, password: entry.password } : null;
    });
  }
  save(email: string, password: string): Promise<void> {
    return this.run(async () => {
      const entry = entrySchema.parse({ email, password, lastUsedAt: Date.now() });
      const accounts = await this.read();
      await this.write([entry, ...accounts.filter(a => a.email !== entry.email)].slice(0, 20));
    });
  }
  forget(email: string): Promise<void> {
    return this.run(async () => {
      const normalized = emailSchema.parse(email), accounts = await this.read();
      await this.write(accounts.filter(a => a.email !== normalized));
    });
  }
}
