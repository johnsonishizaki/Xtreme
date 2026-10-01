# Xtreme — Weekly Teacher Duty Reminder Assistant

**Xtreme** is a mobile-first PWA designed specifically for **Xtreme** to take teacher-duty rosters from Excel/CSV spreadsheets, digital PDFs, or Google Sheets, understand which teacher(s) are on duty for the coming week, generate a ready-to-send WhatsApp announcement, and trigger a weekly reminder every Sunday.

---

## 🎯 Core Purpose & Philosophy

* **Manual Sending, Zero Risk**: Xtreme does not automate personal WhatsApp credentials, scrape WhatsApp Web, or risk account flags. Instead, the app prepares the exact formatted announcement, provides a prominent **Copy Message** button, and an **Open WhatsApp** button to launch WhatsApp directly so Xtreme can paste and send manually.
* **Minimal AI Quota Usage**: Gemini 2.5 Flash is invoked **only** during document import when table layouts are irregular or ambiguous. Once interpreted, structured weekly assignments are saved to Cloud Firestore and never require recurring AI calls for standard Sunday reminders.
* **Mobile-First iPhone Experience**: Native-like PWA with touch-friendly controls, standalone display mode, offline cache, and instant status indicators.

---

## 🚀 Key Features

1. **Multi-Format Roster Ingestion**:
   - **Excel**: `.xlsx`, `.xls` via client-side SheetJS parsing.
   - **CSV**: `.csv` comma/tab separated duty tables.
   - **PDF**: Browser-side PDF text extraction via PDF.js. If a scanned photo/image PDF with unreadable text is uploaded, Xtreme is clearly warned instead of hallucinating teacher names.
   - **Google Sheets**: Direct CSV export link import or pasted sheet rows.
   - **Harmless Demo Data**: 1-tap test roster with generic duty periods and teachers.

2. **Smart Table Understanding**:
   - Deterministic column recognition for headings like `Teacher`, `Staff`, `Duty Teacher`, `Week`, `Start Date`, `End Date`, `Duty Assignment`.
   - On-demand server-side Gemini 2.5 Flash normalization for irregular tables.
   - **Review Extracted Data Screen**: Allows Xtreme to review, edit teacher names, adjust dates, or add rows before saving to Firestore.

3. **Message Generator & Template Customization**:
   - Customizable template with dynamic placeholders:
     - `{TEACHERS}`: Formatted as numbered list when multiple teachers are on duty.
     - `{START_DATE}` & `{END_DATE}`: Human-readable dates (e.g. `21 September 2026`).
     - `{WEEK}`: Week label.
     - `{DUTY}`: Assignment area/role.
   - Live editable preview on the Home screen.

4. **Sunday Reminders**:
   - Scheduled recurring reminder check every Sunday.
   - Web Notification API support with "Send Test Notification" in Settings.
   - Reminder pending badge if Sunday announcement hasn't been sent.
   - Activity log (Send History) tracking copied and sent announcements.

---

## 🛠️ Tech Stack

* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons
* **Database & Persistence**: Google Cloud Firestore (provisioned via AI Studio Firebase integration)
* **AI Model**: `@google/genai` with Gemini 2.5 Flash on `/api/roster-parse`
* **Parsing**: `xlsx` (SheetJS), `pdfjs-dist` (PDF.js)
* **PWA**: Web App Manifest (`manifest.webmanifest`), Service Worker (`sw.js`), iPhone safe-area optimization

---

## 📋 How Firebase Is Connected

Firebase Firestore is configured in `firebase-applet-config.json` with the provisioned project and database ID:
- Database: `ai-studio-8410f7c6-e6fd-4b1d-a44f-e6f877a6595d`
- Rules: `firestore.rules` allows authenticated/valid applet read/write operations on `/settings`, `/rosters`, `/dutyAssignments`, and `/sendHistory`.
- Offline resilience: If offline, the app automatically persists and restores from local storage cache.

---

## ⚡ Running & Deploying

### Development
```bash
npm run dev
```
Starts the Vite development server with the Gemini API proxy plugin on `http://localhost:3000`.

### Production Build
```bash
npm run build
npm start
```
Compiles Vite client assets to `dist/` and runs `server.ts` with Express.

---

## 🔔 Enabling Notifications

1. Open **Xtreme** in your mobile Safari or desktop browser.
2. Tap the **Settings** icon in the top navigation bar.
3. Tap **Enable Browser Notifications**.
4. Confirm "Allow" in the browser prompt.
5. Tap **Send Test Notification** to verify delivery.
6. On iPhone: Tap the Share button in Safari, select **"Add to Home Screen"**, and launch Xtreme from your Home Screen.
