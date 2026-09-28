import type {
  InputItem,
  FunctionCallOutput,
} from "#providers/codex/schemas.js";
import { existsSync, statSync } from "node:fs";
import { extname, isAbsolute } from "node:path";
import type { MessageOptions } from "@github/copilot-sdk";

type Attachment = NonNullable<MessageOptions["attachments"]>[number];
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_EXTENSIONS = new Set([
  ".bmp",
  ".csv",
  ".docx",
  ".gif",
  ".jpeg",
  ".jpg",
  ".json",
  ".md",
  ".pdf",
  ".png",
  ".pptx",
  ".py",
  ".rs",
  ".ts",
  ".tsx",
  ".txt",
  ".webp",
  ".xlsx",
  ".xml",
  ".yaml",
  ".yml",
  ".zip",
]);
const ALLOWED_DATA_MIME_TYPES = new Set([
  "application/json",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "text/csv",
  "text/markdown",
  "text/plain",
  "text/x-python",
  "text/xml",
]);
const TEXT_ATTACHMENT_MIME_TYPES = new Map([
  [".c", "text/x-c"],
  [".cpp", "text/x-c++"],
  [".csv", "text/csv"],
  [".go", "text/x-go"],
  [".h", "text/x-c"],
  [".hpp", "text/x-c++"],
  [".java", "text/x-java"],
  [".js", "text/javascript"],
  [".json", "application/json"],
  [".jsx", "text/jsx"],
  [".md", "text/markdown"],
  [".ps1", "text/x-powershell"],
  [".py", "text/x-python"],
  [".rs", "text/x-rust"],
  [".sh", "text/x-shellscript"],
  [".ts", "text/typescript"],
  [".tsx", "text/tsx"],
  [".txt", "text/plain"],
  [".xml", "text/xml"],
  [".yaml", "text/yaml"],
  [".yml", "text/yaml"],
]);

function extractContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const part of content) {
    if (
      part &&
      typeof part === "object" &&
      "text" in part &&
      typeof part.text === "string"
    ) {
      text += part.text;
    }
  }
  return text;
}

export function formatResponsesPrompt(input: string | InputItem[]): string {
  if (typeof input === "string") {
    return `[User]: ${input}`;
  }

  const parts: string[] = [];

  for (const item of input) {
    if ("role" in item) {
      const content = extractContent(item.content);
      switch (item.role) {
        case "system":
        case "developer":
          break;
        case "user":
          parts.push(`[User]: ${content}`);
          break;
        case "assistant":
          if (content) parts.push(`[Assistant]: ${content}`);
          break;
      }
    } else if (item.type === "function_call") {
      parts.push(
        `[Assistant called tool ${String(item.name)} with args: ${String(item.arguments)}]`,
      );
    } else if (item.type === "function_call_output") {
      parts.push(
        `[Tool result for ${String(item.call_id)}]: ${String(item.output)}`,
      );
    }
  }

  return parts.join("\n\n");
}

export function extractInstructions(
  input: string | InputItem[],
): string | undefined {
  if (typeof input === "string") return undefined;

  const parts: string[] = [];
  for (const item of input) {
    if (
      "role" in item &&
      (item.role === "system" || item.role === "developer")
    ) {
      const text = extractContent(item.content);
      if (text) parts.push(text);
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

export function extractFunctionCallOutputs(
  input: string | InputItem[],
): FunctionCallOutput[] {
  if (typeof input === "string") return [];
  return input.filter(
    (item): item is FunctionCallOutput =>
      "type" in item && item.type === "function_call_output",
  );
}

export function extractResponsesAttachments(
  input: string | InputItem[],
): Attachment[] {
  if (typeof input === "string") return [];

  const seenPaths = new Set<string>();
  const pathAttachments: Attachment[] = [];
  const inlineAttachments: Attachment[] = [];

  for (const item of input) {
    if (!("role" in item)) continue;
    const content = item.content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const record = part as Record<string, unknown>;
      if (typeof record.text === "string") {
        for (const path of extractDesktopPaths(record.text)) {
          if (
            !seenPaths.has(path) &&
            isAllowedAttachmentPath(path) &&
            !TEXT_ATTACHMENT_MIME_TYPES.has(extname(path).toLowerCase())
          ) {
            seenPaths.add(path);
            pathAttachments.push({ type: "file", path });
          }
        }
      }

      if (
        record.type === "input_image" &&
        typeof record.image_url === "string"
      ) {
        const attachment = attachmentFromDataUrl(record.image_url, "image");
        if (attachment) inlineAttachments.push(attachment);
      }

      if (record.type === "input_file") {
        const fileData =
          typeof record.file_data === "string"
            ? record.file_data
            : typeof record.file_url === "string"
              ? record.file_url
              : undefined;
        if (fileData?.startsWith("data:")) {
          const attachment = attachmentFromDataUrl(
            fileData,
            typeof record.filename === "string" ? record.filename : "file",
          );
          if (attachment) inlineAttachments.push(attachment);
        }
      }
    }
  }

  // Desktop provides both a path and data URL for a pasted image. Prefer the
  // path-backed attachment so the same image is not sent twice.
  return pathAttachments.length > 0 ? pathAttachments : inlineAttachments;
}

function extractDesktopPaths(text: string): string[] {
  const paths = new Set<string>();
  const imageTag = /<image\b[^>]*\bpath="([^"]+)"/gi;
  for (const match of text.matchAll(imageTag)) {
    const path = match[1];
    if (path) paths.add(path);
  }
  for (const path of extractDesktopFileMentionPaths(text)) paths.add(path);
  return [...paths];
}

function extractDesktopFileMentionPaths(text: string): string[] {
  if (!text.includes("# Files mentioned by the user:")) return [];
  const paths = new Set<string>();
  const fileMention = /^##[^\r\n:]+:\s*([A-Za-z]:[\\/][^\r\n]+)$/gim;
  for (const match of text.matchAll(fileMention)) {
    const path = match[1];
    if (path) paths.add(path);
  }
  return [...paths];
}

function isAllowedAttachmentPath(path: string): boolean {
  if (!isAbsolute(path) || !existsSync(path)) return false;
  try {
    const metadata = statSync(path);
    if (!metadata.isFile() || metadata.size > MAX_ATTACHMENT_BYTES)
      return false;
    return ALLOWED_FILE_EXTENSIONS.has(extname(path).toLowerCase());
  } catch {
    return false;
  }
}

function attachmentFromDataUrl(
  dataUrl: string,
  displayName: string,
): Attachment | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(dataUrl);
  if (!match?.[1] || !match[2]) return null;
  const data = match[2].replace(/\s/g, "");
  const mimeType = match[1].toLowerCase();
  const estimatedBytes = Math.floor((data.length * 3) / 4);
  if (
    estimatedBytes > MAX_ATTACHMENT_BYTES ||
    (!mimeType.startsWith("image/") && !ALLOWED_DATA_MIME_TYPES.has(mimeType))
  )
    return null;
  return {
    type: "blob",
    data,
    mimeType,
    displayName,
  };
}
