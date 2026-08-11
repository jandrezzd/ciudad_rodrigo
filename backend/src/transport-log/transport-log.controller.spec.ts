import { Test, TestingModule } from '@nestjs/testing';
import { TransportLogController } from './transport-log.controller';

describe('TransportLogController', () => {
  let controller: TransportLogController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransportLogController],
    }).compile();

    controller = module.get<TransportLogController>(TransportLogController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
