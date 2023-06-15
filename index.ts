if (process.env.NODE_ENV === 'test') { 
  (global as any).WebSocket = require('ws')
}

import { defaultConfig, isFunc, isObject } from './helpers'
import type {
  IConfig,
  TDataDeserialized,
  TMessageId,
  TRejector,
  TResolver,
  TWaitingOperations
} from './types'

export default class WebsocketPromiseLiteClient {
  #socket: WebSocket
  #socketTimeout: ReturnType<typeof setTimeout>
  #messageId: number
  #waitingOperations: TWaitingOperations
  #reconnectTimeArr: number[]
  #reconnectTimeArrPos: number
  #reconnectCount: number
  #closedByTimer: boolean
  #connectedTimes: number
  #config: IConfig
  #establishedResolver: TResolver
  #establishedRejector: TRejector
  #bindedEventHandlers: Record<string, () => void>

  constructor(config: IConfig) {
    this.#waitingOperations = {}
    this.#reconnectTimeArr = [3000, 5000, 8000, 12000, 17000] // reconnnects after xyz, 3xyz, 5xyz, 8xyz, 12xyz, 17xyz ... 17xyz ms if pauseBetweenReconnects === 0
    this.#reconnectTimeArrPos = 0
    this.#reconnectCount = 0
    this.#closedByTimer = false
    this.#connectedTimes = 0
    this.#messageId = 0

    this.#config = Object.assign(
      {},
      defaultConfig,
      config
    )

    if (!this.#config.url || !this.#config.url.match(/^ws{1,2}:\/\//)) {
      throw new Error('WebsocketPromiseLiteClient: url can\'t be blank and must start with ws:// or wss://')
    }

    if (this.#config.pauseBetweenReconnects === 0) {
      const addToReconnectTime = Math.floor(Math.random() * 999)
      this.#reconnectTimeArr = this.#reconnectTimeArr.map((v) => v + addToReconnectTime)
      this.#reconnectTimeArr.unshift(addToReconnectTime)
    }

    this.#bindedEventHandlers = {
      error: this.#onSocketError.bind(this),
      close: this.#onSocketClose.bind(this),
      message: this.#onSocketMessage.bind(this),
      open: this.#onSocketOpen.bind(this)
    }
  }

  /** waits for the connection to be established. If fails it reconnects automatically */
  connectionEstablished() {
    return new Promise((resolve, reject) => {
      this.#establishedResolver = resolve
      this.#establishedRejector = reject
      this.#initialize()
    })
  }

  async #initialize() {
    let url = this.#config.url
    if (isFunc(this.#config.urlAdditionalGenerator)) {
      url += this.#config.urlAdditionalGenerator()
    }

    this.#socket = new WebSocket(url)
    this.#socketTimeout = setTimeout(() => {
      if (this.#socket && this.#socket.readyState !== 1) { 
        this.#closedByTimer = true
        this.#socket.close()
      }
    }, this.#config.connectTimeout)

    this.#socket.binaryType = this.#config.binaryType

    this.#switchSocketEventListeners('on')
  }

  /** sends any unserialized object by WS. */
  async send(payload: TDataDeserialized | undefined, resendMessageId?: TMessageId) {
    return new Promise((resolve) => {
      if (isObject(payload)) {
        const messageId = String(++this.#messageId)
        const message = { ...payload, messageId }
        const messageSerialized = this.#config.serializer(message)
        this.#waitingOperations[messageId] = {
          resolver: resolve,
          dateTime: Date.now(),
          msg: messageSerialized
        }
        this.#socket.send(messageSerialized)
      } else if (resendMessageId) {
        this.#socket.send(this.#waitingOperations[resendMessageId].msg)
      }
    })
  }

  #switchSocketEventListeners(newState: 'on' | 'off') {
    const method = newState === 'on'
      ? 'addEventListener'
      : 'removeEventListener'
    Object.keys(this.#bindedEventHandlers)
      .forEach((type) => {
        this.#socket[method](type, this.#bindedEventHandlers[type])
      })
  }

  async #onSocketOpen() {
    clearTimeout(this.#socketTimeout)
    this.#connectedTimes++
    this.#reconnectTimeArrPos = 0
    if (this.#connectedTimes === 1 && isFunc(this.#config.onConnectionOpen)) {
      await this.#config.onConnectionOpen()
    }
    if (this.#connectedTimes > 1 && isFunc(this.#config.onConnectionReOpen)) {
      await this.#config.onConnectionReOpen()
    }
    if (this.#connectedTimes > 1) {
      // resending messages after reconnection
      const waitingOperationsPromises = Object.keys(this.#waitingOperations)
        .map((id) => this.send(undefined, id))
      await Promise.all(waitingOperationsPromises)
    }
    this.#reconnectCount = 0
    if (isFunc(this.#establishedResolver)) {
      this.#establishedResolver()
    }
  }

  #onSocketMessage(ev: MessageEvent) {
    const answer = this.#config.deserializer(ev.data)
    const id = answer.messageId
      ? String(answer.messageId)
      : undefined

    if (id && this.#waitingOperations[id]) {
      delete answer.messageId
      this.#waitingOperations[id].resolver(answer)
      delete this.#waitingOperations[id]
    }

    if (typeof id === 'undefined' && isFunc(this.#config.onNotPromisedData)) { // not promised data hadling
      this.#config.onNotPromisedData(answer)
    }
  }

  #onSocketClose(ev: CloseEvent) {
    if (isFunc(this.#config.onConnectionClose)) {
      this.#config.onConnectionClose(ev.code, this.#closedByTimer)
    }

    if (ev.code !== 1000 && this.#config.maxNumberOfReconnects > -1) {
      this.#switchSocketEventListeners('off')
      this.#closedByTimer = false
      if (this.#reconnectCount < this.#config.maxNumberOfReconnects) {
        this.#reconnectCount++
        let pause = 0
        if (this.#config.pauseBetweenReconnects === 0) {
          if (this.#reconnectTimeArr[this.#reconnectTimeArrPos]) {
            pause = this.#reconnectTimeArr[this.#reconnectTimeArrPos]
            this.#reconnectTimeArrPos++
          } else {
            pause = this.#reconnectTimeArr[this.#reconnectTimeArrPos - 1]
          }
        } else {
          pause = this.#config.pauseBetweenReconnects
        }
        setTimeout(() => {
          if (isFunc(this.#config.onBeforeReOpen)) {
            this.#config.onBeforeReOpen(this.#reconnectCount, this.#config.maxNumberOfReconnects)
          }
          this.#initialize()
        }, pause)
      } else if (isFunc(this.#establishedRejector)) {
        this.#establishedRejector()
      }
    }
  }

  #onSocketError() {
    throw new Error('WebsocketPromiseLiteClient: A socket error has occured')
  }

  /** closes WS at normal way (code 1000) */
  close() {
    this.#socket.close(1000) // normal closure
  }

  /** destructor. removes all event listeners, closes WS connection and clears the list of operations */
  destroy() {
    this.#switchSocketEventListeners('off')
    this.close()
    this.#waitingOperations = {}
  }
}
