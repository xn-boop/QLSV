import { generateKeyPairSync } from 'node:crypto';

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });

export const testJwtEnvironment = {
  JWT_PRIVATE_KEY: pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  JWT_PUBLIC_KEY: pair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  JWT_ISSUER: 'https://api.test.qlsv.local',
  JWT_AUDIENCE: 'qlsv-web',
};
