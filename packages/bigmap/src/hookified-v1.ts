import {
	type HookFn,
	Hookified,
	type IHook,
	type PrependHookOptions,
} from "hookified";

/**
 * hookified 3 replaced the v1 `(event, handler)` methods with `{ event, handler }`
 * objects and stores hook entries instead of the handler functions. These
 * overrides keep the v1 call shape on classes that extend Hookified.
 */
export class HookifiedV1 extends Hookified {
	public prependHook(event: string, handler: HookFn): void;
	public prependHook(
		hook: IHook,
		options?: PrependHookOptions,
	): IHook | undefined;
	public prependHook(
		hookOrEvent: IHook | string,
		handlerOrOptions?: HookFn | PrependHookOptions,
	): IHook | undefined {
		if (typeof hookOrEvent === "string") {
			return super.prependHook({
				event: hookOrEvent,
				handler: asHandler(handlerOrOptions, "prependHook"),
			});
		}

		return super.prependHook(
			hookOrEvent,
			handlerOrOptions as PrependHookOptions | undefined,
		);
	}

	public prependOnceHook(event: string, handler: HookFn): void;
	public prependOnceHook(
		hook: IHook,
		options?: PrependHookOptions,
	): IHook | undefined;
	public prependOnceHook(
		hookOrEvent: IHook | string,
		handlerOrOptions?: HookFn | PrependHookOptions,
	): IHook | undefined {
		if (typeof hookOrEvent === "string") {
			return super.prependOnceHook({
				event: hookOrEvent,
				handler: asHandler(handlerOrOptions, "prependOnceHook"),
			});
		}

		return super.prependOnceHook(
			hookOrEvent,
			handlerOrOptions as PrependHookOptions | undefined,
		);
	}

	public onceHook(event: string, handler: HookFn): void;
	public onceHook(hook: IHook): void;
	public onceHook(hookOrEvent: IHook | string, handler?: HookFn): void {
		if (typeof hookOrEvent === "string") {
			super.onceHook({
				event: hookOrEvent,
				handler: asHandler(handler, "onceHook"),
			});
			return;
		}

		super.onceHook(hookOrEvent);
	}

	public removeHook(event: string, handler: HookFn): void;
	public removeHook(hook: IHook): IHook | undefined;
	public removeHook(
		hookOrEvent: IHook | string,
		handler?: HookFn,
	): IHook | undefined {
		if (typeof hookOrEvent === "string") {
			return super.removeHook({
				event: hookOrEvent,
				handler: asHandler(handler, "removeHook"),
			});
		}

		return super.removeHook(hookOrEvent);
	}

	/**
	 * hookified v1 name for `onHook(hook)`.
	 */
	public onHookEntry(hookEntry: IHook): void {
		this.onHook(hookEntry);
	}

	/**
	 * v1 returned the handler functions. hookified 3 returns `{ event, handler }`
	 * entries. Callers that invoke the result as a function keep working.
	 */
	// @ts-expect-error hookified 3 declares IHook[]; v1 callers receive the handlers.
	public getHooks(event: string): HookFn[] | undefined {
		return super.getHooks(event)?.map((hook) => hook.handler);
	}

	/**
	 * v1 map values were the handler functions.
	 */
	// @ts-expect-error hookified 3 declares Map<string, IHook[]>; v1 values were handlers.
	public get hooks(): Map<string, HookFn[]> {
		const hooks = new Map<string, HookFn[]>();
		for (const [event, entries] of super.hooks) {
			hooks.set(
				event,
				entries.map((entry) => entry.handler),
			);
		}

		return hooks;
	}
}

function asHandler(value: unknown, method: string): HookFn {
	if (typeof value !== "function") {
		throw new TypeError(
			`When calling ${method}(event, handler), the second argument must be a function`,
		);
	}

	return value as HookFn;
}
