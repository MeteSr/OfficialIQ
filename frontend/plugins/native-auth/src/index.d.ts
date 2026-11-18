export interface NativeAuthOptions {
  /** The identity provider URL to open, with the ICRC-167 request in its fragment. */
  url: string;
  /** Host of the https callback, e.g. "abcde-aaaaa-aaaaa-aaaaa-cai.icp0.io". */
  callbackHost: string;
  /** Path of the https callback, e.g. "/native-callback". */
  callbackPath: string;
}

export interface NativeAuthPlugin {
  /**
   * Opens an ASWebAuthenticationSession and resolves with the callback URL the
   * identity provider navigated to. Rejects with code "CANCELED" when the user
   * closes the sheet, and is unavailable before iOS 17.4.
   */
  authenticate(options: NativeAuthOptions): Promise<{ url: string }>;
}

export declare const NativeAuth: NativeAuthPlugin;
