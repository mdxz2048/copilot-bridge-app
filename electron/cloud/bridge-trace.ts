import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { safeModifiedFields, safeProtocolEnum } from './request-diagnostics.js';

export class BridgeTrace {
  readonly directory: string;
  constructor(directory: string) { this.directory = directory; }
  write(stage: string, traceId: string, metadata: Record<string, unknown>, body?: unknown) {
    try {
      mkdirSync(this.directory, { recursive: true });
      let capture = false;
      try { const config = JSON.parse(readFileSync(join(this.directory, 'capture.json'), 'utf8')); capture = config.captureBodies === true && Date.parse(config.expiresAt) > Date.now(); } catch {}
      const entry = { time: new Date().toISOString(), stage, traceId, ...metadata, ...(capture && body !== undefined ? { body } : {}) };
      let line = JSON.stringify(redactTrace(entry));
      if (Buffer.byteLength(line) > 4 * 1024 * 1024) line = JSON.stringify(redactTrace({ stage, traceId, time: entry.time, bodyOmitted: 'exceeds 4 MB capture limit' }));
      const path = join(this.directory, 'requests.jsonl');
      if (existsSync(path) && statSync(path).size + Buffer.byteLength(line) + 1 > 10 * 1024 * 1024) {
        rmSync(path + '.4', { force: true });
        for (let i = 3; i >= 1; i--) if (existsSync(path + '.' + i)) renameSync(path + '.' + i, path + '.' + (i + 1));
        renameSync(path, path + '.1');
      }
      appendFileSync(path, line + '\n', { encoding: 'utf8', mode: 0o600 });
    } catch { /* Diagnostics must never prevent an AI request. */ }
  }
}

/** Capture records structure, never prompts, document contents or tool arguments/results. */
export function redactTrace(value: unknown, key = ""): unknown {
  if(key==="reason"&&["new_user_instruction","missing_tool_outputs","unknown_or_ambiguous"].includes(String(value)))return value;
  if(key==="modifiedFields")return safeModifiedFields(value);
  const protocolEnum=safeProtocolEnum(value,key);if(protocolEnum!==undefined)return protocolEnum;
  if (key === "path" && typeof value === "string" && ["/v1/responses", "/v1/models", "/bridge/models", "/health"].includes(value)) return value;
  if (/^(authorization|cookie|password|api.?key|access.?token|refresh.?token|dpop|instructions|text|content|arguments|input|output|delta|encrypted_content|reasoning_content|image_url|file_data|file_url|url|path|local_path|message)$/i.test(key)) {
    return { redacted: true, kind: Array.isArray(value) ? "array" : typeof value, length: typeof value === "string" || Array.isArray(value) ? value.length : undefined };
  }
  if (Array.isArray(value)) return value.map(item => redactTrace(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redactTrace(item, name)]));
  if (typeof value === "string" && !/^(time|stage|traceId|threadId|sessionId|conversationId|previousResponseId|requestId|aiRequestId|responseId|event|model|mode|effort|type|status|code|name|method|id|call_id|item_id|itemId|logicalModelId|instanceId|providerKind|protocolMode|responsesProfile|inputProtocol|outputProtocol)$/i.test(key)) return { redacted: true, kind: "string", length: value.length };
  if (typeof value === "string" && (value.length > 200 || !/^[A-Za-z0-9_.:/+\- ]+$/.test(value))) return { redacted: true, kind: "string", length: value.length };
  if (typeof value === "string") return value.replace(/\bsk-[a-zA-Z0-9_-]{8,}/g, "[REDACTED_KEY]").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
  return value;
}
