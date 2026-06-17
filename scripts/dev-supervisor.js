const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

const restartDelayMs = 1500;
const rootDir = path.resolve(__dirname, "..");

const services = [
  {
    name: "api",
    cwd: "carbonsense-api",
    port: 3001,
    args: ["run", "dev"]
  },
  {
    name: "web",
    cwd: "carbonsense-web",
    port: 5173,
    args: ["run", "dev"]
  }
];

const children = new Map();
let shuttingDown = false;

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });

    socket.setTimeout(800, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function startService(service) {
  console.log(`[dev] starting ${service.name} on port ${service.port}`);

  const cwd = path.join(rootDir, service.cwd);
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm.cmd run dev"]
      : service.args;

  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, FORCE_COLOR: "1" },
    shell: false,
    stdio: "inherit",
    windowsHide: false
  });

  children.set(service.name, child);

  child.on("exit", async (code, signal) => {
    children.delete(service.name);

    if (shuttingDown) {
      return;
    }

    console.log(
      `[dev] ${service.name} stopped (${signal || `exit ${code}`}). Checking port ${service.port}...`
    );

    setTimeout(async () => {
      if (shuttingDown) {
        return;
      }

      const portStillOpen = await isPortOpen(service.port);

      if (portStillOpen) {
        console.log(
          `[dev] ${service.name} port ${service.port} is already served by another process.`
        );
        return;
      }

      startService(service);
    }, restartDelayMs);
  });
}

async function main() {
  for (const service of services) {
    const alreadyRunning = await isPortOpen(service.port);

    if (alreadyRunning) {
      console.log(
        `[dev] ${service.name} already running on port ${service.port}; leaving it alone.`
      );
      continue;
    }

    startService(service);
  }

  if (children.size === 0) {
    console.log("[dev] all services were already running.");
  }
}

function shutdown() {
  shuttingDown = true;

  for (const child of children.values()) {
    child.kill();
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

main().catch((error) => {
  console.error("[dev] failed to start CarbonSense", error);
  process.exit(1);
});
