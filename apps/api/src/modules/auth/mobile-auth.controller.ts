import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { type MobileSessionResponse, UserRole } from '@mytraders/shared-types';
import { Public } from '../../common/decorators/access.decorators';
import { LoginDto, MobileRefreshDto, MobileSessionResponseDto } from './auth.dto';
import { AuthService, type SessionResult, type SessionRules } from './auth.service';

/** Sessions of the Order Booker mobile app: booker accounts only, specific refusal reasons. */
const BOOKER_APP: SessionRules = { requiredRole: UserRole.ORDER_BOOKER, explainRefusal: true };

/**
 * Sign-in for the SupplyBeacon Booker Android app (D-46). Same accounts, password checks, token
 * rotation and reuse detection as the web; the only difference is that the refresh token travels
 * in the body (a phone keeps it in secure storage) instead of an httpOnly cookie.
 */
@ApiTags('auth')
@Controller('auth/mobile')
export class MobileAuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: MobileSessionResponseDto })
  @ApiForbiddenResponse({ description: 'Not an Order Booker (Admins use the website)' })
  async login(@Body() body: LoginDto): Promise<MobileSessionResponse> {
    return toMobile(await this.auth.login(body, BOOKER_APP));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOkResponse({ type: MobileSessionResponseDto, description: 'Rotates the refresh token' })
  @ApiUnauthorizedResponse({
    description: 'Expired / reused token, inactive account or suspended organization',
  })
  async refresh(@Body() body: MobileRefreshDto): Promise<MobileSessionResponse> {
    return toMobile(await this.auth.refresh(body.refreshToken, BOOKER_APP));
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Refresh token revoked (unknown tokens are ignored)' })
  async logout(@Body() body: MobileRefreshDto): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }
}

function toMobile(result: SessionResult): MobileSessionResponse {
  return {
    ...result.session,
    refreshToken: result.refreshToken.raw,
    refreshTokenExpiresAt: result.refreshToken.expiresAt.toISOString(),
  };
}
