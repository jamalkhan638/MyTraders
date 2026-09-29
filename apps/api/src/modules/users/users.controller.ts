import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserRole, userSchema } from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../../common/decorators/access.decorators';
import { UsersService } from './users.service';

class UserDto extends createZodDto(userSchema) {}

@ApiTags('users')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOkResponse({ type: [UserDto] })
  list() {
    return this.users.list();
  }

  @Get(':id')
  @ApiOkResponse({ type: UserDto })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }
}
