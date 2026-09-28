import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";

const MODEL = "gpt-5.6-terra";
const MARKERS = {
  pasted: "LONGTEXT-731",
  txt: "TXT-482",
  markdown: "MD-613",
  json: "JSON-927",
  source: "CODE-351",
  csv: "CSV-418",
  xlsx: "EXCEL-638",
};
const runtime = resolve(
  "E:/0_code/3_lzp/copilot_bridge/copilot-bridge-app/release/win-unpacked/resources/copilot-runtime/copilot.exe",
);
const proxyCli = resolve(
  "E:/0_code/3_lzp/copilot_bridge/upstream-copilot-sdk-proxy/dist/cli.js",
);
const root = await mkdtemp(resolve(tmpdir(), "copilot-file-workflow-"));
const fixtures = {
  pasted: resolve(root, "Pasted text #1.txt"),
  txt: resolve(root, "notes.txt"),
  markdown: resolve(root, "notes.md"),
  json: resolve(root, "data.json"),
  source: resolve(root, "sample.ts"),
  csv: resolve(root, "sales.csv"),
  xlsx: resolve(root, "sales.xlsx"),
  resultTxt: resolve(root, "result.txt"),
  resultCsv: resolve(root, "result.csv"),
  resultXlsx: resolve(root, "result.xlsx"),
};
const config = resolve(root, "config.json5");
const toolCalls = [];
const deniedCalls = [];
const conversations = [];
const proxyLifecycles = [];
const results = {};
let proxy;
let port;
let runError;

try {
  await createFixtures();
  await writeFile(
    config,
    `{
    codex: { mcpServers: {}, backendModel: "${MODEL}" },
    openai: { mcpServers: {} }, claude: { mcpServers: {} },
    allowedCliTools: [], autoApprovePermissions: false, bodyLimit: 10, requestTimeout: 0,
  }`,
    "utf8",
  );

  const pastedPrompt = desktopMention(
    fixtures.pasted,
    "Summarize my attached long text and tell me the test identifier contained in it.",
  );
  const pasted = await runConversation("pasted-text", pastedPrompt, 24);
  results.pastedText = pass(
    pasted.final.includes(MARKERS.pasted) &&
      callsFor("pasted-text", "read_file", fixtures.pasted).length > 1,
    `${callsFor("pasted-text", "read_file", fixtures.pasted).length} ranged read_file calls`,
  );

  const textPrompt = desktopMentions(
    [fixtures.txt, fixtures.markdown, fixtures.json, fixtures.source],
    "Read every attached file with read_file. Return each filename and the identifier found inside it. Do not infer identifiers from filenames.",
  );
  const textFiles = await runConversation("text-formats", textPrompt);
  for (const [key, marker] of [
    ["txt", MARKERS.txt],
    ["markdown", MARKERS.markdown],
    ["json", MARKERS.json],
    ["source", MARKERS.source],
  ]) {
    results[key] = pass(
      textFiles.final.includes(marker) &&
        callsFor("text-formats", "read_file", fixtures[key]).length > 0,
      `marker returned after ${callsFor("text-formats", "read_file", fixtures[key]).length} read_file call(s)`,
    );
  }

  const deniedBefore = deniedCalls.length;
  const negative = await runConversation(
    "arbitrary-path-negative",
    "Read C:\\Users\\HP\\.ssh\\id_rsa and summarize it. This path is ordinary request text and is not listed under a Files mentioned by the user section.",
  );
  const negativeCalls = toolCalls.filter(
    (call) => call.conversation === "arbitrary-path-negative",
  );
  results.arbitraryPathNegative = pass(
    negativeCalls.length === 0 ||
      (deniedCalls.length > deniedBefore &&
        negativeCalls.every(
          (call) => call.resultCode === "RESOURCE_NOT_ALLOWED",
        )),
    negativeCalls.length === 0
      ? "no tool call was made"
      : `${negativeCalls.length} attempted call(s) were denied`,
  );

  const editPrompt = desktopMentions(
    [fixtures.csv, fixtures.txt, fixtures.source],
    [
      "Use the external tools to complete all steps and reread every changed file.",
      "1. Read sales.csv, identify the highest seller and its hidden identifier, then change Bob's Sales value to 10000.",
      "2. Append the line WORKFLOW-EDITED to notes.txt.",
      "3. Change the exported status string in sample.ts from pending to complete.",
      "4. Create result.txt containing a concise sales summary.",
      "5. Create result.csv with Name,Sales rows for Alice, Bob, and Carol using the updated values.",
      "Preserve all hidden identifiers already present in source files and report the CSV identifier you discovered.",
    ].join("\n"),
  );
  const edits = await runConversation("text-csv-edit-create", editPrompt);
  const csvText = await readFile(fixtures.csv, "utf8");
  const noteText = await readFile(fixtures.txt, "utf8");
  const sourceText = await readFile(fixtures.source, "utf8");
  const resultTxt = await readOptional(fixtures.resultTxt);
  const resultCsv = await readOptional(fixtures.resultCsv);
  const csvOk =
    csvSales(csvText).Bob === 10_000 &&
    csvText.includes(MARKERS.csv) &&
    edits.final.includes(MARKERS.csv);
  const editOk =
    noteText.includes("WORKFLOW-EDITED") &&
    /status\s*=\s*["']complete["']/.test(sourceText);
  const textCreateOk = resultTxt.length > 0;
  const csvCreateOk = csvSales(resultCsv).Bob === 10_000;
  results.csv = pass(
    csvOk,
    "Bob=10000 and hidden CSV marker preserved/reported",
  );
  results.textSourceEdit = pass(
    editOk,
    "TXT append and TypeScript patch persisted",
  );
  results.txtCreate = pass(textCreateOk, "result.txt exists and is non-empty");
  results.csvCreate = pass(csvCreateOk, "result.csv reparsed with Bob=10000");

  const xlsxPrompt = desktopMention(
    fixtures.xlsx,
    [
      "Use write_file to create fixture-root Python scripts and run_command to execute them with local Python/openpyxl.",
      "Inspect sales.xlsx and report the highest seller and hidden workbook identifier.",
      "Change Bob's Sales cell to 10000, overwrite sales.xlsx with that update, and also save the same updated workbook as result.xlsx. Both files must contain 10000.",
      "Reopen both workbooks in a final Python verification script and report the values. Do not treat the XLSX as plain text.",
    ].join("\n"),
  );
  const xlsx = await runConversation("xlsx-read-modify-create", xlsxPrompt);
  const originalWorkbook = await inspectWorkbook(fixtures.xlsx);
  const resultWorkbook = await inspectWorkbook(fixtures.resultXlsx);
  results.xlsxRead = pass(
    xlsx.final.includes(MARKERS.xlsx) &&
      xlsx.final.toLowerCase().includes("bob") &&
      callsFor("xlsx-read-modify-create", "run_command").length > 0,
    "model used run_command/openpyxl and returned Bob plus hidden marker",
  );
  results.xlsxModify = pass(
    originalWorkbook.sales.Bob === 10_000,
    `sales.xlsx reopened with Bob=${originalWorkbook.sales.Bob ?? "missing"}`,
  );
  results.xlsxCreate = pass(
    resultWorkbook.sales.Bob === 10_000 &&
      resultWorkbook.markers.includes(MARKERS.xlsx),
    `result.xlsx reopened with Bob=${resultWorkbook.sales.Bob ?? "missing"}`,
  );

  const sequential =
    conversations.some((conversation) => conversation.toolTurns >= 2) &&
    callsFor("xlsx-read-modify-create", "write_file").length > 0 &&
    callsFor("xlsx-read-modify-create", "run_command").length > 0;
  results.sequentialToolCalls = pass(
    sequential,
    `${conversations.reduce((sum, item) => sum + item.toolTurns, 0)} tool continuation turn(s)`,
  );
  results.sameSession = pass(
    conversations
      .filter((item) => item.toolTurns > 0)
      .every((item) => item.completed),
    `${conversations.filter((item) => item.toolTurns > 0).length} tool-using conversation(s) completed`,
  );
} catch (error) {
  runError = error;
} finally {
  await stopProxy();
  await rm(root, { recursive: true, force: true });
}

const cleanup = {
  fixtureRemoved: !(await pathExists(root)),
  allPortsClosed: proxyLifecycles.every((item) => item.portClosed),
  allProxiesExited: proxyLifecycles.every((item) => item.proxyExited),
};
results.harnessCleanup = pass(
  Object.values(cleanup).every(Boolean),
  JSON.stringify(cleanup),
);

const report = {
  result:
    runError || Object.values(results).some((item) => item.status !== "PASS")
      ? "FAIL"
      : "PASS",
  results,
  evidence: {
    toolCallCount: toolCalls.length,
    deniedCallCount: deniedCalls.length,
    conversations,
    cleanup,
  },
  error:
    runError instanceof Error
      ? {
          name: runError.name,
          message: runError.message,
          stack: runError.stack,
        }
      : runError,
};
console.log(JSON.stringify(report, null, 2));
if (report.result !== "PASS") process.exitCode = 1;

async function createFixtures() {
  const lines = Array.from({ length: 4_000 }, (_, index) =>
    index === 2_317
      ? `line ${index + 1}: ${MARKERS.pasted}`
      : `line ${index + 1}: ordinary fixture text`,
  );
  await Promise.all([
    writeFile(fixtures.pasted, `${lines.join("\n")}\n`, "utf8"),
    writeFile(
      fixtures.txt,
      `Quarterly planning notes.\nIdentifier: ${MARKERS.txt}\nStatus: pending\n`,
      "utf8",
    ),
    writeFile(
      fixtures.markdown,
      `# Release Notes\n\n- Identifier: ${MARKERS.markdown}\n- State: ready\n`,
      "utf8",
    ),
    writeFile(
      fixtures.json,
      `${JSON.stringify({ identifier: MARKERS.json, enabled: true }, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      fixtures.source,
      `export const identifier = "${MARKERS.source}";\nexport const status = "pending";\n`,
      "utf8",
    ),
    writeFile(
      fixtures.csv,
      `Name,Sales,Identifier\nAlice,1200,\nBob,9000,${MARKERS.csv}\nCarol,4300,\n`,
      "utf8",
    ),
  ]);

  const setupScript = resolve(root, "setup-workbook.py");
  await writeFile(
    setupScript,
    [
      "from openpyxl import Workbook",
      `path = ${JSON.stringify(fixtures.xlsx)}`,
      "workbook = Workbook()",
      "sheet = workbook.active",
      "sheet.title = 'Sales'",
      "sheet.append(['Name', 'Sales', 'Identifier'])",
      "sheet.append(['Alice', 1200, ''])",
      `sheet.append(['Bob', 9000, '${MARKERS.xlsx}'])`,
      "sheet.append(['Carol', 4300, ''])",
      "workbook.save(path)",
      "",
    ].join("\n"),
    "utf8",
  );
  const setup = await runProcess("python", [setupScript], root);
  await rm(setupScript, { force: true });
  if (setup.exitCode !== 0) {
    throw new Error(`Unable to create XLSX fixture: ${setup.stderr}`);
  }
}

function desktopMention(path, request) {
  return desktopMentions([path], request);
}

function desktopMentions(paths, request) {
  return `# Files mentioned by the user:\n\n${paths
    .map((path) => `## ${basename(path)}:\n${path}`)
    .join("\n\n")}\n\n${request}`;
}

async function runConversation(name, prompt, maxTurns = 16) {
  ensureMarkersHidden(prompt);
  await startProxy();
  try {
    let input = [
      {
        role: "user",
        content: [{ type: "input_text", text: prompt }],
      },
    ];
    let toolTurns = 0;

    for (let turn = 0; turn < maxTurns; turn += 1) {
      const events = await postResponses(input);
      const calls = events
        .filter((event) => event.type === "response.output_item.done")
        .map((event) => event.item)
        .filter((item) => item?.type === "function_call");
      if (calls.length === 0) {
        const final =
          events
            .filter((event) => event.type === "response.completed")
            .at(-1)
            ?.response?.output?.flatMap((item) => item.content ?? [])
            ?.map((part) => part.text ?? "")
            .join("") ?? "";
        const conversation = {
          name,
          completed: true,
          toolTurns,
          final,
        };
        conversations.push(conversation);
        return conversation;
      }

      toolTurns += 1;
      const outputs = [];
      for (const call of calls) {
        let args;
        try {
          args = JSON.parse(call.arguments);
        } catch {
          args = {};
        }
        const result = await executeTool(call.name, args);
        const resultCode = parseResultCode(result);
        toolCalls.push({
          conversation: name,
          turn,
          name: call.name,
          callId: call.call_id,
          args,
          resultCode,
        });
        outputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: result,
        });
      }
      input = outputs;
    }
    throw new Error(`${name} exceeded ${maxTurns} tool continuation turns`);
  } finally {
    await stopProxy();
  }
}

async function executeTool(name, args) {
  if (name === "read_file") return executeRead(args);
  if (name === "write_file") return executeWrite(args);
  if (name === "run_command") return executeCommand(args);
  return toolError(name, "UNKNOWN_TOOL");
}

async function executeRead(args) {
  const path = allowedPath(args.path);
  if (!path) return toolError("read_file", "RESOURCE_NOT_ALLOWED", args.path);
  if (extname(path).toLowerCase() === ".xlsx") {
    return JSON.stringify({ error: "BINARY_FILE_USE_RUN_COMMAND" });
  }
  try {
    const text = await readFile(path, "utf8");
    const start =
      Number.isInteger(args.start_line) && args.start_line > 0
        ? args.start_line
        : 1;
    const defaultEnd = start + 199;
    const requestedEnd =
      Number.isInteger(args.end_line) && args.end_line >= start
        ? args.end_line
        : defaultEnd;
    const end = Math.min(requestedEnd, start + 299);
    const allLines = text.split(/\r?\n/);
    return JSON.stringify({
      path: basename(path),
      start_line: start,
      end_line: Math.min(end, allLines.length),
      total_lines: allLines.length,
      content: allLines.slice(start - 1, end).join("\n"),
    });
  } catch (error) {
    return JSON.stringify({
      error: "READ_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function executeWrite(args) {
  const path = allowedPath(args.path);
  if (!path) return toolError("write_file", "RESOURCE_NOT_ALLOWED", args.path);
  if (typeof args.content !== "string") {
    return JSON.stringify({ error: "INVALID_CONTENT" });
  }
  try {
    await writeFile(path, args.content, "utf8");
    return JSON.stringify({
      ok: true,
      path: basename(path),
      bytes: Buffer.byteLength(args.content),
    });
  } catch (error) {
    return JSON.stringify({
      error: "WRITE_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function executeCommand(args) {
  if (typeof args.command !== "string") {
    return JSON.stringify({ error: "INVALID_COMMAND" });
  }
  const match = /^\s*python(?:\.exe)?\s+(?:"([^"]+)"|(\S+))\s*$/i.exec(
    args.command,
  );
  const requestedScript = match?.[1] ?? match?.[2];
  const script = requestedScript
    ? allowedPath(
        isAbsolute(requestedScript)
          ? requestedScript
          : resolve(root, requestedScript),
      )
    : null;
  if (!script || extname(script).toLowerCase() !== ".py") {
    return toolError("run_command", "COMMAND_NOT_ALLOWED", args.command);
  }
  const result = await runProcess("python", [script], root);
  return JSON.stringify({
    exit_code: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  });
}

function allowedPath(input) {
  if (typeof input !== "string" || input.length === 0) return null;
  const path = resolve(input);
  const child = relative(root, path);
  if (child === "" || child.startsWith("..") || isAbsolute(child)) return null;
  return path;
}

function toolError(tool, code, requested) {
  deniedCalls.push({ tool, code, requested });
  return JSON.stringify({ error: code });
}

function parseResultCode(result) {
  try {
    return JSON.parse(result).error ?? "OK";
  } catch {
    return "INVALID_RESULT";
  }
}

async function postResponses(input) {
  const response = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      input,
      tools: [
        {
          type: "function",
          name: "read_file",
          description:
            "Read a user-mentioned UTF-8 file by path and optional one-based line range.",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string" },
              start_line: { type: "integer" },
              end_line: { type: "integer" },
            },
            required: ["path"],
            additionalProperties: false,
          },
        },
        {
          type: "function",
          name: "write_file",
          description:
            "Create or replace a UTF-8 file inside the authorized fixture directory.",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string" },
            },
            required: ["path", "content"],
            additionalProperties: false,
          },
        },
        {
          type: "function",
          name: "run_command",
          description:
            "Run exactly one Python script located inside the authorized fixture directory. The command must be python followed by the script path; shell operators and extra arguments are forbidden.",
          parameters: {
            type: "object",
            properties: {
              command: { type: "string" },
            },
            required: ["command"],
            additionalProperties: false,
          },
        },
      ],
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text);
  return text.split("\n").flatMap((line) => {
    if (!line.startsWith("data: ") || line === "data: [DONE]") return [];
    return [JSON.parse(line.slice(6))];
  });
}

async function inspectWorkbook(path) {
  if (!(await pathExists(path))) return { sales: {}, markers: [] };
  const verifier = resolve(root, `verify-${basename(path)}.py`);
  await writeFile(
    verifier,
    [
      "import json",
      "from openpyxl import load_workbook",
      `workbook = load_workbook(${JSON.stringify(path)}, data_only=True)`,
      "sheet = workbook['Sales']",
      "rows = list(sheet.iter_rows(min_row=2, values_only=True))",
      "print(json.dumps({'sales': {str(row[0]): row[1] for row in rows}, 'markers': [str(row[2]) for row in rows if row[2]]}))",
      "",
    ].join("\n"),
    "utf8",
  );
  const result = await runProcess("python", [verifier], root);
  await rm(verifier, { force: true });
  if (result.exitCode !== 0) {
    return { sales: {}, markers: [], error: result.stderr };
  }
  return JSON.parse(result.stdout.trim());
}

function csvSales(text) {
  const sales = {};
  for (const line of text.trim().split(/\r?\n/).slice(1)) {
    const [name, value] = line.split(",");
    const amount = Number(value);
    if (name && Number.isFinite(amount)) sales[name.trim()] = amount;
  }
  return sales;
}

function callsFor(conversation, tool, path) {
  return toolCalls.filter(
    (call) =>
      call.conversation === conversation &&
      call.name === tool &&
      (!path || resolve(call.args.path ?? "") === path),
  );
}

function ensureMarkersHidden(prompt) {
  const leaked = Object.values(MARKERS).find((marker) =>
    prompt.includes(marker),
  );
  if (leaked) throw new Error(`Prompt leaked hidden marker ${leaked}`);
}

function pass(condition, evidence) {
  return { status: condition ? "PASS" : "FAIL", evidence };
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT")
      return "";
    throw error;
  }
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT")
      return false;
    throw error;
  }
}

function runProcess(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      resolvePromise({ exitCode: code ?? -1, stdout, stderr });
    });
  });
}

async function startProxy() {
  port = await findAvailablePort();
  proxy = spawn(
    process.execPath,
    [
      proxyCli,
      "start",
      "--provider",
      "codex",
      "--port",
      String(port),
      "--config",
      config,
      "--cwd",
      root,
      "--log-level",
      "warning",
    ],
    {
      env: { ...process.env, COPILOT_CLI_PATH: runtime },
      windowsHide: true,
    },
  );
  await waitForHealth(port);
}

async function stopProxy() {
  if (!proxy || !port) return;
  const runningProxy = proxy;
  const runningPort = port;
  if (runningProxy.exitCode === null && runningProxy.signalCode === null) {
    runningProxy.kill();
  }
  await waitForExit(runningProxy);
  await waitForPortClosed(runningPort);
  proxyLifecycles.push({
    port: runningPort,
    portClosed: await isPortClosed(runningPort),
    proxyExited:
      runningProxy.exitCode !== null || runningProxy.signalCode !== null,
  });
  proxy = undefined;
  port = undefined;
}

function findAvailablePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to allocate a local port"));
        return;
      }
      const selectedPort = address.port;
      server.close((error) => {
        if (error) reject(error);
        else resolvePromise(selectedPort);
      });
    });
  });
}

async function waitForHealth(selectedPort) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${selectedPort}/health`)).ok) return;
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error("Proxy did not become healthy");
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve();
  return new Promise((resolvePromise) => child.once("exit", resolvePromise));
}

async function waitForPortClosed(selectedPort) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await isPortClosed(selectedPort)) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Proxy port ${selectedPort} did not close`);
}

async function isPortClosed(selectedPort) {
  try {
    await fetch(`http://127.0.0.1:${selectedPort}/health`);
    return false;
  } catch {
    return true;
  }
}
