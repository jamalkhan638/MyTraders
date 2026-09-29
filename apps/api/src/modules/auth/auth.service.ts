import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  type AuthSessionResponse,
  type AuthUser,
  type LoginRequest,
} from '@mytraders/shared-types';
import { type Organization, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from './password.service';
import { type IssuedRefreshToken, TokenService } from './token.service';

type UserWithOrganization = User & { organization: Organization | null };

export interface SessionResult {
  session: AuthSessionResponse;
  refreshToken: IssuedRefreshToken;
}

const INVALID_CREDENTIALS = 'Invalid email or password';
const SESSION_EXPIRED = 'Session expired, please sign in again';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async login(input: LoginRequest): Promise<SessionResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { organization: true },
    });
    const passwordOk = user
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.verifyAgainstDummy(input.password);
    if (!user || !passwordOk) throw new UnauthorizedException(INVALID_CREDENTIALS);
    assertCanSignIn(user);

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const refreshToken = await this.tokens.issueRefreshToken(user.id);
    return { session: await this.buildSession(user), refreshToken };
  }

  async refresh(rawRefreshToken: string): Promise<SessionResult> {
    const rotated = await this.tokens.rotateRefreshToken(rawRefreshToken);
    if (!rotated.ok) throw new UnauthorizedException(SESSION_EXPIRED);

    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
      include: { organization: true },
    });
    if (!user || !canSignIn(user)) {
      await this.tokens.revokeByRawToken(rotated.token.raw);
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
    return { session: await this.buildSession(user), refreshToken: rotated.token };
  }

  logout(rawRefreshToken: string): Promise<void> {
    return this.tokens.revokeByRawToken(rawRefreshToken);
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user) throw new UnauthorizedException('Not authenticated');
    return toAuthUser(user);
  }

  private async buildSession(user: UserWithOrganization): Promise<AuthSessionResponse> {
    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      org: user.organizationId,
      role: user.role,
    });
    return { accessToken, expiresIn: this.tokens.accessTokenTtlSeconds, user: toAuthUser(user) };
  }
}

function canSignIn(user: UserWithOrganization): boolean {
  return user.isActive && user.organization?.status !== 'SUSPENDED';
}

function assertCanSignIn(user: UserWithOrganization): void {
  if (!user.isActive) throw new UnauthorizedException('Your account is inactive');
  if (user.organization?.status === 'SUSPENDED') {
    throw new UnauthorizedException('Your organization is suspended');
  }
}

function toAuthUser(user: UserWithOrganization): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organization: user.organization
      ? {
          id: user.organization.id,
          name: user.organization.name,
          status: user.organization.status,
          currency: user.organization.currency,
          timezone: user.organization.timezone,
        }
      : null,
  };
}
