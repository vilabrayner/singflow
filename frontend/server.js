import { startFrontend } from './scripts/frontend-server.mjs';

// Hostinger imports this entry point rather than executing it as the main module.
try {
  startFrontend();
} catch {
  console.error('SingFlow: configuração inválida. Confira BACKEND_URL, PORT e o build Angular.');
  process.exitCode = 1;
}
