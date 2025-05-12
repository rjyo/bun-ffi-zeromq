// lib/utils.ts

// Message type definitions
export interface Message {
  id: number;
  timestamp: string; // Store BigInt as string
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
export function calibrateTime(): void {
  const nowMs = Date.now();
  const hrNow = process.hrtime.bigint();
  hrToEpochOffsetNs = BigInt(nowMs) * BigInt(1_000_000) - hrNow;
  console.log("Time calibration complete");
}

// Convert hrtime to epoch time in nanoseconds
export function getEpochTimeFromHrtime(): bigint {
  const hrNow = process.hrtime.bigint();
  return hrNow + hrToEpochOffsetNs;
}

// Message encoding/decoding utilities using JSON
export const encodeMessage = (message: Message): string => {
  return JSON.stringify(message);
};

export const decodeMessage = (data: string): Message => {
  return JSON.parse(data);
};

// Format timestamp for display
export function formatTimestamp(timestampNs: bigint): string {
  return new Date(Number(timestampNs / BigInt(1_000_000))).toISOString();
}

// Calculate latency in microseconds
export function calculateLatencyUs(
  sendTimeNs: bigint,
  receiveTimeNs: bigint
): number {
  const latencyNs = receiveTimeNs - sendTimeNs;
  return Number(latencyNs) / 1_000;
}
