#!/bin/bash
# Integration test script for tactics-cli
# Refactor derived from logic.js

set -e

# Change to project root directory
cd "$(dirname "$0")/.."

echo "=== Running integration tests for tactics-cli ==="

# Test 1: Default auto mode with specific output paths
echo ""
echo "Test 1: Auto mode with specific outputs"
node tactics-cli.js --auto --no-ts --json test1.json --out test1.md --format md 2024_04_si_samrong_hourly.csv

if [ -f "test1.md" ] && [ -f "test1.json" ]; then
    echo "✓ Test 1 passed: Files created successfully"
    rm -f test1.md test1.json
else
    echo "✗ Test 1 failed: Missing output files"
    exit 1
fi

# Test 2: Auto mode with --select 1
echo ""
echo "Test 2: Auto mode with --select 1"
node tactics-cli.js --auto --select 1 --only json --out test2.json

if [ -f "test2.json" ]; then
    echo "✓ Test 2 passed: JSON file created with --select"
    rm -f test2.json
else
    echo "✗ Test 2 failed: Missing JSON output"
    exit 1
fi

# Test 3: Only CSV output with custom timeseries path
echo ""
echo "Test 3: Only CSV timeseries output"
node tactics-cli.js --only csv --ts test3_timeseries.csv 2024_si_samrong.csv

if [ -f "test3_timeseries.csv" ]; then
    echo "✓ Test 3 passed: Timeseries CSV created"
    rm -f test3_timeseries.csv
else
    echo "✗ Test 3 failed: Missing timeseries CSV"
    exit 1
fi

# Test 4: Help flag
echo ""
echo "Test 4: Help flag"
node tactics-cli.js --help > /dev/null
if [ $? -eq 0 ]; then
    echo "✓ Test 4 passed: Help command executed"
else
    echo "✗ Test 4 failed: Help command failed"
    exit 1
fi

echo ""
echo "=== All integration tests passed! ==="