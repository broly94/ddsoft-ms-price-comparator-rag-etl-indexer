import { Test, TestingModule } from '@nestjs/testing';
import { DataNormalizerService } from './data-normalizer.service';

describe('DataNormalizerService', () => {
  let service: DataNormalizerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DataNormalizerService],
    }).compile();

    service = module.get<DataNormalizerService>(DataNormalizerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
