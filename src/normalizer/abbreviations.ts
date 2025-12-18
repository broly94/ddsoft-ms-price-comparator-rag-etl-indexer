// src/normalizer/abbreviations.ts

// Este objeto define las reglas de reemplazo.
// La clave es la abreviatura que se buscará (como palabra completa).
// El valor es el texto por el cual será reemplazada.
export const abbreviations = {
  // Nuevas reglas específicas
  's/az': 'sin azucar',
  's/sal': 'sin sal',
  desc: 'descarozada',
  descaro: 'descarozada',

  // Abreviaturas generales de productos
  mer: 'mermelada',
  merm: 'mermelada',
  ara: 'arandano',
  lim: 'limon',
  zan: 'zanahoria',
  tom: 'tomate',
  choc: 'chocolate',
  nar: 'naranja',
  manz: 'manzana',
  frut: 'frutilla',
  yogu: 'yogur',
  yog: 'yogur',
  nat: 'natural',
  descrem: 'descremado',
  ent: 'entero',

  // Abreviaturas de unidades o características
  gallet: 'galleta',
  galle: 'galleta',
  'c/': 'con',

  // Correcciones comunes
  frutilla: 'frutilla',
  frutillas: 'frutilla',
  frutill: 'frutilla',
  frutillla: 'frutilla',
  'frut.rojas': 'frutos rojos',
  'frut rojo': 'frutos rojos',
  'frut.rojo': 'frutos rojos',
  celiac: 'celiaco',
  azuc: 'azucar',
  edulc: 'edulcorante',
  diet: 'dietetico',
  ligth: 'light',
  lig: 'light',
};
