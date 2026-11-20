// Runs the x402 gateway and Mhasibu side by side in one container (hosted on Pxxl).
//   - Mhasibu is the public service: it listens on the platform's PORT.
//   - The gateway listens only inside the container (localhost:4021); only Mhasibu calls it.
//     They stay two programs, so the x402 payment between buyer (Mhasibu) and seller (gateway)
//     is real, and each keeps its own keys.
//   - Each program's memory is capped (about 200 MB), so both fit in a 512 MB plan.
//   - If either program stops, the container stops, and the platform starts a fresh one.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GATEWAY_PORT = process.env.GATEWAY_PORT || "4021";
const env = { ...process.env, GATEWAY_URL: process.env.GATEWAY_URL || `http://localhost:${GATEWAY_PORT}` };

// The gateway reads PORT before GATEWAY_PORT, so it must not see the platform's PORT.
const gatewayEnv = { ...env, GATEWAY_PORT };
delete gatewayEnv.PORT;
const mhasibuEnv = { ...env, PORT: process.env.PORT || "3000" };
const HEAP = `--max-old-space-size=${process.env.HEAP_MB || 200}`;

const children = [
  spawn(process.execPath, [HEAP, "src/server.mjs"], { cwd: path.join(root, "services/gateway"), env: gatewayEnv, stdio: "inherit" }),
  spawn(process.execPath, [HEAP, "bin/serve.mjs"], { cwd: path.join(root, "packages/mhasibu"), env: mhasibuEnv, stdio: "inherit" }),
];
const names = ["gateway", "mhasibu"];

let stopping = false;
function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill("SIGTERM");
  setTimeout(() => process.exit(code), 3000).unref();
}
children.forEach((c, i) => c.on("exit", (code, signal) => {
  if (!stopping) console.error(`${names[i]} stopped (${signal ?? code}); stopping the container so the platform restarts it`);
  stopAll(code ?? 1);
}));
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => stopAll(0));
