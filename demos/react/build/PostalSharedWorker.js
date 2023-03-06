(function () {
'use strict';

/**
 * PostalWorker String Constants
 * @type {string}
 */
const POSTAL_WORKER = "PostalWorker";
const POSTAL_SHARED_WORKER = "PostalSharedWorker";
const FIRE = "FIRE";
const WORKERREGISTER = "WORKERREGISTER";
const REGISTERID = "REGISTERID";
const UNREGISTERID = "UNREGISTERID";
const LOAD = "LOAD";
const POBOX = "POBOX";
const POST = "POST";
const COLLECT = "COLLECT";
const CLOSEBOX = "CLOSEBOX";
const BOXCLOSED = "BOXCLOSED";
const PACKAGE = "PACKAGE";
const PACK = "PACK";
const DELIVERY = "DELIVERY";

var hasProp = Object.prototype.hasOwnProperty;

function throwsMessage(err) {
	return '[Throws: ' + (err ? err.message : '?') + ']';
}

function safeGetValueFromPropertyOnObject(obj, property) {
	if (hasProp.call(obj, property)) {
		try {
			return obj[property];
		}
		catch (err) {
			return throwsMessage(err);
		}
	}

	return obj[property];
}

function ensureProperties(obj) {
	var seen = [ ]; // store references to objects we have seen before

	function visit(obj) {
		if (obj === null || typeof obj !== 'object') {
			return obj;
		}

		if (seen.indexOf(obj) !== -1) {
			return '[Circular]';
		}
		seen.push(obj);

		if (typeof obj.toJSON === 'function') {
			try {
				var fResult = visit(obj.toJSON());
				seen.pop();
				return fResult;
			} catch(err) {
				return throwsMessage(err);
			}
		}

		if (Array.isArray(obj)) {
			var aResult = obj.map(visit);
			seen.pop();
			return aResult;
		}

		var result = Object.keys(obj).reduce(function(result, prop) {
			// prevent faulty defined getter properties
			result[prop] = visit(safeGetValueFromPropertyOnObject(obj, prop));
			return result;
		}, {});
		seen.pop();
		return result;
	}

	return visit(obj);
}

var index = function(data, replacer, space) {
	return JSON.stringify(ensureProperties(data), replacer, space);
};

var ensureProperties_1 = ensureProperties;

index.ensureProperties = ensureProperties_1;

/**
 *  Postal Worker - Shared Worker Thread Engine
 *  @Description: Use web worker threading to fork threads and use postMessage to pass serialized data between threads and windows
 *  @Author: Russ Stratfull
 *  @Contributors: Sakshi Dheer, & Francois Wauquier
 */

self._env = {
  _members: {},
  _stringify: index,
  _events: new Map(),
  _scripts: new Map(),
  _channel: new BroadcastChannel(POSTAL_WORKER),
  _subscriptions: new Map(),
  _postBoxes: {},
  _packages: {}
};

/**
 * Load a library (script) into the worker
 * @param {*} msg
 */
function _loadLibrary(msg) {
  let scrpt = self._env._scripts.get(msg.data);
  // if script already exists, don't reload it
  if (scrpt) {
    // just add window id to it
    if (!scrpt.includes(msg.id)) scrpt.push(msg.id);
  } else {
    try {
      importScripts(msg.data);
      self._env._scripts.set(msg.data, [msg.id]);
    } catch (e) {
      self._env._channel.postMessage(
        self._env._stringify({
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
  self._env._members[id] = nodeType;
}

/**
 * Remove a node from the registry of members
 * @param {*} msg
 */
function _removeNode(msg) {
  const { id } = msg;
  delete self._env._members[id];
  Object.entries(self._env._postBoxes).forEach(box => {
    const [, node] = box;
    if (node.members.includes(id))
      node.members.splice(node.members.indexOf(id), 1);
  });
}

/**
 *
 * @param {*} msg
 */
function _registerPObox(msg) {
  const { id, address } = msg;
  let addr = self._env._postBoxes[address];
  if (addr) {
    if (!addr.members.includes(id)) addr.members.push(id);
  } else {
    self._env._postBoxes[address] = {
      members: [id],
      handlers: [],
      value: null
    };
  }

  const box = Object.entries(self._env._postBoxes).reduce((store, current) => {
    store[current[0]] = current[1].value;
    return store;
  }, {});

  self.PostalWorker().fire(COLLECT, {
    address: address,
    value: self._env._postBoxes[address].value,
    box
  });
}

/**
 *
 * @param {*} msg
 */
function _postBox(msg) {
  const { address, value } = msg;
  let addr = self._env._postBoxes[address];
  if (addr) addr.value = value;
  // todo: box not created case?
  const box = Object.entries(self._env._postBoxes).reduce((store, current) => {
    store[current[0]] = current[1].value;
    return store;
  }, {});
  self.PostalWorker().fire(COLLECT, { address, value, box });
}

function _closeBox(msg) {
  const { id, address } = msg;
  let addr = self._env._postBoxes[address];
  if (addr) {
    addr.members = addr.members.filter(m => m !== id);
    if (!addr.members.length) {
      delete self._env._postBoxes[address];
    }
    const value = null;
    const box = Object.entries(self._env._postBoxes).reduce(
      (store, current) => {
        store[current[0]] = current[1].value;
        return store;
      },
      {}
    );
    self.PostalWorker().fire(BOXCLOSED, { id, address, value, box });
  }
}

function _preparePackage(msg) {
  const { id, address } = msg;
  let pack = self._env._packages[address];
  if (pack) {
    if (!pack.members.includes(id)) pack.members.push(id);
  } else
    self._env._packages[address] = {
      members: [id],
      handlers: [],
      content: null
    };
  // const box = Object.entries(self._env._packages).reduce((store, current) => {
  //   store[current[0]] = current[1].value;
  //   return store;
  // }, {});
  // self.PostalWorker().fire(S.DELIVERY, {
  //   address: address,
  //   content: self._env._packages[address].content
  // });
}

function _pack(msg) {
  const { address, content } = msg;
  let addr = self._env._packages[address];
  if (addr) addr.content = content;

  self.PostalWorker().fire(DELIVERY, { address, content });
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
    case FIRE:
      if (self._env._events.has(msg.data.msgClass)) {
        self._env._events.get(msg.data.msgClass)(msg.data.message, msg.id);
      }
      break;
    case LOAD:
      _loadLibrary(msg);
      break;
    case REGISTERID:
      _addNode(msg);
      break;
    case UNREGISTERID:
      _removeNode(msg);
      break;
    case POBOX:
      _registerPObox(msg);
      break;
    case POST:
      _postBox(msg);
      break;
    case CLOSEBOX:
      _closeBox(msg);
      break;
    case PACKAGE:
      _preparePackage(msg);
      break;
    case PACK:
      _pack(msg);
  }
}

self.PostalWorker = () => ({
  /**
   *
   * @param msgClass
   * @param action
   */
  on: (msgClass, action) => {
    self._env._events.set(msgClass, action);
  },

  /**
   *
   * @param msgClass
   */
  un: msgClass => {
    self._env._events.delete(msgClass);
  },

  /**
   *
   * @param msgClass
   * @param msg
   */
  fire: (msgClass, msg) => {
    self._env._channel.postMessage(
      self._env._stringify({
        postal: true,
        type: FIRE,
        id: POSTAL_SHARED_WORKER,
        data: {
          msgClass: msgClass,
          message: msg
        }
      })
    );
    // deprecated
    // self.PostalWorker._postMessenger(
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
    if (!self._env._subscriptions.get(endpoint)) {
      self._env._subscriptions.set(endpoint, new EventSource(endpoint));
      self._env._subscriptions.get(endpoint).onmessage = msg => {
        callback(msg);
      };
      if (errorCallback) {
        self._env._subscriptions.get(endpoint).onerror = error => {
          errorCallback(error);
        };
      }
    }
  },

  PObox: (address, handler) => {
    // todo...
  }
});

/**
 * When windows connect to the worker,
 * register their source and start their messaging session
 */
onconnect = () => {
  // New messaging method using broadcast channel
  if (!self._env._channel.onmessage)
    self._env._channel.onmessage = event => {
      const data = JSON.parse(event.data);
      _processChannelMessage(data);
    };

  // Announce alive to broadcast channel
  self._env._channel.postMessage(
    self._env._stringify({
      postal: true,
      type: WORKERREGISTER
    })
  );
};

// from connect:
// // // Deprecating
// let address = uniqueNumber();
// let src = event.source,
//   port = {
//     address: address,
//     session: src,
//     tries: 10
//   };
// self.PostalWorker.ports.push(port);
// src.start();
// // src.addEventListener(S.MESSAGE, event => {
// //   self.PostalWorker._registerMessage(
// //     event,
// //     src,
// //     self.PostalWorker.ports
// //   );
// // });
// let startup = {
//   type: S.SET_ADDRESS,
//   data: address
// };
// src.postMessage(startup);

// from object:
/**
 * Listen for an event and execute the provided callback
 * Events:
 * remove - remove from messaging community/queue
 *
 * @param event
 * @param callback
 */
// addListener: (event, callback) => {
//   self.PostalWorker.listeners.set(S.REMOVE, callback);
// },
/** Deprecated
 * Register message events
 * @param event
 * @param port
 * @param ports
 * @private
 */
// _registerMessage: (event, port, ports) => {
//   if (event.data && event.type) {
//     let msg = JSON.parse(event.data),
//       range;
//     switch (msg.type) {
//       // Responses keep the worker aware of which connections are current
//       case S.RESPONSE:
//         if (msg.status) {
//           let lastRequest = self.PostalWorker.ports.find(
//             prt => prt.session === event.currentTarget
//           );
//           if (lastRequest && lastRequest.tries) lastRequest.tries++;
//         }
//         break;
//       case S.ON:
//         // todo: Not ported over from previous version yet
//         // but what do we do with "on" from a window in the worker anyways???
//         break;
//       case S.UN:
//         // todo: Not ported over from previous version yet
//         break;
//       case S.FIRE:
//         console.info("fire worker");
//         // Broadcast to windows/tabs
//         range = msg.data.audience || S.ALL; // public, private, ALL todo: direct port messaging...
//         self.PostalWorker._postMessenger(S.FIRE, range, msg.data, port);
//         // Invoke registered event on this thread
//         if (self.PostalWorker.events.has(msg.data.msgClass)) {
//           let address, index, src;
//           for (let p of self.PostalWorker.ports) {
//             if (p.session === event.currentTarget) {
//               address = p.address;
//               index = self.PostalWorker.ports.indexOf(p);
//               src = p.session;
//             }
//           }
//           self.PostalWorker.events.get(msg.data.msgClass)(
//             msg.data.message,
//             { index: index, address: address, src: src }
//           );
//         }
//         break;
//       // todo...
//       case S.LOAD:
//         if (self.PostalWorker.scripts.has(msg.data)) {
//           return;
//         }
//         // Wrap importScripts in try catch to report errors back to the main window
//         // Attemp to load requested library
//         try {
//           importScripts(msg.data);
//           self.PostalWorker.scripts.add(msg.data);
//         } catch (e) {
//           event.currentTarget.postMessage({
//             type: "ERROR",
//             data: `PostalWorkerWorker Error: Unable to load file ${msg.data}`
//           });
//         }
//         break;
//       case S.SET_ADDRESS: {
//         for (let p of self.PostalWorker.ports) {
//           if (p.session === event.currentTarget) {
//             p.address = msg.data;
//           }
//         }
//         let addressChange = {
//           type: S.SET_ADDRESS,
//           data: msg.data
//         };
//         event.currentTarget.postMessage(addressChange);
//       }
//     }
//   }
// },
/**
 * This function invokes a callback whenever a window is removed from the messaging queue
 * To configure the worker to do this, use the "addListener" method and provide the event "remove"
 * as the first argument
 * @param removals
 * @private
 */
// _invokeRemoveCallback: removals => {
//   for (let r of removals) {
//     self.PostalWorker.listeners.get(S.REMOVE)(r);
//   }
// },
/**
 * The messenger method used to post messages to the windows
 * @param type
 * @param audience
 * @param msg
 * @param port
 * @private
 */
// _postMessenger: (type, audience, msg, port) => {
//   let notification = {
//     type: type,
//     data: msg
//   };
//   switch (audience) {
//     case S.PRIVATE:
//       notification = {type: type,data: msg};
//       _port.tries++;
//       _port.session.postMessage(notification);
//       break;
//     case S.PUBLIC:
//       self.PostalWorker.channel.postMessage(notification);
//       break;
//     default: // ALL
//       self.PostalWorker.channel.postMessage(notification);
//   }
// }

}());
