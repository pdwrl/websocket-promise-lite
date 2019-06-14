##for what?

To easily work with sockets in async / await style.

##how?
```javascript
const WS = new WebsocketPromiseLiteClient({
	url: 'wss://echo.websocket.org/'
})
await WS.connectionEstablished()
const answer = await WS.send({
	myMessage: 'hello websocket!'
})
console.log( answer )

// next actions ...

WS.close()
```
