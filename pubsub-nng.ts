import { NNG_PUB0, NNG_SUB0, Socket } from "./lib/ffi-nng";
import type { Message } from "./lib/utils";
import {
  calculateLatencyUs,
  decodeMessage,
  encodeMessage,
  formatTimestamp,
  getEpochTimeNs,
} from "./lib/utils";

const PUB_ENDPOINT = "ipc:///tmp/nng_pub.ipc";
const PONG_ENDPOINT = "ipc:///tmp/nng_pong.ipc";
const DEFAULT_TOPIC = "UPDATES";
const PONG_TOPIC = "PONG";

// Parse command line arguments
const args = process.argv.slice(2);
const mode = args[0]?.toLowerCase();

if (!mode || (mode !== "pub" && mode !== "sub")) {
  console.error("Usage: bun pubsub-nng.ts [pub|sub]");
  process.exit(1);
}

async function waitForConnection(
  socket: Socket,
  endpoint: string,
  maxRetries = 10,
  retryDelay = 1000
): Promise<void> {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      socket.dial(endpoint);
      console.log(`Successfully connected to ${endpoint}`);
      return;
    } catch (err) {
      retries++;
      if (retries >= maxRetries) {
        throw new Error(
          `Failed to connect to ${endpoint} after ${maxRetries} attempts`
        );
      }
      console.log(
        `Connection attempt ${retries}/${maxRetries} failed, retrying in ${retryDelay}ms...`
      );
      await Bun.sleep(retryDelay);
    }
  }
}

async function runPublisher() {
  console.log("Starting NNG Publisher/Subscriber...");
  let pubSocket: Socket | null = null;
  let pongSocket: Socket | null = null;

  try {
    // Setup publisher socket
    pubSocket = new Socket(NNG_PUB0);
    console.log("Created publisher socket");

    pubSocket.listen(PUB_ENDPOINT);
    console.log(`Publisher listening on ${PUB_ENDPOINT}`);

    // Setup pong subscriber socket
    pongSocket = new Socket(NNG_SUB0);
    console.log("Created pong subscriber socket");

    pongSocket.subscribe(PONG_TOPIC);
    console.log(`Subscribed to pong topic: "${PONG_TOPIC}"`);

    // Try to connect to pong publisher with retries
    console.log(`Attempting to connect to ${PONG_ENDPOINT}...`);
    await waitForConnection(pongSocket, PONG_ENDPOINT);
    console.log(`Pong subscriber connected to ${PONG_ENDPOINT}`);

    let count = 0;
    while (true) {
      try {
        const sendTimeNs = getEpochTimeNs();
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
        console.log("Sending message:", {
          topic: DEFAULT_TOPIC,
          messageLength: combinedMessage.length,
          rawMessage: combinedMessage.slice(0, 100) + "...", // Log first 100 chars
        });

        const bytesSent = pubSocket.send(combinedMessage);
        console.log(`Message sent, bytes: ${bytesSent}`);

        // Wait for pong response
        const pongMessage = pongSocket.receive(32 * 1024);
        const [pongTopic, pongStr] = pongMessage.split("|");
        if (pongTopic && pongStr && pongTopic === PONG_TOPIC) {
          const pongMsg = decodeMessage(pongStr);
          const receiveTimeNs = getEpochTimeNs();
          const sendTimeNs = BigInt(pongMsg.timestamp);
          const roundTripLatencyUs = calculateLatencyUs(
            sendTimeNs,
            receiveTimeNs
          );
          const oneWayLatencyUs = roundTripLatencyUs / 2;

          console.log(`Round-trip complete for message ${count}:`, {
            round_trip_latency_us: roundTripLatencyUs.toFixed(3),
            one_way_latency_us: oneWayLatencyUs.toFixed(3),
          });
        }

        count++;
        await Bun.sleep(100);
      } catch (sendErr) {
        console.error("Error in publisher loop:", sendErr);
        await Bun.sleep(1000);
      }
    }
  } catch (err) {
    console.error("Publisher error:", err);
  } finally {
    if (pubSocket) pubSocket.close();
    if (pongSocket) pongSocket.close();
    console.log("Publisher shut down.");
  }
}

async function runSubscriber() {
  console.log("Starting NNG Subscriber/Publisher...");
  let subSocket: Socket | null = null;
  let pongPubSocket: Socket | null = null;

  try {
    // Setup subscriber socket
    subSocket = new Socket(NNG_SUB0);
    console.log("Created subscriber socket");

    // Subscribe to topic BEFORE connecting
    subSocket.subscribe(DEFAULT_TOPIC);
    console.log(`Subscribed to topic: "${DEFAULT_TOPIC}"`);

    // Setup pong publisher socket first
    pongPubSocket = new Socket(NNG_PUB0);
    pongPubSocket.listen(PONG_ENDPOINT);
    console.log(`Pong publisher listening on ${PONG_ENDPOINT}`);

    // Try to connect to publisher with retries
    console.log(`Attempting to connect to ${PUB_ENDPOINT}...`);
    await waitForConnection(subSocket, PUB_ENDPOINT);
    console.log(`Subscriber connected to ${PUB_ENDPOINT}`);

    // Add debug logging for receive
    console.log("Starting message receive loop...");
    while (true) {
      try {
        console.log("Waiting for message...");
        const combinedMessage = subSocket.receive(32 * 1024);
        console.log("Received raw message:", combinedMessage);

        if (combinedMessage.length === 0) {
          console.log("Received empty message, continuing...");
          continue;
        }

        const [topic, messageStr] = combinedMessage.split("|");
        console.log("Parsed message:", {
          topic,
          messageLength: messageStr?.length,
        });

        if (!topic || !messageStr) {
          console.error("Invalid message format");
          continue;
        }

        const message = decodeMessage(messageStr);
        console.log(`Received message ${message.id}:`, {
          topic,
          timestamp: formatTimestamp(BigInt(message.timestamp)),
          content: message.content,
          metadata: message.metadata,
          size: messageStr.length,
        });

        // Send pong response immediately
        const pongMessage: Message = {
          id: message.id,
          timestamp: message.timestamp, // Keep original timestamp
          content: `Pong for ${message.id}`,
          metadata: {
            source: "subscriber",
            priority: message.metadata?.priority,
            tags: ["pong", "nng", `msg-${message.id}`],
          },
        };

        const pongStr = encodeMessage(pongMessage);
        const pongCombined = `${PONG_TOPIC}|${pongStr}`;
        pongPubSocket.send(pongCombined);
      } catch (err) {
        console.error("Error in subscriber loop:", err);
        await Bun.sleep(100);
      }
    }
  } catch (err) {
    console.error("Subscriber error:", err);
  } finally {
    if (subSocket) subSocket.close();
    if (pongPubSocket) pongPubSocket.close();
    console.log("Subscriber shut down.");
  }
}

// Run the appropriate mode
if (mode === "pub") {
  runPublisher();
} else {
  runSubscriber();
}
