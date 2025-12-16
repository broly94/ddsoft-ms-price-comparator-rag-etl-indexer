import { Test, TestingModule } from '@nestjs/testing';
import { GeminiEmbeddingService } from './gemini-embedding.service';

describe('GeminiEmbeddingService', () => {
  let service: GeminiEmbeddingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GeminiEmbeddingService],
    }).compile();

    service = module.get<GeminiEmbeddingService>(GeminiEmbeddingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
