const http = require('http');
const fs = require('fs');
const finalhandler = require('finalhandler');
const serveStatic = require('serve-static');

const logger = require('./logger');
const config = require('./config');
const wss = require('./server');
const { pool } = require('./Room');

// We serve static files over HTTP
const serve = serveStatic('public');
const server = http.createServer(async function handler(req, res) {
if (req.url === '/api/health-check' && req.method === 'GET') {
    try {
      // Use a raw SQL check that doesn't target your table
      // This verifies the server can talk to the database at all
      await pool.query('SELECT NOW()'); 
      
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify({ status: "healthy" }));
      return;
    } catch (err) {
      // LOG THE ERROR SO WE CAN SEE WHAT'S WRONG
      console.error("Health check error:", err); 
      res.writeHead(500);
      res.end(JSON.stringify({ status: "error", message: err.message }));
      return;
    }
  }
  
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'interest-cohort=()');
  // @ts-ignore
  serve(req, res, finalhandler(req, res));
});

server.on('upgrade', function upgrade(request, socket, head) {
  // Forward these requests to the WebSocket server.
  wss.handleUpgrade(request, socket, head, function done(ws) {
    wss.emit('connection', ws, request);
  });
});

server.on('close', function() {
  // TODO: this code never seems to actually run
  logger.info('Server closing');
  wss.close();
});

const port = config.port;
server.listen(port, function() {
  // Update permissions of unix sockets
  if (typeof port === 'string' && port.startsWith('/') && config.unixSocketPermissions >= 0) {
    fs.chmod(port, config.unixSocketPermissions, function(err) {
      if (err) {
        logger.error('could not chmod unix socket: ' + err);
        process.exit(1);
      }
    });
  }
  logger.info('Server started on port: ' + port);
});
