import type { Connection } from './socket.ts'

// A connection the tests drive by hand, standing in for the network.
export class FakeConnection implements Connection {
  readonly sent: string[] = []
  closed = false
  private messageHandler: (text: string) => void = () => undefined
  private closeHandler: () => void = () => undefined
  private errorHandler: () => void = () => undefined

  onMessage(handler: (text: string) => void): void {
    this.messageHandler = handler
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler
  }

  onError(handler: () => void): void {
    this.errorHandler = handler
  }

  send(text: string): void {
    this.sent.push(text)
  }

  close(): void {
    this.closed = true
    this.closeHandler()
  }

  receive(message: unknown): void {
    this.messageHandler(typeof message === 'string' ? message : JSON.stringify(message))
  }

  fail(): void {
    this.errorHandler()
  }

  drop(): void {
    this.closeHandler()
  }
}
