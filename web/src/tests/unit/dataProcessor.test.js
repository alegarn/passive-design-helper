import { describe, it, expect } from 'vitest';
import { parseCsvStream } from '../../utils/dataProcessor.js';
import { ReadableStream } from 'node:stream/web';

describe('Data Processor', () => {
  it('parses CSV headers from a mock file stream', async () => {
    const csvContent = "Time,Temp,RH\n2024-01-01 10:00,25.5,60\n2024-01-01 11:00,26.0,65";
    
    // Mock the file object with stream()
    const file = {
      stream: () => new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(csvContent));
          controller.close();
        }
      })
    };
    
    const result = await parseCsvStream(file, { sampleRows: 2 });
    
    expect(result.headerFields).toEqual(['Time', 'Temp', 'RH']);
    expect(result.samplesUsed).toBe(2);
  });

  it('handles empty files gracefully', async () => {
    const file = {
      stream: () => new ReadableStream({
        start(controller) {
          controller.close();
        }
      })
    };
    
    const result = await parseCsvStream(file);
    expect(result.headerFields).toEqual([]);
    expect(result.samplesUsed).toBe(0);
  });

  it('handles malformed CSV rows', async () => {
    // Missing comma on second line
    const csvContent = "Time,Temp,RH\n2024-01-01 10:00 25.5 60";
    
    const file = {
      stream: () => new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(csvContent));
          controller.close();
        }
      })
    };
    
    const result = await parseCsvStream(file);
    // Header should still be fine
    expect(result.headerFields).toEqual(['Time', 'Temp', 'RH']);
    // Row might be parsed as a single column or ignored depending on csvSplitLine
  });
});
