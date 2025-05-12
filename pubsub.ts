import {
  Context,
  Socket,
  ZMQ_PUB,
  ZMQ_SNDMORE,
  ZMQ_SUB,
  ZMQ_SUBSCRIBE,
} from "./lib/ffi-zeromq";

const DEFAULT_ENDPOINT = "ipc:///tmp/zeromq_test.ipc";
const DEFAULT_TOPIC = "UPDATES";

// Message type definitions
interface Message {
  id: number;
  timestamp: number;
  content: string;
  metadata?: {
    source?: string;
    priority?: number;
    tags?: string[];
  };
}

// Message encoding/decoding utilities
const encodeMessage = (message: Message): string => {
  return JSON.stringify(message);
};

const decodeMessage = (data: string): Message => {
  return JSON.parse(data);
};

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
    console.log("Context created");

    publisherSocket = new Socket(context, ZMQ_PUB);
    console.log("Publisher socket created");

    publisherSocket.bind(DEFAULT_ENDPOINT);
    console.log(`Publisher bound to ${DEFAULT_ENDPOINT}`);

    await Bun.sleep(1000); // Allow time for subscribers to connect

    let count = 0;
    while (true) {
      const message: Message = {
        id: count,
        timestamp: Date.now(),
        content: `Message ${count}`,
        metadata: {
          source: "publisher",
          priority: count % 3,
          tags: ["test", "zeromq", `msg-${count}`],
        },
      };

      const encodedMessage = encodeMessage(message);

      // Send topic as first part with ZMQ_SNDMORE flag
      publisherSocket.send(DEFAULT_TOPIC, ZMQ_SNDMORE);
      // Send actual message as second part
      const bytesSent = publisherSocket.send(encodedMessage);

      console.log(`Sent message ${count}:`, {
        bytes: bytesSent,
        messageSize: Buffer.byteLength(encodedMessage, "utf-8"),
        message: message,
      });

      count++;
      await Bun.sleep(1000);
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
}

async function runSubscriber() {
  console.log("Starting ZeroMQ Subscriber...");
  let context: Context | null = null;
  let subscriberSocket: Socket | null = null;

  try {
    context = new Context();
    console.log("Context created");

    subscriberSocket = new Socket(context, ZMQ_SUB);
    console.log("Subscriber socket created");

    subscriberSocket.setOption(ZMQ_SUBSCRIBE, DEFAULT_TOPIC, true);
    console.log(`Subscribed to topic: "${DEFAULT_TOPIC}"`);

    subscriberSocket.connect(DEFAULT_ENDPOINT);
    console.log(`Subscriber connected to ${DEFAULT_ENDPOINT}`);

    while (true) {
      // Receive topic (first part)
      const topic = subscriberSocket.receive(1024);
      // Receive message (second part)
      const encodedMessage = subscriberSocket.receive(4096);

      const messageSize = Buffer.byteLength(encodedMessage, "utf-8");
      console.log(`Received message size: ${messageSize} bytes`);

      try {
        const message = decodeMessage(encodedMessage);
        console.log(`Received message ${message.id}:`, {
          topic,
          timestamp: new Date(message.timestamp).toISOString(),
          content: message.content,
          metadata: message.metadata,
          messageSize,
        });
      } catch (err) {
        console.error("Error decoding message:", err);
        console.error("Raw encoded message:", encodedMessage);
        console.error("Message length:", encodedMessage.length);
      }
    }
  } catch (err) {
    console.error("Subscriber error:", err);
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
}

// Run the appropriate mode
if (mode === "pub") {
  runPublisher();
} else {
  runSubscriber();
}
