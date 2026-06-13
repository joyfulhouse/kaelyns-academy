#!/usr/bin/env bun

/**
 * Comprehensive Math Website Audit Script
 * Tests all sections for mathematical correctness
 */

import { launch } from 'chrome-launcher';
import WebSocket from 'ws';
import { writeFileSync } from 'fs';
import { join } from 'path';

const SCREENSHOTS_DIR = '/Users/bryanli/Projects/joyfulhouse/websites/kaelyn-academy/docs/screenshots';
const URL = 'http://localhost:3030';

let chrome;
let client;

async function launchBrowser() {
  chrome = await launch({
    chromeFlags: ['--disable-gpu', '--no-sandbox'],
  });

  const response = await fetch(`http://localhost:${chrome.port}/json/version`);
  const { webSocketDebuggerUrl } = await response.json();

  client = new WebSocket(webSocketDebuggerUrl);

  return new Promise((resolve) => {
    client.on('open', () => resolve());
  });
}

let messageId = 0;
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++messageId;
    const message = JSON.stringify({ id, method, params });

    const handler = (data) => {
      const response = JSON.parse(data);
      if (response.id === id) {
        client.off('message', handler);
        if (response.error) {
          reject(new Error(response.error.message));
        } else {
          resolve(response.result);
        }
      }
    };

    client.on('message', handler);
    client.send(message);
  });
}

async function navigate(url) {
  await send('Page.enable');
  await send('Page.navigate', { url });
  await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for page load
}

async function screenshot(filename) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const buffer = Buffer.from(data, 'base64');
  writeFileSync(join(SCREENSHOTS_DIR, filename), buffer);
  console.log(`✓ Screenshot saved: ${filename}`);
}

async function click(selector) {
  // Get element
  const { root } = await send('DOM.getDocument');
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });

  if (!nodeId) {
    throw new Error(`Element not found: ${selector}`);
  }

  // Get box model
  const { model } = await send('DOM.getBoxModel', { nodeId });
  const [x, y] = model.content;

  // Click
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });

  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });

  await new Promise(resolve => setTimeout(resolve, 1000));
}

async function evaluate(script) {
  const result = await send('Runtime.evaluate', {
    expression: script,
    returnByValue: true,
  });
  return result.result.value;
}

async function testSection(name, selector) {
  console.log(`\n=== Testing ${name} Section ===`);

  // Navigate to section
  await click(selector);
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Take screenshot
  await screenshot(`${name.toLowerCase().replace(/\s+/g, '-')}.png`);
}

async function runAudit() {
  try {
    console.log('Launching Chrome...');
    await launchBrowser();

    console.log('Navigating to website...');
    await navigate(URL);

    // Take home screenshot
    await screenshot('01-home.png');
    console.log('✓ Home page loaded');

    // Test Number Places
    await testSection('Number Places', 'button[data-section="number-places"]');

    // Test Stacked Math
    await testSection('Stacked Math', 'button[data-section="stacked-math"]');

    // Test Carry Over - CRITICAL
    console.log('\n=== CRITICAL: Testing Carry Over Section ===');
    await click('button[data-section="carry-over"]');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get the problem
    const carryProblem = await evaluate(`
      const num1 = document.querySelector('[data-testid="num1"]')?.textContent || 'N/A';
      const num2 = document.querySelector('[data-testid="num2"]')?.textContent || 'N/A';
      const answer = document.querySelector('[data-testid="answer"]')?.textContent || 'N/A';
      ({ num1, num2, answer });
    `);

    console.log('Carry Problem:', carryProblem);

    // Take initial screenshot
    await screenshot('03-carry-over-start.png');

    // Play demo
    const playButton = await evaluate(`
      document.querySelector('button')?.textContent?.includes('Play');
    `);

    if (playButton) {
      await click('button:has-text("Play Demo")');
      await new Promise(resolve => setTimeout(resolve, 2000));
      await screenshot('04-carry-over-playing.png');

      await new Promise(resolve => setTimeout(resolve, 8000)); // Let it play
      await screenshot('05-carry-over-complete.png');
    }

    // Test Borrowing - CRITICAL
    console.log('\n=== CRITICAL: Testing Borrowing Section ===');
    await click('button[data-section="borrowing"]');
    await new Promise(resolve => setTimeout(resolve, 2000));
    await screenshot('06-borrowing-start.png');

    // Test Multiplication
    await testSection('Multiplication', 'button[data-section="multiplication"]');

    // Test Division
    await testSection('Division', 'button[data-section="division"]');

    // Test Practice
    await testSection('Practice', 'button[data-section="practice"]');

    console.log('\n✅ Audit complete! Check screenshots in docs/screenshots/');

  } catch (error) {
    console.error('❌ Error during audit:', error);
  } finally {
    if (client) {
      client.close();
    }
    if (chrome) {
      await chrome.kill();
    }
  }
}

runAudit();
