import { Test, TestingModule } from '@nestjs/testing';
import { MaterialProvidersController } from './material-providers.controller';

describe('MaterialProvidersController', () => {
  let controller: MaterialProvidersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaterialProvidersController],
    }).compile();

    controller = module.get<MaterialProvidersController>(MaterialProvidersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
