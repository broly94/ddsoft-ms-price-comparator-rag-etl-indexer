import { Module } from '@nestjs/common';
import { BatchProcessorService } from './batch-processor.service';
import { EmbeddingModule } from '@/embedding/embedding.module';
import { QdrantModule } from '@/qdrant/qdrant.module';
import { DataNormalizerService } from '@/normalizer/data-normalizer.service';
import { NormalizerModule } from '@/normalizer/normalizer.module';

@Module({
  imports: [NormalizerModule, EmbeddingModule, QdrantModule],
  providers: [BatchProcessorService],
  exports: [BatchProcessorService],
})
export class BatchProcessorModule {}
