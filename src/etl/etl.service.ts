// src/etl/etl.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Cron } from '@nestjs/schedule';
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

  /**
   * CronJob que se ejecuta de Lunes a Viernes a las 19:00 (hora de Argentina).
   * Este job inicia el proceso ETL para los productos.
   * La zona horaria 'America/Argentina/Buenos_Aires' asegura que el job se ajuste
   * automáticamente a los cambios de horario de verano.
   */
  @Cron('0 19 * * 1-6', {
    name: 'productEtl',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  handleCron() {
    this.logger.log('Ejecutando ETL programado de productos...');
    this.runProductEtl();
  }

  async runProductEtl() {
    try {
      this.logger.log('Iniciando proceso ETL de productos.');

      // 1. Obtener productos
      this.logger.log(
        'Llamando a gescom-data-access para obtener productos...',
      );
      const startTime = Date.now();

      const products: GescomProduct[] = await firstValueFrom(
        this.gescomClient.send({ cmd: 'get_products' }, {}),
      );

      const fetchTime = (Date.now() - startTime) / 1000;
      this.logger.log(
        `Se obtuvieron ${products?.length || 0} productos en ${fetchTime}s.`,
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
      this.logger.error('Error crítico durante el proceso ETL.', error.stack);
      throw error;
    }
  }
}
