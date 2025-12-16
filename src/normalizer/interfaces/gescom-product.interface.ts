// src/normalizer/interfaces/gescom-product.interface.ts
export interface GescomProduct {
  Codigo: string;
  Descripcion: string;
  Rubro_Descripcion: string;
  CostoSDesc: number;
  PrecioFinal: number;
  Stock: number;
  Calibre_Descripcion: string;
  UXBCompra: number;
  Linea: number | string;
}
