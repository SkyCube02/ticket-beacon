export function collectSystemInfo() {
  const ua = navigator.userAgent;

  const getOS = () => {
    if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
    if (/Windows NT 6.3/.test(ua)) return 'Windows 8.1';
    if (/Windows NT 6.1/.test(ua)) return 'Windows 7';
    if (/Mac OS X/.test(ua)) return `macOS ${ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, '.') ?? ''}`;
    if (/Linux/.test(ua)) return 'Linux';
    if (/Android/.test(ua)) return `Android ${ua.match(/Android ([\d.]+)/)?.[1] ?? ''}`;
    if (/iPhone|iPad/.test(ua)) return `iOS ${ua.match(/OS ([\d_]+)/)?.[1]?.replace(/_/g, '.') ?? ''}`;
    return 'Unknown OS';
  };

  const getBrowser = () => {
    if (/Edg\//.test(ua)) return `Edge ${ua.match(/Edg\/([\d.]+)/)?.[1] ?? ''}`;
    if (/Chrome\//.test(ua)) return `Chrome ${ua.match(/Chrome\/([\d.]+)/)?.[1] ?? ''}`;
    if (/Firefox\//.test(ua)) return `Firefox ${ua.match(/Firefox\/([\d.]+)/)?.[1] ?? ''}`;
    if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return `Safari ${ua.match(/Version\/([\d.]+)/)?.[1] ?? ''}`;
    return 'Unknown browser';
  };

  return {
    os: getOS(),
    browser: getBrowser(),
    screen: `${window.screen.width}×${window.screen.height}`,
    language: navigator.language,
    online: navigator.onLine,
    platform: navigator.platform || 'Unknown',
    collected_at: new Date().toISOString(),
  };
}
