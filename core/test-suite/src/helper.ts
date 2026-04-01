/**
 * Returns a promise that resolves after the specified number of milliseconds.
 * Useful for TTL and expiration tests.
 * @param ms - Milliseconds to wait
 */
export async function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
