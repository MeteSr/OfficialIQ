import { canisterId } from "../lib/icEnv";
import { createActor } from "./actor";
import { idlFactory, type _SERVICE, type Clip, type ClipInput } from "../declarations/content";

export type { Clip, ClipInput };

// The clip library in the content canister (backend/lib/Clips.mo).
const CANISTER_ID = canisterId("content");
const actor = () => createActor<_SERVICE>(CANISTER_ID, idlFactory);

function unwrap<T>(res: { ok: T } | { err: string }): T {
  if ("err" in res) throw new Error(res.err);
  return res.ok;
}

/** Sends a video file to Cloudflare's one-time upload link, reporting progress (0–1). */
export function uploadVideo(uploadUrl: string, file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (HTTP ${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed: check your connection"));
    const body = new FormData();
    body.append("file", file);
    xhr.send(body);
  });
}

export const clipService = {
  async videoConfigured(): Promise<boolean> {
    if (!CANISTER_ID) return false;
    return actor().videoConfigured();
  },
  async startUpload(): Promise<{ uploadId: string; uploadUrl: string }> {
    return unwrap(await actor().startClipUpload());
  },
  async create(input: ClipInput): Promise<Clip> {
    return unwrap(await actor().createClip(input));
  },
  /** Approved clips for everyone (on one rule, or the sport), and the caller's own waiting for review. */
  async list(sportId: string, articleId?: string): Promise<Clip[]> {
    if (!CANISTER_ID) return [];
    return actor().listClips(sportId, articleId ? [articleId] : []);
  },
  async listForAssociation(associationId: string): Promise<Clip[]> {
    return unwrap(await actor().listAssociationClips(associationId));
  },
  async toReview(): Promise<Clip[]> {
    if (!CANISTER_ID) return [];
    return actor().listClipsToReview();
  },
  async review(id: string, approve: boolean): Promise<Clip> {
    return unwrap(await actor().reviewClip(id, approve));
  },
  async playback(id: string): Promise<{ url: string; clip: Clip }> {
    return unwrap(await actor().clipPlayback(id));
  },
  async remove(id: string): Promise<void> {
    unwrap(await actor().deleteClip(id));
  },
};
