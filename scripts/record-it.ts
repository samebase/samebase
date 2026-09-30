import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trackedFilePath } from "./lib/trackedFilePath.ts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const packageDirectory = path.join(repoRoot, "tools/record-it");
const applicationsDirectory = path.join(homedir(), "Applications");
const appDirectory = path.join(applicationsDirectory, "Samebase Recorder.app");
const bundleID = "com.samebase.record-it";
const command = process.argv[2] ?? "start";

function run(program: string, args: string[]) {
  execFileSync(program, args, { cwd: repoRoot, stdio: "inherit" });
}

function read(program: string, args: string[]) {
  return execFileSync(program, args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function stop() {
  if (!existsSync(appDirectory)) return;
  // Quitting through AppKit lets the app finish every recording before exit.
  run("osascript", [
    "-e",
    `if application ${JSON.stringify(appDirectory)} is running then tell application ${JSON.stringify(appDirectory)} to quit`,
  ]);
}

function install() {
  if (existsSync(appDirectory)) {
    if (
      read("osascript", ["-e", `application ${JSON.stringify(appDirectory)} is running`]) === "true"
    ) {
      throw new Error("Quit Samebase Recorder before setup, or use pnpm record-it restart.");
    }
    const installedID = read("/usr/libexec/PlistBuddy", [
      "-c",
      "Print :CFBundleIdentifier",
      path.join(appDirectory, "Contents/Info.plist"),
    ]);
    if (installedID !== bundleID) {
      throw new Error(`Another app occupies ${appDirectory}. Move it before setup.`);
    }
  }

  run("swift", ["build", "--package-path", packageDirectory, "-c", "release"]);
  const binaryDirectory = read("swift", [
    "build",
    "--package-path",
    packageDirectory,
    "-c",
    "release",
    "--show-bin-path",
  ]);
  mkdirSync(applicationsDirectory, { recursive: true });
  const stagingDirectory = mkdtempSync(path.join(applicationsDirectory, ".samebase-recorder-"));
  const stagedApp = path.join(stagingDirectory, "Samebase Recorder.app");
  try {
    const contents = path.join(stagedApp, "Contents");
    for (const directory of ["MacOS", "Helpers", "Resources"]) {
      mkdirSync(path.join(contents, directory), { recursive: true });
    }
    const appBinary = path.join(contents, "MacOS/record-it-swift");
    const helperBinary = path.join(contents, "Helpers/record-it-recovery-audio");
    copyFileSync(path.join(binaryDirectory, "record-it-swift"), appBinary);
    copyFileSync(path.join(binaryDirectory, "record-it-recovery-audio"), helperBinary);
    chmodSync(appBinary, 0o755);
    chmodSync(helperBinary, 0o755);
    copyFileSync(
      path.join(repoRoot, trackedFilePath("tools/record-it/Resources/Info.plist")),
      path.join(contents, "Info.plist"),
    );

    const iconSource = path.join(repoRoot, trackedFilePath("tools/record-it/icons/record-it.png"));
    const iconset = path.join(stagingDirectory, "record-it.iconset");
    mkdirSync(iconset);
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        const pixels = String(size * scale);
        read("sips", [
          "-z",
          pixels,
          pixels,
          iconSource,
          "--out",
          path.join(iconset, `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`),
        ]);
      }
    }
    run("iconutil", ["-c", "icns", iconset, "-o", path.join(contents, "Resources/record-it.icns")]);

    // A stable local requirement preserves macOS capture grants across rebuilds.
    // Sign nested code first so the app seal includes the helper's final signature.
    for (const [target, identifier] of [
      [helperBinary, `${bundleID}.recovery-audio`],
      [stagedApp, bundleID],
    ]) {
      run("codesign", [
        "--force",
        "--timestamp=none",
        "--sign",
        "-",
        "--identifier",
        identifier,
        "--requirements",
        `=designated => identifier "${identifier}"`,
        target,
      ]);
    }
    run("codesign", ["--verify", "--deep", "--strict", stagedApp]);
    rmSync(appDirectory, { recursive: true, force: true });
    renameSync(stagedApp, appDirectory);
  } finally {
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
  console.info(`Installed ${appDirectory}`);
}

try {
  if (["help", "--help", "-h"].includes(command)) {
    console.info("Usage: pnpm record-it [start|setup|restart|stop|test]");
  } else {
    if (process.platform !== "darwin") {
      throw new Error("Samebase Recorder needs macOS 14 or later and Xcode Command Line Tools.");
    }
    switch (command) {
      case "start":
        if (!existsSync(appDirectory)) install();
        run("open", [appDirectory]);
        break;
      case "setup":
        install();
        break;
      case "restart":
        stop();
        install();
        run("open", [appDirectory]);
        break;
      case "stop":
        stop();
        break;
      case "test":
        run("swift", ["test", "--package-path", packageDirectory]);
        break;
      default:
        throw new Error(`Unknown command: ${command}. Run pnpm record-it --help.`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
