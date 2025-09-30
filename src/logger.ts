export interface LoggerConfig {
  enabled: boolean;
  level: "debug" | "info" | "error" | "none";
}

export class Logger {
  private config: LoggerConfig;
  private prefix: string;
  private name: string;
  private colors = {
    debug: "\x1b[34m", // Blue
    info: "\x1b[32m", // Green
    error: "\x1b[31m", // Red
  };

  constructor(config: Partial<LoggerConfig> = {}, name: string) {
    this.config = { enabled: true, level: "info", ...config };
    this.name = name;
    this.prefix = `[tRPC DB] [${this.name}]`;
  }

  public debug(...args: any[]) {
    if (
      this.config.enabled &&
      (this.config.level === "debug" || this.config.level === "info")
    ) {
      const color = this.colors.debug;
      console.debug(`${color}${this.prefix}`, ...args);
    }
  }

  public info(...args: any[]) {
    if (this.config.enabled && this.config.level === "info") {
      const color = this.colors.info;
      console.info(`${color}${this.prefix}`, ...args);
    }
  }

  public error(...args: any[]) {
    if (this.config.enabled && this.config.level !== "none") {
      const color = this.colors.error;
      console.error(`${color}${this.prefix}`, ...args);
    }
  }
}
