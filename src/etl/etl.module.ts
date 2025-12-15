import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { EtlController } from './etl.controller';
import { EtlService } from './etl.service';
import { QdrantModule } from '../qdrant/qdrant.module';

@Module({
  imports: [
    // Importamos QdrantModule para tener acceso a QdrantService
    QdrantModule,
    // Configuramos el cliente para comunicarnos con el microservicio gescom-data-access
    ClientsModule.register([
      {
        name: 'GESCOM_SERVICE', // El mismo token que usamos para inyectar el cliente
        transport: Transport.REDIS,
        options: {
          host: process.env.REDIS_HOST || 'redis', // Usamos variable de entorno o el default
          port: parseInt(process.env.REDIS_PORT as any, 10) || 6379,
        },
      },
    ]),
  ],
  controllers: [EtlController],
  providers: [EtlService],
})
export class EtlModule {}
