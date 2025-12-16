// src/embedding/embedding.module.ts
import { Module, Global } from '@nestjs/common';
import { GeminiEmbeddingService } from './gemini-embedding.service';

@Global()
@Module({
  imports: [],
  providers: [GeminiEmbeddingService],
  exports: [GeminiEmbeddingService],
})
export class EmbeddingModule {}
