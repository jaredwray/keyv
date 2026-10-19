/**
 * The store's file or directory is not one that @keyv/fs can read: it was not written by
 * @keyv/fs (for example, a keyv-file JSON file) or by a newer version of it. The file is left
 * untouched, and every operation rejects with this error until the path holds a readable store.
 */
export class KeyvFsFormatError extends Error {
	/** The file that could not be read. */
	public readonly path: string;

	/**
	 * @param path - The file that could not be read.
	 * @param message - What is wrong with it.
	 */
	constructor(path: string, message: string) {
		super(message);
		this.name = "KeyvFsFormatError";
		this.path = path;
	}
}

/**
 * Stored data was damaged. With the `"file"` strategy, the damaged file has been renamed to
 * {@link KeyvFsCorruptionError.quarantinePath} and the store started empty. With `"directory"`,
 * the damaged entry is treated as missing, and the next write of that key replaces it.
 */
export class KeyvFsCorruptionError extends Error {
	/** The damaged file. */
	public readonly path: string;
	/** Where the damaged file was moved, when it was moved aside. */
	public readonly quarantinePath?: string;

	/**
	 * @param path - The damaged file.
	 * @param message - What is wrong with it.
	 * @param quarantinePath - Where the damaged file was moved, when it was moved aside.
	 */
	constructor(path: string, message: string, quarantinePath?: string) {
		super(message);
		this.name = "KeyvFsCorruptionError";
		this.path = path;
		this.quarantinePath = quarantinePath;
	}
}
