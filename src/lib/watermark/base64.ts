export function bytesToBase64(bytes: Uint8Array): string {
  const bufferCtor = globalThis.Buffer;
  if (bufferCtor) {
    return bufferCtor.from(bytes).toString('base64');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const bufferCtor = globalThis.Buffer;
  if (bufferCtor) {
    return new Uint8Array(bufferCtor.from(base64, 'base64'));
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
