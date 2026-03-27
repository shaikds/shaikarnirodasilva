import { EventEmitter } from "events";
import type { AppEvents, AppEventName } from "./events";
import { logger } from "../utils/logger";

class TypedEventBus {
  private readonly emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
  }

  emit<K extends AppEventName>(event: K, data: AppEvents[K]): void {
    logger.debug(`Event emitted: ${event}`, { data });
    this.emitter.emit(event, data);
  }

  on<K extends AppEventName>(event: K, listener: (data: AppEvents[K]) => void): void {
    this.emitter.on(event, listener);
    logger.debug(`Event listener registered: ${event}`);
  }

  off<K extends AppEventName>(event: K, listener: (data: AppEvents[K]) => void): void {
    this.emitter.off(event, listener);
  }

  once<K extends AppEventName>(event: K, listener: (data: AppEvents[K]) => void): void {
    this.emitter.once(event, listener);
  }

  removeAllListeners(event?: AppEventName): void {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
  }
}

export const eventBus = new TypedEventBus();
