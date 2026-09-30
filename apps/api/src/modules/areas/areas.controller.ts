import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  areaListSchema,
  areaSchema,
  createAreaSchema,
  listAreasQuerySchema,
  updateAreaSchema,
  UserRole,
} from '@mytraders/shared-types';
import { createZodDto } from 'nestjs-zod';
import { Roles } from '../../common/decorators/access.decorators';
import { AreasService } from './areas.service';

class AreaDto extends createZodDto(areaSchema) {}
class AreaListDto extends createZodDto(areaListSchema) {}
class ListAreasQueryDto extends createZodDto(listAreasQuerySchema) {}
class CreateAreaDto extends createZodDto(createAreaSchema) {}
class UpdateAreaDto extends createZodDto(updateAreaSchema) {}

/** Area management — Admin only. Areas are never deleted, only deactivated. */
@ApiTags('areas')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('areas')
export class AreasController {
  constructor(private readonly areas: AreasService) {}

  @Get()
  @ApiOkResponse({
    type: AreaListDto,
    description: 'Areas of the current organization, sorted by name',
  })
  list(@Query() query: ListAreasQueryDto) {
    return this.areas.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AreaDto })
  @ApiNotFoundResponse({ description: 'Not found in the current organization' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.areas.get(id);
  }

  @Post()
  @ApiCreatedResponse({ type: AreaDto })
  @ApiConflictResponse({ description: 'An area with this name already exists in the organization' })
  create(@Body() body: CreateAreaDto) {
    return this.areas.create(body);
  }

  @Patch(':id')
  @ApiOkResponse({ type: AreaDto, description: 'Rename and/or activate/deactivate' })
  @ApiNotFoundResponse({ description: 'Not found in the current organization' })
  @ApiConflictResponse({ description: 'An area with this name already exists in the organization' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateAreaDto) {
    return this.areas.update(id, body);
  }
}
