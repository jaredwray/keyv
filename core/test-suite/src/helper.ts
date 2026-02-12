// This is a utility function that returns a promise that resolves after a specified number of milliseconds
export async function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
