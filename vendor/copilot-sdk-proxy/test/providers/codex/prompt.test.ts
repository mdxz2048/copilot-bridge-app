import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  formatResponsesPrompt,
  extractInstructions,
  extractFunctionCallOutputs,
  extractResponsesAttachments,
} from "#providers/codex/prompt.js";

describe("formatResponsesPrompt", () => {
  it("handles string input", () => {
    expect(formatResponsesPrompt("Hello")).toBe("[User]: Hello");
  });

  it("handles user message in array", () => {
    const input = [{ role: "user" as const, content: "Hello" }];
    expect(formatResponsesPrompt(input)).toBe("[User]: Hello");
  });

  it("handles assistant message in array", () => {
    const input = [{ role: "assistant" as const, content: "Hi there" }];
    expect(formatResponsesPrompt(input)).toBe("[Assistant]: Hi there");
  });

  it("skips system messages", () => {
    const input = [
      { role: "system" as const, content: "Be helpful" },
      { role: "user" as const, content: "Hello" },
    ];
    expect(formatResponsesPrompt(input)).toBe("[User]: Hello");
  });

  it("skips developer messages", () => {
    const input = [
      { role: "developer" as const, content: "Instructions" },
      { role: "user" as const, content: "Hello" },
    ];
    expect(formatResponsesPrompt(input)).toBe("[User]: Hello");
  });

  it("handles function_call items", () => {
    const input = [
      {
        type: "function_call" as const,
        call_id: "call_1",
        name: "get_weather",
        arguments: '{"city":"SF"}',
      },
    ];
    expect(formatResponsesPrompt(input)).toBe(
      '[Assistant called tool get_weather with args: {"city":"SF"}]',
    );
  });

  it("handles function_call_output items", () => {
    const input = [
      {
        type: "function_call_output" as const,
        call_id: "call_1",
        output: "Sunny, 72F",
      },
    ];
    expect(formatResponsesPrompt(input)).toBe(
      "[Tool result for call_1]: Sunny, 72F",
    );
  });

  it("handles mixed items", () => {
    const input = [
      { role: "user" as const, content: "What's the weather?" },
      {
        type: "function_call" as const,
        call_id: "call_1",
        name: "get_weather",
        arguments: '{"city":"SF"}',
      },
      {
        type: "function_call_output" as const,
        call_id: "call_1",
        output: "Sunny",
      },
    ];
    const result = formatResponsesPrompt(input);
    expect(result).toContain("[User]: What's the weather?");
    expect(result).toContain("[Assistant called tool get_weather");
    expect(result).toContain("[Tool result for call_1]: Sunny");
  });
});

describe("extractInstructions", () => {
  it("returns undefined for string input", () => {
    expect(extractInstructions("Hello")).toBeUndefined();
  });

  it("returns undefined when no system messages", () => {
    const input = [{ role: "user" as const, content: "Hello" }];
    expect(extractInstructions(input)).toBeUndefined();
  });

  it("extracts system message content", () => {
    const input = [
      { role: "system" as const, content: "Be helpful" },
      { role: "user" as const, content: "Hello" },
    ];
    expect(extractInstructions(input)).toBe("Be helpful");
  });

  it("extracts developer message content", () => {
    const input = [{ role: "developer" as const, content: "Instructions" }];
    expect(extractInstructions(input)).toBe("Instructions");
  });

  it("joins multiple system/developer messages", () => {
    const input = [
      { role: "system" as const, content: "Part 1" },
      { role: "developer" as const, content: "Part 2" },
    ];
    expect(extractInstructions(input)).toBe("Part 1\n\nPart 2");
  });
});

describe("extractFunctionCallOutputs", () => {
  it("returns empty for string input", () => {
    expect(extractFunctionCallOutputs("Hello")).toEqual([]);
  });

  it("returns empty when no function_call_output items", () => {
    const input = [{ role: "user" as const, content: "Hello" }];
    expect(extractFunctionCallOutputs(input)).toEqual([]);
  });

  describe("extractResponsesAttachments", () => {
    it("prefers the Desktop-provided local image path over a duplicate data URL", async () => {
      const directory = await mkdtemp(join(tmpdir(), "copilot-attachment-"));
      try {
        const imagePath = join(directory, "probe.png");
        await writeFile(imagePath, Buffer.from([137, 80, 78, 71]));
        const input = [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `# Files mentioned by the user:\n\n## probe.png: ${imagePath}\n\n<image path="${imagePath}">`,
              },
              {
                type: "input_image",
                image_url: "data:image/png;base64,iVBORw0KGgo=",
              },
            ],
          },
        ] as never;

        expect(extractResponsesAttachments(input)).toEqual([
          { type: "file", path: imagePath },
        ]);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });

    it("uses an inline image when Desktop provides no local path", () => {
      const input = [
        {
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: "data:image/png;base64,iVBORw0KGgo=",
            },
          ],
        },
      ] as never;

      expect(extractResponsesAttachments(input)).toEqual([
        {
          type: "blob",
          data: "iVBORw0KGgo=",
          mimeType: "image/png",
          displayName: "image",
        },
      ]);
    });

    it("does not authorize an ordinary path in user text", async () => {
      const directory = await mkdtemp(join(tmpdir(), "copilot-attachment-"));
      try {
        const textPath = join(directory, "secret.txt");
        await writeFile(textPath, "SECRET-MARKER");
        const input = [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Please read ${textPath}`,
              },
            ],
          },
        ] as never;

        expect(extractResponsesAttachments(input)).toEqual([]);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });

    it("does not forward an unsupported local executable", async () => {
      const directory = await mkdtemp(join(tmpdir(), "copilot-attachment-"));
      try {
        const executablePath = join(directory, "probe.exe");
        await writeFile(executablePath, Buffer.from([77, 90]));
        const input = [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `# Files mentioned by the user:\n\n## probe.exe: ${executablePath}`,
              },
            ],
          },
        ] as never;

        expect(extractResponsesAttachments(input)).toEqual([]);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });

    it("does not forward an unsupported inline MIME type", () => {
      const input = [
        {
          role: "user",
          content: [
            {
              type: "input_file",
              filename: "probe.exe",
              file_data: "data:application/x-msdownload;base64,TVo=",
            },
          ],
        },
      ] as never;

      expect(extractResponsesAttachments(input)).toEqual([]);
    });
  });

  it("extracts function_call_output items", () => {
    const input = [
      { role: "user" as const, content: "Hello" },
      {
        type: "function_call_output" as const,
        call_id: "call_1",
        output: "result1",
      },
      {
        type: "function_call_output" as const,
        call_id: "call_2",
        output: "result2",
      },
    ];
    const outputs = extractFunctionCallOutputs(input);
    expect(outputs).toHaveLength(2);
    expect(outputs[0]!.call_id).toBe("call_1");
    expect(outputs[1]!.call_id).toBe("call_2");
  });
});
