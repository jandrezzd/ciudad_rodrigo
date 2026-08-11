import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'))
@Controller('reports')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get('owners')
  getOwners() {
    return this.service.getOwners();
  }

  @Get('owner')
  getOwnerReport(
    @Query('ownerId') ownerId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!ownerId || !startDate || !endDate) {
      throw new BadRequestException(
        'Se requieren: ownerId, startDate, endDate',
      );
    }
    return this.service.getOwnerTransportReport(
      parseInt(ownerId),
      startDate,
      endDate,
    );
  }

  @Get('vehicle')
  getVehicleReport(
    @Query('vehicleId') vehicleId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!vehicleId || !startDate || !endDate) {
      throw new BadRequestException(
        'Se requieren: vehicleId, startDate, endDate',
      );
    }
    return this.service.getVehicleDetailReport(
      parseInt(vehicleId),
      startDate,
      endDate,
    );
  }

  @Get('const-site')
  getTotalM3ByConstSite(
    @Query('constSiteId') constSiteId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (!constSiteId) {
      throw new BadRequestException('Se requiere: constSiteId');
    }
    return this.service.getTotalM3ByConstSite(parseInt(constSiteId), startDate, endDate);
  }

  @Get('planning')
  getTotalM3ByPlanning(@Query('planningId') planningId: string) {
    if (!planningId) {
      throw new BadRequestException('Se requiere: planningId');
    }
    return this.service.getTotalM3ByPlanning(parseInt(planningId));
  }

  @Get('clients')
  getClients() {
    return this.service.getClients();
  }

  @Get('client')
  getClientReport(
    @Query('clientId') clientId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!clientId || !startDate || !endDate) {
      throw new BadRequestException(
        'Se requieren: clientId, startDate, endDate',
      );
    }
    return this.service.getClientTransportReport(
      parseInt(clientId),
      startDate,
      endDate,
    );
  }

  @Get('supervisors')
  getSupervisors() {
    return this.service.getSupervisors();
  }

  @Get('supervisor')
  getSupervisorReport(
    @Query('supervisorId') supervisorId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!supervisorId || !startDate || !endDate) {
      throw new BadRequestException(
        'Se requieren: supervisorId, startDate, endDate',
      );
    }
    return this.service.getSupervisorReport(
      parseInt(supervisorId),
      startDate,
      endDate,
    );
  }

  @Get('jefes')
  getJefesDeObra() {
    return this.service.getJefesDeObra();
  }

  @Get('material-constsite')
  getMaterialByConstSite(
    @Query('materialId') materialId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('constSiteId') constSiteId?: string,
  ) {
    if (!materialId || !startDate || !endDate) {
      throw new BadRequestException(
        'Se requieren: materialId, startDate, endDate',
      );
    }
    return this.service.getMaterialByConstSite(
      parseInt(materialId),
      startDate,
      endDate,
      constSiteId ? parseInt(constSiteId) : undefined,
    );
  }

  @Get('material-providers-list')
  getMaterialProviders() {
    return this.service.getMaterialProviders();
  }

  @Get('material-provider-report')
  getMaterialProviderReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('providerId') providerId?: string,
    @Query('canteraId') canteraId?: string,
    @Query('factura') factura?: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException('Se requieren: startDate, endDate');
    }
    return this.service.getMaterialProviderReport({
      startDate,
      endDate,
      providerId: providerId ? parseInt(providerId) : undefined,
      canteraId: canteraId ? parseInt(canteraId) : undefined,
      factura: factura || undefined,
    });
  }

  @Get('material-planning')
  getMaterialByPlanning(
    @Query('planningId') planningId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!planningId || !startDate || !endDate) {
      throw new BadRequestException(
        'Se requieren: planningId, startDate, endDate',
      );
    }
    return this.service.getMaterialByPlanning(
      parseInt(planningId),
      startDate,
      endDate,
    );
  }
}