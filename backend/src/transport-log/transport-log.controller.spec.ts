import { Test, TestingModule } from '@nestjs/testing';
import { TransportLogController } from './transport-log.controller';
import { TransportLogService } from './transport-log.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TransportLogController', () => {
  let controller: TransportLogController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransportLogController],
      providers: [
        {
          provide: TransportLogService,
          useValue: {},
        },
        // PermissionGuard (@UseGuards de la clase) necesita PrismaService
        // inyectado — no se usa en este test, solo hace falta poder resolverlo.
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<TransportLogController>(TransportLogController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
