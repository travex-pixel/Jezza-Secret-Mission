// A tiny streaming .zip writer (stored, not compressed: the photos are JPEGs already) so the end-of-weekend
// export needs no extra dependency. One file in memory at a time, so a few hundred photos fit in a small server.
import type { Writable } from 'node:stream';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export class ZipStream {
  private offset = 0;
  private central: Buffer[] = [];
  private count = 0;
  private readonly time: number;
  private readonly date: number;
  constructor(private out: Writable) {
    const d = new Date();
    this.time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    this.date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  }
  private async write(b: Buffer) {
    this.offset += b.length;
    if (!this.out.write(b)) await new Promise<void>((res, rej) => { this.out.once('drain', res); this.out.once('error', rej); this.out.once('close', res); });
  }
  async add(name: string, data: Buffer | string) {
    const body = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    const fname = Buffer.from(name, 'utf8');
    const crc = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(this.time, 10); local.writeUInt16LE(this.date, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(fname.length, 26); local.writeUInt16LE(0, 28);
    const at = this.offset;
    await this.write(Buffer.concat([local, fname]));
    await this.write(body);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(this.time, 12); cen.writeUInt16LE(this.date, 14); cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(body.length, 24); cen.writeUInt16LE(fname.length, 28);
    cen.writeUInt32LE(at, 42);
    this.central.push(Buffer.concat([cen, fname]));
    this.count++;
  }
  async finish() {
    const start = this.offset;
    const cd = Buffer.concat(this.central);
    await this.write(cd);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(this.count, 8); end.writeUInt16LE(this.count, 10);
    end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(start, 16);
    await this.write(end);
  }
}
