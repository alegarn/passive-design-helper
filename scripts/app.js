import { ZONES, INF_T } from './zones.js';
import { classifyPoint, pointInPoly } from './classify.js';
import { createAggregator, detectSampling } from './aggregate.js';
import { csvSplitLine, parseHeader, findBestColumn } from './csv.js';
import { tryParseDate, detectDayFirstFromSamples } from './dateParser.js';
import { buildTimeseriesLines, formatSummary, buildJsonSummary } from './output.js';

class TacticsApp {
  constructor() {
    this.state = {
      rawData: null,
      columnMapping: { time: -1, temp: -1, rh: -1 },
      dateOptions: { dayFirst: null, treatAsUTC: false },
      timelineUnit: 'auto',
      results: null
    };
    this.psychroChart = null;
    this.initEventListeners();
    this.tooltip = null;
  }

  initEventListeners() {
    console.log('Initializing event listeners...');
    
    const fileInput = document.getElementById('file-input');
    const dropArea = document.querySelector('.upload-zone__droparea');
    const analyzeBtn = document.querySelector('.btn--analyze');
    const resetBtn = document.querySelector('.app__reset-btn');
    
    console.log('Elements found:', {
      fileInput: !!fileInput,
      dropArea: !!dropArea,
      analyzeBtn: !!analyzeBtn,
      resetBtn: !!resetBtn
    });

    // File upload handlers
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        console.log('File input change event:', e);
        this.handleFileSelect(e);
      });
    }
    
    // Drag and drop handlers
    if (dropArea) {
      dropArea.addEventListener('dragover', (e) => {
        console.log('Drag over event:', e);
        this.handleDragOver(e);
      });
      dropArea.addEventListener('dragleave', (e) => {
        console.log('Drag leave event:', e);
        this.handleDragLeave(e);
      });
      dropArea.addEventListener('drop', (e) => {
        console.log('Drop event:', e);
        this.handleFileDrop(e);
      });
      dropArea.addEventListener('click', () => {
        console.log('Drop area clicked');
        if (fileInput) fileInput.click();
      });
    }

    // Analysis handlers
    analyzeBtn.addEventListener('click', () => this.analyzeData());
    resetBtn.addEventListener('click', () => this.resetAnalysis());

    // Column mapping handlers
    document.getElementById('col-time').addEventListener('change', (e) => this.updateColumnMapping('time', e.target.value));
    document.getElementById('col-temp').addEventListener('change', (e) => this.updateColumnMapping('temp', e.target.value));
    document.getElementById('col-rh').addEventListener('change', (e) => this.updateColumnMapping('rh', e.target.value));

    // Date format handlers
    document.querySelectorAll('input[name="date-format"]').forEach(radio => {
      radio.addEventListener('change', (e) => this.updateDateFormat(e.target.value));
    });

    // Timeline unit handler
    document.getElementById('timeline-unit').addEventListener('change', (e) => this.updateTimelineUnit(e.target.value));

    // Export handlers
    document.querySelectorAll('[data-export]').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleExport(e.target.dataset.export));
    });

    // Timeline view toggle
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', (e) => this.toggleTimelineView(e.target.dataset.view));
    });
  }

  async handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
      await this.processFile(file);
    }
  }

  handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('drag-over');
  }

  handleDragLeave(event) {
    event.currentTarget.classList.remove('drag-over');
  }

  async handleFileDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      await this.processFile(files[0]);
    }
  }

  async processFile(file) {
    console.log('processFile called with:', file);
    
    const statusEl = document.querySelector('.upload-zone__status');
    
    if (!statusEl) {
      console.error('Status element not found!');
      return;
    }
    
    try {
      console.log('Starting file processing...');
      statusEl.textContent = 'Reading file...';
      statusEl.className = 'upload-zone__status';
      
      console.log('Reading file as text...');
      const text = await file.text();
      console.log('File read, length:', text.length);
      
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      console.log('Lines found:', lines.length);
      
      if (lines.length < 2) {
        throw new Error('File appears to be empty or invalid');
      }
      
      console.log('Parsing header...');
      const headers = parseHeader(lines);
      console.log('Headers parsed:', headers);
      
      this.state.rawData = { lines, headers, filename: file.name };
      console.log('Raw data stored:', this.state.rawData);
      
      // Auto-detect columns
      console.log('Detecting columns...');
      this.state.columnMapping = {
        time: findBestColumn(headers, ['time', 'date', 'datetime']),
        temp: findBestColumn(headers, ['temp', 'temperature']),
        rh: findBestColumn(headers, ['rh', 'humidity'])
      };
      console.log('Column mapping detected:', this.state.columnMapping);
      
      console.log('Rendering column mapper...');
      this.renderColumnMapper();
      
      statusEl.textContent = `Loaded ${lines.length - 1} rows from ${file.name}`;
      statusEl.className = 'upload-zone__status success';
      console.log('File processing completed successfully');
      
    } catch (error) {
      console.error('File processing error:', error);
      statusEl.textContent = `Error: ${error.message}`;
      statusEl.className = 'upload-zone__status error';
    }
  }

  renderColumnMapper() {
    console.log('renderColumnMapper called, rawData:', this.state.rawData);
    
    if (!this.state.rawData) {
      console.log('No raw data, returning');
      return;
    }
    
    const { headers } = this.state.rawData;
    console.log('Headers to render:', headers);
    
    const selects = {
      time: document.getElementById('col-time'),
      temp: document.getElementById('col-temp'),
      rh: document.getElementById('col-rh')
    };
    
    console.log('Select elements found:', {
      time: !!selects.time,
      temp: !!selects.temp,
      rh: !!selects.rh
    });
    
    Object.entries(selects).forEach(([type, select]) => {
      if (!select) {
        console.error('Select element not found for type:', type);
        return;
      }
      
      console.log('Rendering select for type:', type, 'with mapping:', this.state.columnMapping[type]);
      
      // Clear existing options except the first
      select.innerHTML = '<option value="">-- Auto detect --</option>';
      
      headers.forEach((header, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = header;
        if (index === this.state.columnMapping[type]) {
          option.selected = true;
        }
        select.appendChild(option);
      });
    });
    
    console.log('Column mapper rendering completed');
  }

  updateColumnMapping(type, value) {
    this.state.columnMapping[type] = parseInt(value) || -1;
    this.updateDatePreview();
  }

  updateDateFormat(format) {
    if (format === 'auto') {
      this.state.dateOptions.dayFirst = null;
    } else {
      this.state.dateOptions.dayFirst = format === 'day-first';
    }
    this.updateDatePreview();
  }

  updateDatePreview() {
    const previewEl = document.querySelector('.date-format-selector__preview code');
    if (!this.state.rawData || this.state.columnMapping.time === -1) {
      previewEl.textContent = '--';
      return;
    }
    
    const { lines } = this.state.rawData;
    const timeCol = this.state.columnMapping.time;
    
    // Try to parse first few non-header rows
    for (let i = 1; i < Math.min(6, lines.length); i++) {
      const cols = csvSplitLine(lines[i]);
      if (cols[timeCol]) {
        const parsed = tryParseDate(cols[timeCol], this.state.dateOptions.dayFirst);
        if (parsed) {
          previewEl.textContent = new Date(parsed).toLocaleString();
          return;
        }
      }
    }
    
    previewEl.textContent = 'Unable to parse date';
  }

  updateTimelineUnit(unit) {
    this.state.timelineUnit = unit;
  }

  async analyzeData() {
    if (!this.state.rawData) {
      this.showError('Please upload a CSV file first');
      return;
    }
    
    const { time, temp, rh } = this.state.columnMapping;
    if (time === -1 || temp === -1 || rh === -1) {
      this.showError('Please map all required columns');
      return;
    }
    
    const analyzeBtn = document.querySelector('.btn--analyze');
    const originalText = analyzeBtn.querySelector('.btn__text').textContent;
    
    try {
      analyzeBtn.disabled = true;
      analyzeBtn.querySelector('.btn__text').textContent = 'Analyzing...';
      
      const aggregator = createAggregator({ 
        treatAsUTC: this.state.dateOptions.treatAsUTC 
      });
      
      if (this.state.timelineUnit !== 'auto') {
        aggregator.setTimelineUnit(this.state.timelineUnit);
      }
      
      const { lines } = this.state.rawData;
      let processedRows = 0;
      
      // Process each row
      for (let i = 1; i < lines.length; i++) {
        const cols = csvSplitLine(lines[i]);
        const tms = tryParseDate(cols[time], this.state.dateOptions.dayFirst);
        const temp = Number(cols[temp]);
        const rh = Number(cols[rh]);
        
        if (Number.isFinite(temp) && Number.isFinite(rh) && tms) {
          aggregator.pushRow({ ts: tms, temp, rh });
          processedRows++;
        }
      }
      
      this.state.results = aggregator.finish();
      
      this.renderResults();
      
      analyzeBtn.querySelector('.btn__text').textContent = `Analyzed ${processedRows} rows`;
      
    } catch (error) {
      this.showError(`Analysis failed: ${error.message}`);
      console.error('Analysis error:', error);
    } finally {
      analyzeBtn.disabled = false;
      setTimeout(() => {
        analyzeBtn.querySelector('.btn__text').textContent = originalText;
      }, 2000);
    }
  }

  renderResults() {
    this.renderChart();
    this.renderStatistics();
    this.renderTimeline();
  }

  renderChart() {
    // Try to use psychrometric chart if available, fallback to simple chart
    const chartContainer = document.querySelector('.chart-container');
    
    if (chartContainer && this.psychroChart) {
      this.renderPsychroChart();
    } else {
      this.renderSimpleChart();
    }
  }

  renderSimpleChart() {
    const canvas = document.querySelector('.psychrometric-chart');
    const ctx = canvas.getContext('2d');
    const legendEl = document.querySelector('.chart-legend');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set up coordinate system
    const padding = 40;
    const chartWidth = canvas.width - 2 * padding;
    const chartHeight = canvas.height - 2 * padding;
    
    // Temperature range: 10-40°C
    // RH range: 0-100%
    const tempRange = { min: 10, max: 40 };
    const rhRange = { min: 0, max: 100 };
    
    const mapTempToX = (temp) => {
      return padding + ((temp - tempRange.min) / (tempRange.max - tempRange.min)) * chartWidth;
    };
    
    const mapRHToY = (rh) => {
      return padding + chartHeight - ((rh - rhRange.min) / (rhRange.max - rhRange.min)) * chartHeight;
    };
    
    // Draw axes
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();
    
    // Draw axis labels
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    
    // Temperature labels
    for (let temp = tempRange.min; temp <= tempRange.max; temp += 5) {
      const x = mapTempToX(temp);
      ctx.fillText(`${temp}°C`, x, canvas.height - padding + 20);
    }
    
    // RH labels
    ctx.textAlign = 'right';
    for (let rh = 0; rh <= 100; rh += 20) {
      const y = mapRHToY(rh);
      ctx.fillText(`${rh}%`, padding - 10, y + 4);
    }
    
    // Draw zones
    ZONES.forEach(zone => {
      if (zone.poly && zone.poly.length > 0) {
        ctx.fillStyle = zone.color + '40'; // 25% opacity
        ctx.strokeStyle = zone.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        zone.poly.forEach((pt, i) => {
          const x = mapTempToX(pt[0]);
          const y = mapRHToY(pt[1]);
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    });
    
    // Draw data points
    if (this.state.results && this.state.results.rows) {
      this.state.results.rows.forEach(row => {
        const x = mapTempToX(row.temp);
        const y = mapRHToY(row.rh);
        const zone = ZONES.find(z => z.id === row.zone);
        
        ctx.fillStyle = zone ? zone.color : '#999';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
    
    // Add hover event listener for tooltips
    canvas.addEventListener('mousemove', (e) => this.handleChartHover(e, mapTempToX, mapRHToY, tempRange, rhRange));
    canvas.addEventListener('mouseleave', () => this.removeChartTooltip());
    
    // Render legend
    legendEl.innerHTML = '';
    ZONES.forEach(zone => {
      const item = document.createElement('div');
      item.className = 'chart-legend__item';
      item.innerHTML = `
        <div class="chart-legend__color" style="background-color: ${zone.color}"></div>
        <span>${zone.id}</span>
      `;
      legendEl.appendChild(item);
    });
  }

  renderPsychroChart() {
    if (!this.psychroChart || !this.state.results || !this.state.results.rows) {
      return;
    }

    // Prepare data points for psychrometric chart
    const dataPoints = this.state.results.rows.map(row => ({
      temp: row.temp,
      rh: row.rh,
      zone: row.zone,
      timestamp: row.ts
    }));

    // Update chart with data
    this.psychroChart.updateData(dataPoints);
  }

  renderStatistics() {
    const gridEl = document.querySelector('.zone-stats__grid');
    gridEl.innerHTML = '';
    
    if (!this.state.results || !this.state.results.summary) {
      return;
    }
    
    // Sort by hours descending
    const summary = [...this.state.results.summary].sort((a, b) => b.hours - a.hours);
    
    summary.forEach(item => {
      const zone = ZONES.find(z => z.id === item.zone);
      const card = document.createElement('article');
      card.className = 'stat-card';
      card.setAttribute('role', 'listitem');
      card.innerHTML = `
        <div class="stat-card__color" style="background-color: ${zone ? zone.color : '#999'}"></div>
        <h3 class="stat-card__zone">${item.zone}</h3>
        <p class="stat-card__hours">${item.hours.toFixed(1)} hours</p>
        <p class="stat-card__percent">${item.percent.toFixed(1)}%</p>
      `;
      gridEl.appendChild(card);
    });
  }

  renderTimeline() {
    const contentEl = document.querySelector('.timeline-breakdown__content');
    
    if (!this.state.results || !this.state.results.perBucket) {
      contentEl.innerHTML = '<p>No timeline data available</p>';
      return;
    }
    
    const perBucket = this.state.results.perBucket;
    const periods = Object.keys(perBucket).sort();
    
    let html = '<table class="timeline-table"><thead><tr><th>Period</th>';
    
    // Add zone headers
    ZONES.forEach(zone => {
      html += `<th>${zone.id}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    periods.forEach(period => {
      html += `<tr><td>${period}</td>`;
      ZONES.forEach(zone => {
        const hours = perBucket[period][zone.id] || 0;
        html += `<td>${hours.toFixed(1)}</td>`;
      });
      html += '</tr>';
    });
    
    html += '</tbody></table>';
    contentEl.innerHTML = html;
  }

  toggleTimelineView(view) {
    // Update button states
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.classList.toggle('btn--primary', btn.dataset.view === view);
      btn.classList.toggle('btn--secondary', btn.dataset.view !== view);
    });
    
    // For now, only table view is implemented
    const contentEl = document.querySelector('.timeline-breakdown__content');
    if (view === 'chart') {
      contentEl.innerHTML = '<p>Chart view not yet implemented</p>';
    } else {
      this.renderTimeline();
    }
  }

  handleExport(format) {
    if (!this.state.results) {
      this.showError('No results to export');
      return;
    }
    
    try {
      let content, filename, mimeType;
      
      // Handle missing/undefined/null/empty format values by using a safe default
      if (format === undefined || format === null || format === '' || format === 'undefined' || format === 'null') {
        format = 'csv';
      }
      
      // Normalize and validate the format
      const normalizedFormat = this.normalizeExportFormat(format);
      
      switch (normalizedFormat) {
        case 'csv':
          content = buildTimeseriesLines(this.state.results.rowsWithDur || []).join('\n');
          filename = `tactics-timeseries-${new Date().toISOString().split('T')[0]}.csv`;
          mimeType = 'text/csv';
          break;
          
        case 'json':
          content = JSON.stringify(buildJsonSummary(this.state.results.summary, this.state.results.totalMs, this.state.rawData?.filename), null, 2);
          filename = `tactics-summary-${new Date().toISOString().split('T')[0]}.json`;
          mimeType = 'application/json';
          break;
          
        case 'md':
          content = formatSummary(
            this.state.results.summary,
            this.state.results.perBucket,
            this.state.timelineUnit,
            'md',
            this.state.results.totalMs,
            this.state.dateOptions.treatAsUTC,
            this.state.results.firstTs,
            this.state.results.lastTs
          );
          filename = `tactics-report-${new Date().toISOString().split('T')[0]}.md`;
          mimeType = 'text/markdown';
          break;
          
        default:
          const supportedFormats = ['csv', 'json', 'md'];
          throw new Error(`Unsupported export format: "${format}". Supported formats are: ${supportedFormats.join(', ')}`);
      }
      
      this.downloadBlob(content, filename, mimeType);
      
    } catch (error) {
      this.showError(`Export failed: ${error.message}`);
      console.error('Export error:', error);
    }
  }

  normalizeExportFormat(format) {
    if (!format || typeof format !== 'string') {
      return format;
    }
    
    // Convert to lowercase and remove leading dots
    const normalized = format.toLowerCase().replace(/^\./, '');
    
    // Handle MIME types
    const mimeToFormat = {
      'text/csv': 'csv',
      'application/json': 'json',
      'text/markdown': 'md'
    };
    
    if (mimeToFormat[normalized]) {
      return mimeToFormat[normalized];
    }
    
    // Handle common variations
    const variations = {
      'markdown': 'md',
      'text': 'md', // Common mistake
      'csv': 'csv',
      'json': 'json'
    };
    
    return variations[normalized] || normalized;
  }

  downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  resetAnalysis() {
    this.state = {
      rawData: null,
      columnMapping: { time: -1, temp: -1, rh: -1 },
      dateOptions: { dayFirst: null, treatAsUTC: false },
      timelineUnit: 'auto',
      results: null
    };
    
    // Reset UI
    document.getElementById('file-input').value = '';
    document.querySelector('.upload-zone__status').textContent = '';
    document.querySelector('.upload-zone__status').className = 'upload-zone__status';
    
    // Clear column mapper
    ['col-time', 'col-temp', 'col-rh'].forEach(id => {
      const select = document.getElementById(id);
      select.innerHTML = '<option value="">-- Auto detect --</option>';
    });
    
    // Reset date format
    document.querySelector('input[name="date-format"][value="auto"]').checked = true;
    document.querySelector('.date-format-selector__preview code').textContent = '--';
    
    // Reset timeline unit
    document.getElementById('timeline-unit').value = 'auto';
    
    // Clear results
    document.querySelector('.psychrometric-chart').getContext('2d').clearRect(0, 0, 800, 600);
    document.querySelector('.chart-legend').innerHTML = '';
    document.querySelector('.zone-stats__grid').innerHTML = '';
    document.querySelector('.timeline-breakdown__content').innerHTML = '';
    
    // Reset analyze button
    const analyzeBtn = document.querySelector('.btn--analyze');
    analyzeBtn.disabled = false;
    analyzeBtn.querySelector('.btn__text').textContent = 'Analyze Data';
  }

  showError(message) {
    const statusEl = document.querySelector('.upload-zone__status');
    statusEl.textContent = message;
    statusEl.className = 'upload-zone__status error';
    
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'upload-zone__status';
    }, 5000);
  }

  handleChartHover(event, mapTempToX, mapRHToY, tempRange, rhRange) {
    const canvas = event.target;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Convert canvas coordinates to data coordinates
    const temp = tempRange.min + ((x - 40) / (canvas.width - 80)) * (tempRange.max - tempRange.min);
    const rh = rhRange.max - ((y - 40) / (canvas.height - 80)) * (rhRange.max - rhRange.min);
    
    // Find nearby data points (within 10 pixels)
    if (this.state.results && this.state.results.rows) {
      const nearbyPoint = this.state.results.rows.find(row => {
        const px = 40 + ((row.temp - tempRange.min) / (tempRange.max - tempRange.min)) * (canvas.width - 80);
        const py = 40 + (canvas.height - 80) - ((row.rh - rhRange.min) / (rhRange.max - rhRange.min)) * (canvas.height - 80);
        const distance = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2));
        return distance <= 10;
      });
      
      if (nearbyPoint) {
        this.showChartTooltip(event, nearbyPoint);
        return;
      }
    }
    
    this.removeChartTooltip();
  }

  showChartTooltip(event, point) {
    this.removeChartTooltip();
    
    const zone = ZONES.find(z => z.id === point.zone);
    const date = new Date(point.ts);
    
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    tooltip.innerHTML = `
      <div class="chart-tooltip__title">${zone ? zone.id : 'Unknown'}</div>
      <div class="chart-tooltip__row">
        <span class="chart-tooltip__label">Temperature:</span>
        <span class="chart-tooltip__value">${point.temp.toFixed(1)}°C</span>
      </div>
      <div class="chart-tooltip__row">
        <span class="chart-tooltip__label">Humidity:</span>
        <span class="chart-tooltip__value">${point.rh.toFixed(0)}%</span>
      </div>
      <div class="chart-tooltip__row">
        <span class="chart-tooltip__label">Time:</span>
        <span class="chart-tooltip__value">${date.toLocaleString()}</span>
      </div>
    `;
    
    document.body.appendChild(tooltip);
    
    // Position tooltip
    const rect = event.target.getBoundingClientRect();
    tooltip.style.left = `${event.clientX + 10}px`;
    tooltip.style.top = `${event.clientY - tooltip.offsetHeight - 10}px`;
    
    this.tooltip = tooltip;
  }

  removeChartTooltip() {
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
  }
}

/**
 * Initialize psychrometric chart integration
 */
function initPsychroIntegration() {
  // Guard behind feature flag
  if (!window.DEV_PSYCHRO_CHART) {
    return;
  }

  try {
    // Import psychrometric chart module
    import('./psychro/index.js').then(({ initPsychroChart, createSampleDataPoints }) => {
      // Find or create container element
      let container = document.querySelector('.psychro-chart-container');
      
      if (!container) {
        // Create container inside existing chart area
        const chartArea = document.querySelector('.chart-container');
        if (chartArea) {
          container = document.createElement('div');
          container.className = 'psychro-chart-container';
          chartArea.appendChild(container);
        } else {
          console.error('Chart container not found');
          return;
        }
      }

      // Initialize psychrometric chart
      const renderer = initPsychroChart('.psychro-chart-container', {
        Tmin: 0,
        Tmax: 50,
        Wmax: 0.03,
        p: 101325,
        samplingN: 200
      });

      // Hook window resize to renderer.resize
      const resizeHandler = () => {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          renderer.resize(rect.width, rect.height);
        }
      };
      
      window.addEventListener('resize', resizeHandler);
      
      // Hook dataset-change to renderer.renderDataPoints
      const datasetChangeHandler = () => {
        // Convert existing data to psychrometric format
        if (app.state.results && app.state.results.rows) {
          const points = app.state.results.rows.map(row => ({
            T: row.temp,
            W: (row.rh / 100) * 0.622 * (2338 / (101325 - (row.rh / 100) * 2338)) // Approximate W from RH
          }));
          renderer.renderDataPoints(points);
        }
      };

      // Listen for custom dataset change events
      document.addEventListener('dataset-change', datasetChangeHandler);

      // Load sample data after 1 second for testing
      setTimeout(() => {
        const samplePoints = createSampleDataPoints(20);
        renderer.renderDataPoints(samplePoints);
        console.log('Loaded sample psychrometric data points');
      }, 1000);

      // Store cleanup function
      window._psychroCleanup = () => {
        window.removeEventListener('resize', resizeHandler);
        document.removeEventListener('dataset-change', datasetChangeHandler);
        renderer.destroy();
      };

    }).catch(error => {
      console.error('Failed to load psychrometric chart module:', error);
    });

  } catch (error) {
    console.error('Failed to initialize psychrometric integration:', error);
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new TacticsApp();
  
  // Initialize psychrometric chart integration when feature flag is enabled
  if (window.DEV_PSYCHRO_CHART === true) {
    initPsychroIntegration();
  }
});