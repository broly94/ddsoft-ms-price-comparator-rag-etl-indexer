
// src/normalizer/data-normalizer.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { GescomProduct } from '@/normalizer/interfaces/gescom-product.interface';
import { NormalizedProduct } from '@/normalizer/interfaces/normalized-product.interface';
import { ProductPayload } from '@/normalizer/interfaces/product-payload.interface';
import { abbreviations } from './abbreviations';

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

  // Objeto de abreviaciones para expandir descripciones
  private readonly descriptionExpansions = abbreviations;

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
    let { marca, descripcion } = this.parseDescription(product.Descripcion);

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

    // 5. Expandir abreviaturas en la descripción (AHORA SE HACE ANTES)
    descripcion = this.expandAbbreviations(descripcion);

    // 6. Crear texto para embedding (usando la descripción ya expandida)
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

    // 7. Construir objeto normalizado
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

    // 1. Normalizar unidades de texto explícitas primero
    const normalizedWithUnits = pesoStr
      .replace(/KILOS?|KGS?|K$/, 'KG') // KILO, KILOS, KG, KGS, K -> KG
      .replace(/GRAMOS?|GRS?/, 'G') // GRAMO, GRAMOS, GR, GRS -> G
      .replace(/LITROS?|LTS?/, 'L') // LITRO, LITROS, LT, LTS -> L
      .replace(/CC|CM3|MLITROS?/, 'ML'); // CC, CM3, MILILITRO, MILILITROS -> ML

    // Si la normalización de texto cambió la cadena, es porque encontró una unidad.
    if (normalizedWithUnits !== pesoStr || /[A-Z]/.test(normalizedWithUnits)) {
      return normalizedWithUnits;
    }

    // 2. Si no hay unidades de texto, procesar como valor puramente numérico (asumiendo gramos o kg)
    const numMatch = pesoStr.match(/^(\d+\.?\d*)$/);
    if (numMatch) {
      const numValue = parseFloat(numMatch[1]);
      if (numValue < 1) {
        // Ej: 0.15 → 150G (asumiendo que es una fracción de KG)
        return `${numValue * 1000}G`;
      }
      // Ej: 150 → 150G, 1000 -> 1KG
      if (numValue >= 1000 && numValue % 1000 === 0) {
        return `${numValue / 1000}KG`;
      }
      return `${numValue}G`;
    }

    // Si no coincide con nada, devolver la cadena original normalizada.
    return normalizedWithUnits;
  }

  private buildTextForEmbedding(product: any): string {
    // Divide la descripción en palabras, quita la última y las vuelve a unir.
    const descriptionWithoutWeight = product.descripcion
      .split(' ')
      .slice(0, -1)
      .join(' ');

    return `
      Marca: ${product.marca}; Descripcion: ${descriptionWithoutWeight}; Calibre: ${product.peso};
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

  private expandAbbreviations(description: string): string {
    let expandedDescription = description;

    // Helper para escapar caracteres especiales en la abreviatura para usarla en un regex
    const escapeRegExp = (str: string) =>
      str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Iterar sobre el objeto de abreviaciones
    for (const [abbreviation, fullText] of Object.entries(
      this.descriptionExpansions,
    )) {
      const escapedAbbr = escapeRegExp(abbreviation);

      // La regex busca la abreviatura como una palabra completa, permitiendo
      // que esté rodeada por el inicio/fin de la cadena o por cualquier
      // caracter que NO sea una letra o número (ej: espacio, punto, guion, barra).
      const regex = new RegExp(`(^|\\W)${escapedAbbr}(\\W|$)`, 'gi');

      // El reemplazo utiliza $1 y $2 para reinsertar los caracteres
      // que rodean a la abreviatura, preservando el formato original.
      expandedDescription = expandedDescription.replace(regex, `$1${fullText}$2`);
    }

    return expandedDescription;
  }
}
