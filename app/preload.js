// in preload scripts, we have access to node.js and electron APIs
// the remote web app will not have access, so this is safe
const {ipcRenderer: ipc, remote} = require('electron');

init();

function init() {
  attachIPCListeners();

  // Expose a bridging API to by setting an global on `window`.
  // We'll add methods to it here first, and when the remote web app loads,
  // it'll add some additional methods as well.
  //
  // !CAREFUL! do not expose any functionality or APIs that could compromise the
  // user's computer. E.g. don't directly expose core Electron (even IPC) or node.js modules.
  window.Bridge = {
    processDataFrame
  };
}

function attachIPCListeners() {
  // we get this message from the main process
  ipc.on('evaluateDataFrame', () => {
    // the todo app defines this function
    window.Bridge.processDataFrame();
  });
}

function processDataFrame() {
  if (process.platform === 'darwin') {
    console.log('message received');
  }
}
