import type {
	GlideClient,
	GlideClientConfiguration,
	GlideClusterClient,
	GlideClusterClientConfiguration,
} from "@valkey/valkey-glide";

/**
 * Adapter-only options mixed with Valkey GLIDE client configuration.
 * Extra GLIDE fields (`readFrom`, `clientAz`, `addresses`, `useTLS`, …) are
 * forwarded to `GlideClient.createClient` / `GlideClusterClient.createClient`.
 */
export type KeyvValkeyGlideOptions = {
	/**
	 * Connection URI such as `redis://localhost:6379` or `valkey://localhost:6379`.
	 * Used to populate `addresses` when they are not set explicitly.
	 * @default undefined
	 */
	uri?: string;
	/**
	 * When `true`, connect with {@link GlideClusterClient} instead of {@link GlideClient}.
	 * @default false
	 */
	cluster?: boolean;
	/**
	 * Whether to use Valkey sets for namespace key tracking. When `true`, a set is
	 * maintained per namespace so `clear()` can remove keys without scanning.
	 * @default false
	 */
	useSets?: boolean;
	/**
	 * Namespace used to prefix keys for multi-tenant isolation.
	 * @default undefined
	 */
	namespace?: string;
} & Partial<GlideClientConfiguration> &
	Partial<GlideClusterClientConfiguration>;

/**
 * Values accepted as the first argument to the {@link KeyvValkeyGlide} constructor:
 * a connection URI string, an options object, or an existing GLIDE client.
 */
export type KeyvValkeyGlideConnect =
	| string
	| KeyvValkeyGlideOptions
	| GlideClient
	| GlideClusterClient;

export type KeyvValkeyGlideClient = GlideClient | GlideClusterClient;
