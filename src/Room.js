/**
 * @typedef {import('./Client')} Client
 */

/**
 * @typedef {string} RoomID A unique ID for a Room.
 */

/**
 * @typedef {string|number} Value A value stored in a variable in a Room.
 */

const { Pool } = require('pg');
// Ensure you set DATABASE_URL in your Render environment variables
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

class Room {
  constructor(id) {
    this.id = id;
    this.variables = new Map();
    this.clients = [];
    this.lastDisconnectTime = -1;
    this.maxVariables = 128;
    this.maxClients = 128;
    
    // Automatically load data when a room is initialized
    this.loadFromDatabase();
  }

  async loadFromDatabase() {
    try {
      const res = await pool.query('SELECT name, value FROM cloud_vars WHERE room_id = $1', [this.id]);
      res.rows.forEach(row => this.variables.set(row.name, row.value));
    } catch (err) {
      console.error('Failed to load from DB:', err);
    }
  }

  /**
   * Add a new client.
   * @param {Client} client The client to add
   * @throws Will throw if client is already added, or there are too many clients connected.
   */
  addClient(client) {
    if (this.clients.includes(client)) {
      throw new Error(`Client is already added to room ${this.id}`);
    }
    if (this.clients.length >= this.maxClients) {
      throw new Error(`Too many clients are connected to room ${this.id}`);
    }
    this.clients.push(client);
  }

  /**
   * Remove a client.
   * @param {Client} client The client to remove
   * @throws Will throw if the client is not part of this room.
   */
  removeClient(client) {
    const index = this.clients.indexOf(client);
    if (index === -1) {
      throw new Error(`Client is not part of room ${this.id}`);
    }
    this.clients.splice(index, 1);
    this.lastDisconnectTime = Date.now();
  }

  /**
   * Get all connected clients.
   * @returns {Client[]} All connected clients.
   */
  getClients() {
    return this.clients;
  }

  /**
   * Get a map of all variables.
   * @returns {Map<string, Value>} All variables, and their value.
   */
  getAllVariables() {
    return this.variables;
  }

  /**
   * Create a new variable.
   * This method does not inform clients of the change.
   * @param {string} name The name of the variable
   * @param {string} value The value of the variable
   * @throws Will throw if the variable already exists, or there are too many variables.
   */
  create(name, value) {
    if (this.has(name)) {
      throw new Error('Variable already exists');
    }
    if (this.variables.size >= this.maxVariables) {
      throw new Error('Too many variables');
    }
    this.variables.set(name, value);
  }

  /**
   * Set an existing variable to a new value.
   * This method does not inform clients of the change.
   * @param {string} name The name of the variable
   * @param {Value} value The value of the variable
   * @throws Will throw if the variable does not exist.
   */
async set(name, value) {
    if (!this.variables.has(name)) {
      throw new Error('Variable does not exist');
    }
    this.variables.set(name, value);

    // Save to SQL immediately
    try {
      await pool.query(
        `INSERT INTO cloud_vars (room_id, name, value) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (room_id, name) DO UPDATE SET value = $3`,
        [this.id, name, value.toString()]
      );
    } catch (err) {
      console.error('Database update failed:', err);
    }
  }

  /**
   * Delete a variable.
   * @param {string} name The name of the variable
   * @throws Will throw if the variable does not exist.
   */
  delete(name) {
    if (!this.has(name)) {
      throw new Error('Variable does not exist');
    }
    this.variables.delete(name);
  }

  /**
   * Get a variable.
   * @param {string} name The name of the variable
   * @returns {Value} Variable value.
   * @throws Will throw if the variable does not exist.
   */
  get(name) {
    const value = this.variables.get(name);
    if (typeof value === 'undefined') {
      throw new Error('Variable does not exist');
    }
    return value;
  }

  /**
   * Determine whether this room has a variable of a given name.
   * @param {string} name The name of the variable
   */
  has(name) {
    return this.variables.has(name);
  }
}

module.exports = { Room, pool };
