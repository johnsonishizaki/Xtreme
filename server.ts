import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { handleRosterParseApi } from './src/server/apiHandler.ts';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import { getOrCreateUser } from './src/db/users.ts';
import {
  getUserSettings,
  saveUserSettings,
  getUserRosters,
  saveRosterWithAssignmentsInDb,
  deleteUserRoster,
  setActiveUserRoster,
  getUserDutyAssignments,
  updateSpecificDutyAssignment,
  getUserSendHistory,
  saveUserSendHistory,
} from './src/db/queries.ts';

import { tallyService } from './src/server/tallyService.ts';
import {
  handleGoogleFormsAttendanceWebhook,
  getGoogleFormsReceiverStatus
} from './src/server/googleFormsReceiver.ts';
import {
  handleTallyWebhookPost,
  getTallyWebhookReceiverStatus
} from './src/server/tallyWebhookReceiver.ts';
import { pushService } from './src/server/pushService.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({
    limit: '30mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(express.urlencoded({ extended: true, limit: '30mb' }));

  // API endpoint for Gemini roster analysis
  app.post('/api/roster-parse', async (req, res) => {
    try {
      const result = await handleRosterParseApi(req.body);
      res.json(result);
    } catch (err: any) {
      console.error('API /api/roster-parse error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  });

  // Health check endpoint for Gemini AI connectivity
  app.get('/api/ai-check', async (_req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ success: false, error: 'GEMINI_API_KEY is not configured on the server.' });
      }
      const testResult = await handleRosterParseApi({
        text: 'Week 1 (08 Sep - 14 Sep 2026): Teacher Alpha, Teacher Beta',
        fileName: 'ai_health_check.txt',
        sourceType: 'text'
      });
      res.json({
        success: true,
        message: 'Gemini AI is connected and functioning correctly.',
        sampleParsedCount: testResult.assignments.length
      });
    } catch (err: any) {
      console.error('API /api/ai-check error:', err);
      res.status(500).json({ success: false, error: err.message || 'Gemini check failed' });
    }
  });

  // --- TALLY OFFICIAL API ENDPOINTS ---
  app.get('/api/tally/status', (_req, res) => {
    try {
      const status = tallyService.getStatus();
      res.json({ success: true, ...status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to get Tally status' });
    }
  });

  app.post('/api/tally/config', (req, res) => {
    try {
      const { apiKey, formId, pollIntervalSeconds, pollIntervalMinutes } = req.body;
      tallyService.saveConfiguration(apiKey, formId, pollIntervalSeconds, pollIntervalMinutes);
      res.json({ success: true, status: tallyService.getStatus() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to update Tally configuration' });
    }
  });

  app.post('/api/tally/test-connection', async (_req, res) => {
    try {
      const result = await tallyService.testConnection();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ status: 'connection_error', message: err.message || 'Test connection failed' });
    }
  });

  app.post('/api/tally/sync', async (req, res) => {
    try {
      const trigger = req.body?.trigger === 'automatic' ? 'automatic' : 'manual';
      const result = await tallyService.syncSubmissions(trigger);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || 'Sync failed' });
    }
  });

  app.get('/api/tally/history', (_req, res) => {
    try {
      const history = tallyService.getSyncHistory();
      res.json({ success: true, history });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/tally/failed-submissions', (_req, res) => {
    try {
      const issues = tallyService.getFailedSubmissions();
      res.json({ success: true, issues });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- GOOGLE FORMS ATTENDANCE WEBHOOK RECEIVER ---
  // Suggested route: POST /api/integrations/google-forms/attendance
  app.post('/api/integrations/google-forms/attendance', handleGoogleFormsAttendanceWebhook);

  app.get('/api/integrations/google-forms/attendance', (_req, res) => {
    try {
      const status = getGoogleFormsReceiverStatus();
      res.json({ success: true, ...status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- TALLY DIRECT INSTANT WEBHOOK RECEIVER ---
  app.post('/api/integrations/tally/webhook', handleTallyWebhookPost);
  app.post('/api/tally/webhook', handleTallyWebhookPost);
  app.post('/api/webhook/tally', handleTallyWebhookPost);
  app.post('/api/tally/webhook/attendance', handleTallyWebhookPost);

  const handleTallyWebhookGet = (_req: any, res: any) => {
    try {
      const status = getTallyWebhookReceiverStatus();
      res.json({ success: true, ...status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  app.get('/api/integrations/tally/webhook', handleTallyWebhookGet);
  app.get('/api/tally/webhook', handleTallyWebhookGet);
  app.get('/api/webhook/tally', handleTallyWebhookGet);

  // --- DIRECT FAST ATTENDANCE REPORTS API (Same-Origin, 0ms latency) ---
  app.get('/api/reports', async (_req, res) => {
    try {
      const { collection, getDocs } = await import('firebase/firestore');
      const { db } = await import('./src/services/firebase.ts');
      const snap = await getDocs(collection(db, 'houseReports'));
      const reports: any[] = [];
      snap.forEach(d => {
        const rep = d.data();
        if (rep && rep.id && !rep.id.includes('sample') && !rep.id.includes('demo')) {
          reports.push(rep);
        }
      });
      reports.sort((a, b) => (b.reportingDate || '').localeCompare(a.reportingDate || ''));
      res.json({ success: true, count: reports.length, reports });
    } catch (err: any) {
      console.warn('[Server] /api/reports fetch error:', err);
      res.status(500).json({ success: false, error: err.message, reports: [] });
    }
  });

  app.post('/api/reports', async (req, res) => {
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      const { db } = await import('./src/services/firebase.ts');
      const report = req.body;
      if (!report || !report.id || !report.reportingDate || !report.houseId) {
        return res.status(400).json({ success: false, error: 'Missing required report fields (id, reportingDate, houseId).' });
      }
      await setDoc(doc(db, 'houseReports', report.id), report, { merge: true });
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- ACADEMIC TERMS API (Direct same-origin Firestore access) ---
  app.get('/api/terms', async (_req, res) => {
    try {
      const { collection, getDocs } = await import('firebase/firestore');
      const { db } = await import('./src/services/firebase.ts');
      const snap = await getDocs(collection(db, 'terms'));
      const terms: any[] = [];
      snap.forEach(d => {
        const t = d.data();
        if (t && t.id) terms.push({ ...t, status: 'open' });
      });
      res.json({ success: true, count: terms.length, terms });
    } catch (err: any) {
      console.warn('[Server] /api/terms fetch error:', err);
      res.status(500).json({ success: false, error: err.message, terms: [] });
    }
  });

  app.post('/api/terms', async (req, res) => {
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      const { db } = await import('./src/services/firebase.ts');
      const term = req.body;
      if (!term || !term.id || !term.termName) {
        return res.status(400).json({ success: false, error: 'Missing term id or termName' });
      }
      await setDoc(doc(db, 'terms', term.id), term, { merge: true });
      res.json({ success: true, term });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/terms/:id', async (req, res) => {
    try {
      const { doc, deleteDoc } = await import('firebase/firestore');
      const { db } = await import('./src/services/firebase.ts');
      const termId = req.params.id;
      if (!termId) {
        return res.status(400).json({ success: false, error: 'Missing term id' });
      }
      await deleteDoc(doc(db, 'terms', termId));
      res.json({ success: true, termId });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- DATABASE & AUTH API ENDPOINTS ---

  // 1. Sync / register user profile and initialize settings
  app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const decodedUser = req.user!;
      const userRecord = await getOrCreateUser(decodedUser.uid, decodedUser.email || '');
      res.json({ success: true, user: userRecord });
    } catch (err: any) {
      console.error('API /api/auth/sync error:', err);
      res.status(500).json({ error: err.message || 'Failed to sync user.' });
    }
  });

  // 2. Settings management
  app.get('/api/settings', requireAuth, async (req: AuthRequest, res) => {
    try {
      const decodedUser = req.user!;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || '');
      const settingsData = await getUserSettings(dbUser.id);
      res.json(settingsData);
    } catch (err: any) {
      console.error('API GET /api/settings error:', err);
      res.status(500).json({ error: err.message || 'Failed to fetch settings.' });
    }
  });

  app.post('/api/settings', requireAuth, async (req: AuthRequest, res) => {
    try {
      const decodedUser = req.user!;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || '');
      await saveUserSettings(dbUser.id, req.body);
      res.json({ success: true });
    } catch (err: any) {
      console.error('API POST /api/settings error:', err);
      res.status(500).json({ error: err.message || 'Failed to save settings.' });
    }
  });

  // 3. Rosters management
  app.get('/api/rosters', requireAuth, async (req: AuthRequest, res) => {
    try {
      const decodedUser = req.user!;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || '');
      const rosterList = await getUserRosters(dbUser.id);
      res.json(rosterList);
    } catch (err: any) {
      console.error('API GET /api/rosters error:', err);
      res.status(500).json({ error: err.message || 'Failed to load rosters.' });
    }
  });

  app.post('/api/rosters', requireAuth, async (req: AuthRequest, res) => {
    try {
      const decodedUser = req.user!;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || '');
      const { roster, assignments } = req.body;
      await saveRosterWithAssignmentsInDb(dbUser.id, roster, assignments);
      res.json({ success: true });
    } catch (err: any) {
      console.error('API POST /api/rosters error:', err);
      res.status(500).json({ error: err.message || 'Failed to save roster.' });
    }
  });

  app.delete('/api/rosters/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const decodedUser = req.user!;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || '');
      await deleteUserRoster(dbUser.id, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      console.error('API DELETE /api/rosters error:', err);
      res.status(500).json({ error: err.message || 'Failed to delete roster.' });
    }
  });

  app.post('/api/rosters/active', requireAuth, async (req: AuthRequest, res) => {
    try {
      const decodedUser = req.user!;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || '');
      await setActiveUserRoster(dbUser.id, req.body.rosterId);
      res.json({ success: true });
    } catch (err: any) {
      console.error('API POST /api/rosters/active error:', err);
      res.status(500).json({ error: err.message || 'Failed to activate roster.' });
    }
  });

  // 4. Assignments management
  app.get('/api/assignments', requireAuth, async (req: AuthRequest, res) => {
    try {
      const decodedUser = req.user!;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || '');
      const list = await getUserDutyAssignments(dbUser.id);
      res.json(list);
    } catch (err: any) {
      console.error('API GET /api/assignments error:', err);
      res.status(500).json({ error: err.message || 'Failed to load assignments.' });
    }
  });

  app.post('/api/assignments/update', requireAuth, async (req: AuthRequest, res) => {
    try {
      const decodedUser = req.user!;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || '');
      await updateSpecificDutyAssignment(dbUser.id, req.body.assignment);
      res.json({ success: true });
    } catch (err: any) {
      console.error('API POST /api/assignments/update error:', err);
      res.status(500).json({ error: err.message || 'Failed to update assignment.' });
    }
  });

  // 5. Send History management
  app.get('/api/send-history', requireAuth, async (req: AuthRequest, res) => {
    try {
      const decodedUser = req.user!;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || '');
      const list = await getUserSendHistory(dbUser.id);
      res.json(list);
    } catch (err: any) {
      console.error('API GET /api/send-history error:', err);
      res.status(500).json({ error: err.message || 'Failed to fetch send history.' });
    }
  });

  app.post('/api/send-history', requireAuth, async (req: AuthRequest, res) => {
    try {
      const decodedUser = req.user!;
      const dbUser = await getOrCreateUser(decodedUser.uid, decodedUser.email || '');
      await saveUserSendHistory(dbUser.id, req.body);
      res.json({ success: true });
    } catch (err: any) {
      console.error('API POST /api/send-history error:', err);
      res.status(500).json({ error: err.message || 'Failed to record history item.' });
    }
  });

  // --- WEB PUSH (REAL iPHONE APNs BACKGROUND LOCK-SCREEN PUSH) ---
  app.get('/api/push/vapid-public-key', (_req, res) => {
    try {
      res.json({ success: true, publicKey: pushService.getPublicKey() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/push/subscribe', async (req, res) => {
    try {
      const { subscription, sendWelcome } = req.body || {};
      if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ success: false, error: 'Missing push subscription object' });
      }
      const result = await pushService.registerSubscription(
        subscription,
        req.headers['user-agent'],
        Boolean(sendWelcome)
      );
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/push/unsubscribe', async (req, res) => {
    try {
      const { endpoint } = req.body || {};
      if (endpoint) {
        await pushService.removeSubscription(endpoint);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/push/sync-state', async (req, res) => {
    try {
      const state = await pushService.syncDutyState(req.body || {});
      res.json({ success: true, state });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/push/mark-done', async (_req, res) => {
    try {
      const result = await pushService.markDutyDoneFromPush();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/push/test', async (_req, res) => {
    try {
      const result = await pushService.sendTestDutyPush();
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Build/boot version token so installed PWAs and open browser tabs auto-refresh cleanly on updates
  const BOOT_VERSION = String(Date.now());
  app.get('/api/version', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json({ version: BOOT_VERSION });
  });

  // Explicit anti-caching for service worker and manifest so updates are detected immediately
  app.get(['/sw.js', '/service-worker.js', '/manifest.webmanifest'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use((req, res, next) => {
      if (req.url === '/' || req.url.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
      next();
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    // Serve hashed assets with long cache
    app.use('/assets', express.static(path.join(distPath, 'assets'), {
      maxAge: '1y',
      immutable: true
    }));
    // Serve all other static assets
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Initialize automatic Tally background scheduler & iPhone Push Watchdog
  tallyService.startPolling();
  pushService.startScheduler();

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Xtreme duty server running on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
