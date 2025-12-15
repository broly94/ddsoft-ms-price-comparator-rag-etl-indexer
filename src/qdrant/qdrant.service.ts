import { Injectable, OnModuleInit } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
// Corregido según tu indicación

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly client: QdrantClient;
  private readonly collectionName = 'products';
  // NOTA: El tamaño del vector (10) es un valor temporal.
  // Deberá coincidir con el tamaño del vector que genere el modelo de embeddings real.
  private readonly vectorSize = 10;

  constructor() {
    this.client = new QdrantClient({ url: process.env.QDRANT_URL });
  }

  async onModuleInit() {
    await this.ensureCollectionExists();
  }

  private async ensureCollectionExists() {
    const result = await this.client.getCollections();
    const collectionExists = result.collections.some(
      (collection) => collection.name === this.collectionName,
    );

    if (!collectionExists) {
      console.log(`Creando colección en Qdrant: "${this.collectionName}"`);
      await this.client.createCollection(this.collectionName, {
        vectors: {
          size: this.vectorSize,
          distance: 'Cosine',
        },
      });
    }
  }

  async upsertProducts(products: any[]) {
    if (!products || products.length === 0) {
      return;
    }

    console.log(`Indexando ${products.length} productos en Qdrant...`);

    const points = products.map((product) => ({
      id: product.id,
      // NOTA: Usamos un vector simulado. Esto deberá ser reemplazado
      // por el vector real generado por un modelo de embeddings.
      vector: Array(this.vectorSize).fill(0.0),
      payload: product,
    }));

    // El cliente 'qdrant-client' espera el nombre de la colección como primer argumento
    await this.client.upsert(this.collectionName, {
      wait: true,
      points,
    });

    console.log('Productos indexados correctamente en Qdrant.');
  }
}
