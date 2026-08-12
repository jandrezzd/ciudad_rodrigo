import { Test, TestingModule } from '@nestjs/testing';
import { TransportLogController } from './transport-log.controller';
import { TransportLogService } from './transport-log.service';

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
      ],
    }).compile();

    controller = module.get<TransportLogController>(TransportLogController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
