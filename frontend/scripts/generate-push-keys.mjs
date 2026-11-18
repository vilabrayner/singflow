import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const destination = resolve(process.argv[2] ?? resolve(tmpdir(), 'singflow-web-push.env'));
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = privateKey.export({ format: 'jwk' });
const publicKey = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(jwk.x, 'base64url'),
  Buffer.from(jwk.y, 'base64url'),
]).toString('base64url');
const text = `SINGFLOW_WEB_PUSH_PUBLIC_KEY=${publicKey}\nSINGFLOW_WEB_PUSH_PRIVATE_KEY=${jwk.d}\nSINGFLOW_WEB_PUSH_SUBJECT=mailto:contato@flowave.tec.br\n`;
try {
  writeFileSync(destination, text, { mode: 0o600, flag: 'wx' });
  console.log(`Chaves gravadas em arquivo privado: ${destination}`);
} catch (error) {
  console.error(
    error.code === 'EEXIST'
      ? 'Arquivo já existe. Preserve as chaves atuais; escolha outro caminho apenas para uma rotação planejada.'
      : 'Não foi possível gravar o arquivo privado.',
  );
  process.exitCode = 1;
}
