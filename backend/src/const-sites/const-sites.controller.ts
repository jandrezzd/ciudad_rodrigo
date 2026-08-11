import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ConstSitesService } from './const-sites.service';
import { CreateConstSiteDto } from './DTOs/create-const-site.dto';
import { UpdateConstSiteDto } from './DTOs/update-const-site.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('const-sites')
export class ConstSitesController {
  constructor(private constSitesService: ConstSitesService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(@Body() body: CreateConstSiteDto) {
    return this.constSitesService.create(body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get()
  findAll() {
    return this.constSitesService.findAll();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.constSitesService.findOne(Number(id));
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateConstSiteDto) {
    return this.constSitesService.update(Number(id), body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.constSitesService.remove(Number(id));
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':constSiteId/clients/:clientId')
  addClient(@Param('constSiteId') constSiteId: string, @Param('clientId') clientId: string) {
    return this.constSitesService.addClient(Number(constSiteId), Number(clientId));
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':constSiteId/clients/:clientId')
  removeClient(@Param('constSiteId') constSiteId: string, @Param('clientId') clientId: string) {
    return this.constSitesService.removeClient(Number(constSiteId), Number(clientId));
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':constSiteId/clients')
  getClientsByConstSite(@Param('constSiteId') constSiteId: string) {
    return this.constSitesService.getClientsByConstSite(Number(constSiteId));
  }
}
