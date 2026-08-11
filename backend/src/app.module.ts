import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { OwnersModule } from './owners/owners.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { ClientsModule } from './clients/clients.module';
import { ConstSitesModule } from './const-sites/const-sites.module';
import { PlanningsModule } from './plannings/plannings.module';
import { TransportLogModule } from './transport-log/transport-log.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { MaterialModule } from './material/material.module';
import { MaterialProvidersModule } from './material-providers/material-providers.module';
import { DriversModule } from './drivers/drivers.module';

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, OwnersModule, VehiclesModule, ClientsModule, ConstSitesModule, PlanningsModule, TransportLogModule, ReportsModule, DashboardModule, MaterialModule, MaterialProvidersModule, DriversModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
