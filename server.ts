import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { handleRosterParseApi } from './src/server/apiHandler.ts';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '30mb' }));
  app.use(express.urlencoded({ extended: true, limit: '30mb' }));

  // API endpoint for Gemini roster analysis (unprotected or protected depending on usage, let's keep it open for simple parsing from any UI, or optionally require token)
  app.post('/api/roster-parse', async (req, res) => {
    try {
      const result = await handleRosterParseApi(req.body);
      res.json(result);
    } catch (err: any) {
      console.error('API /api/roster-parse error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
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

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Xtreme duty server running on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
