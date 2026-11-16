// Tiny JSON file store. One writer (this process), so atomic rename is all the safety we need.
// Everything the bot must remember across restarts lives under DATA_DIR: state, lockdown snapshots, feedback log.

import fs from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(path.join(dir, 'snapshots'), { recursive: true });
  }

  read(name, fallback) {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.dir, name), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return fallback;
      throw new Error(`Cannot read ${name}: ${err.message}`);
    }
  }

  write(name, data) {
    const target = path.join(this.dir, name);
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, target);
  }

  append(name, record) {
    fs.appendFileSync(path.join(this.dir, name), `${JSON.stringify(record)}\n`);
  }

  state() {
    return this.read('state.json', { community: {}, lockdown: { active: false }, tickets: {}, counter: 0 });
  }

  saveState(state) {
    this.write('state.json', state);
  }
}
