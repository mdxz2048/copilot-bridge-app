import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import process from "node:process";
import {
  CopilotClient,
  RuntimeConnection,
} from "@github/copilot-sdk";

const [runtimePath, model, fixturePath, kind, mode] = process.argv.slice(2);

if (!runtimePath || !model || !fixturePath || !kind || !mode) {
  throw new Error(
    "Usage: node attachment-runtime-probe.mjs <runtime> <model> <fixture> <txt|png> <path|blob>",
  );
}

const fixture = resolve(fixturePath);
const content = await readFile(fixture);
const metadata = await stat(fixture);
const marker = kind === "txt" ? "ALPHA-482" : "ORANGE-714";
const mimeType = kind === "txt" ? "text/plain" : "image/png";
const attachment = mode === "path"
  ? { type: "file", path: fixture, displayName: basename(fixture) }
  : {
      type: "blob",
      data: content.toString("base64"),
      mimeType,
      displayName: basename(fixture),
    };

const events = [];
const client = new CopilotClient({
  connection: RuntimeConnection.forStdio({ path: runtimePath }),
  workingDirectory: process.cwd(),
  env: Object.fromEntries(
    Object.entries(process.env).filter((entry) => entry[1] != null),
  ),
  logLevel: "error",
});

try {
  await client.start();
  const session = await client.createSession({
    model,
    streaming: true,
    workingDirectory: process.cwd(),
  });
  const unsubscribe = session.on((event) => {
    const attachmentTypes = "data" in event
      && event.data
      && typeof event.data === "object"
      && "attachments" in event.data
      && Array.isArray(event.data.attachments)
      ? event.data.attachments.map((item) =>
        item && typeof item === "object" && "type" in item ? item.type : "unknown",
      )
      : undefined;
    events.push({
      type: event.type,
      ...(attachmentTypes && { attachmentTypes }),
    });
  });
  const response = await session.sendAndWait({
    prompt: `Read the attached ${kind} fixture and reply with only the marker contained in it.`,
    attachments: [attachment],
  });
  unsubscribe();
  const text = response?.data.content ?? "";
  console.log(JSON.stringify({
    result: text.includes(marker) ? "PASS" : "FAIL",
    expectedMarker: marker,
    responseContainsMarker: text.includes(marker),
    attachment: {
      type: mode,
      basename: basename(fixture),
      mimeType,
      size: metadata.size,
      sha256: createHash("sha256").update(content).digest("hex"),
    },
    runtimePath: resolve(runtimePath),
    nodeVersion: process.version,
    cwd: process.cwd(),
    workingDirectory: process.cwd(),
    events,
  }));
} finally {
  await client.stop();
}
