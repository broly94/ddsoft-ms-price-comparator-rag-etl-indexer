import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { EtlController } from './etl.controller';
import { EtlService } from './etl.service';
import { QdrantModule } from '../qdrant/qdrant.module';
import { ConfigModule } from '@nestjs/config';
import { BatchProcessorModule } from '@/batch-processor/batch-processor.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    BatchProcessorModule,
    ClientsModule.register([
      {
        name: 'GESCOM_SERVICE',
        transport: Transport.REDIS,
        options: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
        },
      },
    ]),
  ],
  controllers: [EtlController],
  providers: [EtlService],
})
export class EtlModule {}
