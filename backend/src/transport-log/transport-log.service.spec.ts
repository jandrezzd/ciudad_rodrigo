import { Test, TestingModule } from '@nestjs/testing';
import { TransportLogService } from './transport-log.service';

describe('TransportLogService', () => {
  let service: TransportLogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransportLogService],
    }).compile();

    service = module.get<TransportLogService>(TransportLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
