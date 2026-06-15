// src/lib/audio/store.ts
/**
 * Object-store access for narration clips. Reads are creds-free (anonymous HEAD
 * against AUDIO_ORIGIN, same bucket the `/audio` proxy serves). Writes use a
 * scoped MinIO credential; when unconfigured, writes are skipped (returns false)
 * so dev/test still synthesize-and-stream without durable caching.
 */
import { Buffer } from "node:buffer";
import { getEnv } from "@/lib/env";
import { captureNonCritical } from "@/lib/capture";
import { clipObjectPath } from "./config";

/** True if a clip already exists in the bucket (anonymous HEAD via AUDIO_ORIGIN). */
export async function clipExists(prefix: string, key: string): Promise<boolean> {
  const origin = getEnv("AUDIO_ORIGIN", "").trim().replace(/\/$/, "");
  if (!origin) return false;
  try {
    const res = await fetch(`${origin}/${clipObjectPath(prefix, key)}`, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

interface S3Config {
  endPoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  port?: number;
  useSSL: boolean;
}

function s3Config(): S3Config | null {
  const endpointRaw = getEnv("AUDIO_S3_ENDPOINT", "").trim();
  const accessKey = getEnv("AUDIO_S3_ACCESS_KEY", "").trim();
  const secretKey = getEnv("AUDIO_S3_SECRET_KEY", "").trim();
  const bucket = getEnv("AUDIO_S3_BUCKET", "").trim();
  if (!endpointRaw || !accessKey || !secretKey || !bucket) return null;
  // Accept "host", "host:port", or "http(s)://host:port".
  const useSSL = endpointRaw.startsWith("https://");
  const hostPort = endpointRaw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const [endPoint, portStr] = hostPort.split(":");
  const port = portStr ? Number.parseInt(portStr, 10) : undefined;
  return { endPoint, accessKey, secretKey, bucket, port, useSSL };
}

/** Write-through a clip. Returns false (and never throws) when unconfigured or on error. */
export async function putClip(prefix: string, key: string, bytes: Uint8Array): Promise<boolean> {
  const cfg = s3Config();
  if (!cfg) return false;
  try {
    const { Client } = await import("minio");
    const client = new Client({
      endPoint: cfg.endPoint,
      port: cfg.port,
      useSSL: cfg.useSSL,
      accessKey: cfg.accessKey,
      secretKey: cfg.secretKey,
    });
    const body = Buffer.from(bytes);
    await client.putObject(cfg.bucket, clipObjectPath(prefix, key), body, body.length, {
      "Content-Type": "audio/mpeg",
    });
    return true;
  } catch (err) {
    captureNonCritical(`putClip failed for ${prefix}/${key}`, err);
    return false;
  }
}
