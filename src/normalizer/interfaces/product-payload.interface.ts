import { NormalizedProduct } from '@/normalizer/interfaces/normalized-product.interface';

// src/normalizer/interfaces/product-payload.interface.ts
export interface ProductPayload extends NormalizedProduct {
  unidad_count?: number;
}
