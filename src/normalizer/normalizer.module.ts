import { Module } from '@nestjs/common';
import { DataNormalizerService } from '@/normalizer/data-normalizer.service';

@Module({
  providers: [DataNormalizerService],
  exports: [DataNormalizerService],
})
export class NormalizerModule {}
