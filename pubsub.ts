import {
  Context,
  Socket,
  ZMQ_PUB,
  ZMQ_RCVMORE,
  ZMQ_SNDMORE,
  ZMQ_SUB,
  ZMQ_SUBSCRIBE,
} from "./lib/ffi-zeromq";

const DEFAULT_ENDPOINT = "ipc:///tmp/zeromq_test.ipc";
const DEFAULT_TOPIC = "UPDATES";

// Message type definitions
interface Message {
  id: number;
  timestamp: string; // Changed to string to store BigInt as string
  content: string;
  metadata?: {
    source?: string;
    priority?: number;
    tags?: string[];
  };
}

// Calibration state
let hrToEpochOffsetNs: bigint;

// Initialize time calibration
function calibrateTime() {
  const nowMs = Date.now();
  const hrNow = process.hrtime.bigint();
  hrToEpochOffsetNs = BigInt(nowMs) * BigInt(1_000_000) - hrNow;
  console.log("Time calibration complete");
}

// Convert hrtime to epoch time in nanoseconds
function getEpochTimeFromHrtime(): bigint {
  const hrNow = process.hrtime.bigint();
  return hrNow + hrToEpochOffsetNs;
}

// Message encoding/decoding utilities using JSON
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
  calibrateTime(); // Calibrate time at startup
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
      const sendTimeNs = getEpochTimeFromHrtime();
      const message: Message = {
        id: count,
        timestamp: sendTimeNs.toString(), // Convert BigInt to string for JSON
        content: `Message ${count}`,
        metadata: {
          source: "publisher",
          priority: count % 3,
          tags: ["test", "zeromq", `msg-${count}`],
        },
      };

      // Encode to JSON string
      const messageStr = encodeMessage(message);

      // Combine topic and message with a delimiter
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
  calibrateTime(); // Calibrate time at startup
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
        // Receive single message
        const combinedMessage = subscriberSocket.receive();

        // Split topic and message
        const [topic, messageStr] = combinedMessage.split("|");

        if (!topic || !messageStr) {
          console.error("Invalid message format");
          continue;
        }

        // Decode the JSON data
        const message = decodeMessage(messageStr);

        // Calculate time difference in nanoseconds
        const receiveTimeNs = getEpochTimeFromHrtime();
        const sendTimeNs = BigInt(message.timestamp); // Convert string back to BigInt
        const latencyNs = receiveTimeNs - sendTimeNs;
        const latencyUs = Number(latencyNs) / 1_000; // Convert to microseconds

        console.log(`Received message ${message.id}:`, {
          topic,
          timestamp: new Date(
            Number(sendTimeNs / BigInt(1_000_000))
          ).toISOString(), // Convert to ms for display
          content: message.content,
          metadata: message.metadata,
          size: messageStr.length,
          latency_us: latencyUs.toFixed(3),
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
