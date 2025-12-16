// src/embedding/embedding.module.ts
import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GeminiEmbeddingService } from './gemini-embedding.service';

@Global()
@Module({
  imports: [ConfigModule.forRoot()],
  providers: [GeminiEmbeddingService],
  exports: [GeminiEmbeddingService],
})
export class EmbeddingModule {}
