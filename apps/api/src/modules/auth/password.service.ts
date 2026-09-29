import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** argon2id password hashing (docs/architecture.md §4). */
@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  /** Spends the same time as a real check when the email is unknown (prevents user enumeration). */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash('dummy-password-for-timing');
    await argon2.verify(await this.dummyHash, password);
    return false;
  }
}
