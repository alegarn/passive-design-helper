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
});
