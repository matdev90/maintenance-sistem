const { Server } = require('socket.io');
const { Notification } = require('../models');

let io = null;
const userSockets = new Map();

function initSocketIO(server) {
  io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('register', (userId) => {
      if (userId) {
        socket.userId = userId;
        if (!userSockets.has(userId)) userSockets.set(userId, new Set());
        userSockets.get(userId).add(socket.id);
        console.log(`User ${userId} registered socket ${socket.id}`);
      }
    });

    socket.on('disconnect', () => {
      if (socket.userId && userSockets.has(socket.userId)) {
        userSockets.get(socket.userId).delete(socket.id);
        if (userSockets.get(socket.userId).size === 0) {
          userSockets.delete(socket.userId);
        }
      }
      console.log('Socket disconnected:', socket.id);
    });
  });

  console.log('Socket.IO initialized');
  return io;
}

async function emitNotification(userId, notification) {
  if (!io) return;

  const sockets = userSockets.get(userId);
  if (sockets && sockets.size > 0) {
    for (const socketId of sockets) {
      io.to(socketId).emit('new_notification', notification);
    }
  }
}

async function emitToAll(event, data) {
  if (!io) return;
  io.emit(event, data);
}

async function broadcastNotification(userId, title, message, link) {
  const notif = await Notification.create({
    id_user: userId,
    title,
    message,
    link
  });

  await emitNotification(userId, {
    id: notif.id,
    title: notif.title,
    message: notif.message,
    link: notif.link,
    created_at: notif.created_at
  });

  return notif;
}

function getIO() {
  return io;
}

module.exports = { initSocketIO, emitNotification, emitToAll, broadcastNotification, getIO };
