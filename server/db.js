// db.js — SQLite persistence layer for SSMV.
// Uses Node's built-in `node:sqlite` module, so there is nothing to
// `npm install`. Requires Node.js 22.5+ (this project pins >=22.5 in
// package.json). If your host only offers an older Node version, see the
// note in README.md about switching to `better-sqlite3` instead.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'ssmv.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT,
    location TEXT,
    category TEXT,
    description TEXT,
    image TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    submittedBy TEXT,
    submittedAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS albums (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    albumId TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    src TEXT NOT NULL,
    caption TEXT,
    description TEXT,
    uploader TEXT,
    uploadedAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    photo TEXT,
    mobile TEXT,
    whatsapp TEXT
  );
`);

function uid(){ return crypto.randomBytes(6).toString('hex'); }

// ---------------------------------------------------------------- events --
function getEvents(){
  return db.prepare('SELECT * FROM events ORDER BY date, time').all();
}
function createEvent(ev){
  const row = {
    id: uid(), title: ev.title, date: ev.date, time: ev.time || '', location: ev.location || '',
    category: ev.category || 'Community', description: ev.description || '', image: ev.image || '',
    status: 'pending', submittedBy: ev.submittedBy || 'Guest', submittedAt: Date.now()
  };
  db.prepare(`INSERT INTO events (id,title,date,time,location,category,description,image,status,submittedBy,submittedAt)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(row.id, row.title, row.date, row.time, row.location, row.category, row.description, row.image, row.status, row.submittedBy, row.submittedAt);
  return row;
}
function updateEvent(id, patch){
  const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if(!existing) return null;
  const merged = Object.assign({}, existing, patch, { id });
  db.prepare(`UPDATE events SET title=?, date=?, time=?, location=?, category=?, description=?, image=?, status=? WHERE id=?`)
    .run(merged.title, merged.date, merged.time, merged.location, merged.category, merged.description, merged.image, merged.status, id);
  return merged;
}
function deleteEvent(id){
  db.prepare('DELETE FROM events WHERE id = ?').run(id);
  return true;
}

// ---------------------------------------------------------------- albums --
function getAlbums(){
  const albums = db.prepare('SELECT * FROM albums').all();
  const photoStmt = db.prepare('SELECT * FROM photos WHERE albumId = ? ORDER BY uploadedAt');
  return albums.map(a => Object.assign({}, a, { photos: photoStmt.all(a.id) }));
}
function createAlbum(name){
  const row = { id: uid(), name };
  db.prepare('INSERT INTO albums (id, name) VALUES (?, ?)').run(row.id, row.name);
  return Object.assign({}, row, { photos: [] });
}
function deleteAlbum(id){
  db.prepare('DELETE FROM photos WHERE albumId = ?').run(id);
  db.prepare('DELETE FROM albums WHERE id = ?').run(id);
  return true;
}
function addPhotos(albumId, photos){
  const stmt = db.prepare(`INSERT INTO photos (id,albumId,src,caption,description,uploader,uploadedAt) VALUES (?,?,?,?,?,?,?)`);
  const created = photos.map(p => {
    const row = { id: uid(), albumId, src: p.src, caption: p.caption || '', description: p.description || '', uploader: p.uploader || 'Guest', uploadedAt: Date.now() };
    stmt.run(row.id, row.albumId, row.src, row.caption, row.description, row.uploader, row.uploadedAt);
    return row;
  });
  return created;
}
function updatePhoto(albumId, photoId, patch){
  const existing = db.prepare('SELECT * FROM photos WHERE id = ? AND albumId = ?').get(photoId, albumId);
  if(!existing) return null;
  const merged = Object.assign({}, existing, patch);
  db.prepare('UPDATE photos SET caption=?, description=? WHERE id=?').run(merged.caption, merged.description, photoId);
  return merged;
}
function deletePhoto(albumId, photoId){
  db.prepare('DELETE FROM photos WHERE id = ? AND albumId = ?').run(photoId, albumId);
  return true;
}

// -------------------------------------------------------------- members --
function getMembers(){
  return db.prepare('SELECT * FROM members').all();
}
function upsertMember(m){
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(m.id);
  const row = { id: m.id, name: m.name, photo: m.photo || '', mobile: m.mobile || '', whatsapp: m.whatsapp || '' };
  if(existing){
    db.prepare('UPDATE members SET name=?, photo=?, mobile=?, whatsapp=? WHERE id=?')
      .run(row.name, row.photo, row.mobile, row.whatsapp, row.id);
  } else {
    db.prepare('INSERT INTO members (id,name,photo,mobile,whatsapp) VALUES (?,?,?,?,?)')
      .run(row.id, row.name, row.photo, row.mobile, row.whatsapp);
  }
  return row;
}

// ------------------------------------------------------------------ seed --
function seedIfEmpty(){
  const count = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
  if(count > 0) return;
  const today = new Date();
  function inDays(n){ const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  createEvent({ title: 'Sunday Morning Aarti', date: inDays(3), time: '08:00', location: 'Main Sanctum', category: 'Darshan', description: 'Weekly morning aarti followed by prasad. All are welcome to join.', submittedBy: 'SSMV Trust' });
  createEvent({ title: 'Diwali Utsav Celebration', date: inDays(18), time: '18:30', location: 'Community Hall', category: 'Utsav', description: "An evening of lamps, music and sweets to welcome the festival of lights together.", submittedBy: 'SSMV Trust' });
  createEvent({ title: 'Saturday Satsang & Bhajan', date: inDays(9), time: '19:00', location: 'Prayer Hall', category: 'Satsang', description: 'An evening of devotional singing and reflection, open to families and children.', submittedBy: 'SSMV Trust' });
  // mark seed events approved (createEvent defaults to pending)
  db.exec("UPDATE events SET status = 'approved'");

  const darshan = createAlbum('Darshan');
  addPhotos(darshan.id, [
    { src: 'https://images.unsplash.com/photo-1600100397608-f00312e372a0?w=900&q=70&auto=format', caption: 'Morning aarti', description: 'Diyas lit for the morning aarti in the main sanctum.', uploader: 'SSMV Trust' },
    { src: 'https://images.unsplash.com/photo-1609619385076-36a873425636?w=900&q=70&auto=format', caption: 'Flower offerings', description: 'Marigold offerings prepared ahead of darshan.', uploader: 'SSMV Trust' }
  ]);
  const utsav = createAlbum('Utsav');
  addPhotos(utsav.id, [
    { src: 'https://images.unsplash.com/photo-1516450137517-162bfbeb8dba?w=900&q=70&auto=format', caption: 'Diwali lights', description: "The hall lit up for last year's Diwali utsav.", uploader: 'SSMV Trust' }
  ]);
  createAlbum('Satsang');
}
seedIfEmpty();

module.exports = {
  getEvents, createEvent, updateEvent, deleteEvent,
  getAlbums, createAlbum, deleteAlbum, addPhotos, updatePhoto, deletePhoto,
  getMembers, upsertMember
};
