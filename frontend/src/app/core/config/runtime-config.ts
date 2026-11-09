export interface RuntimeConfig {
  readonly apiBaseUrl: string;
  readonly primeUiLicense: string;
}

export function parseRuntimeConfig(value: unknown): RuntimeConfig {
  if (!value || typeof value !== 'object') throw new Error('Configuração inválida.');
  const config = value as Record<string, unknown>;
  if (typeof config['apiBaseUrl'] !== 'string' || !/^\/(?!\/)[^?#]*$/.test(config['apiBaseUrl'])) {
    throw new Error('apiBaseUrl deve ser um caminho no mesmo domínio, como /api.');
  }
  if (typeof config['primeUiLicense'] !== 'string') {
    throw new Error('primeUiLicense deve ser uma string.');
  }
  return Object.freeze({
    apiBaseUrl: config['apiBaseUrl'].replace(/\/$/, '') || '/',
    primeUiLicense: config['primeUiLicense'].trim(),
  });
}

export async function loadRuntimeConfig(baseUrl: string): Promise<RuntimeConfig> {
  const response = await fetch(new URL('config.json', baseUrl), {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Não foi possível carregar config.json.');
  return parseRuntimeConfig(await response.json());
}
