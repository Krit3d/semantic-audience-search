import { useEffect, useState } from 'react';
import { api, type BrandItem } from './api';

let cache: BrandItem[] | null = null;

export function invalidateBrandsCache(): void {
  cache = null;
}

export function useBrands(): BrandItem[] {
  const [brands, setBrands] = useState<BrandItem[]>(cache ?? []);

  useEffect(() => {
    let active = true;
    api.getBrands()
      .then(list => {
        cache = list;
        if (active) setBrands(list);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  return brands;
}

export function findBrand(brands: BrandItem[], key: string): BrandItem | undefined {
  return brands.find(b => String(b.id) === key) ?? brands.find(b => b.name === key);
}

export function brandLetter(brand: BrandItem | undefined, fallback = '?'): string {
  return (brand?.name ?? fallback).trim().slice(0, 1).toUpperCase() || '?';
}
