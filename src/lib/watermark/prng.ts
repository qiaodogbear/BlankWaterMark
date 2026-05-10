export function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x9e3779b9;
}

export function createPrng(seedText: string): () => number {
  let state = hashSeed(seedText);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

export function shuffledIndices(length: number, seedText: string): Uint32Array {
  const values = new Uint32Array(length);
  for (let i = 0; i < length; i += 1) {
    values[i] = i;
  }

  const random = createPrng(seedText);
  for (let i = length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = values[i];
    values[i] = values[j];
    values[j] = tmp;
  }

  return values;
}

export function normalizeKey(key?: string): string {
  const value = key?.trim();
  return value ? value : 'blind-watermark-default-placement-key';
}
