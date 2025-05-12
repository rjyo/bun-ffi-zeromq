import {
  Context,
  Socket,
  ZMQ_PUB,
  ZMQ_SNDMORE,
  ZMQ_SUB,
  ZMQ_SUBSCRIBE,
  ZMQ_RCVMORE,
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

// Message encoding/decoding utilities using JSON
const encodeMessage = (message: Message): Buffer => {
  return Buffer.from(JSON.stringify(message));
};

const decodeMessage = (data: Buffer): Message => {
  return JSON.parse(data.toString());
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

      // Encode to JSON
      const messageBuffer = encodeMessage(message);

      // Send topic as first part with ZMQ_SNDMORE flag
      const topicBuffer = Buffer.from(DEFAULT_TOPIC);
      publisherSocket.send(topicBuffer, ZMQ_SNDMORE);

      // Send actual message as second part
      const bytesSent = publisherSocket.send(messageBuffer);

      const jsonSize = messageBuffer.length;

      console.log(`Sent message ${count}:`, {
        bytes: bytesSent,
        size: jsonSize,
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
      try {
        // Receive all parts of the message
        const parts: Buffer[] = [];
        let hasMore = true;

        while (hasMore) {
          // Use receiveBinary for raw binary data
          const part = subscriberSocket.receiveBinary(4096);
          parts.push(part);
          // Check if there are more parts
          hasMore = subscriberSocket.getOption(ZMQ_RCVMORE) === 1;
        }

        if (parts.length !== 2) {
          console.error(`Expected 2 message parts, got ${parts.length}`);
          continue;
        }

        // We know we have exactly 2 parts at this point
        const [topicBuffer, messageBuffer] = parts as [Buffer, Buffer];

        // Convert topic to string (it's safe to do this for the topic)
        const topic = topicBuffer.toString("utf-8");

        // Decode the JSON data
        const message = decodeMessage(messageBuffer);

        console.log(`Received message ${message.id}:`, {
          topic,
          timestamp: new Date(message.timestamp).toISOString(),
          content: message.content,
          metadata: message.metadata,
          size: messageBuffer.length,
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
