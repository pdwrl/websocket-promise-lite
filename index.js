
let _establishedResolve
let _establishedReject
let _waitingOperations = {}
let _reconnectTimeArr = [3000, 5000, 8000, 12000, 17000] // reconnnects after xyz, 3xyz, 5xyz, 8xyz, 12xyz, 17xyz ... 17xyz if pauseBetweenReconnects === 0
let _reconnectTimeArrPos = 0
let _reconnectCount = 0
let _socket
let _socketTimeout
let _closedByTimer = false
let _connectedTimes = 0
let _messageId = 0
let _options 

export default class WebsocketPromiseLiteClient {
	constructor (config){
		const defaultConfig = {
			url: null,
			urlAdditionalGenerator: null,
			maxNumberOfReconnects: 0, // infinite
			pauseBetweenReconnects: 0, // 0 is for random to spare back-end
			connectTimeout: 5000,
			serializer: JSON.stringify,
			deserializer: JSON.parse,
			binaryType: 'arraybuffer' // or 'blob' if specified
		}
		_options = Object.assign(
			{},
			defaultConfig,
			config
		)

		if (!_options.url || !_options.url.match( /^ws{1,2}:\/\// )){
			throw new Error(`WebsocketPromiseLiteClient: url can't be blank and must start with ws:// or wss://`)
		}

		if (_options.pauseBetweenReconnects === 0){
			const addToReconnectTime = Math.floor( Math.random() * 999 );
			_reconnectTimeArr = _reconnectTimeArr.map( (v) => {
				return v + addToReconnectTime
			})
			_reconnectTimeArr.unshift( addToReconnectTime )
		}
	}


	connectionEstablished () {
		return new Promise((resolve, reject)=>{
			_establishedResolve = resolve
			_establishedReject = reject
			this.initialize()
		})
	}

	async initialize (){
		let url = _options.url
		if (_options.urlAdditionalGenerator){
			url += _options.urlAdditionalGenerator()
		}
		_socket = new WebSocket( url )
		_socketTimeout = setTimeout( ()=>{
			if (_socket && _socket.readyState !== 1) { 
				_closedByTimer = true
				_socket.close()
			}
		}, _options.connectTimeout)

		_socket.binaryType = _options.binaryType
		
		_socket.addEventListener('error', (e)=>{ console.error('WebSocket ERROR: ', e) })
		
		_socket.addEventListener('close', (e)=>{
			if (e.code !== 1000){
				if (_options.onConnectionClose) _options.onConnectionClose(e.code, _closedByTimer)

				_closedByTimer = false
				if (_reconnectCount < _options.maxNumberOfReconnects || _options.maxNumberOfReconnects === 0) {
					_reconnectCount++
					let pause
					if (_options.pauseBetweenReconnects === 0){
						if ( _reconnectTimeArr[ _reconnectTimeArrPos ] ){
							pause = _reconnectTimeArr[ _reconnectTimeArrPos ]
							_reconnectTimeArrPos++
						}
						else pause = _reconnectTimeArr[ _reconnectTimeArrPos - 1 ] 
					}
					else pause = _options.pauseBetweenReconnects
					setTimeout( () => {
						if (_options.onBeforeReOpen) _options.onBeforeReOpen(_reconnectCount, _options.maxNumberOfReconnects)
						this.initialize()
					}, pause)
				}
				else {
					if (_establishedReject) _establishedReject()				
				}
			}
		})
		
		_socket.addEventListener('message', (message)=> {
			const answer = _options.deserializer( message.data )
			const id = answer.messageId
			if (id && _waitingOperations[ id ]) {
				delete answer.messageId
				_waitingOperations[ id ].resolveMe( answer )
				delete _waitingOperations[ id ]
			}
			if (typeof id === 'undefined' && _options.onNotPromisedData) { // not promised data hadling
				_options.onNotPromisedData( answer )
			}
		})

		_socket.addEventListener('open', async () => {
			clearTimeout( _socketTimeout )
			_connectedTimes++
			_reconnectTimeArrPos = 0
			if (_connectedTimes === 1 && _options.onConnectionOpen) {
				await _options.onConnectionOpen()
			}
			if (_connectedTimes > 1 && _options.onConnectionReOpen) {
				await _options.onConnectionReOpen()
			}
			if (_connectedTimes > 1) {
				for (let k in _waitingOperations){
					await this.send( _waitingOperations[ k ].msg, k ) // resending messages after reconnection
				}
			}
			_reconnectCount = 0
			if (_establishedResolve) _establishedResolve()
		})	
	}

	async send( payload, resendMessageId ){
		return new Promise( (resolve, reject)=>{			
			if (resendMessageId){
				_socket.send( _waitingOperations[ resendMessageId ].msg )
			}
			else {
				const msgId = ++_messageId
				_waitingOperations[ msgId ] = {}
				_waitingOperations[ msgId ].resolveMe = resolve
				_waitingOperations[ msgId ].dateTime = Date.now()
				
				const payloadType = typeof payload
				if (payloadType === 'object' && !Array.isArray( payload )){ // pure object
					payload.messageId = msgId
				}
				else { 
					if (payloadType === 'function') throw new Error(`WebsocketPromiseLiteClient: can't send FUNCTION via websocket`)
					payload = { // if payload is no object and has a primitive type 
						message: payload,
						messageId: msgId
					}
				}
				const serialized = _options.serializer (payload)
				_waitingOperations[ msgId ].msg = serialized
				_socket.send(serialized)
			}
		})		
	}
	
	close (){
		_socket.close(1000) // normal closure
	}
}