import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Passive Design Tactics E2E', () => {
  const sampleCsvContent = `timestamp,temperature,humidity
2024-01-01T00:00,20,50
2024-01-01T01:00,21,55
2024-01-01T02:00,22,60
2024-01-01T03:00,23,65
2024-01-01T04:00,24,70`;

  const csvPath = path.join('/home/a/Documents/Projets/passive-design-tactics/web', 'test-sample.csv');

  test('full flow: upload, map, process, and interact', async ({ page }) => {
    // Force write the file inside the test to be sure
    fs.writeFileSync(csvPath, sampleCsvContent);

    await page.goto('/');

    // 1. File Upload
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('input[type="file"]');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(csvPath);

    // Verify upload status
    await expect(page.locator('text=Parsed 5 sample rows')).toBeVisible();

    // 2. Column Mapping (ProcessControls)
    // Check if auto-mapping worked or select manually
    await page.selectOption('select[id="time-column"]', 'timestamp');
    await page.selectOption('select[id="temp-column"]', 'temperature');
    await page.selectOption('select[id="rh-column"]', 'humidity');

    // 3. Process Data
    await page.click('button:has-text("Process Data")');

    // Wait for processing to complete (look for summary or charts)
    await expect(page.locator('text=Processing...')).not.toBeVisible();
    
    // Verify results: Psychrometric Chart should be visible
    const psychroChart = page.locator('.psychro-chart');
    await expect(psychroChart).toBeVisible();

    // 4. Interactive Psychrometric Chart and Time Series
    // Ensure "Comfort Zones" or "Zone Hours" cards appear
    await expect(page.locator('.stat-card').first()).toBeVisible();

    // 5. Slider update: Changing the slider should update the Psychrometric Chart
    const slider = page.locator('#median-slider-input');
    await slider.fill('30');
    // Verify slider value update in UI (using more specific locator for top slider)
    await expect(page.locator('header input[type="number"]')).toHaveValue('30');

    // 6. Modal interaction: Click on a tactic card to open the modal
    // Assuming TacticCards are rendered
    const tacticCard = page.locator('.tactic-card').first();
    if (await tacticCard.isVisible()) {
      await tacticCard.click();
      await expect(page.locator('.modal-content')).toBeVisible();
      await page.locator('button.close-modal').click();
      await expect(page.locator('.modal-content')).not.toBeVisible();
    }

    // 7. Multi-process: Fetch data from Open-Meteo
    await page.click('button:has-text("Open Map Preview")');
    await expect(page.locator('input[placeholder*="Search or choose a city"]')).toBeVisible();
    
    // Type a city and select it
    await page.fill('input[placeholder*="Search or choose a city"]', 'Paris');
    // Wait for results to appear
    await page.waitForTimeout(1000); 
    const cityResult = page.locator('.city-item').first();
    if (await cityResult.isVisible()) {
        await cityResult.click();
        await page.click('button:has-text("Fetch & Download")');
        // It should start processing or show mapping for the new data
        await expect(page.locator('text=Fetching...')).toBeVisible();
    }
  });

  test('fetching climate data (Locate Me / Fetch Open-Meteo)', async ({ page }) => {
    await page.goto('/');
    // Check if the geolocation button exists
    const locateMeBtn = page.locator('button[aria-label="Use your current location"]');
    await expect(locateMeBtn).toBeVisible();
    await expect(locateMeBtn).toBeEnabled();
  });
});
