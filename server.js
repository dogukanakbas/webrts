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
    
    socket.join(streamId);
    socket.emit('streamer-ready', { streamId });
    console.log(`Streamer joined: ${streamId}`);
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

  // WebRTC signaling - ICE Candidate
  socket.on('ice-candidate', (data) => {
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      sender: socket.id
    });
  });

  // Handle stream data from Raspberry Pi
  socket.on('stream-data', (data) => {
    const streamId = data.streamId;
    if (activeStreams.has(streamId)) {
      // Broadcast to all viewers in this stream
      socket.to(streamId).emit('stream-data', data);
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
        console.log(`Stream ended: ${streamId}`);
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 WebRTC Streaming Server running on port ${PORT}`);
  console.log(`📱 Streamer URL: http://localhost:${PORT}/streamer`);
  console.log(`👀 Viewer URL: http://localhost:${PORT}/viewer`);
  console.log(`📊 API URL: http://localhost:${PORT}/api/streams`);
});
