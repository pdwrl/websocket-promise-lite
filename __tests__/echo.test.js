const WebsocketPromiseLiteClient = require('../index').default

const myMessage = 'hello websocket!'

describe('Websocket echo server', () => {
  it('should answer with same message', async () => {
    const WS = new WebsocketPromiseLiteClient({
      url: 'wss://ws.postman-echo.com/raw'
    })
    await WS.connectionEstablished()
    const payload = { myMessage }
    const answer = await WS.send(payload)
    WS.destroy()
    expect(answer).toEqual(payload)
  })
})
