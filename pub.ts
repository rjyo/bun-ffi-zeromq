// pub.ts
import { ZMQ_PUB, Context, Socket } from "./lib/ffi-zeromq";

const endpoint = "tcp://*:5555"; // Publish on all interfaces, port 5555
const topic = "UPDATES";

console.log("Starting ZeroMQ Publisher...");

let context: Context | null = null;
let publisherSocket: Socket | null = null;

try {
  // 1. Create context
  context = new Context();
  console.log("Context created");

  // 2. Create PUB socket
  publisherSocket = new Socket(context, ZMQ_PUB);
  console.log("Publisher socket created");

  // 3. Bind PUB socket
  publisherSocket.bind(endpoint);
  console.log(`Publisher bound to ${endpoint}`);

  // Allow some time for subscribers to connect (optional in some ZMQ versions/transports)
  await Bun.sleep(1000);

  let count = 0;
  while (true) {
    const messageContent = `Message ${count}`;
    const fullMessage = `${topic} ${messageContent}`; // Prepend topic

    // 4. Send message
    const bytesSent = publisherSocket.send(fullMessage); // Automatically handles null termination if needed
    console.log(`Sent: "${fullMessage}" (${bytesSent} bytes)`);

    count++;
    await Bun.sleep(1000); // Send a message every second
  }
} catch (err) {
  console.error("Publisher error:", err);
} finally {
  if (publisherSocket) {
    console.log("Closing publisher socket...");
    publisherSocket.close();
  }
  if (context) {
    console.log("Terminating context...");
    context.terminate();
  }
  console.log("Publisher shut down.");
}
