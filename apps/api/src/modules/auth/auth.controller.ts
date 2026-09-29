import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AnyRole, Public } from '../../common/decorators/access.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { type AuthContext } from '../../common/types/auth-context';
import { type Env } from '../../config/env';
import { AuthSessionResponseDto, AuthUserDto, LoginDto } from './auth.dto';
import { AuthService, type SessionResult } from './auth.service';
import { clearRefreshCookie, REFRESH_COOKIE_NAME, setRefreshCookie } from './refresh-cookie';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly secureCookie: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.secureCookie = config.get('COOKIE_SECURE', { infer: true });
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({
    type: AuthSessionResponseDto,
    description: 'Also sets the httpOnly refresh cookie',
  })
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.login(body));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiOkResponse({ type: AuthSessionResponseDto, description: 'Rotates the refresh cookie' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = readRefreshCookie(req);
    try {
      if (!raw) throw new UnauthorizedException('Session expired, please sign in again');
      return this.respond(res, await this.auth.refresh(raw));
    } catch (error) {
      clearRefreshCookie(res, this.secureCookie);
      throw error;
    }
  }

  /** Public so a user with an expired access token can still log out. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const raw = readRefreshCookie(req);
    if (raw) await this.auth.logout(raw);
    clearRefreshCookie(res, this.secureCookie);
  }

  @AnyRole()
  @Get('me')
  @ApiBearerAuth()
  @ApiOkResponse({ type: AuthUserDto })
  me(@CurrentUser() user: AuthContext) {
    return this.auth.me(user.userId);
  }

  private respond(res: Response, result: SessionResult) {
    setRefreshCookie(
      res,
      result.refreshToken.raw,
      result.refreshToken.expiresAt,
      this.secureCookie,
    );
    return result.session;
  }
}

function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
