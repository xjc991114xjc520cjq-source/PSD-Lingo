// Public trust anchor only; private update keys must remain outside the application and repository.
module.exports=Object.freeze({
  "appId": "PSDLingo",
  "deviceNamespace": "PSDLingo.Device.v1",
  "authorizationEnabled": true,
  "learningCloudEnabled": true,
  "serverUrl": "https://psd-lingo-api.1498224542.workers.dev",
  "leaseKeys": {
  "lease-1": "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAErJsAX5D1Tn6VW/TU/f0ZSkqdS8lO\nZtmGKqzNsDFQJgTV04MkZAapsyGcZ0r3s8/CDxzf/XB9/oFTWcFzFDg3gA==\n-----END PUBLIC KEY-----\n"
},
  "updateManifestUrl": "https://github.com/xjc991114xjc520cjq-source/PSD-Lingo/releases/latest/download/update.json",
  "macUpdateChannel": "mac-dmg-updates",
  "macUpdateManifestUrl": "https://github.com/xjc991114xjc520cjq-source/PSD-Lingo/releases/download/mac-dmg-updates/update-macos-arm64.json",
  "githubRepository": "xjc991114xjc520cjq-source/PSD-Lingo",
  "updateKeys": {
    "update-1": "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEX2Oc7NN7NTFihjhiVvmwjgbUUhv7\np1Iw3/vJYtKvsYxP14g7DQih3/PeE+pOko//xwoQoeASN5D5N4u35sRYQQ==\n-----END PUBLIC KEY-----\n"
  },
  "channel": "production"
});
