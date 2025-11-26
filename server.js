import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const CSV_FILE = path.join(__dirname, 'public', 'cleaned_bangkok_traffy.csv');

// Metadata cache (lightweight)
let metadataCache = null;
let isLoadingMetadata = false;

// Helper function to stream and process CSV data on-demand
const streamCSVData = (options = {}) => {
  return new Promise((resolve, reject) => {
    const {
      limit = null,
      skip = 0,
      startDate = null,
      endDate = null,
      sample = false,
      sampleSize = 5000
    } = options;

    const results = [];
    let rowIndex = 0;
    let processedCount = 0;
    let sampleStep = 1;

    // For sampling, we'll determine step after first pass
    if (sample) {
      // We'll collect every Nth row based on estimated file size
      sampleStep = Math.max(1, Math.floor(100)); // Adjust dynamically
    }

    Papa.parse(fs.createReadStream(CSV_FILE), {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,

      step: (result) => {
        const row = result.data;
        rowIndex++;

        // Apply sampling logic
        if (sample && rowIndex % sampleStep !== 0) {
          return;
        }

        // Apply skip logic
        if (rowIndex <= skip) {
          return;
        }

        // Parse row data
        const parsedRow = {
          ...row,
          type: parseArray(row.type),
          organization: parseArray(row.organization),
          lon: parseFloat(row.lon) || 0,
          lat: parseFloat(row.lat) || 0,
          solve_days: parseInt(row.solve_days) || 0,
          count_reopen: parseInt(row.count_reopen) || 0
        };

        // Apply date filters
        if (startDate || endDate) {
          const rowDate = new Date(parsedRow.timestamp);
          if (startDate && rowDate < new Date(startDate)) return;
          if (endDate && rowDate > new Date(endDate)) return;
        }

        results.push(parsedRow);
        processedCount++;

        // Stop if we've reached the limit
        if (limit && processedCount >= limit) {
          result.parser.abort();
        }

        // Stop if sampling and reached sample size
        if (sample && results.length >= sampleSize) {
          result.parser.abort();
        }
      },

      complete: () => {
        console.log(`Stream completed. Processed ${processedCount} records`);
        resolve({ data: results, totalProcessed: rowIndex });
      },

      error: (err) => {
        console.error("Stream parser error:", err);
        reject(err);
      }
    });
  });
};

// Load lightweight metadata once at startup
const loadMetadata = () => {
  if (isLoadingMetadata || metadataCache) return Promise.resolve(metadataCache);
  isLoadingMetadata = true;

  console.log("Loading CSV metadata...");

  return new Promise((resolve, reject) => {
    const dates = [];
    const complaintTypes = {};
    const districts = new Set();
    let totalRecords = 0;

    Papa.parse(fs.createReadStream(CSV_FILE), {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,

      step: (result) => {
        const row = result.data;
        totalRecords++;

        // Collect dates
        const timestamp = new Date(row.timestamp);
        if (!isNaN(timestamp)) {
          dates.push(timestamp.getTime());
        }

        // Collect types
        const types = parseArray(row.type);
        types.forEach(t => {
          complaintTypes[t] = (complaintTypes[t] || 0) + 1;
        });

        // Collect districts
        if (row.district) {
          districts.add(row.district);
        }
      },

      complete: () => {
        metadataCache = {
          dateRange: {
            min: dates.length > 0 ? new Date(Math.min(...dates)) : null,
            max: dates.length > 0 ? new Date(Math.max(...dates)) : null
          },
          complaintTypes,
          districts: Array.from(districts),
          totalRecords
        };
        console.log(`Metadata loaded. Total records: ${totalRecords}`);
        isLoadingMetadata = false;
        resolve(metadataCache);
      },

      error: (err) => {
        console.error("Metadata loading error:", err);
        isLoadingMetadata = false;
        reject(err);
      }
    });
  });
};

const parseArray = (str) => {
  if (!str) return [];
  const cleaned = str.replace(/[{}"\s]/g, '');
  return cleaned ? cleaned.split(',').filter(Boolean) : [];
};

// Start loading metadata (lightweight)
loadMetadata();

// API endpoint: Get paginated data (streaming on-demand)
app.get('/api/data', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 1000;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    const skip = (page - 1) * limit;

    // Stream only the requested page
    const result = await streamCSVData({
      limit: limit * 2, // Get slightly more to account for filters
      skip: skip,
      startDate,
      endDate
    });

    // Get metadata for total count
    const metadata = await loadMetadata();
    const total = metadata.totalRecords;

    res.json({
      data: result.data.slice(0, limit), // Trim to exact limit
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + limit < total
      }
    });
  } catch (error) {
    console.error('Error in /api/data:', error);
    res.status(500).json({ error: 'Failed to load data' });
  }
});

// API endpoint: Get metadata (for date ranges, complaint types, etc.)
app.get('/api/metadata', async (req, res) => {
  try {
    const metadata = await loadMetadata();

    if (!metadata) {
      return res.status(503).json({ error: 'Metadata still loading', loading: true });
    }

    res.json(metadata);
  } catch (error) {
    console.error('Error in /api/metadata:', error);
    res.status(500).json({ error: 'Failed to load metadata' });
  }
});

// API endpoint: Get sampled data for visualization
app.get('/api/sample', async (req, res) => {
  try {
    const sampleSize = parseInt(req.query.size) || 5000;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    // Stream with sampling enabled
    const result = await streamCSVData({
      sample: true,
      sampleSize,
      startDate,
      endDate
    });

    // Get total count from metadata
    const metadata = await loadMetadata();

    res.json({
      data: result.data,
      totalRecords: metadata.totalRecords,
      sampledRecords: result.data.length
    });
  } catch (error) {
    console.error('Error in /api/sample:', error);
    res.status(500).json({ error: 'Failed to load sample data' });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});