import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { QdrantService } from '../qdrant/qdrant.service';

@Injectable()
export class EtlService {
  constructor(
    // Inyectamos el cliente para comunicarnos con gescom-data-access
    @Inject('GESCOM_SERVICE') private readonly gescomClient: ClientProxy,
    private readonly qdrantService: QdrantService,
  ) {}

  async runProductEtl() {
    try {
      console.log('Iniciando proceso ETL de productos...');

      // 1. Pedir los datos a gescom-data-access
      console.log('Solicitando productos a gescom-data-access...');
      const products = await firstValueFrom(
        this.gescomClient.send({ cmd: 'get_simulated_products' }, {}),
      );

      if (!products || products.length === 0) {
        console.log('No se recibieron productos de gescom-data-access. Finalizando ETL.');
        return { message: 'No se encontraron productos para indexar.' };
      }

      console.log(`Se recibieron ${products.length} productos.`);

      // 2. Indexar los datos en Qdrant
      await this.qdrantService.upsertProducts(products);

      console.log('Proceso ETL de productos completado exitosamente.');
      return {
        message: 'ETL completado. Productos indexados en Qdrant.',
        productsCount: products.length,
      };
    } catch (error) {
      console.error('Ocurrió un error durante el proceso ETL:', error);
      // Aquí podrías lanzar una excepción o manejar el error como prefieras
      throw new Error('El proceso ETL falló.');
    }
  }
}
