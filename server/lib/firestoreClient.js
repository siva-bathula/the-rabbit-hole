import { Firestore } from '@google-cloud/firestore';

let db;
let loggedInit;

/** Shared Admin SDK client — ADC on Cloud Run, GOOGLE_APPLICATION_CREDENTIALS locally. */
export function getSharedFirestore() {
  if (!db) {
    db = new Firestore({
      projectId: process.env.GCLOUD_PROJECT || undefined,
      databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)',
    });
    if (!loggedInit) {
      loggedInit = true;
      console.log(
        '[firestore] init — project:',
        process.env.GCLOUD_PROJECT || '(auto)',
        'db:',
        process.env.FIRESTORE_DATABASE_ID || '(default)',
      );
    }
  }
  return db;
}
