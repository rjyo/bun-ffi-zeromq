// sub.ts
import { ZMQ_SUB, ZMQ_SUBSCRIBE, Context, Socket } from "./lib/ffi-zeromq";

const endpoint = "ipc:///tmp/zeromq_test.ipc"; // Connect to publisher via IPC
const topicString = "UPDATES"; // Subscribe to "UPDATES" topic

console.log("Starting ZeroMQ Subscriber...");

let context: Context | null = null;
let subscriberSocket: Socket | null = null;

try {
  // 1. Create context
  context = new Context();
  console.log("Context created");

  // 2. Create SUB socket
  subscriberSocket = new Socket(context, ZMQ_SUB);
  console.log("Subscriber socket created");

  // 3. Set ZMQ_SUBSCRIBE socket option
  // The Socket.setOption method will handle Buffer or string for topics.
  // If passing a string, it will be sent as is (not null-terminated by setOption for topics).
  subscriberSocket.setOption(ZMQ_SUBSCRIBE, topicString, true); // true for isTopic
  console.log(`Subscribed to topic: "${topicString}"`);

  // 4. Connect SUB socket
  subscriberSocket.connect(endpoint);
  console.log(`Subscriber connected to ${endpoint}`);

  try {
    while (true) {
      // 5. Receive message
      const message = subscriberSocket.receive(1024); // bufferSize = 1024
      console.log(
        `Received: "${message}" (${Buffer.byteLength(message, "utf-8")} bytes)`
      );
      // Note: Buffer.byteLength(message, 'utf-8') gives the byte length of the JS string when UTF-8 encoded.
      // The original 'bytesReceived' was from the raw C buffer.
      // The new receive() method returns a JS string, so its length might differ if there were null terminators or multi-byte UTF-8 chars.
    }
  } catch (err) {
    // EAGAIN handling might be needed here if ZMQ_DONTWAIT is used in receive(),
    // but current Socket.receive() doesn't expose flags to enable ZMQ_DONTWAIT easily.
    // For blocking recv, any error from checkReturnCode in receive() is critical.
    console.error("Subscriber loop error:", err);
  }
} catch (err) {
  console.error("Subscriber setup error:", err);
} finally {
  if (subscriberSocket) {
    console.log("Closing subscriber socket...");
    subscriberSocket.close();
  }
  if (context) {
    console.log("Terminating context...");
    context.terminate();
  }
  console.log("Subscriber shut down.");
}
