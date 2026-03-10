/* eslint-env browser */
// UI bridge utilities - thin adapter layer for UI-specific data transformations

import { ZONES } from './zones.js';

export function prepareChartData(rows) {
  return rows.map(row => ({
    x: row.temp,
    y: row.rh,
    zone: row.zone,
    color: getZoneColor(row.zone),
    timestamp: row.ts
  }));
}

export function getZoneColor(zoneId) {
  const zone = ZONES.find(z => z.id === zoneId);
  return zone ? zone.color : '#999999';
}

export function getZoneById(zoneId) {
  return ZONES.find(z => z.id === zoneId);
}

export function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatTemperature(temp) {
  return `${temp.toFixed(1)}°C`;
}

export function formatHumidity(rh) {
  return `${rh.toFixed(0)}%`;
}

export function formatHours(hours) {
  return `${hours.toFixed(1)} hours`;
}

export function formatPercent(percent) {
  return `${percent.toFixed(1)}%`;
}

export function createTooltipHTML(point) {
  const zone = getZoneById(point.zone);
  const date = new Date(point.timestamp);
  
  return `
    <div class="chart-tooltip__title">${zone ? zone.id : 'Unknown'}</div>
    <div class="chart-tooltip__row">
      <span class="chart-tooltip__label">Temperature:</span>
      <span class="chart-tooltip__value">${formatTemperature(point.x)}</span>
    </div>
    <div class="chart-tooltip__row">
      <span class="chart-tooltip__label">Humidity:</span>
      <span class="chart-tooltip__value">${formatHumidity(point.y)}</span>
    </div>
    <div class="chart-tooltip__row">
      <span class="chart-tooltip__label">Time:</span>
      <span class="chart-tooltip__value">${date.toLocaleString()}</span>
    </div>
  `;
}

export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      if (typeof globalThis.clearTimeout === 'function') globalThis.clearTimeout(timeout);
      func(...args);
    };
    if (typeof globalThis.clearTimeout === 'function') globalThis.clearTimeout(timeout);
    timeout = (typeof globalThis.setTimeout === 'function') ? globalThis.setTimeout(later, wait) : null;
  };
}

export function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      if (typeof globalThis.setTimeout === 'function') globalThis.setTimeout(() => inThrottle = false, limit);
    }
  };
}

export function validateFile(file) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    throw new Error('Please upload a CSV file');
  }
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error('File size must be less than 50MB');
  }
  return true;
}

export function createStatusMessage(message, type = 'info') {
  const statusEl = document.querySelector('.upload-zone__status');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `upload-zone__status ${type}`;
  
  if (type === 'error') {
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'upload-zone__status';
    }, 5000);
  }
}

export function showLoadingState(element, loadingText = 'Loading...') {
  element.disabled = true;
  const originalText = element.textContent;
  element.textContent = loadingText;
  
  return () => {
    element.disabled = false;
    element.textContent = originalText;
  };
}

export function createChartTooltip(x, y, content) {
  const existing = document.querySelector('.chart-tooltip');
  if (existing) {
    existing.remove();
  }
  
  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.innerHTML = content;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
  document.body.appendChild(tooltip);
  
  return tooltip;
}

export function removeChartTooltip() {
  const tooltip = document.querySelector('.chart-tooltip');
  if (tooltip) {
    tooltip.remove();
  }
}

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getCanvasCoordinates(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

export function dataPointAtCoordinates(canvas, coords, chartData, tempRange, rhRange) {
  const { x, y } = coords;
  const padding = 40;
  const chartWidth = canvas.width - 2 * padding;
  const chartHeight = canvas.height - 2 * padding;
  
  const temp = tempRange.min + ((x - padding) / chartWidth) * (tempRange.max - tempRange.min);
  const rh = rhRange.max - ((y - padding) / chartHeight) * (rhRange.max - rhRange.min);
  
  const threshold = 10;
  return chartData.find(point => {
    const px = padding + ((point.x - tempRange.min) / (tempRange.max - tempRange.min)) * chartWidth;
    const py = padding + chartHeight - ((point.y - rhRange.min) / (rhRange.max - rhRange.min)) * chartHeight;
    
    const distance = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2));
    return distance <= threshold;
  });
}
