import { Firestore } from '@google-cloud/firestore';

let db;
let loggedInit;

function buildFirestoreSettings() {
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || undefined;
  const rawDb = String(process.env.FIRESTORE_DATABASE_ID ?? '').trim();
  /** Named DB only — omit when unset so the SDK uses the real `(default)` database. */
  const settings = { projectId };
  if (rawDb && rawDb !== '(default)') {
    settings.databaseId = rawDb;
  }
  return { settings, rawDb };
}

/** Shared Admin SDK client — ADC on Cloud Run, GOOGLE_APPLICATION_CREDENTIALS locally. */
export function getSharedFirestore() {
  if (!db) {
    const { settings, rawDb } = buildFirestoreSettings();
    db = new Firestore(settings);
    if (!loggedInit) {
      loggedInit = true;
      const dbLabel = rawDb && rawDb !== '(default)' ? rawDb : '(default)';
      console.log(
        '[firestore] init — project:',
        settings.projectId || '(ADC default)',
        'databaseId:',
        dbLabel,
      );
    }
  }
  return db;
}
