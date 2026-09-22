

import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { sha256 } from 'js-sha256';
import { useSyncExternalStore } from 'react';

import { API_URL } from '@/api';

export type LlmStatus =
  | 'idle'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'error';

type State = {
  status: LlmStatus;
  progress: number;
  error: string | null;
};

export type ModelManifest = {
  id: string;
  format: string;
  quantization: string;
  bytes: number;
  sha256: string;
  url: string;
};

const CHUNK = 10 * 1024 * 1024;
const MODEL_FILE = 'model.gguf';
const PARTIAL_FILE = 'model.gguf.partial';
const INSTALLED_FILE = 'model-manifest.json';
const CONSENT_FILE = 'llm-consent.json';

const FALLBACK_MANIFEST: ModelManifest = {
  id: 'gemma-4-q4',
  format: 'gguf',
  quantization: 'Q4_K_M',
  bytes: 3462680032,
  sha256: '',
  url: 'https://models.creepy.im/models/gemma-4/q4_k_m/model.gguf',
};

let state: State = { status: 'idle', progress: 0, error: null };
const listeners = new Set<() => void>();
let llamaContext: { completion: (p: unknown) => Promise<{ text: string }> } | null = null;
let initPromise: Promise<void> | null = null;
let contextHung = false;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useLlmState(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

const dir = () => new Directory(Paths.document, 'models');
const modelFile = () => new File(dir(), MODEL_FILE);
const partialFile = () => new File(dir(), PARTIAL_FILE);
const installedFile = () => new File(dir(), INSTALLED_FILE);
const consentFile = () => new File(Paths.document, CONSENT_FILE);

function installedManifest(): ModelManifest | null {
  try {
    const f = installedFile();
    if (!f.exists) return null;
    return JSON.parse(f.textSync()) as ModelManifest;
  } catch {
    return null;
  }
}

function isInstalled(manifest: ModelManifest): boolean {
  const local = installedManifest();
  const file = modelFile();
  return (
    local?.id === manifest.id &&
    local?.sha256 === manifest.sha256 &&
    file.exists &&
    file.size === manifest.bytes
  );
}

async function fetchManifest(): Promise<ModelManifest> {
  try {
    const resp = await fetch(`${API_URL}/models/recommended`);
    if (resp.ok) return (await resp.json()) as ModelManifest;
  } catch {

  }
  return FALLBACK_MANIFEST;
}

const CHUNK_TIMEOUT_MS = 60_000;

async function fetchChunk(
  url: string,
  offset: number,
  end: number,
): Promise<{ status: number; chunk: Uint8Array }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    try {
      const fetchPromise = fetch(url, {
        headers: { Range: `bytes=${offset}-${end}` },
        signal: ctrl.signal,
      });
      fetchPromise.catch(() => {});
      const resp = await Promise.race([
        fetchPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            ctrl.abort();
            reject(new Error(`Chunk at ${offset} timed out`));
          }, CHUNK_TIMEOUT_MS),
        ),
      ]);
      if (resp.status !== 206 && resp.status !== 200) {
        throw new Error(`CDN returned ${resp.status}`);
      }

      if (resp.status === 200 && offset !== 0) {
        throw new Error('CDN ignored the Range header');
      }
      const bufPromise = resp.arrayBuffer();
      bufPromise.catch(() => {});
      const buf = await Promise.race([
        bufPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            ctrl.abort();
            reject(new Error(`Chunk body at ${offset} timed out`));
          }, CHUNK_TIMEOUT_MS),
        ),
      ]);
      const chunk = new Uint8Array(buf);
      if (resp.status === 206 && chunk.byteLength !== end - offset + 1) {
        throw new Error(`Short chunk at offset ${offset}`);
      }
      return { status: resp.status, chunk };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Chunk download failed');
}

async function downloadRanged(manifest: ModelManifest): Promise<void> {
  const partial = partialFile();
  const total = manifest.bytes;
  let startOffset = 0;
  if (partial.exists) {
    const existing = partial.size ?? 0;
    if (existing === total) {

      return;
    }


    if (existing > 0 && existing % CHUNK === 0) {
      startOffset = existing;
    } else {
      partial.delete();
    }
  }
  if (!partial.exists) partial.create({ intermediates: true });
  const handle = partial.open(startOffset > 0 ? FileMode.Append : FileMode.WriteOnly);
  try {
    for (let offset = startOffset; offset < total; offset += CHUNK) {
      const end = Math.min(offset + CHUNK - 1, total - 1);
      const { status, chunk } = await fetchChunk(manifest.url, offset, end);
      handle.writeBytes(chunk);

      if (status === 200) {
        set({ progress: 0.99 });
        return;
      }
      set({ progress: Math.min(0.99, (end + 1) / total) });
    }
  } finally {
    handle.close();
  }
}

async function sha256File(file: File): Promise<string> {
  const hasher = sha256.create();
  const reader = file.readableStream().getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) hasher.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  return hasher.hex();
}

async function install(manifest: ModelManifest): Promise<void> {
  const partial = partialFile();
  if (!partial.exists || partial.size !== manifest.bytes) {
    throw new Error('Downloaded file size does not match the manifest');
  }
  if (manifest.sha256) {
    set({ status: 'verifying' });
    const hex = await sha256File(partial);
    if (hex.toLowerCase() !== manifest.sha256.toLowerCase()) {
      try {
        partial.delete();
      } catch {

      }
      throw new Error('SHA-256 mismatch — downloaded model is corrupted');
    }
  }
  partial.move(modelFile(), { overwrite: true });
  installedFile().write(JSON.stringify(manifest));
}

export async function consentAndDownload(): Promise<void> {
  if (state.status === 'downloading' || state.status === 'ready') return;
  try {
    consentFile().write(JSON.stringify({ consent: true, at: new Date().toISOString() }));
  } catch {

  }
  set({ status: 'downloading', progress: 0, error: null });
  try {
    const manifest = await fetchManifest();
    if (!isInstalled(manifest)) {
      await downloadRanged(manifest);
      await install(manifest);
    }



    set({ status: 'ready', progress: 1 });
    void initContext().catch(() => {});
  } catch (e) {
    set({ status: 'error', error: e instanceof Error ? e.message : 'Model download failed' });
  }
}

async function initContext(): Promise<void> {
  if (llamaContext || contextHung) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {



    const mod = require('llama.rn') as {
      initLlama: (p: object) => Promise<NonNullable<typeof llamaContext>>;
    };


    const ctx = await Promise.race([
      mod.initLlama({
        model: modelFile().uri.replace(/^file:\/\//, ''),
        n_ctx: 2048,
        use_mlock: false,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 180_000)),
    ]);
    if (ctx === null) {
      contextHung = true;
      return;
    }
    llamaContext = ctx;
  })();
  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

export function llmReady(): boolean {
  return state.status === 'ready';
}

export async function complete(prompt: string, maxTokens = 96): Promise<string | null> {
  if (!llmReady()) return null;
  try {
    if (!llamaContext) await initContext();
    if (!llamaContext) return null;
    const out = await llamaContext.completion({
      prompt,
      n_predict: maxTokens,
      temperature: 0.4,
      top_p: 0.9,
      stop: ['<end_of_turn>', '\n\n'],
    });
    return out.text.trim() || null;
  } catch {
    return null;
  }
}

export async function restoreModel(): Promise<void> {
  try {
    const consented = consentFile().exists;
    if (!consented || !modelFile().exists) return;

    const manifest = await fetchManifest();
    if (!isInstalled(manifest)) return;
    set({ status: 'ready', progress: 1 });
    void initContext().catch(() => {});
  } catch {

  }
}
