export default class WebsocketPromiseLiteClient {
  constructor (config) {
    this._waitingOperations = {}
    this._reconnectTimeArr = [3000, 5000, 8000, 12000, 17000] // reconnnects after xyz, 3xyz, 5xyz, 8xyz, 12xyz, 17xyz ... 17xyz ms if pauseBetweenReconnects === 0
    this._reconnectTimeArrPos = 0
    this._reconnectCount = 0
    this._closedByTimer = false
    this._connectedTimes = 0
    this._messageId = 0

    const defaultConfig = {
      url: null,
      urlAdditionalGenerator: null,
      maxNumberOfReconnects: 0, // 0 is infinite, -1 means no reconnects after the fall of backend
      pauseBetweenReconnects: 0, // 0 is for random to spare back-end
      connectTimeout: 5000,
      serializer: JSON.stringify,
      deserializer: JSON.parse,
      binaryType: 'arraybuffer' // or 'blob' if specified
    }
    this._options = Object.assign(
      {},
      defaultConfig,
      config
    )

    if (!this._options.url || !this._options.url.match( /^ws{1,2}:\/\// )) {
      throw new Error(`WebsocketPromiseLiteClient: url can't be blank and must start with ws:// or wss://`)
    }

    if (this._options.pauseBetweenReconnects === 0) {
      const addToReconnectTime = Math.floor(Math.random() * 999)
      this._reconnectTimeArr = this._reconnectTimeArr.map((v) => {
        return v + addToReconnectTime
      })
      this._reconnectTimeArr.unshift(addToReconnectTime)
    }
  }

  connectionEstablished () {
    return new Promise((resolve, reject) => {
      this._establishedResolve = resolve
      this._establishedReject = reject
      this.initialize()
    })
  }

  async initialize () {
    let url = this._options.url
    if (this._options.urlAdditionalGenerator) {
      url += this._options.urlAdditionalGenerator()
    }
    this._Socket = new WebSocket(url)
    this._SocketTimeout = setTimeout(() => {
      if (this._Socket && this._Socket.readyState !== 1) { 
        this._closedByTimer = true
        this._Socket.close()
      }
    }, this._options.connectTimeout)

    this._Socket.binaryType = this._options.binaryType
    
    this._Socket.addEventListener('error', (e) => { console.error('WebSocket ERROR: ', e) })		
    this._Socket.addEventListener('close', (e) => {
      if (e.code !== 1000 && this._options.maxNumberOfReconnects > -1) {
        if (this._options.onConnectionClose) this._options.onConnectionClose(e.code, this._closedByTimer)

        this._closedByTimer = false
        if (this._reconnectCount < this._options.maxNumberOfReconnects || this._options.maxNumberOfReconnects === 0) {
          this._reconnectCount++
          let pause
          if (this._options.pauseBetweenReconnects === 0) {
            if (this._reconnectTimeArr[this._reconnectTimeArrPos]) {
              pause = this._reconnectTimeArr[this._reconnectTimeArrPos]
              this._reconnectTimeArrPos++
            } else {
              pause = this._reconnectTimeArr[this._reconnectTimeArrPos - 1]
            }
          } else {
            pause = this._options.pauseBetweenReconnects
          }
          setTimeout(() => {
            if (this._options.onBeforeReOpen) this._options.onBeforeReOpen(this._reconnectCount, this._options.maxNumberOfReconnects)
            this.initialize()
          }, pause)
        } else {
          if (this._establishedReject) this._establishedReject()				
        }
      }
    })
    
    this._Socket.addEventListener('message', (message) => {
      const answer = this._options.deserializer(message.data)
      const id = answer.messageId
      if (id && this._waitingOperations[id]) {
        delete answer.messageId
        this._waitingOperations[id].resolveMe(answer)
        delete this._waitingOperations[id]
      }
      if (typeof id === 'undefined' && this._options.onNotPromisedData) { // not promised data hadling
        this._options.onNotPromisedData(answer)
      }
    })

    this._Socket.addEventListener('open', async () => {
      clearTimeout(this._SocketTimeout)
      this._connectedTimes++
      this._reconnectTimeArrPos = 0
      if (this._connectedTimes === 1 && this._options.onConnectionOpen) {
        await this._options.onConnectionOpen()
      }
      if (this._connectedTimes > 1 && this._options.onConnectionReOpen) {
        await this._options.onConnectionReOpen()
      }
      if (this._connectedTimes > 1) {
        const waitingOperationsPromises = []
        Object.keys(this._waitingOperations).forEach(messageId => {
          waitingOperationsPromises.push(
            this.send(this._waitingOperations[messageId].msg, messageId) // resending messages after reconnection
          )
        })
        await Promise.all(waitingOperationsPromises)
      }
      this._reconnectCount = 0
      if (this._establishedResolve) this._establishedResolve()
    })
  }

  async send (payload, resendMessageId) {
    return new Promise((resolve) => {
      if (resendMessageId) {
        this._Socket.send(this._waitingOperations[resendMessageId].msg)
      } else {
        const msgId = ++this._messageId
        this._waitingOperations[msgId] = {}
        this._waitingOperations[msgId].resolveMe = resolve
        this._waitingOperations[msgId].dateTime = Date.now()
        
        const payloadType = typeof payload
        if (payload && payloadType === 'object' && !Array.isArray(payload)) { // pure object
          payload.messageId = msgId
        } else {
          if (payloadType === 'function') throw new Error(`WebsocketPromiseLiteClient: can't send FUNCTION via websocket`)
          payload = { // if payload is no object and has a primitive type 
            message: payload,
            messageId: msgId
          }
        }
        const serialized = this._options.serializer(payload)
        this._waitingOperations[msgId].msg = serialized
        this._Socket.send(serialized)
      }
    })
  }

  close () {
    this._Socket.close(1000) // normal closure
  }
}
