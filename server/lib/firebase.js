import fs from 'node:fs';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { config } from '../config.js';

function buildApp() {
  if (getApps().length) return getApps()[0];

  let credential;
  if (config.serviceAccountJson) {
    credential = cert(JSON.parse(config.serviceAccountJson));
  } else if (fs.existsSync(config.serviceAccountPath)) {
    credential = cert(JSON.parse(fs.readFileSync(config.serviceAccountPath, 'utf8')));
  } else if (!process.env.FIRESTORE_EMULATOR_HOST) {
    credential = applicationDefault();
  }

  return initializeApp({
    ...(credential ? { credential } : {}),
    ...(config.firebaseProjectId ? { projectId: config.firebaseProjectId } : {}),
  });
}

export const db = getFirestore(buildApp());
export { FieldValue };
