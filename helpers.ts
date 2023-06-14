import type { IConfig } from './types';

export const defaultConfig: IConfig = {
  url: '',
  urlAdditionalGenerator: null,
  maxNumberOfReconnects: Infinity, // -1 means no reconnects after the fall of backend
  pauseBetweenReconnects: 0, // 0 is for random to spare back-end
  connectTimeout: 5000,
  serializer: JSON.stringify,
  deserializer: JSON.parse,
  binaryType: 'arraybuffer' // or 'blob' if specified
}

export function isFunc(arg: unknown): arg is Function {
  return Boolean(arg) && typeof arg === 'function'
}

export function isObject(arg: unknown): boolean {
  return arg?.constructor.name === 'Object'
}
