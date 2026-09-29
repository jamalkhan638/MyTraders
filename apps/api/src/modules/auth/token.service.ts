import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { type Env } from '../../config/env';
import { type AccessTokenPayload } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

export interface IssuedRefreshToken {
  raw: string;
  expiresAt: Date;
}

export type RotateResult = { ok: true; userId: string; token: IssuedRefreshToken } | { ok: false };

/**
 * Access tokens: short-lived JWTs. Refresh tokens: random opaque strings, stored only as
 * sha256 hashes, rotated on every use. Reusing an already-rotated token revokes its whole
 * family (the token was probably stolen). docs/architecture.md §4.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get accessTokenTtlSeconds(): number {
    return this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }

  signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload);
  }

  async issueRefreshToken(
    userId: string,
    familyId: string = randomUUID(),
  ): Promise<IssuedRefreshToken> {
    const { token } = await this.createRefreshToken(this.prisma, userId, familyId);
    return token;
  }

  async rotateRefreshToken(raw: string): Promise<RotateResult> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(raw) },
    });
    if (!existing) return { ok: false };

    if (existing.revokedAt) {
      // Reuse of a rotated/revoked token: revoke the whole family.
      await this.revokeFamily(existing.familyId);
      return { ok: false };
    }
    if (existing.expiresAt <= new Date()) return { ok: false };

    const rotated = await this.prisma.$transaction(async (tx) => {
      // Atomically claim the token; a concurrent refresh with the same token gets count 0.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (claimed.count === 0) return null;
      const next = await this.createRefreshToken(tx, existing.userId, existing.familyId);
      await tx.refreshToken.update({ where: { id: existing.id }, data: { replacedById: next.id } });
      return next.token;
    });

    if (!rotated) {
      await this.revokeFamily(existing.familyId);
      return { ok: false };
    }
    return { ok: true, userId: existing.userId, token: rotated };
  }

  /** Revokes the family the given raw token belongs to (logout). Unknown tokens are ignored. */
  async revokeByRawToken(raw: string): Promise<void> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(raw) },
    });
    if (existing) await this.revokeFamily(existing.familyId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async createRefreshToken(
    client: Pick<PrismaService, 'refreshToken'>,
    userId: string,
    familyId: string,
  ): Promise<{ id: string; token: IssuedRefreshToken }> {
    const raw = randomBytes(32).toString('base64url');
    const days = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const record = await client.refreshToken.create({
      data: { userId, familyId, tokenHash: hashToken(raw), expiresAt },
      select: { id: true },
    });
    return { id: record.id, token: { raw, expiresAt } };
  }
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
