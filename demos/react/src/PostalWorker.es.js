/**
 * PostalWorker String Constants
 * @type {string}
 */
const POSTAL_WORKER = "PostalWorker";
const POSTAL_SHARED_WORKER = "PostalSharedWorker";
const ON = "ON";
const UN = "UN";
const FIRE = "FIRE";
const CROSSFIRE = "CROSSFIRE";
const BACKFIRE = "BACKFIRE";
const CHILDREGISTER = "CHILDREGISTER";
const WORKERREGISTER = "WORKERREGISTER";
const REGISTERID = "REGISTERID";
const UNREGISTERID = "UNREGISTERID";
const BROADCASTNODE = "BROADCASTNODE";
const CROSSNODE = "CROSSNODE";
const ERROR = "ERROR";
const MESSAGE = "message";
const SCRIPT = "script";
const JS = "js";
const LOAD = "LOAD";
const RESPONSE = "RESPONSE";
const SET_ADDRESS = "SET_ADDRESS";
const CONNECT = "CONNECT";
const DISCONNECT = "DISCONNECT";
const POBOX = "POBOX";
const POST = "POST";
const COLLECT = "COLLECT";
const CLOSEBOX = "CLOSEBOX";
const BOXCLOSED = "BOXCLOSED";
const PACKAGE = "PACKAGE";
const PACK = "PACK";
const DELIVERY = "DELIVERY";
const _BLANK = "_blank";

class Deprecated {

    static registerWorker(worker, OK, events, address) {
        worker.port.onmessage = (event) => {
            
            // Handle messages sent from worker by type
            switch (event.data.type) {
                case FIRE: // If the legacy messaging is used, it will still work here
                    // Send the message
                    if (event.data.data.msgClass &&
                        events.get(event.data.data.msgClass)) {
                        events.get(event.data.data.msgClass)(event.data.data.message);
                    }
                    // Let worker know message was received
                    event.currentTarget.postMessage(OK);
                    break;
                case SET_ADDRESS: {
                    Deprecated.address = event.data.data;
                    break;
                }
                case ERROR:
                    console.error(event.data.data);
                    break;
                default: console.warn(event);
            }
        };
    }
}

/**
 * Postal Helper defines the public API methods and creates window event handlers
 * for the postal worker and add/remove internal postal subscriptions used by the library
 * @author: Russ Stratfull
 */
class PostalHelper {
  /**
   * Primary PostalWorker public methods
   * @param {*} module
   */
  static rootMethods(module) {
    module.on = (msgClass, action) => module._on(msgClass, action);
    module.on.example = `PostalWorker().on('example', (msg) => console.info(msg))`;

    module.un = msgClass => module._un(msgClass);
    module.un.example = `PostalWorker().un('example')`;

    module.fire = (msgClass, msg, audience) =>
      module._fire(msgClass, msg, audience);
    module.fire.example = `PostalWorker().fire('example', 'Hello world')`;

    module.crossOn = (msgClass, action, subscriber, name, windowparams) =>
      module._crossOn(msgClass, action, subscriber, name, windowparams);
    module.crossOn.example = `PostalWorker().crossOn('example', (msg) => console.info(msg), 'http://example.com', 'Example Name', )`;

    module.unCross = (msgClass, subscriber) =>
      module._unCross(msgClass, subscriber);
    module.unCross.example = `PostalWorker().unCross('example', 'http://example.com')`;

    module.crossFire = (msgClass, msg) => module._crossFire(msgClass, msg);
    module.crossFire.example = `PostalWorker().crossFire('example', 'message to all windows/tabs cross launched')`;

    module.fireAll = (msgClass, msg) => module._fireAll(msgClass, msg);
    module.fireAll.example = `PostalWorker().fireAll('example', 'message to ALL windows/tabs/workers')`;

    module.load = library => module._load(library);
    module.load.example = `PostalWorker().load('path/to/script.js')`;

    module.postBox = (address, callback) => module._postBox(address, callback);
    module.postBox.example = `PostalWorker().PObox('example', function(value) { console.log(value); })`;

    module.post = (address, value) => module._post(address, value);
    module.post.example = `PostalWorker().post('example', 'This is an example value')`;

    module.closeBox = address => module._closeBox(address);
    module.closeBox.example = `PostalWorker().closeBox("example")`;

    module.package = (address, handling) => module._package(address, handling);
    module.package.example = `PostalWorker().package('example', (todo) => {})`;

    module.pack = (address, content) => module._pack(address, content);
    module.pack.example = `PostalWorker().pack('example', 'url/of/file.jpg')`;
  }

  /**
   * Special method added when script detects that the current window is an iframe
   * @param {*} module
   */
  static backMethod(module) {
    module.backFire = (msgClass, msg) => module._backFire(msgClass, msg);
    module.backFire.example = `PostalWorker().backfire('example', 'Message to parent window')`;
  }

  /**
   * Utility methods which in the future could maybe be removed from public access
   * @param {*} module
   */
  static utilityMethods(module) {
    // module.getAddress = () => module._getAddress();
    // module.getAddress.example = `PostalWorker().getAddress()`;
    // module.getPostalRoute = () => module._getPostalRoute();
    // module.getPostalRoute.example = `PostalWorker().getPostalRoute()`;
    // module.getCrossEvents = () => module._getCrossEvents();
    // module.getCrossEvents.example = `PostalWorker().getCrossEvents()`;
    // module.getEvents = () => module._getEvents();
    // module.getEvents.example = `PostalWorker().getEvents()`;
    // module.getSubscriber = url => module._getSubscriber(url);
    // module.getSubscriber.example = `PostalWorker().getSubscriber('http://example.com')`;
    // module.getSubscriptions = () => module._getSubscriptions();
    // module.getSubscriptions.example = `PostalWorker().getSubscriptions()`;
    // module.getWindows = () => module._getWindows();
    // module.getWindows.example = `PostalWorker().getWindows()`;
    // module.getWindowsBySubscriber = subscriber =>
    //   module._getWindowsBySubscriber(subscriber);
    // module.getWindowsBySubscriber.example = `PostalWorker().getWindowsBySubscriber('http://example.com')`;
    // module.uniqueNumber = () => module._uniqueNumber();
  }

  /**
   * Attach global window event handlers needed by PostalWorker
   * @param {*} module
   */
  static attachHandlers(module) {
    // Beforewindow unloads, announce disconnect to community
    window.addEventListener("beforeunload", () => {
      const mod = module;
      mod._unmapFromBroadcastNetwork(mod.id);
      mod._fireAll(DISCONNECT, {
        id: mod.id,
        subscriber: mod._getSubscriber(window.location.href)
      });
    });

    // When window loads, announce connection to community
    window.addEventListener("load", () => {
      const mod = module;
      mod._fireAll(CONNECT, {
        id: mod.id,
        subscriber: mod._getSubscriber(window.location.href)
      });
    });
  }

  /**
   * Establish internal usage of PostalWorker to create connect, disconnect, msgClasses
   * @param {*} module
   */
  static internalSubscriptions(module) {
    // Connect
    module._on(CONNECT, msg => {
      // console.info("CONNECT", msg);
      const mod = module;
      mod._mapToBroadcastNetwork(msg.id);
    });
    module._crossOn(CONNECT, msg => {
      // console.info("crossOn CONNECT", msg);
      const mod = module;
      let wins = mod._getOpeningWindows(); //.get(msg.subscriber);
      let mapped = [];
      if (wins) {
        // wins.size should be 1 but todo: support multiple?
        for (let [subscriber, win] of wins) {
          mod._mapToWindow(msg.id, win, msg.subscriber);
          mapped.push(subscriber);
        }
        for (let m of mapped) {
          mod._getOpeningWindows().delete(m);
        }
      }
    });

    // Disconnect
    module._on(DISCONNECT, msg => {
      // console.info("DISCONNECT", msg);
      const mod = module;
      mod._unmapFromWindow(msg.id);
    });
    module._crossOn(DISCONNECT, msg => {
      // console.info("crossOn: DISCONNECT", msg);
      const mod = module;
      mod._unmapFromWindow(msg.id);
    });
  }

  /**
   * Subscribe to postbox collection msgClass to get updates
   * @param {*} module
   */
  static registerCollection(module) {
    // let last;
    module._on(COLLECT, msg => {
      const mod = module;
      // const serialized = JSON.stringify(msg);
      //if (last !== serialized) {
      mod._collectBox(msg);
      // }
      // last = serialized;
    });
  }

  /**
   * Unregister postbox collection msgClass
   * @param {*} module
   */
  static unregisterCollection(module) {
    module._un(COLLECT);
  }

  /**
   * Register for temporary msgClass to get final update when postbox is being closed
   * @param {*} module
   * @param {*} add
   * @param {*} collect
   */
  static registerClosure(module, add, collect) {
    const lastCollection = collect;
    if (!module._getEvents().get(BOXCLOSED)) {
      module._on(BOXCLOSED, msg => {
        const mod = module;
        mod._clearBox(msg);

        // todo: remove boxclosed subscription if not needed anymore
        // mod._un(S.BOXCLOSED);
      });
    }

    module._lastCollection(add, lastCollection);
  }

  /**
   * Register for msgClass to receive package updates and deliver them
   * @param {*} module
   */
  static registerDelivery(module) {
    module._on(DELIVERY, msg => {
      const mod = module;
      mod._delivery(msg);
    });
    // todo: handle unregister
  }
}

/**
 * PostalWorker Post Messenger Event Bus Module (ES6)
 * @description: Listen for and broadcast out messages by "message class"
 * between windows/tabs & web workers using the postMessage API
 * @Author: Russ Stratfull
 * @Contributors: Sakshi Dheer, & François Wauquier
 */

let _config = false;
let _stringify;
let _worker = false;
let _parentWindow = false;
let _subscriptions = new Set();
let _events = new Map();
let _crossEvents = new Map();
let _openingWindows = new Map();
let _windows = new Map();
let _broadcastNetwork = new Set();
let _channel = new BroadcastChannel(POSTAL_WORKER);
let _queue = [];
let _POboxes = new Map();
let _closures = new Map();
let _packages = new Map();

// Define the PostalWorker
class PostalWorker {
  /**
   * Initialize object with configuration & setup the worker and listeners
   * @param configuration
   * @param safeJsonStringify
   */
  constructor(configuration, safeJsonStringify) {
    this.uniqueNumber = 0;

    this.id = this._uniqueNumber();
    this.workerOnline = false;

    _config = configuration || false;
    _stringify = safeJsonStringify;

    // Public API
    PostalHelper.rootMethods(this);
    PostalHelper.utilityMethods(this);

    // Attach global handlers
    PostalHelper.attachHandlers(this);

    // Does this window have a parent?
    if (window.self !== window.top) {
      // If it does, include additional public methods and then register it
      // and let it know this window is ready to receive messages
      PostalHelper.backMethod(this);
      _parentWindow = this._getSubscriber(document.referrer);
      this._backFire(CHILDREGISTER);
    }

    // Add event listener to incoming messages (from windows) and process with messageController
    window.addEventListener(MESSAGE, this._messageController);
    // Subscribe to internal message classes
    PostalHelper.internalSubscriptions(this);

    // Resolve worker threading
    this._resolveWorker();
  }

  /**
   * Get root URL for subscriptions
   * (postMessage treats ALL urls the same off the same root)
   * @param url
   * @return {*}
   * @private
   */
  _getSubscriber(url) {
    let splt = url.split("://"),
      protocol = splt[0],
      urlx = splt[1];
    if (urlx !== undefined) {
      let domain = splt[1].split("/")[0];
      return protocol.concat("://").concat(domain);
    } else {
      return url;
    }
  }

  /**
   * Resolve what type of worker threading is available
   * todo: this is very incomplete
   * at the moment it only sets up the sharedworker - which is the priority in all cases anyways
   * @private
   */
  _resolveWorker() {
    // Browser supports SharedWorker
    let sh = !!window.SharedWorker;
    sh = Boolean(sh);
    if (sh) {
      _worker = this._startSharedWorker();
      if (!_worker) {
        // Fallback on failure
        _worker = this._startDedicatedWorker();
      }
    }

    // Use plain web worker
    else {
      _worker = this._startDedicatedWorker();
    }

    return _worker;
  }

  /**
   * Attempt to start SharedWorker thread or fail and return false
   * @return {SharedWorker | boolean}
   * @private
   */
  _startSharedWorker() {
    let worker,
      route = this._getPostalRoute();

    try {
      worker = new SharedWorker(
        route.concat(POSTAL_SHARED_WORKER).concat(".").concat(JS),
        POSTAL_WORKER
      );

      /* !!! DEPRECATED messaging route !!! but leaving in place as fallback for older browsers */
      // this stuff is no longer tested and does not work
      // (no more messaging, only the connection is being established here)
      // but leaving it in to polyfill older browsers potentially
      let OK = _stringify({
        postal: true,
        type: RESPONSE,
        id: this.id,
        status: true
      });
      Deprecated.registerWorker(worker, OK, _events, this);

      /* !!! PRIMARY messaging - This should always be used first */
      _channel.onmessage = event => {
        // Handle messages sent from worker by type
        const data = JSON.parse(event.data);
        if (data.postal !== true) return; // Not a postalWorker message
        switch (data.type) {
          case WORKERREGISTER:
            // worker startup
            this.workerOnline = true;

            this._mapToBroadcastNetwork(this.id);

            if (_queue.length) {
              const getLength = () => _queue.length;
              while (getLength()) {
                _queue.shift()();
              }
            }

            break;
          case FIRE:
            if (data.data.msgClass && _events.get(data.data.msgClass)) {
              _events.get(data.data.msgClass)(data.data.message /*, event*/);
            }
            break;
          case ERROR:
            console.error(data.data);
            break;
          // default:
          //   console.warn(event);
        }
      };
    } catch (e) {
      // todo: Add intelligent error handling, including destination options
      window.console.warn(
        "PostalWorker - Unable to start SharedWorker" // todo: Reverting to dedicated worker
      );
      window.console.debug(e);
    }
    return worker ? worker : false;
  }

  /**
   * Start a basic web worker (not available at this time)
   * @private
   */
  _startDedicatedWorker() {
    window.console.info("_startDedicatedWorker... (not complete)");
  }

  /**
   * Resolve route to use to find the sharedworker file
   * Priority is:
   * 1. Configuration passed to library
   * 2. Find any script tag in document which is called PostalWorker and then see if PostalRoute is defined in the querystring
   * 3. Assume the file is adjacent to where this script is being run from
   * @return {String}
   * @private
   */
  _getPostalRoute() {
    let script = Array.from(document.querySelectorAll(SCRIPT))
      .filter(s => {
        if (s.src) {
          return s.src.match(POSTAL_WORKER);
        } else return [];
      })
      .filter(f => f !== null);

    // What about if more than one postalworker is found?
    // This should be pointed out...
    if (script.length > 1) {
      window.console.warn(
        'PostalWorker - Discovered more than 1 script tag matching "PostalWorker"'
      );
    }
    if (_config.PostalRoute) {
      return _config.PostalRoute;
    }
    // If PostalRoute is defined in the url, parse it and use it
    else if (script[0].src.match("PostalRoute")) {
      let query = script[0].src.match(/PostalRoute=.*&/)
        ? script[0].src.match(/PostalRoute=.*&/)[0].replace("&", "")
        : script[0].src.match(/PostalRoute=.*$/)[0];
      return query.match("PostalRoute=.*$")[0].replace("PostalRoute=", "");
    } else {
      // Otherwise, look next to where the PostalWorker script is located
      return script.length === 1
        ? script[0].src

            // minified version
            .replace(/PostalWorker\.min\.js.*$/, "")

            // full version
            .replace(/PostalWorker\.js.*$/, "")
        : "";
    }
  }

  /**
   * Process window messaging events "data" by "type"
   * @param e { data: JSON{ id: number, msgClass: string, message: any }, id: number, origin: string, source: port }
   * @private
   */
  _messageController(e) {
    if (
      !e.data ||
      (e.data.match && e.data.match("webpack")) ||
      (e.data.type && e.data.type.match("webpack")) ||
      (e.data.source && e.data.source.match("react"))
    )
      return;
    let msg = JSON.parse(e.data);
    if (!msg.postal || msg.postal !== true) return; // Not a postalWorker message
    // console.info(msg);
    switch (msg.type) {
      case CROSSFIRE:
        // Is this a parent we don't yet know about?
        if (!_windows.has(msg.id)) {
          _windows.set(msg.id, { win: e.source, subscriber: e.origin });
        }
        // Is this window known by the module? If not, add it to the registry
        if (!_windows.has(msg.id)) {
          _windows.set(msg.id, { win: e.source, subscriber: e.origin });
          _subscriptions.add(e.origin);
        }
        // Is this a cross event?
        if (_crossEvents.has(msg.data.msgClass)) {
          // If so, invoke registered callback against message
          _crossEvents.get(msg.data.msgClass)(msg.data.message);
        }
        break;

      case BACKFIRE:
        // Children register themselves with the parent
        if (msg.data.msgClass === CHILDREGISTER) {
          if (!_windows.has(msg.data.id)) {
            // if (!_windows.has(e.source)) {
            _windows.set(msg.id, { win: e.source, subscriber: e.origin }); //_windows.set(e.source, e.origin);
            _subscriptions.add(e.origin);
          } else {
            // When a duplicate attempts to register, delete the previous resource
            // This accounts for iframe reloading
            _windows.delete(msg.id); // _windows.delete(e.source);
            _windows.set(msg.id, { win: e.origin, subscriber: e.origin }); // _windows.set(e.source, e.origin);
          }
        }
        // Regular backfire
        else {
          if (_crossEvents.has(msg.data.msgClass)) {
            // Invoke registered callback
            _crossEvents.get(msg.data.msgClass)(msg.data.message);
          }
        }
        break;

      case ERROR:
        window.console.error(msg.data.message);
        break;

      default:
        window.console.error("PostalWorker - Unexpected message event");
        window.console.debug({
          type: "_messageController",
          event: e
        });
    }
  }

  /**
   * Register for events
   * @param msgClass
   * @param action
   * @return {PostalWorker}
   */
  _on(msgClass, action) {
    if (msgClass && action) {
      // Send message to worker thread
      let msg_ = _stringify({
        postal: true,
        type: ON,
        id: this.id,
        data: {
          msgClass: msgClass,
          action: action
        }
      });
      if (_worker) _channel.postMessage(msg_);
      else _queue.push(() => _channel.postMessage(msg_));

      // Update registry
      _events.set(msgClass, action);

      return this;
    }
  }

  /**
   * Unregister event
   * @param msgClass
   * @return {Boolean}
   */
  _un(msgClass) {
    try {
      // Send message to worker thread
      let msg_ = _stringify({
        postal: true,
        type: UN,
        id: this.id,
        data: msgClass
      });
      if (_worker) _channel.postMessage(msg_);
      else _queue.push(() => _channel.postMessage(msg_));
      // Update registry
      _events.delete(msgClass);
    } catch (e) {
      window.console.error(e);
      return false;
    }
    return true;
  }

  /**
   * Fire event
   * @param msgClass
   * @param msg
   * @param audience - not being used currently
   * @return {PostalWorker}
   */
  _fire(msgClass, msg, audience) {
    let msg_ = _stringify({
      postal: true,
      type: FIRE,
      id: this.id,
      data: {
        msgClass: msgClass,
        message: msg,
        audience: audience
      }
    });

    if (!this.workerOnline) {
      _queue.push(() => _channel.postMessage(msg_));
    } else if (_worker) _channel.postMessage(msg_);
    else _queue.push(() => _channel.postMessage(msg_));

    return true;
  }

  /**
   * Register for cross launched windows or iframes messages
   * @param msgClass {string}
   * @param action {function}
   * @param subscriber {string}
   * @param name {string}
   * @param windowparams {WindowParameters}
   * @return {PostalWorker}
   */
  _crossOn(msgClass, action, subscriber, name, windowparams) {
    let rootSubscriber,
      winName,
      delimeter = "",
      params = "";

    if (subscriber) {
      // postMessage only needs the root protocol+domain to send messages
      rootSubscriber = this._getSubscriber(subscriber);

      // It also cannot be the parent window as that is already taken
      if (_parentWindow && rootSubscriber !== _parentWindow) {
        window.console.warn("PostalWorker - Unable to crossOn parentWindow");
        return this;
      }

      // Register subscription
      if (_subscriptions.has(rootSubscriber) === false) {
        // If subscriber doesn't exist
        _subscriptions.add(rootSubscriber);
      }

      // Open window for subscription
      winName = name || _BLANK;

      if (windowparams) {
        for (const param of Object.entries(windowparams)) {
          params = params.concat(`${delimeter} ${param[0]}=${param[1]}`);
          if (delimeter === "") delimeter = ",";
        }

        // Open window (with extra params)
        // debug: console.info(`window.open(${subscriber}, ${winName}, ${params})`);
        // _windows.set(window.open(subscriber, winName, params), rootSubscriber);
        _openingWindows.set(
          rootSubscriber,
          window.open(subscriber, winName, params)
        );
      } else {
        // Open window (basic)
        // _windows.set(window.open(subscriber, winName), rootSubscriber);
        _openingWindows.set(rootSubscriber, window.open(subscriber, winName));
      }

      // Register associated action in registry
      _crossEvents.set(msgClass, action);

      // Now wait until it connects
    } else {
      // No subscriber means to ONLY listen but not to open the window reference
      _crossEvents.set(msgClass, action);
    }

    return this;
  }

  /**
   * Unregister cross launch/iframes
   * @param msgClass
   * @param subscriber
   * @return {PostalWorker}
   */
  _unCross(msgClass, subscriber) {
    // Remove from cross events registry
    _crossEvents.delete(msgClass); // todo: this should check if any other subscribers are using it...
    if (subscriber) {
      // Get root subscriber
      let rootSubscriber = this._getSubscriber(subscriber);

      // Remove from subscriptions
      _subscriptions.delete(rootSubscriber);

      // If a reference to a window exists
      let ids = [];
      for (let [id, win] of _windows) {
        if (win.subscriber === this._getSubscriber(subscriber)) {
          win.win.close();
          ids.push(id);
        }
      }
      ids.forEach(id => {
        _windows.delete(id);
      });

      // if (_windows.has(rootSubscriber)) {
      //   // Close it
      //   _windows.get(rootSubscriber).close();

      //   // Then remove from registry
      //   _windows.delete(rootSubscriber);
      // }
    }
    return this;
  }

  /**
   * Broadcast/fire across the windows/frames
   * @param msgClass
   * @param msg
   * @return {PostalWorker}
   */
  _crossFire(msgClass, msg) {
    let msg_ = _stringify({
      postal: true,
      type: CROSSFIRE,
      id: this.id,
      data: {
        msgClass: msgClass,
        message: msg
      }
    });

    if (_windows.size === 0 && window.opener) {
      window.opener.postMessage(msg_, "*"); // todo: find a more secure subscriber than *
    }

    // Parent window is part of the crossFire group
    if (_parentWindow) {
      window.top.postMessage(msg_, _parentWindow);
    }

    if (_windows.size > 0) {
      for (let [, win] of _windows) {
        win.win.postMessage(msg_, win.subscriber);
      }
    }

    return this;
  }

  /**
   * Fire to all the things!
   * @param msgClass
   * @param msg
   * @return {PostalWorker}
   */
  _fireAll(msgClass, msg) {
    this._fire(msgClass, msg);
    this._crossFire(msgClass, msg);
    return this;
  }

  /**
   * Special fire type that is specifically from child to parent window
   * @param msgClass
   * @param msg
   * @return {PostalWorker}
   */
  _backFire(msgClass, msg) {
    if (_parentWindow && msgClass) {
      let msg_ = _stringify({
        postal: true,
        type: BACKFIRE,
        id: this.id,
        data: {
          msgClass: msgClass,
          message: msg
        }
      });

      try {
        window.top.postMessage(msg_, _parentWindow);
      } catch (e) {
        window.console.warn("PostalWorker - Unable to backFire");
        window.console.debug({
          msg: msg_,
          parentWindow: _parentWindow,
          error: e
        });
      }
    }
    return this;
  }

  /**
   * Load JavaScript library into worker thread
   * todo: @Russ - support for multiple threads...
   * @param library
   */
  _load(library) {
    const msg = _stringify({
      postal: true,
      type: LOAD,
      id: this.id,
      data: library
    });
    if (!this.workerOnline) {
      // If the worker has not completed startup yet, queue the message
      _queue.push(() => {
        _channel.postMessage(msg);
      });
    } else if (_worker) {
      // Otherwise, send the message to load the library
      _channel.postMessage(msg);
    } else {
      _queue.push(() => _channel.postMessage(msg));
    }
  }

  /**
   *
   * @returns
   */
  _getOpeningWindows() {
    return _openingWindows;
  }

  /**
   * Get current window references registered with postal system
   * @return {Map<any, any>}
   */
  _getWindows() {
    return _windows;
  }

  /**
   *
   * @return {Map<any, any>}
   */
  _getCrossEvents() {
    return _crossEvents;
  }

  /**
   *
   * @return {Set<any>}
   */
  _getSubscriptions() {
    return _subscriptions;
  }

  /**
   * @param subscriber
   * @return {boolean | Array}
   */
  _getWindowsBySubscriber(subscriber) {
    let results = [];
    for (let [, win] of _windows) {
      if (subscriber === win.subscriber) {
        results.push(win);
      }
    }
    return results;
  }

  /**
   *
   * @return {Map<any, any>}
   */
  _getEvents() {
    return _events;
  }

  /**
   * Generate unique number using timestamp + incrementing number
   * @returns number
   */
  _uniqueNumber() {
    let date = Date.now();
    if (date <= this._uniqueNumber.previous) {
      date = ++this._uniqueNumber.previous;
    } else {
      this._uniqueNumber.previous = date;
    }

    return date;
  }

  /**
   * Map window being opened to the window instance which is confirmed by first message
   * @param {number} id
   * @param {*} win
   * @param {string} subscriber
   */
  _mapToWindow(id, win, subscriber) {
    _windows.set(id, { win, subscriber });
    _channel.postMessage(
      _stringify({
        postal: true,
        type: REGISTERID,
        id: id,
        nodeType: CROSSNODE
      })
    );
  }

  /**
   *
   * @param {number} id
   */
  _unmapFromWindow(id) {
    _windows.delete(id);
    _channel.postMessage(
      _stringify({
        postal: true,
        type: UNREGISTERID,
        id: id
      })
    );
  }

  /**
   *
   * @param {number} id
   */
  _mapToBroadcastNetwork(id) {
    _broadcastNetwork.add(id);
    _channel.postMessage(
      _stringify({
        postal: true,
        type: REGISTERID,
        id: id,
        nodeType: BROADCASTNODE
      })
    );
  }

  /**
   *
   * @param {number} id
   */
  _unmapFromBroadcastNetwork(id) {
    _broadcastNetwork.delete(id);
    _channel.postMessage(
      _stringify({
        postal: true,
        type: UNREGISTERID,
        id: id
      })
    );
  }

  /**
   *
   * @param {*} address
   * @param {Function} handler - { update, box }
   */
  _postBox(address, handler) {
    const msg = _stringify({
      postal: true,
      type: POBOX,
      id: this.id,
      address: address
    });
    if (!this.workerOnline) {
      _queue.push(() => _channel.postMessage(msg));
    } else if (_worker) {
      _channel.postMessage(msg);
    }
    if (!_POboxes.size) {
      PostalHelper.registerCollection(this);
    }

    if (!_POboxes.get(address)) {
      _POboxes.set(address, handler);
    }
    // todo: else do something about duplicate requests...
  }

  /**
   *
   * @param {*} address
   */
  _closeBox(address) {
    const fn = _POboxes.get(address);
    PostalHelper.registerClosure(this, address, fn);

    _POboxes.delete(address);
    _channel.postMessage(
      _stringify({
        postal: true,
        type: CLOSEBOX,
        id: this.id,
        address: address
      })
    );
  }

  // _getPostBoxes() {
  //   return _POboxes;
  // }

  /**
   *
   * @param {*} address
   * @param {*} value
   */
  _post(address, value) {
    const msg = _stringify({
      postal: true,
      type: POST,
      id: this.id,
      address: address,
      value: value
    });
    if (!this.workerOnline) _queue.push(() => _channel.postMessage(msg));
    else if (_worker) _channel.postMessage(msg);
    else _queue.push(() => _channel.postMessage(msg));
  }

  /**
   *
   * @param {*} drop
   */
  _collectBox(drop) {
    const { address, value, box } = drop;
    let collect = _POboxes.get(address);
    if (collect) {
      collect({ address, value, box });
    }
  }

  /**
   *
   * @param {*} address
   * @param {*} collect
   */
  _lastCollection(address, collect) {
    _closures.set(address, collect);
  }

  /**
   *
   * @param {*} msg
   */
  _clearBox(msg) {
    const { id, address, box } = msg;
    if (id !== this.id) return;
    if (_closures.get(address)) {
      const value = null;
      _closures.get(address)({ address, value, box });
      _closures.delete(address);
    }
    _POboxes.delete(address);
    if (!_closures.size && !_POboxes.size) {
      PostalHelper.unregisterCollection(this);
    }
  }

  /**
   *
   * @param {*} address
   * @param {*} content
   * @param {*} handling
   */
  _package(address, handling) {
    const msg = _stringify({
      postal: true,
      type: PACKAGE,
      id: this.id,
      address: address
    });
    if (!this.workerOnline) {
      _queue.push(() => _channel.postMessage(msg));
    } else if (_worker) {
      _channel.postMessage(msg);
    }
    if (!_packages.size) {
      PostalHelper.registerDelivery(this);
    }

    if (!_packages.get(address)) {
      _packages.set(address, handling);
    }
  }

  /**
   *
   * @param {*} address
   * @param {*} content
   */
  _pack(address, content) {
    let xhRequest = new XMLHttpRequest();
    let me = this;
    xhRequest.onload = function () {
      let reader = new FileReader();
      reader.onloadend = function () {
        const msg = _stringify({
          postal: true,
          type: PACK,
          id: me.id,
          address: address,
          content: reader.result
        });
        if (!me.workerOnline) {
          _queue.push(() => {
            _channel.postMessage(msg);
          });
        } else if (_worker) {
          _channel.postMessage(msg);
        }
      };
      reader.readAsDataURL(xhRequest.response);
    };
    xhRequest.open("GET", content);
    xhRequest.responseType = "blob";
    xhRequest.send();
  }

  /**
   *
   * @param {*} msg
   */
  _delivery(msg) {
    const { address, content } = msg;
    let pk = _packages.get(address);
    if (pk) pk({ address, content });
  }
}

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
 * PostalWorker Main Source (ES6 Version - Exports )
 * Build ES6 module version
 * @Author: Russ Stratfull - 2018
 */


let _PostalWorker;
function main (configuration) {
    if (!_PostalWorker) {
        _PostalWorker = new PostalWorker(configuration, index);
        return _PostalWorker;
    }
    else return _PostalWorker;
}

export default main;
