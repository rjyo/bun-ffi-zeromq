// ffi-zeromq.ts (common interface definitions)
import type { Pointer } from "bun:ffi";
import { CString, dlopen, FFIType, ptr, suffix } from "bun:ffi";

// Define ZeroMQ constants
export const ZMQ_PUB = 1;
export const ZMQ_SUB = 2;
export const ZMQ_SUBSCRIBE = 6;
export const ZMQ_DONTWAIT = 1;
export const ZMQ_SNDMORE = 2; // If you need multipart messages

// Attempt to determine the library name
// 1. Check for an environment variable ZMQ_CUSTOM_LIB_PATH
// 2. Fallback to libzmq.[platform_suffix] (e.g., libzmq.dylib, libzmq.so, libzmq.dll)
// 3. As a last resort, try just "libzmq"
// const PLATFORM_PATH = "/opt/homebrew/lib";
const ZMQ_LIB_PATH = process.env.ZMQ_CUSTOM_LIB_PATH || `libzmq.${suffix}`;

console.log(`Attempting to load ZeroMQ library from: ${ZMQ_LIB_PATH}`);

const { symbols } = dlopen(ZMQ_LIB_PATH, {
  zmq_ctx_new: {
    args: [],
    returns: FFIType.ptr, // void*
  },
  zmq_ctx_term: {
    args: [FFIType.ptr], // void* context
    returns: FFIType.i32, // int
  },
  zmq_socket: {
    args: [FFIType.ptr, FFIType.i32], // void* context, int type
    returns: FFIType.ptr, // void*
  },
  zmq_close: {
    args: [FFIType.ptr], // void* socket
    returns: FFIType.i32, // int
  },
  zmq_bind: {
    args: [FFIType.ptr, FFIType.cstring], // void* socket, const char* endpoint
    returns: FFIType.i32, // int
  },
  zmq_connect: {
    args: [FFIType.ptr, FFIType.cstring], // void* socket, const char* endpoint
    returns: FFIType.i32, // int
  },
  zmq_setsockopt: {
    args: [FFIType.ptr, FFIType.i32, FFIType.ptr, FFIType.u64], // void* socket, int option, const void* optval, size_t optvallen
    returns: FFIType.i32, // int
  },
  zmq_send: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.u64, FFIType.i32], // void* socket, const void* buf, size_t len, int flags
    returns: FFIType.i32, // int (bytes sent or -1)
  },
  zmq_recv: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.u64, FFIType.i32], // void* socket, void* buf, size_t len, int flags
    returns: FFIType.i32, // int (bytes received or -1)
  },
  zmq_errno: {
    args: [],
    returns: FFIType.i32, // int
  },
  zmq_strerror: {
    args: [FFIType.i32], // int errnum
    returns: FFIType.cstring, // const char*
  },
});

export const zmq = symbols;

export function checkReturnCode(rc: number, operation: string): void {
  if (rc !== 0 && operation !== "zmq_send" && operation !== "zmq_recv") {
    // For send/recv, rc is byte count or -1. Other ops often return 0 on success.
    // zmq_close, zmq_ctx_term, zmq_bind, zmq_connect, zmq_setsockopt should return 0 on success
    const errno = zmq.zmq_errno();
    const errorMsg = zmq.zmq_strerror(errno);
    throw new Error(
      `ZeroMQ operation '${operation}' failed: ${errorMsg.toString()} (errno ${errno}, rc ${rc})`
    );
  } else if ((operation === "zmq_send" || operation === "zmq_recv") && rc < 0) {
    const errno = zmq.zmq_errno();
    const errorMsg = zmq.zmq_strerror(errno);
    throw new Error(
      `ZeroMQ operation '${operation}' failed: ${errorMsg.toString()} (errno ${errno}, rc ${rc})`
    );
  }
}

export class Context {
  private _ptr: Pointer | null;

  constructor() {
    this._ptr = zmq.zmq_ctx_new() as Pointer;
    if (this._ptr === null) {
      // No rc for zmq_ctx_new, error check is via null return
      const errno = zmq.zmq_errno();
      const errorMsg = zmq.zmq_strerror(errno);
      throw new Error(
        `Failed to create ZeroMQ context: ${errorMsg.toString()} (errno ${errno})`
      );
    }
  }

  get ptr(): Pointer | null {
    return this._ptr;
  }

  terminate(): void {
    if (this._ptr) {
      const rc = zmq.zmq_ctx_term(this._ptr);
      checkReturnCode(rc, "zmq_ctx_term");
      this._ptr = null; // Mark as terminated
    }
  }
}

export class Socket {
  private _ptr: Pointer | null;
  private _context: Context;

  constructor(context: Context, type: number) {
    this._context = context;
    if (!context.ptr) {
      throw new Error("Context is not valid for creating a socket.");
    }
    this._ptr = zmq.zmq_socket(context.ptr, type) as Pointer;
    if (this._ptr === null) {
      // No rc for zmq_socket, error check is via null return
      const errno = zmq.zmq_errno();
      const errorMsg = zmq.zmq_strerror(errno);
      // We don't terminate the context here, caller might have other sockets
      throw new Error(
        `Failed to create ZeroMQ socket: ${errorMsg.toString()} (errno ${errno})`
      );
    }
  }

  get ptr(): Pointer | null {
    return this._ptr;
  }

  close(): void {
    if (this._ptr) {
      const rc = zmq.zmq_close(this._ptr);
      checkReturnCode(rc, "zmq_close");
      this._ptr = null; // Mark as closed
    }
  }

  bind(endpoint: string): void {
    if (!this._ptr) throw new Error("Socket is closed or invalid.");
    const endpointBuffer = Buffer.from(endpoint + "\0"); // Ensure null-terminated
    const rc = zmq.zmq_bind(this._ptr, endpointBuffer);
    checkReturnCode(rc, "zmq_bind");
  }

  connect(endpoint: string): void {
    if (!this._ptr) throw new Error("Socket is closed or invalid.");
    const endpointBuffer = Buffer.from(endpoint + "\0"); // Ensure null-terminated
    const rc = zmq.zmq_connect(this._ptr, endpointBuffer);
    checkReturnCode(rc, "zmq_connect");
  }

  setOption(option: number, value: Buffer): void;
  setOption(option: number, value: string, isTopic?: boolean): void;
  setOption(option: number, value: number): void;
  setOption(
    option: number,
    value: Buffer | string | number,
    isTopic: boolean = false
  ): void {
    if (!this._ptr) throw new Error("Socket is closed or invalid.");
    let optval: Buffer;
    let optvallen: number;

    if (Buffer.isBuffer(value)) {
      optval = value;
      optvallen = value.byteLength;
      if (isTopic && value[value.byteLength - 1] === 0) {
        // for ZMQ_SUBSCRIBE topic buffers
        optvallen = value.byteLength - 1;
      }
    } else if (typeof value === "string") {
      optval = Buffer.from(value + (isTopic ? "" : "\0")); // Null-terminate unless it's a topic meant to be exact
      optvallen = isTopic ? value.length : optval.byteLength;
    } else if (typeof value === "number") {
      // Assuming number options are for things like ZMQ_LINGER, ZMQ_SNDHWM, etc.
      // These typically expect a pointer to an int or int64.
      // For simplicity, let's assume int for now, adjust if specific options need int64_t.
      const numBuffer = Buffer.alloc(4); // 4 bytes for int32
      numBuffer.writeInt32LE(value, 0);
      optval = numBuffer;
      optvallen = numBuffer.byteLength;
    } else {
      throw new Error("Unsupported socket option value type.");
    }

    const rc = zmq.zmq_setsockopt(this._ptr, option, ptr(optval), optvallen);
    checkReturnCode(rc, "zmq_setsockopt");
  }

  send(message: string | Buffer, flags: number = 0): number {
    if (!this._ptr) throw new Error("Socket is closed or invalid.");
    const messageBuffer = Buffer.isBuffer(message)
      ? message
      : Buffer.from(message + "\0");
    // Ensure messageBuffer is not empty for ptr() if it's derived from an empty string
    const bufferToSend =
      messageBuffer.byteLength === 0 && !Buffer.isBuffer(message)
        ? Buffer.from("\0")
        : messageBuffer;

    const rc = zmq.zmq_send(
      this._ptr,
      ptr(bufferToSend),
      bufferToSend.byteLength,
      flags
    );
    // checkReturnCode will throw if rc is -1, otherwise rc is bytes sent
    checkReturnCode(rc, "zmq_send");
    return rc;
  }

  receive(bufferSize: number = 1024, flags: number = 0): string {
    if (!this._ptr) throw new Error("Socket is closed or invalid.");
    const buffer = Buffer.alloc(bufferSize);
    const bytesReceived = zmq.zmq_recv(
      this._ptr,
      ptr(buffer),
      bufferSize,
      flags
    );

    // checkReturnCode will throw if bytesReceived is -1 (and not EAGAIN, which would need special handling if ZMQ_DONTWAIT is used)
    checkReturnCode(bytesReceived, "zmq_recv");

    if (bytesReceived > bufferSize) {
      // This case should ideally be handled by checkReturnCode or by ensuring buffer is large enough.
      // If zmq_recv somehow reports more bytes than buffer size without erroring (unlikely for standard behavior).
      console.warn(
        `Received message larger than buffer: ${bytesReceived} bytes. Message truncated.`
      );
      return new CString(ptr(buffer), 0, bufferSize).toString();
    }

    // Convert only the received part of the buffer to a string
    // Assuming messages are null-terminated C strings or we take up to bytesReceived
    let end = bytesReceived;
    if (buffer[bytesReceived - 1] === 0) {
      // If null-terminated
      end = bytesReceived - 1;
    }
    return buffer.toString("utf-8", 0, end);
  }
}
