// RTSP templates mirror rv_edge/ingest/rtsp_templates.py.
import { describe, expect, it } from 'vitest';
import { buildRtspUrl, guessBrand, normalizeBrand, parseCameraUrl, redactUrl } from '../lib/rtsp';

describe('buildRtspUrl', () => {
  it.each([
    ['hikvision', 1, true, 'rtsp://192.168.1.64:554/Streaming/Channels/102'],
    ['hikvision', 3, false, 'rtsp://192.168.1.64:554/Streaming/Channels/301'],
    ['dahua', 2, true, 'rtsp://192.168.1.64:554/cam/realmonitor?channel=2&subtype=1'],
    ['uniview', 1, true, 'rtsp://192.168.1.64:554/unicast/c1/s1/live'],
    ['axis', 1, true, 'rtsp://192.168.1.64:554/axis-media/media.amp?camera=1&videocodec=h264&resolution=640x360'],
    ['provision_isr', 4, true, 'rtsp://192.168.1.64:554/profile2'],
    ['generic', 1, false, 'rtsp://192.168.1.64:554/stream1'],
  ])('%s channel %i substream %s', (brand, channel, substream, expected) => {
    expect(buildRtspUrl({ brand, host: '192.168.1.64', channel, substream })).toBe(expected);
  });

  it('never puts credentials in the URL and brackets IPv6 hosts', () => {
    expect(buildRtspUrl({ brand: 'generic', host: 'fe80::1', port: 8554 })).toBe('rtsp://[fe80::1]:8554/stream2');
  });

  it('maps brand names like normalize_brand / guess_brand', () => {
    expect(normalizeBrand('Hik Vision')).toBe('generic');
    expect(normalizeBrand('HIKVISION')).toBe('hikvision');
    expect(normalizeBrand('Amcrest')).toBe('dahua');
    expect(guessBrand('Provision-ISR', 'I4-340')).toBe('provision_isr');
    expect(guessBrand(null, 'unknown')).toBeNull();
  });
});

describe('redacted URLs', () => {
  it('redacts user info and secret query values', () => {
    expect(redactUrl('rtsp://admin:p@ss/w0rd@10.0.0.2:554/x')).toBe('rtsp://***@10.0.0.2:554/x');
    expect(redactUrl('http://cam/snap?user=a&pwd=b&ch=1')).toBe('http://cam/snap?user=***&pwd=***&ch=1');
  });

  it('parses a listed URL back into the brand form', () => {
    expect(parseCameraUrl('rtsp://***@192.168.1.64:554/Streaming/Channels/202')).toEqual({
      host: '192.168.1.64',
      port: 554,
      brand: 'hikvision',
      channel: 2,
      substream: true,
    });
    expect(parseCameraUrl('rtsp://10.0.0.9:10554/custom/path')?.brand).toBeNull();
    expect(parseCameraUrl('http://x')).toBeNull();
  });
});
