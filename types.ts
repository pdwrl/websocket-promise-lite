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
  /** WebSocket URL. Must start with "ws://" or "wss://". The only required param */
  url: string

  /** function that generates "postfix" part of WS url */
  urlAdditionalGenerator: (() => string) | null

  /** maximum number of reconnections, after which there will be no more reconnections.
   * If -1 then will be no reconnections. Default Infinity.
   * */
  maxNumberOfReconnects: number

  /** pause between reconnections (in ms). If 0 then reconnections will become after randomized pause.
   * Pauses are stored in array [xyz, 3xyz, 5xyz, 8xyz, 12xyz, 17xyz ... 17xyz], where xyz is random number.
   * This is so that all clients reconnects at different time for stable back-end. Default 0.
   * */  
  pauseBetweenReconnects: number

  /** time in ms after which connection is considered unsuccessful (and then reconnects again). Default 5000 */
  connectTimeout: number

  /** serializer function. For example, CBOR.encode. Default JSON.stringify. */
  serializer: TSerializer

  /** deserializer function. For example, CBOR.decode. Default JSON.parse. */
  deserializer: TDeserializer

  /** type of data to be transmitted. In most cases it's "arraybuffer". But You may specify it as "blob". Default "arraybuffer". */
  binaryType: 'arraybuffer' | 'blob',

  /** function/promise which is called when a connection is opened successfully for a 1st time */
  onConnectionOpen?: () => Promise<void>

  /** function/promise which is called when a connection is closed.
   * @param {number} code - code of closure
   * @param {boolean} isClosedByTimer - indicates is connection closed by timeout timer or not
  */
  onConnectionClose?: (code: number, isClosedByTimer: boolean) => Promise<void>

  /** function/promise which is called when a connection is before reopen.
   * @param {number} reconnectCount - current value of the reconnect counter
   * @param {number} maxNumberOfReconnects - max possible value of the reconnect counter
  */
  onBeforeReOpen?: (reconnectCount: number, maxNumberOfReconnects: number) => Promise<void>

  /** function/promise which is called when a connection is opened successfully for a 2nd+ time */
  onConnectionReOpen?: () => Promise<void>

  /** function/promise which is called when server sends not promised data (simple WS data from back-end)
   * @param {object} data - js object with deserialized data
  */
  onNotPromisedData?: (data: ReturnType<TDeserializer>) => Promise<void>
}

export type TWaitingOperations = Record<TMessageId, IWaitingOperation>