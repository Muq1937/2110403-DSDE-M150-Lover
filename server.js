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
let cachedData = null;
let isLoading = false;

// Load CSV data once at startup (in background)
const loadFullData = () => {
  if (isLoading) return;
  isLoading = true;

  console.log("Streaming CSV data...");

  cachedData = [];

  Papa.parse(fs.createReadStream(CSV_FILE), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,

    step: (results) => {
      const row = results.data;

      cachedData.push({
        ...row,
        type: parseArray(row.type),
        organization: parseArray(row.organization),
        lon: parseFloat(row.lon) || 0,
        lat: parseFloat(row.lat) || 0,
        solve_days: parseInt(row.solve_days) || 0,
        count_reopen: parseInt(row.count_reopen) || 0
      });
    },

    complete: () => {
      console.log(`Streaming completed. Loaded ${cachedData.length} records`);
      isLoading = false;
    },

    error: (err) => {
      console.error("Streaming parser error:", err);
      isLoading = false;
    }
  });
};

const parseArray = (str) => {
  if (!str) return [];
  const cleaned = str.replace(/[{}"\s]/g, '');
  return cleaned ? cleaned.split(',').filter(Boolean) : [];
};

// Start loading data
loadFullData();

// API endpoint: Get paginated data
app.get('/api/data', (req, res) => {
  if (!cachedData) {
    return res.status(503).json({ error: 'Data still loading', loading: true });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 1000;
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;

  let filteredData = [...cachedData];

  // Filter by date range if provided
  if (startDate || endDate) {
    filteredData = filteredData.filter(row => {
      const rowDate = new Date(row.timestamp);
      if (startDate && rowDate < new Date(startDate)) return false;
      if (endDate && rowDate > new Date(endDate)) return false;
      return true;
    });
  }

  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedData = filteredData.slice(startIndex, endIndex);

  res.json({
    data: paginatedData,
    pagination: {
      page,
      limit,
      total: filteredData.length,
      totalPages: Math.ceil(filteredData.length / limit),
      hasMore: endIndex < filteredData.length
    }
  });
});

// API endpoint: Get metadata (for date ranges, complaint types, etc.)
app.get('/api/metadata', (req, res) => {
  if (!cachedData) {
    return res.status(503).json({ error: 'Data still loading', loading: true });
  }

  const dates = cachedData.map(d => new Date(d.timestamp)).filter(d => !isNaN(d));
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));

  const complaintTypes = {};
  const districts = new Set();

  cachedData.forEach(row => {
    if (row.type) {
      row.type.forEach(t => {
        complaintTypes[t] = (complaintTypes[t] || 0) + 1;
      });
    }
    if (row.district) {
      districts.add(row.district);
    }
  });

  res.json({
    dateRange: { min: minDate, max: maxDate },
    complaintTypes,
    districts: Array.from(districts),
    totalRecords: cachedData.length
  });
});

// API endpoint: Get sampled data for visualization
app.get('/api/sample', (req, res) => {
  if (!cachedData) {
    return res.status(503).json({ error: 'Data still loading', loading: true });
  }

  const sampleSize = parseInt(req.query.size) || 5000;
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;

  let filteredData = [...cachedData];

  // Filter by date range
  if (startDate || endDate) {
    filteredData = filteredData.filter(row => {
      const rowDate = new Date(row.timestamp);
      if (startDate && rowDate < new Date(startDate)) return false;
      if (endDate && rowDate > new Date(endDate)) return false;
      return true;
    });
  }

  // Sample evenly across the dataset
  const step = Math.max(1, Math.floor(filteredData.length / sampleSize));
  const sampledData = filteredData.filter((_, index) => index % step === 0);

  res.json({
    data: sampledData.slice(0, sampleSize),
    totalRecords: filteredData.length,
    sampledRecords: Math.min(sampleSize, sampledData.length)
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});