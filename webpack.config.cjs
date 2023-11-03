module.exports = {
  resolve: {
    
    fallback: {
      "fs": false,
      "url": false,
      "tls": false,
      "net": false,
      "zlib": false,
      "util": false,
      "http": false,
      "https": false,
      "stream": false,
      "eventsource": false,
      "buffer": require.resolve('buffer/'),
      "events": require.resolve("events/"),
      "path": require.resolve("path-browserify"),
      "crypto": require.resolve('crypto-browserify'),
      "crypto-browserify": require.resolve('crypto-browserify')
    } 
  },
  mode: 'development',
  entry: {
  	client: './testTss.js',
  },
  output: {
    filename: '[name].js',
    path: __dirname
  },
  "experiments": {
    "topLevelAwait": true
  }
};
