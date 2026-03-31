import { createWriteStream, type WriteStream } from "node:fs";
import { stat, readFile } from "node:fs/promises";
import path from "node:path";

export interface LogHandle {
  runId: string;
  logRef: string;
  stream: WriteStream;
}

export interface LogResult {
  logStore: "local";
  logRef: string;
  logBytes: number;
  logExcerpt: string;
}

const EXCERPT_LINES = 20;

export class RunLogger {
  constructor(private logDir: string) {}

  create(runId: string): LogHandle {
    const logRef = path.join(this.logDir, `${runId}.log`);
    const stream = createWriteStream(logRef, { flags: "w" });
    return { runId, logRef, stream };
  }

  async finalize(handle: LogHandle): Promise<LogResult> {
    await new Promise<void>((resolve, reject) => {
      handle.stream.on("error", reject);
      handle.stream.end(() => resolve());
    });

    let logBytes = 0;
    try {
      const stats = await stat(handle.logRef);
      logBytes = stats.size;
    } catch {
      // File may not exist if nothing was written
    }

    let logExcerpt = "";
    if (logBytes > 0) {
      const content = await readFile(handle.logRef, "utf-8");
      const lines = content.split("\n").filter((l) => l.length > 0);
      const excerptLines = lines.slice(-EXCERPT_LINES);
      logExcerpt = excerptLines.join("\n");
    }

    return {
      logStore: "local",
      logRef: handle.logRef,
      logBytes,
      logExcerpt,
    };
  }
}
