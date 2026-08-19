// biome-ignore-all lint/suspicious/noExplicitAny: this is a test file
import {
	DeleteParameterCommand,
	DeleteParametersCommand,
	GetParameterCommand,
	GetParametersByPathCommand,
	GetParametersCommand,
	type Parameter,
	ParameterAlreadyExists,
	ParameterNotFound,
	type ParameterTier,
	type ParameterType,
	PutParameterCommand,
} from "@aws-sdk/client-ssm";

/** Maximum number of names/results per batch call — mirrors AWS's real limit so chunking bugs surface as test failures. */
const maxBatchSize = 10;

type StoredParameter = {
	value: string;
	type: ParameterType;
	tier: ParameterTier;
	version: number;
};

/**
 * Minimal in-memory fake of an AWS SDK v3 SSM client, implementing only `send()`.
 *
 * Simulates enough of the Parameter Store API surface — including the real
 * 10-item batch caps and `GetParametersByPath` pagination — to drive both the
 * shared `@keyv/test-suite` compliance tests and adapter-specific tests fully
 * offline. Real `@aws-sdk/client-ssm` command/exception classes are used so the
 * adapter's `instanceof` checks behave exactly as they would against a real client.
 */
export class FakeSsmClient {
	private readonly store = new Map<string, StoredParameter>();

	public async send(command: unknown): Promise<unknown> {
		if (command instanceof PutParameterCommand) {
			return this.putParameter(command.input);
		}

		if (command instanceof GetParameterCommand) {
			return this.getParameter(command.input);
		}

		if (command instanceof GetParametersCommand) {
			return this.getParameters(command.input);
		}

		if (command instanceof DeleteParameterCommand) {
			return this.deleteParameter(command.input);
		}

		if (command instanceof DeleteParametersCommand) {
			return this.deleteParameters(command.input);
		}

		if (command instanceof GetParametersByPathCommand) {
			return this.getParametersByPath(command.input);
		}

		throw new Error(
			`FakeSsmClient: unsupported command ${(command as { constructor: { name: string } }).constructor.name}`,
		);
	}

	/** Test helper: seeds a raw (non-enveloped) parameter, bypassing the adapter's `set()`. */
	public seedRaw(name: string, value: string, type: ParameterType = "String"): void {
		this.store.set(name, { value, type, tier: "Standard", version: 1 });
	}

	private putParameter(input: {
		Name?: string;
		Value?: string;
		Type?: ParameterType;
		Tier?: ParameterTier;
		Overwrite?: boolean;
	}) {
		const name = this.requireField(input.Name, "Name");
		const existing = this.store.get(name);
		if (existing && !input.Overwrite) {
			throw new ParameterAlreadyExists({
				message: `Parameter ${name} already exists.`,
				$metadata: {},
			});
		}

		const version = (existing?.version ?? 0) + 1;
		this.store.set(name, {
			value: input.Value ?? "",
			type: input.Type ?? "String",
			tier: input.Tier ?? "Standard",
			version,
		});

		return { Version: version, Tier: input.Tier ?? "Standard" };
	}

	private getParameter(input: { Name?: string }) {
		const name = this.requireField(input.Name, "Name");
		const parameter = this.store.get(name);
		if (!parameter) {
			throw new ParameterNotFound({ message: `Parameter ${name} not found.`, $metadata: {} });
		}

		return { Parameter: this.toParameter(name, parameter) };
	}

	private getParameters(input: { Names?: string[] }) {
		const names = input.Names ?? [];
		this.assertBatchSize(names.length, "GetParameters", "Names");

		const parameters: Parameter[] = [];
		const invalidParameters: string[] = [];
		for (const name of names) {
			const parameter = this.store.get(name);
			if (parameter) {
				parameters.push(this.toParameter(name, parameter));
			} else {
				invalidParameters.push(name);
			}
		}

		return { Parameters: parameters, InvalidParameters: invalidParameters };
	}

	private deleteParameter(input: { Name?: string }) {
		const name = this.requireField(input.Name, "Name");
		if (!this.store.has(name)) {
			throw new ParameterNotFound({ message: `Parameter ${name} not found.`, $metadata: {} });
		}

		this.store.delete(name);
		return {};
	}

	private deleteParameters(input: { Names?: string[] }) {
		const names = input.Names ?? [];
		this.assertBatchSize(names.length, "DeleteParameters", "Names");

		const deletedParameters: string[] = [];
		const invalidParameters: string[] = [];
		for (const name of names) {
			if (this.store.has(name)) {
				this.store.delete(name);
				deletedParameters.push(name);
			} else {
				invalidParameters.push(name);
			}
		}

		return { DeletedParameters: deletedParameters, InvalidParameters: invalidParameters };
	}

	private getParametersByPath(input: {
		Path?: string;
		Recursive?: boolean;
		MaxResults?: number;
		NextToken?: string;
	}) {
		const path = this.requireField(input.Path, "Path");
		const boundary = path.endsWith("/") ? path : `${path}/`;
		const maxResults = input.MaxResults ?? maxBatchSize;
		this.assertBatchSize(maxResults, "GetParametersByPath", "MaxResults");

		const allNames = [...this.store.keys()]
			.filter((name) => name.startsWith(boundary))
			.filter((name) => input.Recursive || !name.slice(boundary.length).includes("/"))
			.sort();

		const startIndex = input.NextToken ? Number(input.NextToken) : 0;
		const page = allNames.slice(startIndex, startIndex + maxResults);
		const nextIndex = startIndex + maxResults;
		const nextToken = nextIndex < allNames.length ? String(nextIndex) : undefined;

		return {
			Parameters: page.map((name) => {
				const parameter = this.store.get(name);
				/* v8 ignore next 3 -- @preserve defensive: name always comes from store.keys() above */
				if (!parameter) {
					throw new Error(`FakeSsmClient: inconsistent state for ${name}`);
				}

				return this.toParameter(name, parameter);
			}),
			NextToken: nextToken,
		};
	}

	private toParameter(name: string, parameter: StoredParameter): Parameter {
		return {
			Name: name,
			Value: parameter.value,
			Type: parameter.type,
			Version: parameter.version,
		};
	}

	private requireField(value: string | undefined, field: string): string {
		if (!value) {
			throw new Error(`FakeSsmClient: ${field} is required.`);
		}

		return value;
	}

	private assertBatchSize(size: number, operation: string, field: string): void {
		if (size > maxBatchSize) {
			throw new Error(
				`FakeSsmClient: ${operation} accepts at most ${maxBatchSize} ${field} (got ${size}). This mirrors the real AWS limit — if you hit this in a test, the adapter isn't chunking correctly.`,
			);
		}
	}
}
