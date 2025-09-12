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

// Port configuration for dual streaming
const STREAMER_PORT = process.env.STREAMER_PORT || 5000;  // Raspberry Pi stream input
const VIEWER_PORT = process.env.VIEWER_PORT || 5001;      // Client stream output

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
