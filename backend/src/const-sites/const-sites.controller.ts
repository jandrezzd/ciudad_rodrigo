import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ConstSitesService } from './const-sites.service';
import { CreateConstSiteDto } from './DTOs/create-const-site.dto';
import { UpdateConstSiteDto } from './DTOs/update-const-site.dto';
import { AuthGuard } from '@nestjs/passport';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('const-sites')
export class ConstSitesController {
  constructor(private constSitesService: ConstSitesService) {}

  @RequirePermission('const-sites', 'create')
  @Post()
  create(@Body() body: CreateConstSiteDto) {
    return this.constSitesService.create(body);
  }

  @Get()
  findAll() {
    return this.constSitesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.constSitesService.findOne(Number(id));
  }

  @RequirePermission('const-sites', 'edit')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateConstSiteDto) {
    return this.constSitesService.update(Number(id), body);
  }

  @RequirePermission('const-sites', 'delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.constSitesService.remove(Number(id));
  }

  @RequirePermission('const-sites', 'edit')
  @Post(':constSiteId/clients/:clientId')
  addClient(
    @Param('constSiteId') constSiteId: string,
    @Param('clientId') clientId: string,
  ) {
    return this.constSitesService.addClient(
      Number(constSiteId),
      Number(clientId),
    );
  }

  @RequirePermission('const-sites', 'edit')
  @Delete(':constSiteId/clients/:clientId')
  removeClient(
    @Param('constSiteId') constSiteId: string,
    @Param('clientId') clientId: string,
  ) {
    return this.constSitesService.removeClient(
      Number(constSiteId),
      Number(clientId),
    );
  }

  @Get(':constSiteId/clients')
  getClientsByConstSite(@Param('constSiteId') constSiteId: string) {
    return this.constSitesService.getClientsByConstSite(Number(constSiteId));
  }
}
