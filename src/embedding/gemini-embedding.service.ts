// src/embedding/gemini-embedding.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';

interface EmbeddingBatchResult {
  embeddings: number[][];
  success: boolean;
  error?: string;
}

@Injectable()
export class GeminiEmbeddingService {
  private readonly logger = new Logger(GeminiEmbeddingService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly modelName = 'gemini-embedding-001';

  private readonly embeddingDimension = 3072;

  private readonly maxBatchSize = 100; // Límite de textos por batch en Gemini API (batchEmbedContents)

  // El límite oficial de Gemini para batchEmbedContents es 20 RPM (Requests Per Minute).
  private readonly requestsPerMinute = 60;

  // Para cumplir con el límite de 20 RPM, necesitamos un delay de al menos 3 segundos por batch (60s / 20 = 3s).
  // Se usa un valor ligeramente superior para tener un margen de seguridad.
  private readonly delayBetweenBatches = 2000; // 3.1 segundos

  constructor(private configService: ConfigService) {
    // const apiKey = this.configService.get<string>('GOOGLE_GEMINI_API_KEY');
    // if (!apiKey) {
    //   throw new Error(
    //     'La variable de entorno GOOGLE_GEMINI_API_KEY no está configurada.',
    //   );
    // }
    this.genAI = new GoogleGenerativeAI(
      'AIzaSyAv_VXpuXTTJB9vk3iydNRRM7c-zCieMvs',
    );
    this.logger.log(
      `Gemini Embedding Service inicializado - Modelo: ${this.modelName}, Dimensión: ${this.embeddingDimension}`,
    );
  }

  /**
   * Genera embeddings para una lista de textos.
   * El método está optimizado para manejar grandes volúmenes de texto de forma eficiente y robusta,
   * utilizando procesamiento por lotes (batches), reintentos automáticos y respetando los límites de la API.
   * @param texts Array de strings para los que se generarán embeddings.
   * @returns Una promesa que resuelve a un array de arrays de números (los embeddings).
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    this.logger.log(
      `🚀 Iniciando generación de embeddings para ${texts.length} textos...`,
    );

    const startTime = Date.now();
    const allEmbeddings: number[][] = [];
    const totalBatches = Math.ceil(texts.length / this.maxBatchSize);

    // Procesar en lotes (batches) para no exceder los límites de la API
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * this.maxBatchSize;
      const batchEnd = Math.min(batchStart + this.maxBatchSize, texts.length);
      const batch = texts.slice(batchStart, batchEnd);
      const batchNum = batchIndex + 1;

      this.logger.log(
        `🔨 Procesando batch ${batchNum}/${totalBatches} (${batch.length} textos)`,
      );

      try {
        const batchResult = await this.processBatchWithRetry(batch, batchNum);

        if (batchResult.success) {
          allEmbeddings.push(...batchResult.embeddings);
          this.logger.log(
            `✅ Batch ${batchNum} completado: ${batchResult.embeddings.length} embeddings generados.`,
          );
        } else {
          // Si el batch falla después de todos los reintentos, se usan embeddings de ceros como fallback.
          this.logger.warn(
            `⚠️  Batch ${batchNum} falló permanentemente. Usando embeddings de respaldo (ceros). Error: ${batchResult.error}`,
          );
          allEmbeddings.push(...this.createZeroEmbeddings(batch.length));
        }

        // Aplicar un delay entre batches para respetar el rate limit de la API, excepto en el último batch.
        if (batchNum < totalBatches) {
          await this.delay(this.delayBetweenBatches);
        }
      } catch (error) {
        this.logger.error(
          `❌ Error crítico no controlado en batch ${batchNum}:`,
          error,
        );
        allEmbeddings.push(...this.createZeroEmbeddings(batch.length));
      }
    }

    const processingTime = (Date.now() - startTime) / 1000;
    const embeddingsPerSecond = texts.length / processingTime;

    this.logger.log(
      `🎉 Embeddings completados: ${allEmbeddings.length} en ${processingTime.toFixed(2)}s (${embeddingsPerSecond.toFixed(2)} textos/s)`,
    );

    return allEmbeddings;
  }

  /**
   * Procesa un único batch con una política de reintentos para manejar errores transitorios de la API.
   * @param batch El array de textos a procesar.
   * @param batchNum El número de batch (para logging).
   * @param maxRetries El número máximo de reintentos.
   * @returns Un objeto con los embeddings y el estado del procesamiento.
   */
  private async processBatchWithRetry(
    batch: string[],
    batchNum: number,
    maxRetries: number = 3,
  ): Promise<EmbeddingBatchResult> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          const backoffDelay = 2000 * attempt;
          this.logger.log(
            `   ↳ Reintento ${attempt}/${maxRetries} para batch ${batchNum} tras espera de ${backoffDelay}ms`,
          );
          await this.delay(backoffDelay); // Backoff exponencial
        }

        const embeddings = await this.processSingleBatch(batch);

        return {
          embeddings,
          success: true,
        };
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          `   ⚠️  Intento ${attempt} para batch ${batchNum} falló: ${error.message}`,
        );

        // Si es un error de rate limit (429) o cuota, esperar más tiempo antes de reintentar.
        if (
          error.message?.includes('429') ||
          error.message?.includes('quota')
        ) {
          const rateLimitDelay = 5000 * attempt;
          this.logger.warn(
            `   ↳ Error de rate limit detectado. Esperando ${rateLimitDelay}ms...`,
          );
          await this.delay(rateLimitDelay);
        }
      }
    }

    return {
      embeddings: [],
      success: false,
      error:
        lastError?.message ||
        'Todos los reintentos fallaron sin un error específico.',
    };
  }

  /**
   * Envía una solicitud de embedding para un batch a la API de Gemini.
   * @param batch El array de textos a embeber.
   * @returns Un array con los embeddings generados.
   */
  private async processSingleBatch(batch: string[]): Promise<number[][]> {
    const model = this.genAI.getGenerativeModel({ model: this.modelName });

    const requests: any = batch.map((text) => ({
      content: {
        parts: [{ text }],
        role: 'user' as const, // El rol es requerido por la estructura, 'user' es un valor genérico para este caso.
      },
      taskType: TaskType.RETRIEVAL_DOCUMENT,
    }));

    const response = await model.batchEmbedContents({
      requests,
    });

    // Validar que la respuesta de la API sea completa y correcta.
    if (!response.embeddings || response.embeddings.length !== batch.length) {
      throw new Error(
        `Respuesta incompleta de la API: se recibieron ${response.embeddings?.length || 0} de ${batch.length} embeddings.`,
      );
    }

    return response.embeddings.map((embedding) => {
      if (!embedding.values) {
        // Esto no debería ocurrir si el embedding fue exitoso, pero es una salvaguarda.
        this.logger.warn(
          'Se recibió un embedding sin valores en la respuesta.',
        );
        return this.createZeroEmbeddings(1)[0];
      }
      return Array.from(embedding.values);
    });
  }

  /**
   * Genera un solo embedding, útil para búsquedas en tiempo real o tareas de baja latencia.
   * @param text El texto a embeber.
   * @returns El embedding como un array de números.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.modelName });

      const result = await model.embedContent({
        content: {
          parts: [{ text }],
          role: 'user' as const,
        },
        taskType: TaskType.RETRIEVAL_DOCUMENT,
      });

      if (!result.embedding?.values) {
        throw new Error('Respuesta de embedding vacía de la API.');
      }

      return Array.from(result.embedding.values);
    } catch (error) {
      this.logger.error('Error generando embedding único:', error);
      return this.createZeroEmbeddings(1)[0];
    }
  }

  /**
   * Genera embeddings para múltiples textos.
   * Wrapper para mantener compatibilidad, delega al método principal `generateEmbeddings`.
   */
  async generateEmbeddingsOptimized(
    texts: string[],
    // El parámetro batchSize se ignora para usar la configuración óptima del servicio.
    batchSize?: number,
  ): Promise<number[][]> {
    // Se delega la llamada al método principal `generateEmbeddings`,
    // que ya está optimizado para manejar cualquier cantidad de textos de forma robusta
    // con batching, reintentos y delays automáticos.
    return this.generateEmbeddings(texts);
  }

  /**
   * Crea embeddings de fallback (vectores de ceros).
   * @param count El número de embeddings de ceros a crear.
   * @returns Un array de embeddings de ceros.
   */
  private createZeroEmbeddings(count: number): number[][] {
    return Array(count)
      .fill(null)
      .map(() => Array(this.embeddingDimension).fill(0));
  }

  /**
   * Realiza una comprobación de salud del servicio, intentando generar un embedding de prueba.
   * @returns `true` si la comprobación es exitosa, `false` en caso contrario.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testText = 'health check';
      const embedding = await this.generateEmbedding(testText);

      // Verifica que el embedding tenga la dimensión correcta y no sea un vector de ceros.
      return (
        embedding.length === this.embeddingDimension &&
        embedding.some((val) => val !== 0)
      );
    } catch (error) {
      this.logger.error(
        'Health check para GeminiEmbeddingService falló:',
        error,
      );
      return false;
    }
  }

  /**
   * Obtiene estadísticas y configuración del servicio.
   */
  getStats(): {
    dimension: number;
    maxBatchSize: number;
    requestsPerMinute: number;
    modelName: string;
  } {
    return {
      dimension: this.embeddingDimension,
      maxBatchSize: this.maxBatchSize,
      requestsPerMinute: this.requestsPerMinute,
      modelName: this.modelName,
    };
  }

  /**
   * Retorna la dimensión de los embeddings generados por el servicio.
   */
  getEmbeddingDimension(): number {
    return this.embeddingDimension;
  }

  /**
   * Función de utilidad para crear un delay.
   * @param ms Tiempo de espera en milisegundos.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
