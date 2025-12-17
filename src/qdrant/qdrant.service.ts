// src/qdrant/qdrant.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import { NormalizedProduct } from '../normalizer/interfaces/normalized-product.interface';
import { ProductPayload } from '../normalizer/interfaces/product-payload.interface';

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private readonly client: QdrantClient;
  private readonly collectionName = 'supermarket_products';
  private readonly vectorSize = 768; // Gemini embedding-001

  constructor(private configService: ConfigService) {
    const qdrantUrl =
      this.configService.get<string>('QDRANT_URL') || 'http://localhost:6333';
    const apiKey = this.configService.get<string>('QDRANT_API_KEY');

    this.client = new QdrantClient({
      url: qdrantUrl,
      apiKey,
    });

    this.logger.log(`Qdrant client inicializado para: ${qdrantUrl}`);
  }

  async onModuleInit() {
    await this.ensureCollection();
  }

  private async ensureCollection() {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        (c) => c.name === this.collectionName,
      );

      if (!exists) {
        this.logger.log(`Creando colección: ${this.collectionName}`);
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: 'Cosine',
          },
        });

        await this.createIndexes();
        this.logger.log(`✅ Colección creada con dimensión ${this.vectorSize}`);
      } else {
        this.logger.log(`✅ Colección ya existe: ${this.collectionName}`);
      }
    } catch (error) {
      this.logger.error('Error asegurando colección:', error);
      throw error;
    }
  }

  private async createIndexes() {
    try {
      await this.client.createPayloadIndex(this.collectionName, {
        field_name: 'marca',
        field_schema: 'keyword',
      });

      await this.client.createPayloadIndex(this.collectionName, {
        field_name: 'peso',
        field_schema: 'keyword',
      });

      await this.client.createPayloadIndex(this.collectionName, {
        field_name: 'codigo',
        field_schema: 'integer',
      });

      this.logger.log('Índices creados correctamente');
    } catch (error) {
      this.logger.warn('Error creando índices:', error);
    }
  }

  async upsertProductsWithEmbeddings(
    products: NormalizedProduct[],
    embeddings: number[][],
  ) {
    if (products.length !== embeddings.length) {
      throw new Error('Número de productos y embeddings no coincide');
    }

    this.logger.log(`Upsert de ${products.length} productos con embeddings...`);

    const points = products.map((product, index) => ({
      id: this.normalizeId(product.codigo),
      vector: embeddings[index],
      payload: this.buildQdrantPayload(product),
    }));

    // Upsert en batches de 100
    const batchSize = 100;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);

      await this.client.upsert(this.collectionName, {
        wait: true,
        points: batch,
      });

      this.logger.log(
        `Batch ${Math.floor(i / batchSize) + 1} procesado: ${batch.length} puntos`,
      );

      // Pequeño delay entre batches
      if (i + batchSize < points.length) {
        await this.delay(500);
      }
    }

    this.logger.log(`✅ ${points.length} puntos upsertados en Qdrant`);
  }

  private buildQdrantPayload(product: NormalizedProduct): Record<string, any> {
    return {
      codigo: product.codigo,
      descripcion: product.descripcion,
      marca: product.marca,
      rubro_descripcion: product.rubro_descripcion,
      peso: product.peso,
      stock_unidad: product.stock_unidad,
      uxbcompra: product.uxbcompra,
      stock_bultos: product.stock_bultos,
      precio_costo: product.precio_costo,
      preciofinal: product.preciofinal,
      precio_l1_5: product.precio_l1_5,
      precio_l1_11: product.precio_l1_11,
      texto_para_embedding: product.texto_para_embedding,
    };
  }

  private normalizeId(idVal: any): number {
    if (typeof idVal === 'number') {
      return Math.abs(idVal);
    }

    const str = String(idVal);
    try {
      const num = parseInt(str, 10);
      if (num >= 0) return num;
    } catch {}

    // Hash function similar a Python
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convertir a 32-bit
    }
    return Math.abs(hash);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
