import { Test, TestingModule } from '@nestjs/testing';
import { BatchProcessorService } from './batch-processor.service';

describe('BatchProcessorService', () => {
  let service: BatchProcessorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BatchProcessorService],
    }).compile();

    service = module.get<BatchProcessorService>(BatchProcessorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
