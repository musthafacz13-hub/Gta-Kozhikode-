import type { Logger } from './Logger.ts';

export type EngineEventMap = {
  'engine:mode_changed': { from: string; to: string };
  'engine:context_lost': { timestamp: number };
  'engine:context_restored': { timestamp: number };
  'engine:error': { scope: string; message: string };
  'settings:updated': { graphicsTier: string };
  'save:completed': { slotId: string; slotType: string };
  'save:restored': { slotId: string };
};

type Handler<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown> = EngineEventMap> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();
  private readonly logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => {
      this.off(event, handler);
    };
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    const set = this.handlers.get(event);
    if (!set) {
      return;
    }
    set.delete(handler as Handler<never>);
    if (set.size === 0) {
      this.handlers.delete(event);
    }
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) {
      return;
    }
    for (const handler of [...set]) {
      try {
        (handler as Handler<Events[K]>)(payload);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger?.error('EventBus', `Listener failed on "${String(event)}"`, msg);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
