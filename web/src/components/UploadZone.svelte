<script>
  import { createEventDispatcher } from 'svelte';
  import { setRawData } from '../stores/uiStore.js';
  
  const dispatch = createEventDispatcher();
  let statusText = '';
  let parsedRowCount = 0;
  
  /**
   * Fallback minimal CSV parser that splits by lines and commas
   * Used when the main CSV parser is unavailable or fails
   * @param {string} text - CSV text content
   * @returns {Array<Object>} Parsed data as array of objects
   */
  function fallbackCSVParser(text) {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    // Parse header row
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    
    // Parse data rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      if (values.length === headers.length) {
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        data.push(row);
      }
    }
    
    return data;
  }
  
  /**
   * Handle file input change and parse CSV
   */
  async function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    statusText = `Reading ${file.name}...`;
    parsedRowCount = 0;
    
    try {
      // Read file as text
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
      });
      
      statusText = 'Parsing CSV...';
      
      let parsed = [];
      
      try {
        // Try to use the main CSV parser from scripts/csv.js
        // Note: The API provides csvSplitLine, parseHeader, and findBestColumn functions
        const { csvSplitLine, parseHeader } = await import('../../../scripts/csv.js');
        
        // Split text into lines and filter out empty ones
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
          throw new Error('CSV must have header + data rows');
        }
        
        // Parse header using the imported function
        const headers = parseHeader(lines);
        
        // Parse data rows using csvSplitLine
        const data = [];
        for (let i = 1; i < lines.length; i++) {
          const values = csvSplitLine(lines[i]);
          if (values.length === headers.length) {
            const row = {};
            headers.forEach((header, index) => {
              row[header] = values[index];
            });
            data.push(row);
          }
        }
        
        parsed = data;
      } catch (importError) {
        console.warn('Could not use main CSV parser, falling back to minimal parser:', importError.message);
        // Fallback to minimal parser
        parsed = fallbackCSVParser(text);
      }
      
      // Update the parsed row count
      parsedRowCount = parsed.length;
      statusText = `Parsed ${parsedRowCount} rows`;
      
      // Update the store with parsed data
      setRawData(parsed);
      
      // Dispatch event with parsed data
      dispatch('fileParsed', { data: parsed });
      
    } catch (error) {
      console.error('Error parsing CSV:', error);
      statusText = `Error: ${error.message}`;
    }
  }
</script>

<div class="upload-zone">
  <input
    type="file"
    accept=".csv"
    on:change={handleFileChange}
    id="file-input"
    class="file-input"
  />
  <label for="file-input" class="file-label">
    <div class="upload-icon">📁</div>
    <p>Click to upload a CSV file or drag and drop</p>
    <p class="upload-hint">CSV files only</p>
  </label>
  
  {#if statusText}
    <div class="status-text">
      {statusText}
    </div>
  {/if}
</div>

<style>
  .upload-zone {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    border: 2px dashed #ccc;
    border-radius: 4px;
    background-color: #f9f9f9;
    transition: all 0.3s ease;
  }
  
  .upload-zone:hover {
    border-color: #007bff;
    background-color: #f0f8ff;
  }
  
  .file-input {
    position: absolute;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
  
  .file-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
  }
  
  .upload-icon {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }
  
  .upload-hint {
    font-size: 0.8rem;
    color: #666;
    margin-top: 0.5rem;
  }
  
  .status-text {
    margin-top: 1rem;
    font-size: 0.9rem;
    color: #333;
    text-align: center;
  }
</style>