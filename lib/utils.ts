// lib/utils.ts

// Message type definitions
export interface Message {
  id: number
  timestamp: string // Store BigInt as string
  content: string
  metadata?: {
    source?: string
    priority?: number
    tags?: string[]
  }
}

// Convert hrtime to epoch time in nanoseconds
export function getEpochTimeNs(): bigint {
  return process.hrtime.bigint()
}

// Message encoding/decoding utilities using JSON
export const encodeMessage = (message: Message): string => {
  return JSON.stringify(message)
}

export const decodeMessage = (data: string): Message => {
  return JSON.parse(data)
}

// Format timestamp for display
export function formatTimestamp(timestampNs: bigint): string {
  return new Date(Number(timestampNs / BigInt(1_000_000))).toISOString()
}

// Calculate latency in microseconds
export function calculateLatencyUs(sendTimeNs: bigint, receiveTimeNs: bigint): number {
  const latencyNs = receiveTimeNs - sendTimeNs
  return Number(latencyNs) / 1_000
}
