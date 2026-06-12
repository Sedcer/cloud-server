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

const pool = new Pool({
  connectionString: new URL(process.env.DATABASE_URL).toString(),
  ssl: { rejectUnauthorized: false },
  family: 4
});

class Room {
  constructor(id) {
    this.id = id;
    this.variables = new Map();
    this.clients = [];
    this.lastDisconnectTime = -1;
    this.maxVariables = 128;
    this.maxClients = 128;

    this.ready = this.loadFromDatabase();
  }

  async loadFromDatabase() {
    try {
      const res = await pool.query(
        'SELECT name, value FROM cloud_vars WHERE room_id = $1',
        [this.id]
      );

      for (const row of res.rows) {
        this.variables.set(row.name, row.value);
      }
    } catch (err) {
      console.error('Failed to load from DB:', err);
    }
  }

  addClient(client) {
    if (this.clients.includes(client)) {
      throw new Error(`Client is already added to room ${this.id}`);
    }
    if (this.clients.length >= this.maxClients) {
      throw new Error(`Too many clients are connected to room ${this.id}`);
    }
    this.clients.push(client);
  }

  removeClient(client) {
    const index = this.clients.indexOf(client);
    if (index === -1) {
      throw new Error(`Client is not part of room ${this.id}`);
    }
    this.clients.splice(index, 1);
    this.lastDisconnectTime = Date.now();
  }

  getClients() {
    return this.clients;
  }

  getAllVariables() {
    return this.variables;
  }

  async create(name, value) {
    if (this.has(name)) {
      throw new Error('Variable already exists');
    }

    if (this.variables.size >= this.maxVariables) {
      throw new Error('Too many variables');
    }

    this.variables.set(name, value);

    try {
      await pool.query(
        `
        INSERT INTO cloud_vars (room_id, name, value)
        VALUES ($1, $2, $3)
        ON CONFLICT (room_id, name)
        DO UPDATE SET value = EXCLUDED.value
        `,
        [this.id, name, String(value)]
      );
    } catch (err) {
      console.error('Database create failed:', err);
      throw err;
    }
  }

  async set(name, value) {
    if (!this.variables.has(name)) {
      throw new Error('Variable does not exist');
    }

    this.variables.set(name, value);

    try {
      await pool.query(
        `
        INSERT INTO cloud_vars (room_id, name, value)
        VALUES ($1, $2, $3)
        ON CONFLICT (room_id, name)
        DO UPDATE SET value = EXCLUDED.value
        `,
        [this.id, name, String(value)]
      );
    } catch (err) {
      console.error('Database update failed:', err);
      throw err;
    }
  }

  async delete(name) {
    if (!this.has(name)) {
      throw new Error('Variable does not exist');
    }

    this.variables.delete(name);

    try {
      await pool.query(
        `DELETE FROM cloud_vars WHERE room_id = $1 AND name = $2`,
        [this.id, name]
      );
    } catch (err) {
      console.error('Database delete failed:', err);
      throw err;
    }
  }

  get(name) {
    const value = this.variables.get(name);
    if (typeof value === 'undefined') {
      throw new Error('Variable does not exist');
    }
    return value;
  }

  has(name) {
    return this.variables.has(name);
  }
}

module.exports = Room;
