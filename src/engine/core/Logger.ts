import type { LogEntry, LogLevel } from '../types.ts';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private readonly entries: LogEntry[] = [];
  private readonly maxEntries: number;
  private nextId = 1;
  private minLevel: LogLevel;
  private listeners = new Set<(entry: LogEntry) => void>();

  constructor(maxEntries = 250, minLevel: LogLevel = 'info') {
    this.maxEntries = maxEntries;
    this.minLevel = minLevel;
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  subscribe(listener: (entry: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  debug(scope: string, message: string, detail?: string): void {
    this.record('debug', scope, message, detail);
  }

  info(scope: string, message: string, detail?: string): void {
    this.record('info', scope, message, detail);
  }

  warn(scope: string, message: string, detail?: string): void {
    this.record('warn', scope, message, detail);
  }

  error(scope: string, message: string, detail?: string): void {
    this.record('error', scope, message, detail);
  }

  getEntries(levelFilter?: LogLevel): LogEntry[] {
    if (!levelFilter) {
      return [...this.entries];
    }
    const minPrio = LEVEL_PRIORITY[levelFilter];
    return this.entries.filter((entry) => LEVEL_PRIORITY[entry.level] >= minPrio);
  }

  clear(): void {
    this.entries.length = 0;
  }

  private record(level: LogLevel, scope: string, message: string, detail?: string): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      id: this.nextId++,
      timestamp: Date.now(),
      level,
      scope,
      message,
      detail,
    };

    if (this.entries.length >= this.maxEntries) {
      this.entries.shift();
    }
    this.entries.push(entry);

    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // Isolate subscriber errors from core logging.
      }
    }
  }
}
