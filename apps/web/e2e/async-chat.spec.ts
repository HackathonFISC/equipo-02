import { expect, test } from '@playwright/test';

test('submits, polls, and renders an asynchronous chat turn', async ({ page }) => {
  let jobId = 'chatjob-e2e';
  let requestHeaders: Record<string, string> = {};
  await page.route('**/api/chat', async (route) => {
    await route.fulfill({ json: { transcript: [], slotState: {}, version: 0, phase: 'profile' } });
  });
  await page.route('**/api/v1/chat/turns', async (route) => {
    requestHeaders = route.request().headers();
    await route.fulfill({ status: 202, json: { jobId, status: 'queued', statusUrl: `/api/v1/chat/turns/${jobId}`, pollAfterMs: 10 } });
  });
  await page.route(`**/api/v1/chat/turns/${jobId}`, async (route) => {
    await route.fulfill({ json: { jobId, status: 'succeeded', sessionVersion: 1, result: {
      intent: 'ask_slot', reply: 'Respuesta async', pendingSlot: 'greeting', slotUpdates: [],
      chips: [], phase: 'profile', source: 'fallback',
    } } });
  });
  await page.goto('/chat');
  const input = page.getByRole('textbox', { name: 'Escribe tu respuesta' });
  await input.fill('hola');
  await input.press('Enter');
  await expect(page.getByText('Respuesta async')).toBeVisible();
  expect(requestHeaders['idempotency-key']).toBeTruthy();
  expect(requestHeaders['x-request-id']).toBeTruthy();
});
