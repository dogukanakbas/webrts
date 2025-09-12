const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store active streams and clients
const activeStreams = new Map();
const clients = new Map();

// Stream relay bridge between servers
const streamBridge = {
  activeStreams: new Map(),
  relayData: (streamId, data) => {
    // This will be used to relay stream data between servers
    console.log(`Relaying stream data for ${streamId}`);
  }
};

// GPS data storage and management
const gpsDataStore = {
  latestData: null,
  dataHistory: [],
  maxHistorySize: 1000, // Keep last 1000 GPS points
  
  addData: (gpsData) => {
    gpsDataStore.latestData = {
      ...gpsData,
      timestamp: new Date().toISOString()
    };
    
    // Add to history
    gpsDataStore.dataHistory.push(gpsDataStore.latestData);
    
    // Keep only recent data
    if (gpsDataStore.dataHistory.length > gpsDataStore.maxHistorySize) {
      gpsDataStore.dataHistory.shift();
    }
    
    console.log(`GPS data received: ${JSON.stringify(gpsDataStore.latestData)}`);
  },
  
  getLatestData: () => {
    return gpsDataStore.latestData;
  },
  
  getDataHistory: (limit = 100) => {
    return gpsDataStore.dataHistory.slice(-limit);
  }
};

// WebRTC signaling server
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Handle streamer (Raspberry Pi) connection
  socket.on('streamer-join', (streamData) => {
    const streamId = streamData.streamId || uuidv4();
    activeStreams.set(streamId, {
      streamerId: socket.id,
      streamData: streamData,
      viewers: new Set()
    });
    
    // Also add to stream bridge for relay
    streamBridge.activeStreams.set(streamId, {
      streamerId: socket.id,
      streamData: streamData,
      viewers: new Set()
    });
    
    socket.join(streamId);
    socket.emit('streamer-ready', { streamId });
    console.log(`Streamer joined: ${streamId} - Ready for relay to port ${VIEWER_PORT}`);
  });

  // Handle viewer connection
  socket.on('viewer-join', (streamId) => {
    if (activeStreams.has(streamId)) {
      const stream = activeStreams.get(streamId);
      stream.viewers.add(socket.id);
      socket.join(streamId);
      
      // Notify streamer about new viewer
      socket.to(streamId).emit('viewer-joined', { viewerId: socket.id });
      socket.emit('viewer-ready', { streamId });
      console.log(`Viewer joined stream: ${streamId}`);
    } else {
      socket.emit('stream-not-found', { streamId });
    }
  });

  // WebRTC signaling - Offer
  socket.on('offer', (data) => {
    socket.to(data.target).emit('offer', {
      offer: data.offer,
      sender: socket.id
    });
  });

  // WebRTC signaling - Answer
  socket.on('answer', (data) => {
    socket.to(data.target).emit('answer', {
      answer: data.answer,
      sender: socket.id
    });
  });

  // Handle answer from viewer server (relay to streamer)
  socket.on('viewer-answer', (data) => {
    // This is an answer from a viewer on the viewer server
    // Forward it to the appropriate streamer
    socket.to(data.target).emit('answer', {
      answer: data.answer,
      sender: data.sender
    });
  });

  // WebRTC signaling - ICE Candidate
  socket.on('ice-candidate', (data) => {
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      sender: socket.id
    });
  });

  // Handle ICE candidate from viewer server (relay to streamer)
  socket.on('viewer-ice-candidate', (data) => {
    // Forward ICE candidate to streamer
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      sender: data.sender
    });
  });

  // Handle stream data from Raspberry Pi
  socket.on('stream-data', (data) => {
    const streamId = data.streamId;
    if (activeStreams.has(streamId)) {
      // Broadcast to all viewers in this stream (streamer server)
      socket.to(streamId).emit('stream-data', data);
      
      // Relay to viewer server if stream exists in bridge
      if (streamBridge.activeStreams.has(streamId)) {
        const bridgeStream = streamBridge.activeStreams.get(streamId);
        if (bridgeStream.viewers.size > 0) {
          // Relay to all viewers on viewer server
          viewerIo.to(streamId).emit('stream-data', data);
        }
      }
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    // Remove from active streams if streamer
    for (const [streamId, stream] of activeStreams.entries()) {
      if (stream.streamerId === socket.id) {
        // Notify all viewers that stream ended
        io.to(streamId).emit('stream-ended', { streamId });
        activeStreams.delete(streamId);
        
        // Also remove from bridge and notify viewer server
        if (streamBridge.activeStreams.has(streamId)) {
          viewerIo.to(streamId).emit('stream-ended', { streamId });
          streamBridge.activeStreams.delete(streamId);
        }
        
        console.log(`Stream ended: ${streamId} - Relay also terminated`);
        break;
      } else if (stream.viewers.has(socket.id)) {
        stream.viewers.delete(socket.id);
        // Notify streamer about viewer leaving
        socket.to(streamId).emit('viewer-left', { viewerId: socket.id });
      }
    }
  });
});

// API Routes
app.get('/api/streams', (req, res) => {
  const streams = Array.from(activeStreams.entries()).map(([id, stream]) => ({
    id,
    streamerId: stream.streamerId,
    viewerCount: stream.viewers.size,
    streamData: stream.streamData
  }));
  res.json(streams);
});

app.get('/api/stream/:id', (req, res) => {
  const streamId = req.params.id;
  if (activeStreams.has(streamId)) {
    const stream = activeStreams.get(streamId);
    res.json({
      id: streamId,
      streamerId: stream.streamerId,
      viewerCount: stream.viewers.size,
      streamData: stream.streamData
    });
  } else {
    res.status(404).json({ error: 'Stream not found' });
  }
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve streamer page
app.get('/streamer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'streamer.html'));
});

// Serve viewer page
app.get('/viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

// Port configuration for dual streaming and GPS data
const STREAMER_PORT = process.env.STREAMER_PORT || 5000;  // Raspberry Pi stream input
const VIEWER_PORT = process.env.VIEWER_PORT || 5001;      // Client stream output
const GPS_INPUT_PORT = process.env.GPS_INPUT_PORT || 5002; // GPS data input
const GPS_OUTPUT_PORT = process.env.GPS_OUTPUT_PORT || 5004; // GPS data output

// Start streamer server (Raspberry Pi input)
server.listen(STREAMER_PORT, () => {
  console.log(`🚀 WebRTC Streaming Server - Streamer Input running on port ${STREAMER_PORT}`);
  console.log(`📱 Raspberry Pi Streamer URL: http://localhost:${STREAMER_PORT}/streamer`);
  console.log(`📊 API URL: http://localhost:${STREAMER_PORT}/api/streams`);
});

// Create separate server for viewer output
const viewerApp = express();
const viewerServer = http.createServer(viewerApp);
const viewerIo = socketIo(viewerServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware for viewer server
viewerApp.use(cors());
viewerApp.use(express.json());
viewerApp.use(express.static(path.join(__dirname, 'public')));

// Serve viewer page on viewer port
viewerApp.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

viewerApp.get('/viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

// API Routes for viewer server
viewerApp.get('/api/streams', (req, res) => {
  const streams = Array.from(streamBridge.activeStreams.entries()).map(([id, stream]) => ({
    id,
    streamerId: stream.streamerId,
    viewerCount: stream.viewers.size,
    streamData: stream.streamData
  }));
  res.json(streams);
});

viewerApp.get('/api/stream/:id', (req, res) => {
  const streamId = req.params.id;
  if (streamBridge.activeStreams.has(streamId)) {
    const stream = streamBridge.activeStreams.get(streamId);
    res.json({
      id: streamId,
      streamerId: stream.streamerId,
      viewerCount: stream.viewers.size,
      streamData: stream.streamData
    });
  } else {
    res.status(404).json({ error: 'Stream not found' });
  }
});

// WebRTC signaling for viewer server (relay from streamer server)
viewerIo.on('connection', (socket) => {
  console.log(`Viewer client connected: ${socket.id}`);

  // Handle viewer connection to relayed stream
  socket.on('viewer-join', (streamId) => {
    if (streamBridge.activeStreams.has(streamId)) {
      const stream = streamBridge.activeStreams.get(streamId);
      stream.viewers.add(socket.id);
      socket.join(streamId);
      
      socket.emit('viewer-ready', { streamId });
      console.log(`Viewer joined relayed stream: ${streamId}`);
    } else {
      socket.emit('stream-not-found', { streamId });
    }
  });

  // WebRTC signaling - Offer (from viewer to streamer via relay)
  socket.on('offer', (data) => {
    // Forward offer to streamer server
    const streamId = data.streamId;
    if (streamBridge.activeStreams.has(streamId)) {
      const stream = streamBridge.activeStreams.get(streamId);
      // Send offer to streamer on streamer server
      io.to(stream.streamerId).emit('offer', {
        offer: data.offer,
        sender: socket.id,
        target: stream.streamerId
      });
    }
  });

  // WebRTC signaling - Answer (from viewer to relay)
  socket.on('answer', (data) => {
    // Forward answer to streamer server
    const streamId = data.streamId;
    if (streamBridge.activeStreams.has(streamId)) {
      const stream = streamBridge.activeStreams.get(streamId);
      // Send answer to streamer on streamer server
      io.to(stream.streamerId).emit('viewer-answer', {
        answer: data.answer,
        sender: socket.id,
        target: stream.streamerId
      });
    }
  });

  // WebRTC signaling - ICE Candidate (from viewer)
  socket.on('ice-candidate', (data) => {
    // Forward ICE candidate to streamer server
    const streamId = data.streamId;
    if (streamBridge.activeStreams.has(streamId)) {
      const stream = streamBridge.activeStreams.get(streamId);
      // Send ICE candidate to streamer on streamer server
      io.to(stream.streamerId).emit('viewer-ice-candidate', {
        candidate: data.candidate,
        sender: socket.id,
        target: stream.streamerId
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Viewer client disconnected: ${socket.id}`);
    
    // Remove from relay streams
    for (const [streamId, stream] of streamBridge.activeStreams.entries()) {
      if (stream.viewers.has(socket.id)) {
        stream.viewers.delete(socket.id);
      }
    }
  });
});

// Start viewer server (Client output)
viewerServer.listen(VIEWER_PORT, () => {
  console.log(`👀 WebRTC Streaming Server - Viewer Output running on port ${VIEWER_PORT}`);
  console.log(`👀 Viewer URL: http://localhost:${VIEWER_PORT}/viewer`);
});

// Create GPS input server (5002)
const gpsInputApp = express();
const gpsInputServer = http.createServer(gpsInputApp);

// Middleware for GPS input server
gpsInputApp.use(cors());
gpsInputApp.use(express.json());

// GPS data input endpoint
gpsInputApp.post('/gps', (req, res) => {
  try {
    const gpsData = req.body;
    
    // Validate GPS data
    if (!gpsData.latitude || !gpsData.longitude) {
      return res.status(400).json({ 
        error: 'Invalid GPS data. latitude and longitude are required.' 
      });
    }
    
    // Add to GPS data store
    gpsDataStore.addData(gpsData);
    
    res.json({ 
      success: true, 
      message: 'GPS data received successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('GPS data error:', error);
    res.status(500).json({ 
      error: 'Failed to process GPS data',
      message: error.message 
    });
  }
});

// Health check endpoint for GPS input
gpsInputApp.get('/health', (req, res) => {
  res.json({ 
    status: 'GPS Input Server Running',
    port: GPS_INPUT_PORT,
    timestamp: new Date().toISOString()
  });
});

// Start GPS input server
gpsInputServer.listen(GPS_INPUT_PORT, () => {
  console.log(`📍 GPS Input Server running on port ${GPS_INPUT_PORT}`);
  console.log(`📍 GPS Data URL: http://localhost:${GPS_INPUT_PORT}/gps`);
});

// Create GPS output server (5004)
const gpsOutputApp = express();
const gpsOutputServer = http.createServer(gpsOutputApp);

// Middleware for GPS output server
gpsOutputApp.use(cors());
gpsOutputApp.use(express.json());

// GPS data output endpoints
gpsOutputApp.get('/gps/latest', (req, res) => {
  try {
    const latestData = gpsDataStore.getLatestData();
    
    if (!latestData) {
      return res.status(404).json({ 
        error: 'No GPS data available',
        message: 'No GPS data has been received yet'
      });
    }
    
    res.json({
      success: true,
      data: latestData
    });
    
  } catch (error) {
    console.error('GPS latest data error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve latest GPS data',
      message: error.message 
    });
  }
});

gpsOutputApp.get('/gps/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const history = gpsDataStore.getDataHistory(limit);
    
    res.json({
      success: true,
      count: history.length,
      data: history
    });
    
  } catch (error) {
    console.error('GPS history error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve GPS history',
      message: error.message 
    });
  }
});

gpsOutputApp.get('/gps/status', (req, res) => {
  try {
    const latestData = gpsDataStore.getLatestData();
    const historyCount = gpsDataStore.dataHistory.length;
    
    res.json({
      success: true,
      status: 'GPS Output Server Running',
      port: GPS_OUTPUT_PORT,
      hasData: !!latestData,
      lastUpdate: latestData ? latestData.timestamp : null,
      historyCount: historyCount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('GPS status error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve GPS status',
      message: error.message 
    });
  }
});

// Health check endpoint for GPS output
gpsOutputApp.get('/health', (req, res) => {
  res.json({ 
    status: 'GPS Output Server Running',
    port: GPS_OUTPUT_PORT,
    timestamp: new Date().toISOString()
  });
});

// Start GPS output server
gpsOutputServer.listen(GPS_OUTPUT_PORT, () => {
  console.log(`📍 GPS Output Server running on port ${GPS_OUTPUT_PORT}`);
  console.log(`📍 Latest GPS: http://localhost:${GPS_OUTPUT_PORT}/gps/latest`);
  console.log(`📍 GPS History: http://localhost:${GPS_OUTPUT_PORT}/gps/history`);
  console.log(`📍 GPS Status: http://localhost:${GPS_OUTPUT_PORT}/gps/status`);
});
