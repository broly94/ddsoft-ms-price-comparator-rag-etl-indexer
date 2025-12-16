// src/normalizer/interfaces/normalized-product.interface.ts
export interface NormalizedProduct {
  codigo: string;
  descripcion: string;
  marca: string;
  rubro_descripcion: string;
  peso: string;
  stock_unidad: number;
  uxbcompra: number;
  stock_bultos: number;
  precio_costo: number;
  preciofinal: number;
  precio_l1_5: number;
  precio_l1_11: number;
  texto_para_embedding: string;
}
