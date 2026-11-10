const esbuild = require('esbuild');
esbuild.buildSync({ entryPoints: ['renderer/app.js'], bundle: true, outfile: 'renderer/bundle.js', platform: 'browser', alias: {util: './renderer/util-shim.js'}, sourcemap: false, minify: true });
console.log('Renderer built.');
