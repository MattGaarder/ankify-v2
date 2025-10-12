# ankify (ankify)

A Quasar Project

## Install the dependencies
```bash
yarn
# or
npm install
```

### Start the app in development mode (hot-code reloading, error reporting, etc.)
```bash
quasar dev
```


### Lint the files
```bash
yarn lint
# or
npm run lint
```


### Build the app for production
```bash
quasar build
```

### Customize the configuration
See [Configuring quasar.config.js](https://v2.quasar.dev/quasar-cli-vite/quasar-config-js).


// electron-main.js (DEV-ONLY, non-packaged)
// Runs in Electron's MAIN process (separate from the Vue/Quasar renderer).
// Responsibilities:
//  - Creates the tray/popup window
//  - Bridges renderer <-> main via IPC
//  - Hosts services: Jisho lookup, AnkiConnect requests
//  - Hosts Japanese tokenization using kuromoji (loading dict from node_modules in dev)
//
// How to run (dev):
//  1) npm install
//  2) quasar dev -m electron  (or your project's dev command)
//  3) You should see "[main] app is ready" in the main process logs and a tray icon appear
//
// Where logs appear:
//  - Anything with console.log in THIS FILE = Electron main process logs (in your terminal)
//  - Renderer console.log = DevTools console of the BrowserWindow