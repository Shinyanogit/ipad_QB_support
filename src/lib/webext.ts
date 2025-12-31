type StorageAreaLike = {
  get: (keys: string | string[] | object | null, callback?: (items: any) => void) => any;
  set: (items: Record<string, unknown>, callback?: () => void) => any;
};

type RuntimeLike = {
  getManifest?: () => chrome.runtime.Manifest;
  sendMessage?: (...args: any[]) => any;
  onMessage?: chrome.runtime.ExtensionMessageEvent;
  connect?: (...args: any[]) => chrome.runtime.Port;
  lastError?: { message?: string };
};

type WebExtLike = {
  storage?: { sync?: StorageAreaLike; local?: StorageAreaLike };
  runtime?: RuntimeLike;
  debugger?: typeof chrome.debugger;
};

const globalApi = globalThis as typeof globalThis & {
  chrome?: WebExtLike;
  browser?: WebExtLike;
};

export const webext: WebExtLike = globalApi.browser ?? globalApi.chrome ?? {};

export function getStorageArea(preferSync = true): StorageAreaLike | null {
  const storage = webext.storage;
  if (!storage) return null;
  if (preferSync && storage.sync) return storage.sync;
  return storage.local ?? storage.sync ?? null;
}

function promisify<T>(runner: (callback: (value: T) => void) => any): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const callback = (value: T) => {
      if (settled) return;
      settled = true;
      const error = webext.runtime?.lastError;
      if (error?.message) {
        reject(new Error(error.message));
        return;
      }
      resolve(value);
    };
    try {
      const result = runner(callback);
      if (result && typeof (result as Promise<T>).then === "function") {
        (result as Promise<T>)
          .then((value) => {
            if (settled) return;
            settled = true;
            resolve(value);
          })
          .catch((error) => {
            if (settled) return;
            settled = true;
            reject(error);
          });
      }
    } catch (error) {
      if (settled) return;
      settled = true;
      reject(error);
    }
  });
}

export function storageGet(area: StorageAreaLike, key: string): Promise<Record<string, any>> {
  if (area.get.length <= 1) {
    try {
      const result = area.get(key);
      if (result && typeof (result as Promise<Record<string, any>>).then === "function") {
        return result as Promise<Record<string, any>>;
      }
      return Promise.resolve(result as Record<string, any>);
    } catch (error) {
      return Promise.reject(error);
    }
  }
  return promisify<Record<string, any>>((callback) => area.get(key, callback));
}

export function storageSet(area: StorageAreaLike, items: Record<string, unknown>): Promise<void> {
  if (area.set.length <= 1) {
    try {
      const result = area.set(items);
      if (result && typeof (result as Promise<void>).then === "function") {
        return result as Promise<void>;
      }
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }
  return promisify<void>((callback) => area.set(items, callback));
}

export function getManifest(): chrome.runtime.Manifest | null {
  return webext.runtime?.getManifest ? webext.runtime.getManifest() : null;
}

export function sendRuntimeMessage<T>(message: unknown): Promise<T | undefined> {
  const runtime = webext.runtime;
  if (!runtime?.sendMessage) return Promise.resolve(undefined);
  if (runtime.sendMessage.length <= 1) {
    try {
      const result = runtime.sendMessage(message);
      if (result && typeof (result as Promise<T>).then === "function") {
        return result as Promise<T>;
      }
      return Promise.resolve(result as T);
    } catch (error) {
      return Promise.reject(error);
    }
  }
  return promisify<T | undefined>((callback) => runtime.sendMessage(message, callback));
}
