import { Global, Module } from '@nestjs/common';
import { PermissionGuard } from './guards/permission.guard';

/// Global igual que PrismaModule: PermissionGuard se referencia por clase en
/// `@UseGuards(AuthGuard('jwt'), PermissionGuard)` en cada controller, y así
/// no hace falta importar este módulo en los 11 módulos que lo usan.
@Global()
@Module({
  providers: [PermissionGuard],
  exports: [PermissionGuard],
})
export class CommonModule {}
