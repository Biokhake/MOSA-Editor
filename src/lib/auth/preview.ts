/**
 * Shared live-preview OAuth metadata (server-only).
 *
 * The public client id and callback host pattern are safe to keep in source.
 * The corresponding client secret must always be injected by the preview or
 * deployment environment through `GROK_AUTH_CLIENT_SECRET`.
 */
export const PREVIEW_CLIENT_ID = "grok_preview";

/** The shared auth broker issuer (OIDC discovery lives under it). */
export const GROK_ISSUER_DEFAULT = "https://auth.grok.me";

/** Host patterns accepted by the preview client's dynamic callback. */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
