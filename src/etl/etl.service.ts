// src/etl/etl.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { BatchProcessorService } from '../batch-processor/batch-processor.service';
import { GescomProduct } from '../normalizer/interfaces/gescom-product.interface';

@Injectable()
export class EtlService {
  private readonly logger = new Logger(EtlService.name);

  constructor(
    @Inject('GESCOM_SERVICE') private readonly gescomClient: ClientProxy,
    private readonly batchProcessor: BatchProcessorService,
  ) {}

  async runProductEtl() {
    try {
      this.logger.log('Iniciando proceso ETL de productos.');

      // 1. Obtener productos
      this.logger.log('Llamando a gescom-data-access para obtener productos...');
      const startTime = Date.now();

      const products: GescomProduct[] = await firstValueFrom(
        this.gescomClient.send({ cmd: 'get_products' }, {}),
      );

      const fetchTime = (Date.now() - startTime) / 1000;
      this.logger.log(
        `Se obtuvieron ${
          products?.length || 0
        } productos en ${fetchTime}s.`,
      );

      if (!products || products.length === 0) {
        this.logger.warn('No se recibieron productos. Proceso ETL finalizado.');
        return { message: 'No hay productos para procesar.' };
      }

      // 2. Procesar todos los productos
      this.logger.log(
        `Iniciando procesamiento en batch para ${products.length} productos...`,
      );
      const fullStart = Date.now();
      const fullResult = await this.batchProcessor.processProducts(products);
      const fullTime = (Date.now() - fullStart) / 1000;

      this.logger.log(`Proceso completo en ${fullTime}s.`);
      return fullResult;
    } catch (error) {
      this.logger.error(
        'Error crítico durante el proceso ETL.',
        error.stack,
      );
      throw error;
    }
  }
}
