// src/embedding/gemini-embedding.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';

interface EmbeddingBatchResult {
  embeddings: number[][];
  success: boolean;
  error?: string;
}

@Injectable()
export class GeminiEmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(GeminiEmbeddingService.name);
  private genAI: GoogleGenerativeAI;
  private readonly modelName = 'text-embedding-004';
  private readonly embeddingDimension = 768;

  // Configuración de límites
  private readonly maxBatchSize = 100;
  private readonly delayBetweenBatches = 2000; // 2 segundos para cumplir ~30 RPM

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('GOOGLE_GEMINI_API_KEY');

    if (!apiKey) {
      throw new Error(
        'La variable de entorno GOOGLE_GEMINI_API_KEY no está configurada.',
      );
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.logger.log(
      `✅ Gemini Embedding Service inicializado - Modelo: ${this.modelName}, Dimensión: ${this.embeddingDimension}`,
    );
  }

  /**
   * Genera embeddings para una lista de textos (Optimizado para INDEXACIÓN)
   * Usa TaskType.RETRIEVAL_DOCUMENT por defecto.
   */
  async generateEmbeddings(
    texts: string[],
    taskType: TaskType = TaskType.RETRIEVAL_DOCUMENT,
  ): Promise<number[][]> {
    if (!texts || texts.length === 0) return [];

    this.logger.log(
      `🚀 Generando embeddings (${taskType}) para ${texts.length} textos...`,
    );

    const startTime = Date.now();
    const allEmbeddings: number[][] = [];
    const totalBatches = Math.ceil(texts.length / this.maxBatchSize);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * this.maxBatchSize;
      const batchEnd = Math.min(batchStart + this.maxBatchSize, texts.length);
      const batch = texts.slice(batchStart, batchEnd);
      const batchNum = batchIndex + 1;

      try {
        const batchResult = await this.processBatchWithRetry(
          batch,
          batchNum,
          taskType,
        );

        if (batchResult.success) {
          allEmbeddings.push(...batchResult.embeddings);
        } else {
          this.logger.warn(
            `⚠️ Batch ${batchNum} falló. Usando vectores de ceros.`,
          );
          allEmbeddings.push(...this.createZeroEmbeddings(batch.length));
        }

        if (batchNum < totalBatches) {
          await this.delay(this.delayBetweenBatches);
        }
      } catch (error) {
        this.logger.error(`❌ Error crítico en batch ${batchNum}:`, error);
        allEmbeddings.push(...this.createZeroEmbeddings(batch.length));
      }
    }

    const processingTime = (Date.now() - startTime) / 1000;
    this.logger.log(
      `🎉 Finalizado: ${allEmbeddings.length} embeddings en ${processingTime.toFixed(2)}s`,
    );

    return allEmbeddings;
  }

  /**
   * Genera un embedding para una CONSULTA de búsqueda (Optimizado para SEARCH)
   * Usa TaskType.RETRIEVAL_QUERY.
   */
  async generateQueryEmbedding(query: string): Promise<number[]> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.modelName });

      const result = await model.embedContent({
        content: { parts: [{ text: query }], role: 'user' },
        taskType: TaskType.RETRIEVAL_QUERY,
      });

      if (!result.embedding?.values) throw new Error('Respuesta vacía');

      return Array.from(result.embedding.values);
    } catch (error) {
      this.logger.error(`❌ Error en Query Embedding: ${error.message}`);
      return this.createZeroEmbeddings(1)[0];
    }
  }

  private async processBatchWithRetry(
    batch: string[],
    batchNum: number,
    taskType: TaskType,
    maxRetries: number = 3,
  ): Promise<EmbeddingBatchResult> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) await this.delay(2000 * attempt);

        const embeddings = await this.processSingleBatch(batch, taskType);
        return { embeddings, success: true };
      } catch (error: any) {
        lastError = error;
        const isRateLimit =
          error.message?.includes('429') || error.message?.includes('quota');

        this.logger.warn(
          `⚠️ Intento ${attempt} (Batch ${batchNum}) falló: ${error.message}`,
        );

        if (isRateLimit) await this.delay(5000 * attempt);
      }
    }

    return { embeddings: [], success: false, error: lastError?.message };
  }

  private async processSingleBatch(
    batch: string[],
    taskType: TaskType,
  ): Promise<number[][]> {
    const model = this.genAI.getGenerativeModel({ model: this.modelName });

    // Mapeo de solicitudes con la configuración de dimensiones
    const requests = batch.map((text) => ({
      content: { parts: [{ text }], role: 'user' },
      taskType: taskType,
    }));

    const response = await model.batchEmbedContents({ requests });

    if (!response.embeddings || response.embeddings.length !== batch.length) {
      throw new Error('Respuesta de batch incompleta');
    }

    return response.embeddings.map((e) =>
      e.values ? Array.from(e.values) : this.createZeroEmbeddings(1)[0],
    );
  }

  /**
   * Mantiene compatibilidad con el método simple
   */
  async generateEmbedding(text: string): Promise<number[]> {
    return this.generateQueryEmbedding(text);
  }

  private createZeroEmbeddings(count: number): number[][] {
    return Array(count)
      .fill(null)
      .map(() => Array(this.embeddingDimension).fill(0));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const vec = await this.generateQueryEmbedding('health check');
      return vec.length === this.embeddingDimension && vec.some((v) => v !== 0);
    } catch {
      return false;
    }
  }

  getEmbeddingDimension(): number {
    return this.embeddingDimension;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
