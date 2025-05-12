# Bun Messaging Libraries FFI Example

This project demonstrates how to use messaging libraries (ZeroMQ and NNG) with Bun via its Foreign Function Interface (FFI). It provides implementations for both ZeroMQ and NNG (Nanomsg Next Generation), allowing you to choose the messaging library that best fits your needs.

## Overview

Both implementations provide:
- Publisher/Subscriber pattern
- FFI-based native library integration
- Type-safe TypeScript interfaces
- Error handling and recovery
- Support for different transport protocols

## Prerequisites

1. **Bun:** Ensure you have Bun installed. Visit [bun.sh](https://bun.sh/) for installation instructions.
2. **Messaging Library:** You need either ZeroMQ or NNG (or both) installed on your system.

## Installation

### ZeroMQ Installation

*   **macOS (using Homebrew):**
    ```bash
    brew install zeromq
    ```

*   **Linux (Debian/Ubuntu):**
    ```bash
    sudo apt-get update
    sudo apt-get install libzmq3-dev
    ```

*   **Linux (Fedora/RHEL-based):**
    ```bash
    sudo dnf install zeromq-devel
    # Or using yum:
    # sudo yum install zeromq-devel
    ```

### NNG Installation

*   **macOS (using Homebrew):**
    ```bash
    brew install nng
    ```

*   **Linux (Debian/Ubuntu):**
    ```bash
    sudo apt-get update
    sudo apt-get install libnng-dev
    ```

*   **Linux (Fedora/RHEL-based):**
    ```bash
    sudo dnf install nng-devel
    # Or using yum:
    # sudo yum install nng-devel
    ```

## Library Loading

Both implementations support flexible library loading:

1. **Environment Variable (Recommended for custom paths):**
   ```bash
   # For ZeroMQ
   export ZMQ_CUSTOM_LIB_PATH="/path/to/your/libzmq.dylib"
   # For NNG
   export NNG_CUSTOM_LIB_PATH="/path/to/your/libnng.dylib"
   ```

2. **Standard Names:** If environment variables are not set, they try to load using platform-specific names:
   - ZeroMQ: `libzmq.dylib` (macOS), `libzmq.so` (Linux), `libzmq.dll` (Windows)
   - NNG: `libnng.dylib` (macOS), `libnng.so` (Linux), `libnng.dll` (Windows)

## Running the Examples

### ZeroMQ Implementation

1. **Start the Publisher:**
    ```bash
    bun run pubsub-zmq.ts pub
    ```
    This starts a publisher that:
    - Binds to `tcp://*:5555`
    - Sends structured messages with metadata
    - Uses topic filtering

2. **Start the Subscriber:**
    ```bash
    bun run pubsub-zmq.ts sub
    ```
    The subscriber will:
    - Connect to the publisher
    - Subscribe to topics
    - Display messages with latency information
    - Handle error recovery

### NNG Implementation

1. **Start the Publisher:**
    ```bash
    bun run pubsub-nng.ts pub
    ```
    This starts an enhanced publisher that:
    - Uses IPC for better performance
    - Sends structured JSON messages with metadata
    - Includes timestamps for latency tracking
    - Supports advanced topic filtering

2. **Start the Subscriber:**
    ```bash
    bun run pubsub-nng.ts sub
    ```
    The subscriber will:
    - Connect to the publisher
    - Subscribe to topics with metadata filtering
    - Display messages with latency information
    - Handle advanced error recovery

## Implementation Details

### ZeroMQ (`lib/ffi-zeromq.ts`)

*   Defines ZeroMQ constants (e.g., `ZMQ_PUB`, `ZMQ_SUB`)
*   Uses `Bun.FFI.dlopen()` to load `libzmq` with support for custom paths via `ZMQ_CUSTOM_LIB_PATH`
*   Provides `Context` and `Socket` classes for:
    - Context management (`zmq_ctx_new`, `zmq_ctx_term`)
    - Socket operations (`zmq_socket`, `zmq_bind`, `zmq_connect`)
    - Message handling (`zmq_send`, `zmq_recv`)
    - Error handling with ZeroMQ error codes

### NNG (`lib/ffi-nng.ts`)

*   Defines NNG constants and protocols (`NNG_PUB0`, `NNG_SUB0`)
*   Uses `Bun.FFI.dlopen()` to load `libnng` with support for custom paths via `NNG_CUSTOM_LIB_PATH`
*   Provides a `Socket` class with:
    - Socket management (`nng_pub0_open`, `nng_sub0_open`)
    - Topic subscription handling
    - Binary and string message support
    - Enhanced error handling
    - Performance monitoring

## Project Structure

*   `lib/ffi-zeromq.ts`: ZeroMQ FFI definitions and wrapper classes
*   `lib/ffi-nng.ts`: NNG FFI definitions and wrapper class
*   `pubsub-zmq.ts`: Combined ZeroMQ publisher/subscriber implementation
*   `pubsub-nng.ts`: Combined NNG publisher/subscriber implementation
*   `lib/utils.ts`: Shared utilities for message handling and timing
*   `README.md`: This file
*   `package.json`, `tsconfig.json`: Project configuration

## Shared Utilities (`lib/utils.ts`)

Both implementations use shared utilities for:
- Message structure and encoding/decoding
- High-precision timing and latency tracking
- Timestamp formatting

The `Message` interface provides a consistent structure:
```typescript
interface Message {
  id: number;
  timestamp: string;  // High-precision timestamp
  content: string;
  metadata?: {
    source?: string;
    priority?: number;
    tags?: string[];
  };
}
```

Performance monitoring features available in both implementations:
- Microsecond-precision latency tracking
- High-resolution timestamps using `process.hrtime`
- Time calibration for accurate measurements
- JSON-based message encoding/decoding

## Choosing Between ZeroMQ and NNG

Choose ZeroMQ if you need:
- A battle-tested, mature library
- Maximum compatibility
- Familiar ZeroMQ API design

Choose NNG if you need:
- Modern, lightweight implementation
- More modern API design
- Potentially better performance (benchmark for your use case)

Both implementations:
- Use IPC for transport by default
- Support structured JSON messages with metadata
- Include performance monitoring (latency, timestamps)
- Provide error handling and recovery
- Use the same shared utilities for message handling
- Support custom library paths via environment variables

The choice often depends on your specific requirements and existing infrastructure.
