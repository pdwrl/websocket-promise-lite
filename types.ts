export type TMessageId = string
export type TDataDeserialized = Record<string, unknown>
export type TSerializer = (data: unknown) => string | ArrayBufferLike | Blob | ArrayBufferView
export type TDeserializer = (data: string) => TDataDeserialized
export type TResolver = (value?: unknown) => void
export type TRejector = (reason?: unknown) => void

export interface IWaitingOperation {
  msg: ReturnType<TSerializer>
  resolver: (data: ReturnType<TDeserializer>) => void
  dateTime: number
}

export interface IConfig {
  url: string
  urlAdditionalGenerator: (() => string) | null
  maxNumberOfReconnects: number
  pauseBetweenReconnects: number
  connectTimeout: number
  serializer: TSerializer
  deserializer: TDeserializer
  binaryType: 'arraybuffer' | 'blob',
  onConnectionOpen?: () => Promise<void>
  onConnectionClose?: (code: number, isClosedByTimer: boolean) => Promise<void>
  onBeforeReOpen?: (reconnectCount: number, maxNumberOfReconnects: number) => Promise<void>
  onConnectionReOpen?: () => Promise<void>
  onNotPromisedData?: (data: ReturnType<TDeserializer>) => Promise<void>
}

export type TWaitingOperations = Record<TMessageId, IWaitingOperation>