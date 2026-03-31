import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/dataProcessor.js', () => ({
  parseCsvStream: vi.fn(),
}));

vi.mock('../../stores/fileStore.js', () => ({
  fileStore: { setParsedRaw: vi.fn() },
}));

import { parseCsvStream } from '../../utils/dataProcessor.js';
import { fileStore } from '../../stores/fileStore.js';
import UploadZone from '../../components/UploadZone.svelte';

const mockParsedData = {
  headerFields: ['datetime', 'temp', 'humidity'],
  sampleRows: [['2024-01-01', '25', '60']],
  dayFirst: false,
  samplesUsed: 1,
  minDate: '2024-01-01',
  maxDate: '2024-01-01',
  estimatedSpanDays: 1,
  samplesPerDay: 24,
};

describe('UploadZone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseCsvStream.mockResolvedValue(mockParsedData);
  });

  it('renders upload zone with descriptive text', () => {
    const { getByText } = render(UploadZone);
    expect(getByText('Click to upload a CSV file or drag and drop')).toBeDefined();
    expect(getByText('CSV files only')).toBeDefined();
  });

  it('renders file input accepting only .csv files', () => {
    const { container } = render(UploadZone);
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeDefined();
    expect(input.getAttribute('accept')).toBe('.csv');
  });

  it('calls parseCsvStream and shows status after file selected', async () => {
    const { container, findByText } = render(UploadZone);
    const input = container.querySelector('input[type="file"]');
    const mockFile = new File(['datetime,temp\n2024-01-01,25'], 'test.csv', { type: 'text/csv' });
    await fireEvent.change(input, { target: { files: [mockFile] } });
    await findByText(/Parsed 1 sample rows/);
    expect(parseCsvStream).toHaveBeenCalledWith(mockFile, expect.any(Object));
  });

  it('shows reading status before parse completes', async () => {
    let resolvePromise;
    parseCsvStream.mockReturnValue(new Promise(resolve => { resolvePromise = resolve; }));
    const { container } = render(UploadZone);
    const input = container.querySelector('input[type="file"]');
    const mockFile = new File(['data'], 'test.csv', { type: 'text/csv' });
    // Await the fireEvent so that @testing-library/svelte flushes reactive updates
    // up to the first async suspension point (the parseCsvStream await)
    await fireEvent.change(input, { target: { files: [mockFile] } });
    const statusEl = container.querySelector('.status-text');
    // Component sets 'Reading...' then immediately 'Parsing...' before the first await
    expect(statusEl?.textContent).toBe('Parsing CSV header and samples...');
    resolvePromise(mockParsedData);
  });

  it('shows error message when parseCsvStream rejects', async () => {
    parseCsvStream.mockRejectedValue(new Error('Parse failed'));
    const { container, findByText } = render(UploadZone);
    const input = container.querySelector('input[type="file"]');
    const mockFile = new File(['bad data'], 'bad.csv', { type: 'text/csv' });
    await fireEvent.change(input, { target: { files: [mockFile] } });
    await findByText('Error: Parse failed');
  });

  it('calls onFileParsed callback with parsed data', async () => {
    const onFileParsed = vi.fn();
    const { container } = render(UploadZone, { onFileParsed });
    const input = container.querySelector('input[type="file"]');
    const mockFile = new File(['datetime,temp\n2024-01-01,25'], 'test.csv', { type: 'text/csv' });
    await fireEvent.change(input, { target: { files: [mockFile] } });
    await waitFor(() => expect(onFileParsed).toHaveBeenCalled());
    expect(onFileParsed).toHaveBeenCalledWith(
      expect.objectContaining({ file: mockFile, headerFields: mockParsedData.headerFields })
    );
  });

  it('calls fileStore.setParsedRaw with parsed data', async () => {
    const { container } = render(UploadZone);
    const input = container.querySelector('input[type="file"]');
    const mockFile = new File(['datetime,temp\n2024-01-01,25'], 'test.csv', { type: 'text/csv' });
    await fireEvent.change(input, { target: { files: [mockFile] } });
    await waitFor(() => expect(fileStore.setParsedRaw).toHaveBeenCalled());
  });

  it('adds active CSS class on dragover and removes on dragleave', async () => {
    const { container } = render(UploadZone);
    const label = container.querySelector('.file-label');
    await fireEvent.dragOver(label);
    expect(container.querySelector('.upload-zone.active')).toBeDefined();
    await fireEvent.dragLeave(label);
    expect(container.querySelector('.upload-zone.active')).toBeNull();
  });

  it('shows error for non-CSV file drop', async () => {
    const { container, findByText } = render(UploadZone);
    const label = container.querySelector('.file-label');
    const file = new File(['data'], 'report.txt', { type: 'text/plain' });
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: { files: [file] } });
    await fireEvent(label, dropEvent);
    await findByText('Error: Please upload a CSV file');
  });

  it('processes CSV file on drop', async () => {
    const { container, findByText } = render(UploadZone);
    const label = container.querySelector('.file-label');
    const file = new File(['datetime,temp\n2024-01-01,25'], 'data.csv', { type: 'text/csv' });
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: { files: [file] } });
    await fireEvent(label, dropEvent);
    await findByText(/Parsed 1 sample rows/);
    expect(parseCsvStream).toHaveBeenCalledWith(file, expect.any(Object));
  });
});
