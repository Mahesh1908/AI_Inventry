import sql from 'mssql';

function parseConnectionString(connectionString: string): sql.config {
  const parts = Object.fromEntries(
    connectionString
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const idx = p.indexOf('=');
        return [p.slice(0, idx).trim().toLowerCase(), p.slice(idx + 1).trim()];
      })
  );

  const serverRaw = parts['server'] ?? '';
  const [server, portStr] = serverRaw.split(',');

  return {
    server,
    port: portStr ? Number(portStr) : 1433,
    database: parts['database'],
    user: parts['user id'],
    password: parts['password'],
    options: {
      encrypt: (parts['encrypt'] ?? 'false').toLowerCase() === 'true',
      trustServerCertificate: (parts['trustservercertificate'] ?? 'true').toLowerCase() === 'true',
    },
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildConfig(): sql.config {
  const base = process.env.MSSQL_CONNECTION_STRING
    ? parseConnectionString(process.env.MSSQL_CONNECTION_STRING)
    : {
        server: required('DB_SERVER'),
        port: Number(process.env.DB_PORT ?? '1433'),
        database: required('DB_NAME'),
        user: required('DB_USER'),
        password: required('DB_PASSWORD'),
        options: {
          encrypt: (process.env.DB_ENCRYPT ?? 'false').toLowerCase() === 'true',
          trustServerCertificate: (process.env.DB_TRUST_SERVER_CERTIFICATE ?? 'true').toLowerCase() === 'true',
        },
      };

  return {
    ...base,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
}

let poolPromise: Promise<sql.ConnectionPool> | null = null;

export function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(buildConfig()).connect();
  }
  return poolPromise;
}

export { sql };
