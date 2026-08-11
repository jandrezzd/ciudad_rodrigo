import { Test, TestingModule } from '@nestjs/testing';
import { MaterialProvidersService } from './material-providers.service';

describe('MaterialProvidersService', () => {
  let service: MaterialProvidersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MaterialProvidersService],
    }).compile();

    service = module.get<MaterialProvidersService>(MaterialProvidersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
