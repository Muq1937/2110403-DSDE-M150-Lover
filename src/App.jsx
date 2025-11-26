import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Network, Info } from 'lucide-react';

const TraffyDashboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState([0, 100]);
  const [selectedView, setSelectedView] = useState('map');
  const [filteredData, setFilteredData] = useState([]);
  const [dateRange, setDateRange] = useState({ min: null, max: null });
  const [complaintTypes, setComplaintTypes] = useState({});

//   useEffect(() => {
//     loadData();
//   }, []);

  useEffect(() => {
    if (data.length > 0) {
      filterDataByTime();
    }
  }, [timeRange, data]);

const [metadata, setMetadata] = useState(null);
const [isLoadingMore, setIsLoadingMore] = useState(false);
const [currentPage, setCurrentPage] = useState(1);

useEffect(() => {
  loadMetadata();
  loadSampleData();
}, []);

const loadMetadata = async () => {
  try {
    const response = await fetch('http://localhost:3001/api/metadata');
    if (!response.ok) throw new Error('Failed to load metadata');
    
    const meta = await response.json();
    setMetadata(meta);
    
    const minDate = new Date(meta.dateRange.min);
    const maxDate = new Date(meta.dateRange.max);
    setDateRange({ min: minDate, max: maxDate });
    setComplaintTypes(meta.complaintTypes);
  } catch (err) {
    setError(err.message);
  }
};

const loadSampleData = async () => {
  try {
    setLoading(true);
    const response = await fetch('http://localhost:3001/api/sample?size=5000');
    if (!response.ok) throw new Error('Failed to load data');
    
    const result = await response.json();
    setData(result.data);
    setFilteredData(result.data);
    setLoading(false);
  } catch (err) {
    setError(err.message);
    setLoading(false);
  }
};

const filterDataByTime = async () => {
  if (!dateRange.min || !dateRange.max) return;
  
  const totalMs = dateRange.max - dateRange.min;
  const startMs = dateRange.min.getTime() + (totalMs * timeRange[0] / 100);
  const endMs = dateRange.min.getTime() + (totalMs * timeRange[1] / 100);
  
  const startDate = new Date(startMs).toISOString();
  const endDate = new Date(endMs).toISOString();
  
  try {
    const response = await fetch(
      `http://localhost:3001/api/sample?size=5000&startDate=${startDate}&endDate=${endDate}`
    );
    const result = await response.json();
    setFilteredData(result.data);
  } catch (err) {
    console.error('Filter error:', err);
  }
};

  const parseCSV = (csv) => {
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',');
    
    return lines.slice(1).map(line => {
      const values = parseCSVLine(line);
      const row = {};
      
      headers.forEach((header, i) => {
        const value = values[i] || '';
        const cleanHeader = header.trim();
        
        if (cleanHeader === 'type' || cleanHeader === 'organization') {
          row[cleanHeader] = parseArray(value);
        } else if (cleanHeader === 'lon' || cleanHeader === 'lat') {
          row[cleanHeader] = parseFloat(value);
        } else if (cleanHeader === 'solve_days' || cleanHeader === 'count_reopen') {
          row[cleanHeader] = parseInt(value) || 0;
        } else {
          row[cleanHeader] = value;
        }
      });
      
      return row;
    });
  };

  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    let inBraces = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === '{') {
        inBraces = true;
        current += char;
      } else if (char === '}') {
        inBraces = false;
        current += char;
      } else if (char === ',' && !inQuotes && !inBraces) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  const parseArray = (str) => {
    if (!str) return [];
    const cleaned = str.replace(/[{}"\s]/g, '');
    return cleaned ? cleaned.split(',').filter(Boolean) : [];
  };


  const formatDate = (date) => {
    return date ? date.toLocaleDateString('th-TH', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    }) : '';
  };

  const getComplaintColor = (types) => {
    if (!types || types.length === 0) return '#gray';
    const typeColors = {
      'น้ำท่วม': '#3b82f6',
      'ถนน': '#ef4444',
      'ทางเท้า': '#f59e0b',
      'ความสะอาด': '#10b981',
      'สะพาน': '#8b5cf6',
      'ท่อระบายน้ำ': '#06b6d4',
      'จราจร': '#f97316',
      'ร้องเรียน': '#ec4899'
    };
    return typeColors[types[0]] || '#6b7280';
  };

  const renderMap = () => {
    const bounds = {
      minLat: Math.min(...filteredData.map(d => d.lat).filter(Boolean)),
      maxLat: Math.max(...filteredData.map(d => d.lat).filter(Boolean)),
      minLon: Math.min(...filteredData.map(d => d.lon).filter(Boolean)),
      maxLon: Math.max(...filteredData.map(d => d.lon).filter(Boolean))
    };

    const mapWidth = 800;
    const mapHeight = 600;
    const padding = 40;

    return (
      <div className="bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
        <svg width={mapWidth} height={mapHeight} className="mx-auto">
          <rect width={mapWidth} height={mapHeight} fill="#f8fafc" />
          
          {/* Grid lines */}
          {[...Array(10)].map((_, i) => (
            <g key={i}>
              <line
                x1={padding + (mapWidth - 2 * padding) * i / 9}
                y1={padding}
                x2={padding + (mapWidth - 2 * padding) * i / 9}
                y2={mapHeight - padding}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <line
                x1={padding}
                y1={padding + (mapHeight - 2 * padding) * i / 9}
                x2={mapWidth - padding}
                y2={padding + (mapHeight - 2 * padding) * i / 9}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
            </g>
          ))}
          
          {/* Data points */}
          {filteredData.map((d, i) => {
            if (!d.lon || !d.lat) return null;
            
            const x = padding + ((d.lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * (mapWidth - 2 * padding);
            const y = mapHeight - padding - ((d.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * (mapHeight - 2 * padding);
            
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="4"
                fill={getComplaintColor(d.type)}
                opacity="0.6"
                className="hover:opacity-100 cursor-pointer"
              >
                <title>{`${d.type?.join(', ') || 'Unknown'}\n${d.district || ''}\nSolved in: ${d.solve_days} days`}</title>
              </circle>
            );
          })}
          
          {/* Axis labels */}
          <text x={mapWidth / 2} y={mapHeight - 10} textAnchor="middle" className="text-xs" fill="#64748b">
            Longitude
          </text>
          <text x={20} y={mapHeight / 2} textAnchor="middle" transform={`rotate(-90, 20, ${mapHeight / 2})`} className="text-xs" fill="#64748b">
            Latitude
          </text>
        </svg>
        
        <div className="mt-4 flex flex-wrap gap-3 justify-center">
          {Object.entries({
            'น้ำท่วม': '#3b82f6',
            'ถนน': '#ef4444',
            'ทางเท้า': '#f59e0b',
            'ความสะอาด': '#10b981',
            'สะพาน': '#8b5cf6',
            'ท่อระบายน้ำ': '#06b6d4',
            'จราจร': '#f97316'
          }).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></div>
              <span className="text-sm text-gray-700">{type}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderNetwork = () => {
    const typeConnections = {};
    
    filteredData.forEach(d => {
      if (d.type && d.type.length > 1) {
        for (let i = 0; i < d.type.length; i++) {
          for (let j = i + 1; j < d.type.length; j++) {
            const key = [d.type[i], d.type[j]].sort().join('-');
            typeConnections[key] = (typeConnections[key] || 0) + 1;
          }
        }
      }
    });

    const types = Object.keys(complaintTypes).slice(0, 8);
    const center = { x: 400, y: 300 };
    const radius = 200;
    
    const nodes = types.map((type, i) => ({
      type,
      count: complaintTypes[type],
      x: center.x + radius * Math.cos(2 * Math.PI * i / types.length),
      y: center.y + radius * Math.sin(2 * Math.PI * i / types.length)
    }));

    return (
      <div className="bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
        <svg width={800} height={600} className="mx-auto">
          <rect width={800} height={600} fill="#f8fafc" />
          
          {/* Connections */}
          {Object.entries(typeConnections).map(([key, weight]) => {
            const [type1, type2] = key.split('-');
            const node1 = nodes.find(n => n.type === type1);
            const node2 = nodes.find(n => n.type === type2);
            
            if (!node1 || !node2) return null;
            
            return (
              <line
                key={key}
                x1={node1.x}
                y1={node1.y}
                x2={node2.x}
                y2={node2.y}
                stroke="#cbd5e1"
                strokeWidth={Math.min(weight / 2, 5)}
                opacity="0.5"
              />
            );
          })}
          
          {/* Nodes */}
          {nodes.map((node, i) => (
            <g key={i}>
              <circle
                cx={node.x}
                cy={node.y}
                r={Math.sqrt(node.count) * 3}
                fill={getComplaintColor([node.type])}
                opacity="0.8"
                className="hover:opacity-100 cursor-pointer"
              >
                <title>{`${node.type}: ${node.count} complaints`}</title>
              </circle>
              <text
                x={node.x}
                y={node.y + Math.sqrt(node.count) * 3 + 20}
                textAnchor="middle"
                className="text-xs font-medium"
                fill="#334155"
              >
                {node.type}
              </text>
              <text
                x={node.x}
                y={node.y + Math.sqrt(node.count) * 3 + 35}
                textAnchor="middle"
                className="text-xs"
                fill="#64748b"
              >
                ({node.count})
              </text>
            </g>
          ))}
        </svg>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading Bangkok Traffy data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-bold text-xl mb-2">Error Loading Data</h2>
          <p className="text-red-700">{error}</p>
          <p className="text-sm text-red-600 mt-4">Make sure bangkok_traffy_30.txt is in the public folder.</p>
        </div>
      </div>
    );
  }

  const currentStartDate = new Date(dateRange.min.getTime() + (dateRange.max - dateRange.min) * timeRange[0] / 100);
  const currentEndDate = new Date(dateRange.min.getTime() + (dateRange.max - dateRange.min) * timeRange[1] / 100);

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Bangkok Traffy Complaints Dashboard</h1>
          <p className="text-gray-600">Interactive visualization of citizen complaints across Bangkok districts</p>
          
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-900">{filteredData.length}</div>
              <div className="text-sm text-blue-700">Active Complaints</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-900">
                {Math.round(filteredData.reduce((sum, d) => sum + d.solve_days, 0) / filteredData.length)}
              </div>
              <div className="text-sm text-green-700">Avg. Resolution Days</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-purple-900">{Object.keys(complaintTypes).length}</div>
              <div className="text-sm text-purple-700">Complaint Types</div>
            </div>
          </div>
        </div>

        {/* Time Slider */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <Calendar className="text-blue-600" size={24} />
            <h2 className="text-xl font-semibold text-gray-900">Time Range Filter</h2>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between text-sm text-gray-600">
              <span>{formatDate(currentStartDate)}</span>
              <span>{formatDate(currentEndDate)}</span>
            </div>
            
            <input
              type="range"
              min="0"
              max="100"
              value={timeRange[0]}
              onChange={(e) => setTimeRange([parseInt(e.target.value), timeRange[1]])}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            
            <input
              type="range"
              min="0"
              max="100"
              value={timeRange[1]}
              onChange={(e) => setTimeRange([timeRange[0], parseInt(e.target.value)])}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>

        {/* View Selector */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
          <div className="flex gap-4">
            <button
              onClick={() => setSelectedView('map')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                selectedView === 'map'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <MapPin size={20} />
              Geospatial Map
            </button>
            
            <button
              onClick={() => setSelectedView('network')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                selectedView === 'network'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Network size={20} />
              Complaint Network
            </button>
          </div>
        </div>

        {/* Visualization */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          {selectedView === 'map' ? renderMap() : renderNetwork()}
        </div>

        {/* Info */}
        <div className="bg-blue-50 rounded-lg p-4 mt-6 border-2 border-blue-200">
          <div className="flex gap-2">
            <Info className="text-blue-600 flex-shrink-0" size={20} />
            <p className="text-sm text-blue-800">
              <strong>Map View:</strong> Shows geographic distribution of complaints. Hover over points for details.
              <br />
              <strong>Network View:</strong> Visualizes relationships between complaint types (connected when they occur together).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TraffyDashboard;