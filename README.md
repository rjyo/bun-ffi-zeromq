# Bun ZeroMQ FFI Example

This project demonstrates how to use ZeroMQ with Bun via its Foreign Function Interface (FFI). It provides a simple publisher (`pub.ts`) and subscriber (`sub.ts`) that communicate over a TCP socket.

## Prerequisites

1.  **Bun:** Ensure you have Bun installed. Visit [bun.sh](https://bun.sh/) for installation instructions.
2.  **ZeroMQ Library:** You need the ZeroMQ shared library (`libzmq`) installed on your system.

## Installing ZeroMQ (`libzmq`)

The way `lib/ffi-zeromq.ts` loads the ZeroMQ library is designed to be flexible:

1.  **Environment Variable (Recommended for custom paths):** It first checks for a `ZMQ_CUSTOM_LIB_PATH` environment variable. If you have `libzmq` in a non-standard location, set this variable to the full path of the library file (e.g., `/opt/custom/lib/libzmq.dylib`).
    ```bash
    export ZMQ_CUSTOM_LIB_PATH="/path/to/your/libzmq.dylib"
    # or
    ZMQ_CUSTOM_LIB_PATH="/path/to/your/libzmq.so" bun run pub.ts
    ```

2.  **Standard Names:** If the environment variable is not set, it tries to load the library using a platform-specific name (`libzmq.dylib` on macOS, `libzmq.so` on Linux, `libzmq.dll` on Windows) from standard library search paths.

3.  **Generic Name:** As a last resort, it tries the generic name `libzmq`.

**Recommended Installation Methods:**

*   **macOS (using Homebrew):**
    ```bash
    brew install zeromq
    ```
    Homebrew typically installs libraries to `/opt/homebrew/lib` or `/usr/local/lib`, which are usually in the dynamic linker's search path. The default loading mechanism (`libzmq.dylib`) should work.

*   **Linux (Debian/Ubuntu):**
    ```bash
    sudo apt-get update
    sudo apt-get install libzmq3-dev
    ```
    This usually places `libzmq.so` in a standard location like `/usr/lib/x86_64-linux-gnu/` or `/usr/local/lib`.

*   **Linux (Fedora/RHEL-based):**
    ```bash
    sudo dnf install zeromq-devel
    # Or using yum:
    # sudo yum install zeromq-devel
    ```

After installation via a package manager, the library should be discoverable by its standard name (`libzmq.so` or `libzmq.dylib`).

**Alternative for Custom Installations (If not using `ZMQ_CUSTOM_LIB_PATH`):**

If you compiled ZeroMQ from source and installed it to a custom prefix (e.g., `/myapps/zeromq`), you can make it discoverable by the dynamic linker:

*   **Linux:** Add your custom lib directory to `LD_LIBRARY_PATH`:
    ```bash
    export LD_LIBRARY_PATH=/myapps/zeromq/lib:$LD_LIBRARY_PATH
    ```
    For persistent changes, add this line to your shell configuration file (e.g., `~/.bashrc`, `~/.zshrc`) and then run `source ~/.bashrc` or `ldconfig` (as root) if your system uses it to update the linker cache.

*   **macOS:** Add your custom lib directory to `DYLD_LIBRARY_PATH`:
    ```bash
    export DYLD_LIBRARY_PATH=/opt/homebrew/lib:$DYLD_LIBRARY_PATH
    ```
    For persistent changes, add this line to your shell configuration file.

## Running the Examples

1.  **Start the Publisher:**
    Open a terminal and run:
    ```bash
    bun run pub.ts
    ```
    You should see output indicating it's bound to `tcp://*:5555` and sending messages.

2.  **Start the Subscriber:**
    Open another terminal and run:
    ```bash
    bun run sub.ts
    ```
    You should see it connect to the publisher and start receiving messages.

## Project Structure

*   `lib/ffi-zeromq.ts`: Contains the FFI definitions for ZeroMQ functions, constants, and a higher-level `Context` and `Socket` class to wrap the FFI calls.
*   `pub.ts`: A simple ZeroMQ publisher.
*   `sub.ts`: A simple ZeroMQ subscriber.
*   `README.md`: This file.
*   `package.json`, `tsconfig.json`: Standard Bun project files.

## How `lib/ffi-zeromq.ts` Works

*   It defines necessary ZeroMQ constants (e.g., `ZMQ_PUB`, `ZMQ_SUB`).
*   It uses `Bun.FFI.dlopen()` to load the `libzmq` shared library. The path is determined dynamically (see "Installing ZeroMQ" section).
*   It defines the signatures for common ZeroMQ functions like `zmq_ctx_new`, `zmq_socket`, `zmq_bind`, `zmq_connect`, `zmq_send`, `zmq_recv`, etc.
*   The `Context` class manages the ZeroMQ context (`zmq_ctx_new`, `zmq_ctx_term`).
*   The `Socket` class manages ZeroMQ sockets (`zmq_socket`, `zmq_close`, `zmq_bind`, `zmq_connect`, `zmq_setsockopt`, `zmq_send`, `zmq_recv`).
*   Error handling is done via a `checkReturnCode` function that throws an error if a ZeroMQ operation fails, including the ZeroMQ error number and string.

This setup provides a type-safe and more convenient way to interact with ZeroMQ from Bun compared to raw FFI calls scattered throughout the application code.
