// ffi-nng.ts
import { dlopen, FFIType, ptr, suffix } from 'bun:ffi'

// NNG constants
const SUBSCRIBE_STR = Buffer.from('sub:subscribe\0')
const UNSUBSCRIBE_STR = Buffer.from('sub:unsubscribe\0')
export const NNG_OPT_PUB_SUB_SUBSCRIBE = ptr(SUBSCRIBE_STR)
export const NNG_OPT_PUB_SUB_UNSUBSCRIBE = ptr(UNSUBSCRIBE_STR)
export const NNG_FLAG_NONBLOCK = 1
export const NNG_FLAG_ALLOC = 2

// NNG protocol names
export const NNG_PUB0 = 'pub0'
export const NNG_SUB0 = 'sub0'

// NNG socket type (handle)
type NngSocket = number

// Attempt to determine the library name
const NNG_LIB_PATH = process.env.NNG_CUSTOM_LIB_PATH || `libnng.${suffix}`

console.log(`Attempting to load NNG library from: ${NNG_LIB_PATH}`)

const { symbols } = dlopen(NNG_LIB_PATH, {
  // Core functions
  nng_strerror: {
    args: [FFIType.i32],
    returns: FFIType.cstring,
  },
  nng_free: {
    args: [FFIType.ptr, FFIType.u64],
    returns: FFIType.void,
  },

  // Socket functions
  nng_pub0_open: {
    args: [FFIType.ptr], // nng_socket_t*
    returns: FFIType.i32,
  },
  nng_sub0_open: {
    args: [FFIType.ptr], // nng_socket_t*
    returns: FFIType.i32,
  },
  nng_close: {
    args: [FFIType.u32], // nng_socket_t
    returns: FFIType.void,
  },
  nng_listen: {
    args: [FFIType.u32, FFIType.cstring, FFIType.ptr, FFIType.i32], // nng_socket_t, const char*, nng_listener*, int
    returns: FFIType.i32,
  },
  nng_dial: {
    args: [FFIType.u32, FFIType.cstring, FFIType.ptr, FFIType.i32], // nng_socket_t, const char*, nng_dialer*, int
    returns: FFIType.i32,
  },
  nng_send: {
    args: [FFIType.u32, FFIType.ptr, FFIType.u64, FFIType.i32], // nng_socket_t, const void*, size_t, int
    returns: FFIType.i32,
  },
  nng_recv: {
    args: [FFIType.u32, FFIType.ptr, FFIType.ptr, FFIType.i32], // nng_socket_t, void*, size_t*, int
    returns: FFIType.i32,
  },
  nng_setopt: {
    args: [FFIType.u32, FFIType.cstring, FFIType.ptr, FFIType.u64], // nng_socket_t, const char*, const void*, size_t
    returns: FFIType.i32,
  },
  nng_getopt: {
    args: [FFIType.u32, FFIType.cstring, FFIType.ptr, FFIType.ptr], // nng_socket_t, const char*, void*, size_t*
    returns: FFIType.i32,
  },
})

export const nng = symbols

export function checkReturnCode(rc: number, operation: string): void {
  if (rc !== 0) {
    const errorMsg = nng.nng_strerror(rc)
    throw new Error(`NNG operation '${operation}' failed: ${errorMsg.toString()} (rc ${rc})`)
  }
}

export class Socket {
  private _socket: NngSocket | null
  private _type: string

  constructor(type: string) {
    this._type = type
    this._socket = null

    // Create a pointer to store the socket handle
    const socketArray = new Uint32Array(1)
    const socketPtr = ptr(socketArray)

    let rc: number
    if (type === NNG_PUB0) {
      rc = nng.nng_pub0_open(socketPtr)
    } else if (type === NNG_SUB0) {
      rc = nng.nng_sub0_open(socketPtr)
    } else {
      throw new Error(`Unsupported socket type: ${type}`)
    }

    if (rc !== 0) {
      const errorMsg = nng.nng_strerror(rc)
      throw new Error(`Failed to create NNG socket: ${errorMsg.toString()} (rc ${rc})`)
    }

    // Read the socket handle from the output parameter
    const socketValue = Number(socketArray[0])
    if (socketValue === 0) {
      throw new Error('Failed to get valid socket handle from NNG')
    }
    this._socket = socketValue
    console.log(`Created NNG socket with handle: ${this._socket}`)
  }

  get socket(): NngSocket | null {
    return this._socket
  }

  close(): void {
    if (this._socket) {
      nng.nng_close(this._socket)
      this._socket = null
    }
  }

  listen(endpoint: string): void {
    if (!this._socket) throw new Error('Socket is closed or invalid.')
    const endpointBuffer = Buffer.from(endpoint + '\0')
    console.log(`Attempting to listen on ${endpoint} with socket ${this._socket}`)
    const rc = nng.nng_listen(this._socket, endpointBuffer, null, 0)
    if (rc !== 0) {
      const errorMsg = nng.nng_strerror(rc)
      throw new Error(`Failed to listen on socket: ${errorMsg.toString()} (rc ${rc})`)
    }
    console.log(`Successfully listening on ${endpoint}`)
  }

  dial(endpoint: string): void {
    if (!this._socket) throw new Error('Socket is closed or invalid.')
    const endpointBuffer = Buffer.from(endpoint + '\0')
    const rc = nng.nng_dial(this._socket, endpointBuffer, null, 0)
    checkReturnCode(rc, 'nng_dial')
  }

  subscribe(topic: string): void {
    if (!this._socket) throw new Error('Socket is closed or invalid.')
    if (this._type !== NNG_SUB0) {
      throw new Error('Subscribe is only valid for SUB sockets')
    }
    const topicBuffer = Buffer.from(topic)
    const rc = nng.nng_setopt(
      this._socket,
      NNG_OPT_PUB_SUB_SUBSCRIBE,
      topicBuffer,
      topicBuffer.length
    )
    checkReturnCode(rc, 'nng_setopt(subscribe)')
  }

  unsubscribe(topic: string): void {
    if (!this._socket) throw new Error('Socket is closed or invalid.')
    if (this._type !== NNG_SUB0) {
      throw new Error('Unsubscribe is only valid for SUB sockets')
    }
    const topicBuffer = Buffer.from(topic)
    const rc = nng.nng_setopt(
      this._socket,
      NNG_OPT_PUB_SUB_UNSUBSCRIBE,
      topicBuffer,
      topicBuffer.length
    )
    checkReturnCode(rc, 'nng_setopt(unsubscribe)')
  }

  send(message: string | Buffer, flags: number = 0): number {
    if (!this._socket) throw new Error('Socket is closed or invalid.')
    const buffer = typeof message === 'string' ? Buffer.from(message) : message

    const rc = nng.nng_send(this._socket, buffer, buffer.length, flags)
    if (rc < 0) {
      checkReturnCode(rc, 'nng_send')
    }
    return rc
  }

  receive(bufferSize: number = 1024, flags: number = 0): string {
    if (!this._socket) throw new Error('Socket is closed or invalid.')
    const buffer = Buffer.alloc(bufferSize)
    const sizeArray = new BigUint64Array(1)
    const sizePtr = ptr(sizeArray)

    // Set initial size to buffer size
    sizeArray[0] = BigInt(bufferSize)

    const rc = nng.nng_recv(this._socket, buffer, sizePtr, flags)
    if (rc < 0) {
      checkReturnCode(rc, 'nng_recv')
    }

    // Get the actual size of the received message
    const size = Number(sizeArray[0])
    if (size === 0) {
      return '' // Return empty string for zero-length messages
    }

    // Only convert the actual received bytes to string
    return buffer.toString('utf8', 0, size)
  }

  receiveBinary(bufferSize: number = 1024, flags: number = 0): Buffer {
    if (!this._socket) throw new Error('Socket is closed or invalid.')
    const buffer = Buffer.alloc(bufferSize)
    const sizeArray = new BigUint64Array(1)
    const sizePtr = ptr(sizeArray)

    // Set initial size to buffer size
    sizeArray[0] = BigInt(bufferSize)

    const rc = nng.nng_recv(this._socket, buffer, sizePtr, flags)
    if (rc < 0) {
      checkReturnCode(rc, 'nng_recv')
    }

    // Get the actual size of the received message
    const size = Number(sizeArray[0])
    if (size === 0) {
      return Buffer.alloc(0) // Return empty buffer for zero-length messages
    }

    // Only return the actual received bytes
    return Buffer.from(Uint8Array.prototype.slice.call(buffer, 0, size))
  }
}
