import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EtlModule } from './etl/etl.module';
import { NormalizerModule } from './normalizer/normalizer.module';
import { GeminiEmbeddingService } from '@/embedding/gemini-embedding.service';
import { EmbeddingModule } from './embedding/embedding.module';
import { BatchProcessorModule } from './batch-processor/batch-processor.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Hace que las variables de entorno estén disponibles en toda la app
    }),
    EtlModule,
    NormalizerModule,
    EmbeddingModule,
    BatchProcessorModule,
  ],
  controllers: [], // El controlador de app.controller.ts ya no es necesario
  providers: [GeminiEmbeddingService], // El servicio de app.service.ts ya no es necesario
})
export class AppModule {}
