import { runGoogleFormsReceiverTests } from './googleFormsReceiver.test.ts';
import { runTallyWebhookTests } from './tallyWebhook.test.ts';

async function main() {
  console.log('Running all Xtreme backend test suites...');
  
  // 1. Tally Webhook FORM_RESPONSE Suite
  await runTallyWebhookTests();

  // 2. Google Forms Attendance Receiver Suite
  await runGoogleFormsReceiverTests();

  // 3. Tally API Polling Legacy Integration Suite
  const { execSync } = await import('child_process');
  console.log('Running Tally Integration test suite...');
  execSync('npx tsx tests/tally.test.ts', { stdio: 'inherit' });

  console.log('\n======================================================');
  console.log('ALL XTREME TEST SUITES PASSED SUCCESSFULLY (100%)');
  console.log('======================================================\n');
}

main().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
