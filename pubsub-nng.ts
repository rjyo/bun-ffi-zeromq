import { NNG_PUB0, NNG_SUB0, Socket } from "./lib/ffi-nng";
import type { Message } from "./lib/utils";
import {
  calculateLatencyUs,
  calibrateTime,
  decodeMessage,
  encodeMessage,
  formatTimestamp,
  getEpochTimeFromHrtime,
} from "./lib/utils";

const DEFAULT_ENDPOINT = "tcp://127.0.0.1:5555";
// const DEFAULT_ENDPOINT = "ipc:///tmp/zeromq_test.ipc";
const DEFAULT_TOPIC = "UPDATES";

// Parse command line arguments
const args = process.argv.slice(2);
const mode = args[0]?.toLowerCase();

if (!mode || (mode !== "pub" && mode !== "sub")) {
  console.error("Usage: bun pubsub-nng.ts [pub|sub]");
  process.exit(1);
}

async function runPublisher() {
  console.log("Starting NNG Publisher...");
  calibrateTime();
  let publisherSocket: Socket | null = null;

  try {
    publisherSocket = new Socket(NNG_PUB0);
    publisherSocket.listen(DEFAULT_ENDPOINT);
    console.log(`Publisher listening on ${DEFAULT_ENDPOINT}`);

    await Bun.sleep(1000); // Allow time for subscribers to connect

    let count = 0;
    while (true) {
      try {
        const sendTimeNs = getEpochTimeFromHrtime();
        const message: Message = {
          id: count,
          timestamp: sendTimeNs.toString(),
          content: `Message ${count}`,
          metadata: {
            source: "publisher",
            priority: count % 3,
            tags: ["test", "nng", `msg-${count}`],
          },
        };

        const messageStr = encodeMessage(message);
        const combinedMessage = `${DEFAULT_TOPIC}|${messageStr}`;
        const bytesSent = publisherSocket.send(combinedMessage);

        console.log(`Sent message ${count}:`, {
          topic: DEFAULT_TOPIC,
          bytes: bytesSent,
          size: combinedMessage.length,
          message: message,
        });

        count++;
        await Bun.sleep(1000);
      } catch (sendErr) {
        console.error("Error sending message:", sendErr);
        await Bun.sleep(1000);
      }
    }
  } catch (err) {
    console.error("Publisher error:", err);
  } finally {
    if (publisherSocket) {
      publisherSocket.close();
    }
    console.log("Publisher shut down.");
  }
}

async function runSubscriber() {
  console.log("Starting NNG Subscriber...");
  calibrateTime();
  let subscriberSocket: Socket | null = null;

  try {
    subscriberSocket = new Socket(NNG_SUB0);
    subscriberSocket.subscribe(DEFAULT_TOPIC);
    console.log(`Subscribed to topic: "${DEFAULT_TOPIC}"`);

    subscriberSocket.dial(DEFAULT_ENDPOINT);
    console.log(`Connected to ${DEFAULT_ENDPOINT}`);

    while (true) {
      try {
        const combinedMessage = subscriberSocket.receive(32 * 1024);
        if (combinedMessage.length === 0) {
          continue;
        }

        const [topic, messageStr] = combinedMessage.split("|");
        if (!topic || !messageStr) {
          console.error("Invalid message format");
          continue;
        }

        const message = decodeMessage(messageStr);
        const receiveTimeNs = getEpochTimeFromHrtime();
        const sendTimeNs = BigInt(message.timestamp);
        const latencyUs = calculateLatencyUs(sendTimeNs, receiveTimeNs);

        console.log(`Received message ${message.id}:`, {
          topic,
          timestamp: formatTimestamp(sendTimeNs),
          content: message.content,
          metadata: message.metadata,
          size: messageStr.length,
          latency_us: latencyUs.toFixed(3),
        });
      } catch (err) {
        console.error("Error processing message:", err);
        await Bun.sleep(100);
      }
    }
  } catch (err) {
    console.error("Subscriber error:", err);
  } finally {
    if (subscriberSocket) {
      subscriberSocket.close();
    }
    console.log("Subscriber shut down.");
  }
}

// Run the appropriate mode
if (mode === "pub") {
  runPublisher();
} else {
  runSubscriber();
}
