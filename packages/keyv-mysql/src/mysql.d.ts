declare module 'mysql2/promise' {
	type Row = string;

	interface Connection {
		execute(sql: string): Promise<Row[]>;
	}

	const mysql2: {
		createConnection(uri: string): Promise<Connection>;
	};

	export default mysql2;
}
