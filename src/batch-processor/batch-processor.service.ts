// src/batch-processor/batch-processor.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { DataNormalizerService } from '../normalizer/data-normalizer.service';
import { GeminiEmbeddingService } from '../embedding/gemini-embedding.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { GescomProduct } from '../normalizer/interfaces/gescom-product.interface';

@Injectable()
export class BatchProcessorService {
  private readonly logger = new Logger(BatchProcessorService.name);

  // Configuración optimizada para 1,900 productos
  private readonly EMBEDDING_BATCH_SIZE = 100; // Máximo Gemini
  private readonly QDRANT_BATCH_SIZE = 100; // Tamaño óptimo Qdrant
  private readonly PRODUCT_BATCH_SIZE = 200; // 200 productos por ciclo
  private readonly DELAY_BETWEEN_BATCHES = 2000; // 2 segundos

  constructor(
    private readonly normalizer: DataNormalizerService,
    private readonly embeddingService: GeminiEmbeddingService,
    private readonly qdrantService: QdrantService,
  ) {
    this.logger.log('Batch Processor Service inicializado');
  }

  async processProducts(products: GescomProduct[]) {
    const startTime = Date.now();
    this.logger.log(
      `🚀 Iniciando procesamiento de ${products.length} productos`,
    );

    try {
      // 1. Normalizar todos los productos
      this.logger.log('📊 Normalizando productos...');
      const normalizedProducts = this.normalizer.normalizeProducts(products);
      this.logger.log(`✅ ${normalizedProducts.length} productos normalizados`);

      // 2. Procesar en batches
      const totalProcessed = await this.processInBatches(normalizedProducts);

      // 3. Calcular métricas
      const processingTime = (Date.now() - startTime) / 1000;
      const speed = totalProcessed / processingTime;
      const successRate = (totalProcessed / normalizedProducts.length) * 100;

      this.logger.log(
        `🎉 Procesamiento completado en ${processingTime.toFixed(2)}s`,
      );
      this.logger.log(
        `📊 Resultado: ${totalProcessed}/${normalizedProducts.length} productos (${successRate.toFixed(1)}% éxito)`,
      );
      this.logger.log(`⚡ Velocidad: ${speed.toFixed(2)} productos/segundo`);

      return {
        success: true,
        processed: totalProcessed,
        total: normalizedProducts.length,
        successRate: `${successRate.toFixed(1)}%`,
        processingTime: `${processingTime.toFixed(2)}s`,
        speed: `${speed.toFixed(2)} productos/s`,
      };
    } catch (error) {
      this.logger.error('💥 Error en procesamiento:', error);
      throw error;
    }
  }

  private async processInBatches(products: any[]): Promise<number> {
    let totalProcessed = 0;
    const totalBatches = Math.ceil(products.length / this.PRODUCT_BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * this.PRODUCT_BATCH_SIZE;
      const batchEnd = Math.min(
        batchStart + this.PRODUCT_BATCH_SIZE,
        products.length,
      );
      const batch = products.slice(batchStart, batchEnd);
      const batchNum = batchIndex + 1;

      this.logger.log(
        `🔨 Procesando batch ${batchNum}/${totalBatches} (${batch.length} productos)`,
      );

      try {
        const processedInBatch = await this.processProductBatch(
          batch,
          batchNum,
        );
        totalProcessed += processedInBatch;

        // Delay entre batches (excepto el último)
        if (batchNum < totalBatches) {
          await this.delay(this.DELAY_BETWEEN_BATCHES);
        }
      } catch (error) {
        this.logger.error(`❌ Error en batch ${batchNum}:`, error);
        // Continuar con siguiente batch
      }
    }

    return totalProcessed;
  }

  private async processProductBatch(
    products: any[],
    batchNum: number,
  ): Promise<number> {
    const batchStart = Date.now();

    // 1. Extraer textos para embedding
    const textsForEmbedding = products.map((p) => p.texto_para_embedding);

    // 2. Generar embeddings
    this.logger.log(`   🧠 Generando embeddings para batch ${batchNum}...`);
    const embeddings =
      await this.embeddingService.generateEmbeddings(textsForEmbedding);

    if (embeddings.length !== products.length) {
      throw new Error(
        `Embeddings incompletos: ${embeddings.length} vs ${products.length}`,
      );
    }

    // 3. Cargar a Qdrant
    this.logger.log(`   💾 Cargando ${products.length} puntos en Qdrant...`);
    await this.qdrantService.upsertProductsWithEmbeddings(products, embeddings);

    const batchTime = (Date.now() - batchStart) / 1000;
    this.logger.log(
      `   ✅ Batch ${batchNum} completado en ${batchTime.toFixed(2)}s`,
    );

    return products.length;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
