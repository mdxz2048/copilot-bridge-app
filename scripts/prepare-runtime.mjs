import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const target = join("resources", "node-runtime", "node.exe");

await mkdir(dirname(target), { recursive: true });
await copyFile(process.execPath, target);
