'use strict';

const { createApp } = require('./app');

const port = Number(process.env.PORT) || 3000;

let app;
try {
  app = createApp();
} catch (err) {
  console.error(`Could not start Site Viewer Lite: ${err.message}`);
  process.exit(1);
}

app.listen(port, () => {
  console.log(`Site Viewer Lite running at http://localhost:${port}`);
});
