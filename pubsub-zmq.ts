import {
  Context,
  Socket,
  ZMQ_PUB,
  ZMQ_RCVMORE,
  ZMQ_SUB,
  ZMQ_SUBSCRIBE,
} from "./lib/ffi-zeromq";
import type { Message } from "./lib/utils";
import { decodeMessage, encodeMessage } from "./lib/utils";

const DEFAULT_ENDPOINT = "ipc:///tmp/zeromq_test.ipc";
const DEFAULT_TOPIC = "UPDATES";

// Parse command line arguments
const args = process.argv.slice(2);
const mode = args[0]?.toLowerCase();

if (!mode || (mode !== "pub" && mode !== "sub")) {
  console.error("Usage: bun pubsub.ts [pub|sub]");
  process.exit(1);
}

async function runPublisher() {
  console.log("Starting ZeroMQ Publisher...");
  let context: Context | null = null;
  let publisherSocket: Socket | null = null;

  try {
    context = new Context();
    publisherSocket = new Socket(context, ZMQ_PUB);
    publisherSocket.bind(DEFAULT_ENDPOINT);
    console.log(`Publisher bound to ${DEFAULT_ENDPOINT}`);

    await Bun.sleep(1000); // Allow time for subscribers to connect

    let count = 0;
    while (true) {
      const message: Message = {
        id: count,
        timestamp: new Date().toISOString(),
        content: `Message ${count}`,
        metadata: {
          source: "publisher",
          priority: count % 3,
          tags: ["test", "zeromq", `msg-${count}`],
        },
      };

      const messageStr = encodeMessage(message);
      const combinedMessage = `${DEFAULT_TOPIC}|${messageStr}`;
      const bytesSent = publisherSocket.send(combinedMessage);

      console.log(`Sent message ${count}:`, {
        bytes: bytesSent,
        size: combinedMessage.length,
        message: message,
      });

      count++;
      await Bun.sleep(1000);
    }
  } catch (err) {
    console.error("Publisher error:", err);
  } finally {
    if (publisherSocket) {
      publisherSocket.close();
    }
    if (context) {
      context.terminate();
    }
    console.log("Publisher shut down.");
  }
}

async function runSubscriber() {
  console.log("Starting ZeroMQ Subscriber...");
  let context: Context | null = null;
  let subscriberSocket: Socket | null = null;

  try {
    context = new Context();
    subscriberSocket = new Socket(context, ZMQ_SUB);
    subscriberSocket.setOption(ZMQ_SUBSCRIBE, DEFAULT_TOPIC, true);
    console.log(`Subscribed to topic: "${DEFAULT_TOPIC}"`);

    subscriberSocket.connect(DEFAULT_ENDPOINT);
    console.log(`Subscriber connected to ${DEFAULT_ENDPOINT}`);

    while (true) {
      try {
        const combinedMessage = subscriberSocket.receive();
        const [topic, messageStr] = combinedMessage.split("|");

        if (!topic || !messageStr) {
          console.error("Invalid message format");
          continue;
        }

        const message = decodeMessage(messageStr);

        console.log(`Received message ${message.id}:`, {
          topic,
          content: message.content,
          metadata: message.metadata,
          size: messageStr.length,
        });
      } catch (err) {
        console.error("Error processing message:", err);
        if (err instanceof Error) {
          console.error("Error details:", err.message);
        }
        // Log the message parts for debugging
        const parts: Buffer[] = [];
        let hasMore = true;
        while (hasMore) {
          const part = subscriberSocket.receiveBinary(4096);
          parts.push(part);
          hasMore = subscriberSocket.getOption(ZMQ_RCVMORE) === 1;
        }
        console.error(
          "Message parts:",
          parts.map((part) =>
            Array.from(part)
              .slice(0, 32)
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(" ")
          )
        );
      }
    }
  } catch (err) {
    console.error("Subscriber error:", err);
  } finally {
    if (subscriberSocket) {
      subscriberSocket.close();
    }
    if (context) {
      context.terminate();
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
