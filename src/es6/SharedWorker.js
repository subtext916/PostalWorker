/**
 *  Postal Worker - Shared Worker Thread Engine
 *  @Description: Use web worker threading to fork threads and use postMessage to pass serialized data between threads and windows
 *  @Author: Russ Stratfull
 *  @Contributors: Sakshi Dheer, & Francois Wauquier
 */

import * as S from "./strings";
import safeJsonStringify from "safe-json-stringify";

const _env = {
  _id: "SharedWorker",
  _members: {},
  _stringify: safeJsonStringify,
  _events: new Map(),
  _scripts: new Map(),
  _channel: new BroadcastChannel(S.POSTAL_WORKER),
  _subscriptions: new Map(),
  _postBoxes: {},
  _packages: {},
  PostalWorker: {}
};

/**
 * Load a library (script) into the worker
 * @param {*} msg
 */
function _loadLibrary(msg) {
  let scrpt = _env._scripts.get(msg.data);
  // if script already exists, don't reload it
  if (scrpt) {
    // just add window id to it
    if (!scrpt.includes(msg.id)) scrpt.push(msg.id);
  } else {
    try {
      // Thank you chatGpt for this one
      // Create a closure and importScripts in the closure
      // this allows binding the imported script to the current scope
      // and PostalWorker can be passed securely to it, a little like
      // import in es modules
      const closure = (() => {
        importScripts(msg.data);
        return () => {
          return {
            usePrivate: init
          };
        };
      })();
      const importedScript = closure();
      // This is the magic
      importedScript.usePrivate(PostalWorker);

      _env._scripts.set(msg.data, [msg.id]);
    } catch (e) {
      console.error(e);
      _env._channel.postMessage(
        _env._stringify({
          postal: true,
          type: "ERROR",
          data: `PostalWorkerWorker Error: Unable to load file ${msg.data}`
        })
      );
    }
  }
}

/**
 * Add a node to the registry of members
 * @param {*} msg
 */
function _addNode(msg) {
  const { id, nodeType } = msg;
  _env._members[id] = nodeType;
}

/**
 * Remove a node from the registry of members
 * @param {*} msg
 */
function _removeNode(msg) {
  const { id } = msg;
  delete _env._members[id];
  Object.entries(_env._postBoxes).forEach(box => {
    const [, node] = box;
    if (node.members.includes(id))
      node.members.splice(node.members.indexOf(id), 1);
  });
}

/**
 *
 * @param {*} msg
 * @param {Function} callback - optional callback
 */
function _registerPObox(msg, callback) {
  const { id, address } = msg;
  let addr = _env._postBoxes[address];
  if (addr) {
    if (!addr.members.includes(id)) addr.members.push(id);
    if (!addr.handlers.length) addr.handlers.push(callback);
  } else {
    _env._postBoxes[address] = {
      members: [id],
      handlers: callback ? [callback] : [],
      value: null
    };
  }

  const box = Object.entries(_env._postBoxes).reduce((store, current) => {
    store[current[0]] = current[1].value;
    return store;
  }, {});

  PostalWorker().fire(S.COLLECT, {
    address: address,
    value: _env._postBoxes[address].value,
    box
  });
  // Is there a worker handler for this item?
  for (const [key, bx] of Object.entries(_env._postBoxes)) {
    if (key === address && bx.handlers.length) {
      bx.handlers.forEach(handler => {
        if (handler) {
          handler({ address, value: _env._postBoxes[address].value, box });
        }
      });
    }
  }
}

/**
 *
 * @param {*} msg
 */
function _postBox(msg) {
  const { address, value } = msg;
  let addr = _env._postBoxes[address];
  if (addr) addr.value = value;
  // todo: box not created case?
  const box = Object.entries(_env._postBoxes).reduce((store, current) => {
    store[current[0]] = current[1].value;
    return store;
  }, {});
  PostalWorker().fire(S.COLLECT, { address, value, box });
  // Is there a worker handler for this item?
  for (const [key, bx] of Object.entries(_env._postBoxes)) {
    if (key === address && bx.handlers.length) {
      bx.handlers.forEach(handler => {
        if (handler) handler({ address, value, box });
      });
    }
  }
}

/**
 *
 * @param {*} msg
 */
function _closeBox(msg) {
  const { id, address } = msg;
  let addr = _env._postBoxes[address];
  if (addr) {
    addr.members = addr.members.filter(m => m !== id);
    if (id === _env._id) addr.handlers = [];
    if (!addr.members.length) {
      delete _env._postBoxes[address];
    }
    const value = null;
    const box = Object.entries(_env._postBoxes).reduce((store, current) => {
      store[current[0]] = current[1].value;
      return store;
    }, {});
    PostalWorker().fire(S.BOXCLOSED, { id, address, value, box });
  }
}

/**
 *
 * @param {*} msg
 * @param {*} callback
 */
function _preparePackage(msg, callback) {
  const { id, address } = msg;
  let pack = _env._packages[address];
  if (pack) {
    if (!pack.members.includes(id)) pack.members.push(id);
    if (!pack.handlers.length) pack.handlers.push(callback);
  } else
    _env._packages[address] = {
      members: [id],
      handlers: callback ? [callback] : [],
      content: null
    };

  if (_env._packages[address].content)
    PostalWorker().fire(S.DELIVERY, {
      address: address,
      content: _env._packages[address].content
    });
  else
    PostalWorker().fire(S.DELIVERY, {
      address: address,
      content: null
    });
}

/**
 *
 * @param {*} msg
 */
function _pack(msg) {
  const { address, content } = msg;
  let addr = _env._packages[address];
  if (addr) addr.content = content;

  PostalWorker().fire(S.DELIVERY, { address, content });

  // for (const [key, bx] of Object.entries(_env._postBoxes)) {
  //   if (key === address && bx.handlers.length) {
  //     bx.handlers.forEach(handler => {
  //       if (handler) {
  //         handler({ address, value: _env._postBoxes[address].value, box });
  //       }
  //     });
  //   }
  // }

  for (const [key, pack] of Object.entries(_env._packages)) {
    if (key === address && pack.handlers.length) {
      pack.handlers.forEach(handler => {
        if (handler) {
          handler({ address, content: content });
        }
      });
    }
  }
}

/**
 *
 * @param {*} msg
 */
function _processChannelMessage(msg) {
  // console.info(msg);
  if (!msg.postal) return;
  // console.info(msg);
  switch (msg.type) {
    case S.FIRE:
      if (_env._events.has(msg.data.msgClass)) {
        _env._events.get(msg.data.msgClass)(msg.data.message, msg.id);
      }
      break;
    case S.LOAD:
      _loadLibrary(msg);
      break;
    case S.REGISTERID:
      _addNode(msg);
      break;
    case S.UNREGISTERID:
      _removeNode(msg);
      break;
    case S.POBOX:
      _registerPObox(msg);
      break;
    case S.POST:
      _postBox(msg);
      break;
    case S.CLOSEBOX:
      _closeBox(msg);
      break;
    case S.PACKAGE:
      _preparePackage(msg);
      break;
    case S.PACK:
      _pack(msg);
  }
}

const PostalWorker = () => ({
  /**
   *
   * @param msgClass
   * @param action
   */
  on: (msgClass, action) => {
    _env._events.set(msgClass, action);
  },

  /**
   *
   * @param msgClass
   */
  un: msgClass => {
    _env._events.delete(msgClass);
  },

  /**
   *
   * @param msgClass
   * @param msg
   */
  fire: (msgClass, msg) => {
    _env._channel.postMessage(
      _env._stringify({
        postal: true,
        type: S.FIRE,
        id: S.POSTAL_SHARED_WORKER,
        data: {
          msgClass: msgClass,
          message: msg
        }
      })
    );
    // deprecated
    // PostalWorker._postMessenger(
    //   S.FIRE,
    //   audience,
    //   {
    //     msgClass: msgClass,
    //     message: msg,
    //     audience: audience
    //   },
    //   target
    // );
  },

  /**
   *
   * @param {*} library
   * @returns
   */
  load: library => _loadLibrary(library),

  /**
   * Subscribe to Server Sent Events and create event source
   * @param {*} endpoint
   * @param {*} callback
   * @param {*} errorCallback
   */
  subscribe: (endpoint, callback, errorCallback) => {
    if (!_env._subscriptions.get(endpoint)) {
      _env._subscriptions.set(endpoint, new EventSource(endpoint));
      _env._subscriptions.get(endpoint).onmessage = msg => {
        callback(msg);
      };
      if (errorCallback) {
        _env._subscriptions.get(endpoint).onerror = error => {
          errorCallback(error);
        };
      }
    }
  },

  postBox: (address, callback) => {
    _registerPObox(
      {
        id: _env._id,
        address
      },
      callback
    );
  },

  /**
   *
   * @param {*} address
   * @param {*} value
   */
  post: (address, value) => {
    _postBox({ address, value });
  },

  /**
   *
   * @param {*} address
   */
  closeBox: address => {
    _closeBox({ address, id: _env._id });
  },

  /**
   *
   * @param {*} address
   * @param {*} handling
   */
  package: (address, handling) => {
    // id, address
    _preparePackage(
      {
        id: _env._id,
        address: address
      },
      handling
    );
  },

  /**
   *
   * @param {*} address
   * @param {*} content
   */
  pack: (address, content) => {
    let xhRequest = new XMLHttpRequest();
    xhRequest.onload = function () {
      let reader = new FileReader();
      reader.onloadend = function () {
        _pack({ address, content: reader.result });
      };
      reader.readAsDataURL(xhRequest.response);
    };
    xhRequest.open("GET", content);
    xhRequest.responseType = "blob";
    xhRequest.send();
  },

  // temp
  env: () => _env
});

/**
 * When windows connect to the worker,
 * register their source and start their messaging session
 */
onconnect = () => {
  // New messaging method using broadcast channel
  if (!_env._channel.onmessage)
    _env._channel.onmessage = event => {
      const data = JSON.parse(event.data);
      _processChannelMessage(data);
    };

  // Announce alive to broadcast channel
  _env._channel.postMessage(
    _env._stringify({
      postal: true,
      type: S.WORKERREGISTER
    })
  );
};
