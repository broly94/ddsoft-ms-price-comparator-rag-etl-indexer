// src/normalizer/data-normalizer.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { GescomProduct } from '@/normalizer/interfaces/gescom-product.interface';
import { NormalizedProduct } from '@/normalizer/interfaces/normalized-product.interface';
import { ProductPayload } from '@/normalizer/interfaces/product-payload.interface';

@Injectable()
export class DataNormalizerService {
  private readonly logger = new Logger(DataNormalizerService.name);

  // Columnas finales que queremos en el payload
  private readonly FINAL_COLUMNS = [
    'codigo',
    'descripcion',
    'marca',
    'rubro_descripcion',
    'peso',
    'stock_unidad',
    'uxbcompra',
    'stock_bultos',
    'precio_costo',
    'preciofinal',
    'precio_l1_5',
    'precio_l1_11',
    'texto_para_embedding',
  ];

  normalizeProducts(products: GescomProduct[]): NormalizedProduct[] {
    this.logger.log(`Normalizando ${products.length} productos...`);

    const excludedLines = ['5', '6', '7'];

    return products
      .filter((p) => {
        const lineaStr = String(p.Linea);
        return !excludedLines.includes(lineaStr);
      })
      .map((p) => this.normalizeSingleProduct(p));
  }

  private normalizeSingleProduct(product: GescomProduct): NormalizedProduct {
    // 1. Parsear descripción y marca
    const { marca, descripcion } = this.parseDescription(product.Descripcion);

    // 2. Aplicar reglas de negocio
    const precioCosto = this.calculatePrecioCosto(
      product.CostoSDesc,
      product.Rubro_Descripcion,
      descripcion,
    );

    const stockBultos = Math.floor(product.Stock / product.UXBCompra);

    // 3. Calcular precios con descuento
    const precioFinal = Number(product.PrecioFinal) || 0;
    const precioL1_5 = precioFinal * 0.95; // -5%
    const precioL1_11 = precioFinal * 0.89; // -11%

    // 4. Normalizar peso
    const pesoNormalizado = this.normalizeWeight(product.Calibre_Descripcion);

    // 5. Crear texto para embedding
    const textoParaEmbedding = this.buildTextForEmbedding({
      codigo: product.Codigo,
      rubro_descripcion: product.Rubro_Descripcion,
      marca,
      descripcion,
      peso: pesoNormalizado,
      stock_unidad: product.Stock,
      stockBultos,
      preciofinal: precioFinal,
    });

    // 6. Construir objeto normalizado
    return {
      codigo: this.cleanText(product.Codigo),
      descripcion: this.cleanText(descripcion),
      marca: this.cleanText(marca),
      rubro_descripcion: this.cleanText(product.Rubro_Descripcion),
      peso: pesoNormalizado,
      stock_unidad: product.Stock,
      uxbcompra: product.UXBCompra,
      stock_bultos: stockBultos,
      precio_costo: this.round(precioCosto, 2),
      preciofinal: this.round(precioFinal, 2),
      precio_l1_5: this.round(precioL1_5, 2),
      precio_l1_11: this.round(precioL1_11, 2),
      texto_para_embedding: textoParaEmbedding,
    };
  }

  private parseDescription(descripcionRaw: string): {
    marca: string;
    descripcion: string;
  } {
    const descParts = String(descripcionRaw).split('-');

    if (descParts.length >= 3) {
      return {
        marca: descParts[1]?.trim() || 'NO_MARCA',
        descripcion: descParts[2]?.trim() || descripcionRaw,
      };
    } else if (descParts.length === 2) {
      return {
        marca: descParts[0]?.trim() || 'NO_MARCA',
        descripcion: descParts[1]?.trim() || descripcionRaw,
      };
    }

    return {
      marca: 'NO_MARCA',
      descripcion: descripcionRaw.trim(),
    };
  }

  private calculatePrecioCosto(
    costoSDesc: number,
    rubroDescripcion: string,
    descripcion: string,
  ): number {
    const IVA_GENERAL = 1.21;
    const IVA_LEGGUMBRE = 1.105;

    let precioCosto = costoSDesc * IVA_GENERAL;

    const isLegumbre = rubroDescripcion
      .toUpperCase()
      .includes('LEGUMBRES Y SEMILLAS');
    const isArvejaPartida = descripcion
      .toUpperCase()
      .includes('ARVEJAS PARTIDAS');

    if (isLegumbre && !isArvejaPartida) {
      precioCosto = costoSDesc * IVA_LEGGUMBRE;
    }

    return precioCosto;
  }

  private normalizeWeight(peso: string): string {
    if (!peso) return 'S/P';

    const pesoStr = peso.toUpperCase().replace(/\s+/g, '').replace(',', '.');

    // Si es numérico (como 0.15), convertirlo a formato legible
    const numMatch = pesoStr.match(/^(\d+\.?\d*)/);
    if (numMatch) {
      const numValue = parseFloat(numMatch[1]);
      if (numValue < 1) {
        // Ej: 0.15 → 150G
        const grams = numValue * 1000;
        if (grams >= 1000) {
          return grams % 1000 === 0
            ? `${grams / 1000}KG`
            : `${(grams / 1000).toFixed(1)}KG`;
        }
        return `${grams}G`;
      } else {
        // Ej: 150 → 150G
        if (numValue >= 1000) {
          return numValue % 1000 === 0
            ? `${numValue / 1000}KG`
            : `${(numValue / 1000).toFixed(1)}KG`;
        }
        return `${numValue}G`;
      }
    }

    // Normalizar unidades de texto
    return pesoStr
      .replace(/KILOS|KGS?$/, 'KG')
      .replace(/GRAMOS|GRS?$/, 'G')
      .replace(/LITROS|LTS?$/, 'L')
      .replace(/CC|MLS?$/, 'ML');
  }

  private buildTextForEmbedding(product: any): string {
    return `
      Código: ${product.codigo};
      Rubro: ${product.rubro_descripcion};
      Marca: ${product.marca};
      Descripción: ${product.descripcion};
      Peso: ${product.peso};
      Stock Unidad: ${product.stock_unidad};
      Stock Bultos: ${product.stock_bultos};
      Precio: $${product.preciofinal};
    `
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private cleanText(text: string): string {
    if (!text) return '';
    return text
      .toString()
      .trim()
      .replace(/[^a-zA-Z0-9\sñÑ,./-]/g, '')
      .replace(/\s{2,}/g, ' ');
  }

  private round(num: number, decimals: number = 2): number {
    return (
      Math.round((num + Number.EPSILON) * Math.pow(10, decimals)) /
      Math.pow(10, decimals)
    );
  }

  extractUnitCount(description: string): number | null {
    if (!description) return null;

    const desc = description.toLowerCase();

    // Patrón: <NUM> <UNIT>
    const numUnitMatch = desc.match(
      /(\d+)\s*(?:uni(?:dad)?es?|un|u\.?|sobres|pack|caja|blister)/,
    );
    if (numUnitMatch) {
      return parseInt(numUnitMatch[1], 10);
    }

    // Patrón: x<NUM>
    const xNumMatch = desc.match(/x\s*(\d+)/);
    if (xNumMatch) {
      return parseInt(xNumMatch[1], 10);
    }

    return null;
  }

  buildProductPayload(product: NormalizedProduct): ProductPayload {
    const unitCount = this.extractUnitCount(product.descripcion);

    return {
      ...product,
      unidad_count: unitCount || undefined,
    };
  }
}
