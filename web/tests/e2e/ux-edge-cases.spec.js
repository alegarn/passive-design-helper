import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('UX and Edge Cases', () => {
    const csvDir = path.join('/home/a/Documents/Projets/passive-design-tactics/web', 'test-data');
    if (!fs.existsSync(csvDir)) {
        fs.mkdirSync(csvDir);
    }

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('Error Handling: Invalid CSV headers', async ({ page }) => {
        const invalidCsvPath = path.join(csvDir, 'invalid-headers.csv');
        fs.writeFileSync(invalidCsvPath, 'wrong,header,columns\n1,2,3');

        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.click('input[type="file"]');
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(invalidCsvPath);

        // It should still parse 1 row (it just doesn't know what it is)
        await expect(page.locator('text=Parsed 1 sample rows')).toBeVisible();
        
        // Ensure "Process Data" shows an error if columns aren't selected
        // In this case, auto-detection should fail to find "temperature" or "humidity"
        const processBtn = page.locator('button:has-text("Process Data")');
        await processBtn.click();
        
        await expect(page.locator('text=Please select all required columns')).toBeVisible();
    });

    test('Error Handling: Empty CSV', async ({ page }) => {
        const emptyCsvPath = path.join(csvDir, 'empty.csv');
        fs.writeFileSync(emptyCsvPath, 'timestamp,temperature,humidity');

        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.click('input[type="file"]');
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(emptyCsvPath);

        await expect(page.locator('text=Parsed 0 sample rows')).toBeVisible();
    });

    test('Persistence: State survives UI toggles (Open-Meteo)', async ({ page }) => {
        // Open the map preview
        await page.click('button:has-text("Open Map Preview")');
        await expect(page.locator('input[placeholder*="Search or choose a city"]')).toBeVisible();
        
        // Click and go back to see if it's still "there" (DOM state)
        await page.click('button:has-text("Close Map")');
        await expect(page.locator('input[placeholder*="Search or choose a city"]')).not.toBeVisible();
        
        await page.click('button:has-text("Open Map Preview")');
        await expect(page.locator('input[placeholder*="Search or choose a city"]')).toBeVisible();
    });

    test('Responsive Design: Mobile Viewport', async ({ page }) => {
        // Set viewport to mobile
        await page.setViewportSize({ width: 375, height: 667 });
        
        // Upload sample data to see charts
        const sampleCsvPath = path.join(csvDir, 'responsive-test.csv');
        fs.writeFileSync(sampleCsvPath, 'timestamp,temperature,humidity\n2024-01-01T00:00,20,50\n2024-01-01T01:00,25,60');
        
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.click('input[type="file"]');
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(sampleCsvPath);
        
        await page.click('button:has-text("Process Data")');
        
        // Ensure charts are visible and not overflowing (basic check)
        const psychroChart = page.locator('.psychro-chart');
        await expect(psychroChart).toBeVisible();
        
        // Check if header becomes stacked or handles small width
        const header = page.locator('header');
        const headerBox = await header.boundingBox();
        expect(headerBox.width).toBeLessThanOrEqual(375);
    });

    test('Multi-Process: Switch from Fetch to Upload', async ({ page }) => {
        // 1. Start with a Map Preview
        await page.click('button:has-text("Open Map Preview")');
        await page.fill('input[placeholder*="Search or choose a city"]', 'Berlin');
        await page.waitForTimeout(500);
        const cityItem = page.locator('.city-item').first();
        if (await cityItem.isVisible()) {
            await cityItem.click();
        }
        
        // 2. Now perform a file upload instead
        const sampleCsvPath = path.join(csvDir, 'switch-test.csv');
        fs.writeFileSync(sampleCsvPath, 'timestamp,temperature,humidity\n2024-01-01T00:00,10,30');
        
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.click('input[type="file"]');
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(sampleCsvPath);
        
        // Verify it switched to uploaded file status
        await expect(page.locator('text=Parsed 1 sample rows')).toBeVisible();
        await expect(page.locator('text=Berlin')).not.toBeVisible(); // City name should not be in the primary status if upload took over
    });

    test('Accessibility: Modal ARIA attributes', async ({ page }) => {
        // Upload and process to get tactics
        const sampleCsvPath = path.join(csvDir, 'a11y-test.csv');
        fs.writeFileSync(sampleCsvPath, 'timestamp,temperature,humidity\n2024-01-01T00:00,35,80');
        
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.click('input[type="file"]');
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(sampleCsvPath);
        
        await page.click('button:has-text("Process Data")');
        
        // Wait for tactics (they are rendered in PsychroChart or below)
        const tacticCard = page.locator('.card[role="button"]').first();
        await tacticCard.scrollIntoViewIfNeeded();
        await tacticCard.click();
        
        // Check ARIA properties
        const modal = page.locator('.modal[role="dialog"]');
        await expect(modal).toBeVisible();
        await expect(modal).toHaveAttribute('aria-modal', 'true');
        await expect(modal).toHaveAttribute('aria-labelledby', 'tactic-title');
        
        // Check close button
        const closeBtn = page.locator('button.close');
        await expect(closeBtn).toHaveAttribute('aria-label', 'Close details');
        
        // Test Escape key to close
        await page.keyboard.press('Escape');
        await expect(modal).not.toBeVisible();
    });
});
