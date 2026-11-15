import { sdk } from "./sdk.js";

let stored = {};
try {
  const loaded = await sdk.load();
  if (loaded && typeof loaded === "object") {
    stored = loaded;
  }
} catch (err) {
  console.warn("[Storage] Error loading initial data, using empty state:", err);
}

const storage = stored;

export const store_set = async (key, value) => {
  storage[key] = value;
  try {
    await sdk.save(storage);
  } catch (err) {
    console.warn(`[Storage] Error persisting key "${key}":`, err);
  }
  return storage;
};

export const store_get = (key) => storage[key];
